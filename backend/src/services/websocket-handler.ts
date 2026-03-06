import { WebSocket, WebSocketServer } from 'ws'
import type { Server } from 'http'
import type { ClientMessage, ServerMessage } from '../types/index.js'
import { sshManager } from './ssh-manager.js'

interface WebSocketClient extends WebSocket {
  sessionId?: string
  isAlive?: boolean
  missedPongs?: number  // 连续未响应 pong 的次数
  cachedShell?: NodeJS.ReadWriteStream  // 缓存 shell 引用，跳过 Map 查找
}

// 预构建的消息模板，避免重复字符串拼接
const MSG_PONG = (sessionId: string) => `{"type":"pong","sessionId":"${sessionId}"}`
const MSG_OUTPUT_PREFIX = (sessionId: string) => `{"type":"output","sessionId":"${sessionId}","data":`
const MSG_DISCONNECT = (sessionId: string) => `{"type":"disconnect","sessionId":"${sessionId}"}`
const MSG_ERROR = (sessionId: string, error: string) => `{"type":"error","sessionId":"${sessionId}","error":"${error}"}`

/**
 * WebSocket 处理器
 */
export class WebSocketHandler {
  private wss: WebSocketServer
  private pingInterval: NodeJS.Timeout | null = null
  private sessionToWs: Map<string, WebSocketClient> = new Map()
  private shellOutputSetup: Set<string> = new Set()
  private shellCreating: Set<string> = new Set()
  private outputBuffer: Map<string, string[]> = new Map()

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/ws' })
    this.setupHandlers()
    this.startPingInterval()
  }

  private setupHandlers(): void {
    this.wss.on('connection', (ws: WebSocketClient) => {
      ws.isAlive = true
      ws.missedPongs = 0

      ws.on('pong', () => {
        ws.isAlive = true
        ws.missedPongs = 0
      })

      ws.on('message', async (data) => {
        try {
          // 避免不必要的 Buffer→String 转换
          const raw = typeof data === 'string' ? data : data.toString()
          const message: ClientMessage = JSON.parse(raw)
          
          // 内联 input 快速路径 — 跳过 handleMessage 的 switch 开销
          if (message.type === 'input') {
            const { sessionId, data: inputData } = message
            if (!sessionId || !inputData) return
            
            // 最快路径：使用缓存的 shell 引用
            if (ws.cachedShell && ws.sessionId === sessionId) {
              ws.cachedShell.write(inputData)
              return
            }
            
            await this.handleInput(ws, message)
            return
          }
          
          await this.handleMessage(ws, message)
        } catch {
          this.sendError(ws, 'Invalid message format')
        }
      })

      ws.on('close', () => {
        ws.cachedShell = undefined
        if (ws.sessionId) {
          // 清理 output buffer 防止内存泄漏
          this.outputBuffer.delete(ws.sessionId)
          if (this.sessionToWs.get(ws.sessionId) === ws) {
            this.sessionToWs.delete(ws.sessionId)
            setTimeout(() => {
              if (!this.sessionToWs.has(ws.sessionId!)) {
                sshManager.disconnect(ws.sessionId!)
                this.shellOutputSetup.delete(ws.sessionId!)
                this.shellCreating.delete(ws.sessionId!)
              }
            }, 5000)
          }
        }
      })

      ws.on('error', (err) => {
        console.error('WebSocket error:', err)
      })
    })
  }

  private async handleMessage(ws: WebSocketClient, message: ClientMessage): Promise<void> {
    switch (message.type) {
      case 'input':
        await this.handleInput(ws, message)
        break
      case 'resize':
        await this.handleResize(ws, message)
        break
      case 'ping':
        // ping 时更新会话活跃时间（每 25 秒一次，不影响性能）
        sshManager.touchSession(message.sessionId)
        // 直接发送预构建的 pong 消息
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(MSG_PONG(message.sessionId))
        }
        break
    }
  }

  private async handleInput(ws: WebSocketClient, message: ClientMessage): Promise<void> {
    const { sessionId, data } = message
    if (!sessionId || !data) return

    const session = sshManager.getSession(sessionId)
    if (!session || session.status !== 'connected') {
      this.sendError(ws, 'Session not found', sessionId)
      return
    }

    // 只在首次设置 sessionId
    if (!ws.sessionId) {
      ws.sessionId = sessionId
      this.sessionToWs.set(sessionId, ws)
    }

    // 如果 shell 已存在，直接发送输入并缓存引用
    if (session.shell) {
      ws.cachedShell = session.shell
      session.shell.write(data)
      return
    }

    // 创建 shell
    try {
      const shell = await sshManager.createShell(sessionId)
      if (shell) {
        ws.cachedShell = shell
        this.setupShellOutput(sessionId, shell)
        shell.write(data)
      }
    } catch {
      this.sendError(ws, 'Failed to create shell', sessionId)
    }
  }

  private async handleResize(ws: WebSocketClient, message: ClientMessage): Promise<void> {
    const { sessionId, cols, rows } = message
    if (!sessionId || !cols || !rows) return

    const session = sshManager.getSession(sessionId)
    if (!session || session.status !== 'connected') {
      this.sendError(ws, 'Session not found', sessionId)
      return
    }

    // resize 不频繁，可以更新时间戳
    sshManager.touchSession(sessionId)

    ws.sessionId = sessionId
    this.sessionToWs.set(sessionId, ws)

    if (session.shell) {
      sshManager.resizeTerminal(sessionId, cols, rows)
      ws.cachedShell = session.shell
      return
    }

    if (this.shellCreating.has(sessionId)) return

    this.shellCreating.add(sessionId)

    try {
      const currentSession = sshManager.getSession(sessionId)
      if (currentSession?.shell) {
        ws.cachedShell = currentSession.shell
        sshManager.resizeTerminal(sessionId, cols, rows)
        this.flushBuffer(sessionId, ws)
        return
      }

      const shell = await sshManager.createShell(sessionId, cols, rows)
      if (shell) {
        ws.cachedShell = shell
        this.setupShellOutput(sessionId, shell)
        setTimeout(() => this.flushBuffer(sessionId, ws), 50)
      }
    } finally {
      this.shellCreating.delete(sessionId)
    }
  }

  private setupShellOutput(sessionId: string, shell: NodeJS.ReadWriteStream): void {
    if (this.shellOutputSetup.has(sessionId)) return

    this.shellOutputSetup.add(sessionId)
    this.outputBuffer.set(sessionId, [])

    // 预构建输出消息前缀，避免每次输出都拼接 sessionId
    const outputPrefix = MSG_OUTPUT_PREFIX(sessionId)

    // 微批量输出：合并快速连续的数据块为一次 ws.send()
    let pendingData = ''
    let flushScheduled = false

    const flushOutput = () => {
      flushScheduled = false
      if (!pendingData) return
      
      const ws = this.sessionToWs.get(sessionId)
      const msg = `${outputPrefix}${JSON.stringify(pendingData)}}`
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(msg)
      } else {
        const buffer = this.outputBuffer.get(sessionId) || []
        buffer.push(pendingData)
        this.outputBuffer.set(sessionId, buffer)
      }
      pendingData = ''
    }

    shell.on('data', (data: Buffer) => {
      pendingData += data.toString('utf-8')
      
      if (!flushScheduled) {
        flushScheduled = true
        // setImmediate 在当前 I/O 周期结束后立即执行
        // 合并同一事件循环 tick 内的所有数据块
        setImmediate(flushOutput)
      }
    })

    shell.on('close', () => {
      // 先刷新剩余数据
      if (pendingData) flushOutput()
      
      const ws = this.sessionToWs.get(sessionId)
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(MSG_DISCONNECT(sessionId))
      }
      this.shellOutputSetup.delete(sessionId)
      this.outputBuffer.delete(sessionId)
      this.sessionToWs.delete(sessionId)
    })
  }

  private flushBuffer(sessionId: string, ws: WebSocketClient): void {
    const buffer = this.outputBuffer.get(sessionId)
    if (buffer && buffer.length > 0 && ws.readyState === WebSocket.OPEN) {
      for (const data of buffer) {
        this.sendMessage(ws, { type: 'output', sessionId, data })
      }
      this.outputBuffer.set(sessionId, [])
    }
  }

  private sendMessage(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message))
    }
  }

  private sendError(ws: WebSocket, error: string, sessionId = ''): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(MSG_ERROR(sessionId, error))
    }
  }

  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      this.wss.clients.forEach((ws: WebSocketClient) => {
        if (ws.isAlive === false) {
          ws.missedPongs = (ws.missedPongs || 0) + 1
          // 容忍 3 次未响应（约 90 秒），再断开
          if (ws.missedPongs >= 3) return ws.terminate()
        }
        ws.isAlive = false
        ws.ping()
      })
    }, 30000)
  }

  broadcast(message: ServerMessage): void {
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message))
      }
    })
  }

  shutdown(): void {
    if (this.pingInterval) clearInterval(this.pingInterval)
    this.wss.close()
  }
}
