import { WebSocket, WebSocketServer } from 'ws'
import type { Server } from 'http'
import type { ClientMessage, ServerMessage } from '../types/index.js'
import { sshManager } from './ssh-manager.js'

interface WebSocketClient extends WebSocket {
  sessionId?: string
  isAlive?: boolean
}

/**
 * WebSocket 处理器
 */
export class WebSocketHandler {
  private wss: WebSocketServer
  private pingInterval: NodeJS.Timeout | null = null
  // 跟踪每个 session 对应的 WebSocket 连接
  private sessionToWs: Map<string, WebSocketClient> = new Map()
  // 跟踪已设置输出监听的 session
  private shellOutputSetup: Set<string> = new Set()

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/ws' })
    this.setupHandlers()
    this.startPingInterval()
  }

  /**
   * 设置 WebSocket 事件处理
   */
  private setupHandlers(): void {
    this.wss.on('connection', (ws: WebSocketClient) => {
      console.log('WebSocket client connected')
      ws.isAlive = true

      ws.on('pong', () => {
        ws.isAlive = true
      })

      ws.on('message', async (data) => {
        try {
          const message: ClientMessage = JSON.parse(data.toString())
          await this.handleMessage(ws, message)
        } catch (err) {
          this.sendError(ws, 'Invalid message format')
        }
      })

      ws.on('close', () => {
        console.log('WebSocket client disconnected')
        if (ws.sessionId) {
          // 从映射中移除
          if (this.sessionToWs.get(ws.sessionId) === ws) {
            this.sessionToWs.delete(ws.sessionId)
          }
        }
      })

      ws.on('error', (err) => {
        console.error('WebSocket error:', err)
      })
    })
  }

  /**
   * 处理客户端消息
   */
  private async handleMessage(
    ws: WebSocketClient,
    message: ClientMessage
  ): Promise<void> {
    switch (message.type) {
      case 'input':
        await this.handleInput(ws, message)
        break
      case 'resize':
        await this.handleResize(ws, message)
        break
      case 'ping':
        this.sendMessage(ws, { type: 'pong', sessionId: message.sessionId })
        break
      default:
        this.sendError(ws, 'Unknown message type')
    }
  }

  /**
   * 处理终端输入
   */
  private async handleInput(
    ws: WebSocketClient,
    message: ClientMessage
  ): Promise<void> {
    const { sessionId, data } = message
    if (!sessionId || !data) {
      this.sendError(ws, 'Missing sessionId or data')
      return
    }

    const session = sshManager.getSession(sessionId)
    if (!session) {
      this.sendError(ws, 'Session not found', sessionId)
      return
    }

    // 绑定 WebSocket 到会话
    ws.sessionId = sessionId
    this.sessionToWs.set(sessionId, ws)

    // 如果还没有 shell，创建一个
    if (!session.shell) {
      try {
        await sshManager.createShell(sessionId)
        // 设置 shell 输出处理（只设置一次）
        this.setupShellOutput(sessionId)
      } catch (err) {
        this.sendError(ws, 'Failed to create shell', sessionId)
        return
      }
    }

    // 发送输入到终端
    const success = sshManager.sendInput(sessionId, data)
    if (!success) {
      this.sendError(ws, 'Failed to send input', sessionId)
    }
  }

  /**
   * 处理终端大小调整
   */
  private async handleResize(
    ws: WebSocketClient,
    message: ClientMessage
  ): Promise<void> {
    const { sessionId, cols, rows } = message
    if (!sessionId || !cols || !rows) {
      return // 静默忽略无效的 resize 请求
    }

    const session = sshManager.getSession(sessionId)
    if (!session) {
      return // 会话不存在，静默忽略
    }

    // 绑定 WebSocket 到会话
    ws.sessionId = sessionId
    this.sessionToWs.set(sessionId, ws)

    // 如果 shell 已存在，直接调整大小
    if (session.shell) {
      sshManager.resizeTerminal(sessionId, cols, rows)
      return
    }

    // shell 不存在，尝试创建
    try {
      await sshManager.createShell(sessionId, cols, rows)
      this.setupShellOutput(sessionId)
    } catch {
      // 创建失败，静默忽略（可能会话还在初始化）
      console.log(`Failed to create shell for session ${sessionId}, will retry later`)
    }
  }

  /**
   * 设置 Shell 输出处理（每个 session 只设置一次）
   */
  private setupShellOutput(sessionId: string): void {
    // 避免重复设置
    if (this.shellOutputSetup.has(sessionId)) {
      return
    }

    const session = sshManager.getSession(sessionId)
    if (!session?.shell) return

    this.shellOutputSetup.add(sessionId)

    session.shell.on('data', (data: Buffer) => {
      // 动态获取当前绑定的 WebSocket
      const ws = this.sessionToWs.get(sessionId)
      if (ws && ws.readyState === WebSocket.OPEN) {
        this.sendMessage(ws, {
          type: 'output',
          sessionId,
          data: data.toString('utf-8'),
        })
      }
    })

    session.shell.on('close', () => {
      const ws = this.sessionToWs.get(sessionId)
      if (ws && ws.readyState === WebSocket.OPEN) {
        this.sendMessage(ws, {
          type: 'disconnect',
          sessionId,
        })
      }
      // 清理
      this.shellOutputSetup.delete(sessionId)
      this.sessionToWs.delete(sessionId)
    })
  }

  /**
   * 发送消息到客户端
   */
  private sendMessage(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message))
    }
  }

  /**
   * 发送错误消息
   */
  private sendError(ws: WebSocket, error: string, sessionId = ''): void {
    this.sendMessage(ws, {
      type: 'error',
      sessionId,
      error,
    })
  }

  /**
   * 启动心跳检测
   */
  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      this.wss.clients.forEach((ws: WebSocketClient) => {
        if (ws.isAlive === false) {
          return ws.terminate()
        }
        ws.isAlive = false
        ws.ping()
      })
    }, 30000)
  }

  /**
   * 广播消息到所有连接的客户端
   */
  broadcast(message: ServerMessage): void {
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message))
      }
    })
  }

  /**
   * 关闭 WebSocket 服务
   */
  shutdown(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
    }
    this.wss.close()
  }
}
