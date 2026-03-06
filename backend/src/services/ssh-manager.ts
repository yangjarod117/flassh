import { Client } from 'ssh2'
import { v4 as uuidv4 } from 'uuid'
import type { SSHSession, ConnectionConfig } from '../types/index.js'

/**
 * SSH 会话管理器
 */
export class SSHManager {
  private sessions: Map<string, SSHSession> = new Map()
  private cleanupInterval: NodeJS.Timeout | null = null
  private readonly sessionTimeout = 30 * 60 * 1000 // 30 分钟

  constructor() {
    // 启动定期清理
    this.startCleanup()
  }

  /**
   * 创建新的 SSH 连接
   */
  async connect(config: ConnectionConfig): Promise<SSHSession> {
    const sessionId = uuidv4()
    const client = new Client()

    const session: SSHSession = {
      id: sessionId,
      connection: client,
      config: {
        host: config.host,
        port: config.port,
        username: config.username,
        authType: config.authType,
      },
      createdAt: new Date(),
      lastActivityAt: new Date(),
      status: 'connecting',
    }

    this.sessions.set(sessionId, session)

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        client.end()
        session.status = 'error'
        session.error = 'Connection timeout'
        reject(new Error('Connection timeout'))
      }, 10000)

      client.on('ready', () => {
        clearTimeout(timeout)
        session.status = 'connected'
        session.lastActivityAt = new Date()
        resolve(session)
      })

      client.on('error', (err) => {
        clearTimeout(timeout)
        session.status = 'error'
        session.error = err.message
        reject(err)
      })

      client.on('close', () => {
        session.status = 'disconnected'
      })

      // 连接配置
      const connectConfig: Record<string, unknown> = {
        host: config.host,
        port: config.port,
        username: config.username,
        readyTimeout: 10000,
        keepaliveInterval: 10000, // 每10秒发送keepalive
        keepaliveCountMax: 3,
        // 性能优化
        algorithms: {
          cipher: ['aes128-ctr', 'aes192-ctr', 'aes256-ctr'], // 更快的加密算法
        },
      }

      if (config.authType === 'password' && config.password) {
        connectConfig.password = config.password
      } else if (config.authType === 'key' && config.privateKey) {
        connectConfig.privateKey = config.privateKey
        // 支持私钥密码
        if (config.passphrase) {
          connectConfig.passphrase = config.passphrase
        }
      }

      client.connect(connectConfig)
    })
  }

  /**
   * 获取会话（不更新时间戳，性能优化）
   */
  getSession(sessionId: string): SSHSession | undefined {
    return this.sessions.get(sessionId)
  }

  /**
   * 标记会话活跃（仅在需要时调用）
   */
  touchSession(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.lastActivityAt = new Date()
    }
  }

  /**
   * 获取会话状态
   */
  getSessionStatus(sessionId: string): SSHSession['status'] | null {
    const session = this.sessions.get(sessionId)
    return session?.status ?? null
  }

  /**
   * 断开会话
   */
  disconnect(sessionId: string): boolean {
    const session = this.sessions.get(sessionId)
    if (!session) return false

    try {
      if (session.shell) {
        session.shell.end()
      }
      session.connection.end()
      session.status = 'disconnected'
      this.sessions.delete(sessionId)
      return true
    } catch {
      return false
    }
  }

  /**
   * 创建 Shell - 返回 shell stream 以便调用者立即设置监听器
   */
  async createShell(sessionId: string, cols = 80, rows = 24): Promise<NodeJS.ReadWriteStream | null> {
    const session = this.sessions.get(sessionId)
    if (!session || session.status !== 'connected') {
      throw new Error('Session not connected')
    }

    // 如果已有 shell，不重复创建
    if (session.shell) {
      return session.shell
    }

    return new Promise((resolve, reject) => {
      session.connection.shell(
        { cols, rows, term: 'xterm-256color' },
        (err, stream) => {
          if (err) {
            reject(err)
            return
          }
          session.shell = stream
          resolve(stream)
        }
      )
    })
  }

  /**
   * 获取 SFTP 客户端
   */
  async getSFTP(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session || session.status !== 'connected') {
      throw new Error('Session not connected')
    }

    if (session.sftp) return

    return new Promise((resolve, reject) => {
      session.connection.sftp((err, sftp) => {
        if (err) {
          reject(err)
          return
        }
        session.sftp = sftp
        resolve()
      })
    })
  }

  /**
   * 调整终端大小
   */
  resizeTerminal(sessionId: string, cols: number, rows: number): boolean {
    const session = this.sessions.get(sessionId)
    if (!session?.shell) return false

    try {
      session.shell.setWindow(rows, cols, 0, 0)
      return true
    } catch {
      return false
    }
  }

  /**
   * 发送输入到终端 - 直接写入，不更新时间戳（性能优化）
   */
  sendInput(sessionId: string, data: string): boolean {
    const session = this.sessions.get(sessionId)
    if (!session?.shell) return false

    try {
      session.shell.write(data)
      return true
    } catch {
      return false
    }
  }

  /**
   * 获取所有活动会话
   */
  getActiveSessions(): SSHSession[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.status === 'connected'
    )
  }

  /**
   * 启动定期清理
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupInactiveSessions()
    }, 60000) // 每分钟检查一次
  }

  /**
   * 清理不活动的会话
   */
  private cleanupInactiveSessions(): void {
    const now = Date.now()
    for (const [id, session] of this.sessions) {
      if (now - session.lastActivityAt.getTime() > this.sessionTimeout) {
        this.disconnect(id)
      }
    }
  }

  /**
   * 关闭管理器
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }
    for (const sessionId of this.sessions.keys()) {
      this.disconnect(sessionId)
    }
  }
}

// 单例实例
export const sshManager = new SSHManager()
