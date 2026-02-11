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

      ws.on('pong', () => {
        ws.isAlive = true
      })

      ws.on('message', async (data) => {
        try {
          const message: ClientMessage = JSON.parse(data.toString())
          await this.handleMessage(ws, message)
        } catch {
          this.sendError(ws, 'Invalid message format')
        }
      })

      ws.on('close', () => {
        if (ws.sessionId) {
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
        this.sendMessage(ws, { type: 'pong', sessionId: message.sessionId })
        break
    }
  }

  private async handleInput(ws: WebSocketClient, message: ClientMessage): Promise<void> {
    const { sessionId, data } = message
    if (!sessionId || !data) return

    const session = sshManager.getSession(sessionId)
    if (!session) {
      this.sendError(ws, 'Session not found', sessionId)
      return
    }

    // 只在首次设置 sessionId
    if (!ws.sessionId) {
      ws.sessionId = sessionId
      this.sessionToWs.set(sessionId, ws)
    }

    // 如果 shell 已存在，直接发送输入（最快路径）
    if (session.shell) {
      session.shell.write(data)
      return
    }

    // 创建 shell
    try {
      const shell = await sshManager.createShell(sessionId)
      if (shell) {
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
    if (!session) return

    ws.sessionId = sessionId
    this.sessionToWs.set(sessionId, ws)

    if (session.shell) {
      sshManager.resizeTerminal(sessionId, cols, rows)
      return
    }

    if (this.shellCreating.has(sessionId)) return

    this.shellCreating.add(sessionId)

    try {
      const currentSession = sshManager.getSession(sessionId)
      if (currentSession?.shell) {
        sshManager.resizeTerminal(sessionId, cols, rows)
        this.flushBuffer(sessionId, ws)
        return
      }

      const shell = await sshManager.createShell(sessionId, cols, rows)
      if (shell) {
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

    shell.on('data', (data: Buffer) => {
      const ws = this.sessionToWs.get(sessionId)
      
      if (ws && ws.readyState === WebSocket.OPEN) {
        // 直接发送，不经过 JSON.stringify 的 sendMessage
        ws.send(`{"type":"output","sessionId":"${sessionId}","data":${JSON.stringify(data.toString('utf-8'))}}`)
      } else {
        const buffer = this.outputBuffer.get(sessionId) || []
        buffer.push(data.toString('utf-8'))
        this.outputBuffer.set(sessionId, buffer)
      }
    })

    shell.on('close', () => {
      const ws = this.sessionToWs.get(sessionId)
      if (ws && ws.readyState === WebSocket.OPEN) {
        this.sendMessage(ws, { type: 'disconnect', sessionId })
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
    this.sendMessage(ws, { type: 'error', sessionId, error })
  }

  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      this.wss.clients.forEach((ws: WebSocketClient) => {
        if (ws.isAlive === false) return ws.terminate()
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
