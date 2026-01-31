import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

interface StoredCredential {
  id: string
  host: string
  port: number
  username: string
  authType: 'password' | 'key'
  encryptedPassword?: string
  encryptedPrivateKey?: string
  encryptedPassphrase?: string
  iv: string
  createdAt: string
  lastUsedAt: string
}

// 保存的连接信息（不含敏感凭据）
export interface SavedConnectionInfo {
  id: string
  name: string
  host: string
  port: number
  username: string
  authType: 'password' | 'key'
  hasStoredCredentials: boolean
  createdAt: string
  lastUsedAt: string
}

/**
 * 凭据存储管理器
 * 使用 AES-256-GCM 加密存储敏感信息
 */
class CredentialStore {
  private credentials: Map<string, StoredCredential> = new Map()
  private connections: Map<string, SavedConnectionInfo> = new Map()
  private encryptionKey: Buffer
  private storePath: string
  private connectionsPath: string

  constructor() {
    // 从环境变量获取密钥，或生成一个
    const keyEnv = process.env.CREDENTIAL_KEY
    if (keyEnv) {
      this.encryptionKey = Buffer.from(keyEnv, 'hex')
    } else {
      // 生成随机密钥（生产环境应该使用固定密钥）
      this.encryptionKey = crypto.randomBytes(32)
    }

    // 存储路径
    this.storePath = process.env.CREDENTIAL_STORE_PATH || path.join(process.cwd(), 'data', 'credentials.json')
    this.connectionsPath = process.env.CONNECTIONS_STORE_PATH || path.join(process.cwd(), 'data', 'connections.json')
    
    // 加载已存储的凭据和连接
    this.load()
    this.loadConnections()
  }

  /**
   * 加密数据
   */
  private encrypt(text: string): { encrypted: string; iv: string; tag: string } {
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv)
    
    let encrypted = cipher.update(text, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    const tag = cipher.getAuthTag().toString('hex')
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      tag,
    }
  }

  /**
   * 解密数据
   */
  private decrypt(encrypted: string, ivHex: string, tagHex?: string): string {
    const iv = Buffer.from(ivHex, 'hex')
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv)
    
    if (tagHex) {
      decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
    }
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    
    return decrypted
  }

  /**
   * 保存凭据
   */
  save(
    id: string,
    config: {
      host: string
      port: number
      username: string
      authType: 'password' | 'key'
      password?: string
      privateKey?: string
      passphrase?: string
    }
  ): void {
    const iv = crypto.randomBytes(16).toString('hex')
    
    const credential: StoredCredential = {
      id,
      host: config.host,
      port: config.port,
      username: config.username,
      authType: config.authType,
      iv,
      createdAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
    }

    // 加密敏感数据
    if (config.password) {
      const { encrypted, iv: pwIv, tag } = this.encrypt(config.password)
      credential.encryptedPassword = `${encrypted}:${tag}`
      credential.iv = pwIv
    }
    
    if (config.privateKey) {
      const { encrypted, iv: keyIv, tag } = this.encrypt(config.privateKey)
      credential.encryptedPrivateKey = `${encrypted}:${tag}`
      credential.iv = keyIv
    }
    
    if (config.passphrase) {
      const { encrypted, tag } = this.encrypt(config.passphrase)
      credential.encryptedPassphrase = `${encrypted}:${tag}`
    }

    this.credentials.set(id, credential)
    this.persist()
  }

  /**
   * 获取凭据
   */
  get(id: string): {
    host: string
    port: number
    username: string
    authType: 'password' | 'key'
    password?: string
    privateKey?: string
    passphrase?: string
  } | null {
    const credential = this.credentials.get(id)
    if (!credential) return null

    // 更新最后使用时间
    credential.lastUsedAt = new Date().toISOString()
    this.persist()

    const result: {
      host: string
      port: number
      username: string
      authType: 'password' | 'key'
      password?: string
      privateKey?: string
      passphrase?: string
    } = {
      host: credential.host,
      port: credential.port,
      username: credential.username,
      authType: credential.authType,
    }

    // 解密敏感数据
    try {
      if (credential.encryptedPassword) {
        const [encrypted, tag] = credential.encryptedPassword.split(':')
        result.password = this.decrypt(encrypted, credential.iv, tag)
      }
      
      if (credential.encryptedPrivateKey) {
        const [encrypted, tag] = credential.encryptedPrivateKey.split(':')
        result.privateKey = this.decrypt(encrypted, credential.iv, tag)
      }
      
      if (credential.encryptedPassphrase) {
        const [encrypted, tag] = credential.encryptedPassphrase.split(':')
        result.passphrase = this.decrypt(encrypted, credential.iv, tag)
      }
    } catch (err) {
      console.error('Failed to decrypt credential:', err)
      return null
    }

    return result
  }

  /**
   * 检查凭据是否存在
   */
  has(id: string): boolean {
    return this.credentials.has(id)
  }

  /**
   * 删除凭据
   */
  delete(id: string): boolean {
    const result = this.credentials.delete(id)
    if (result) {
      this.persist()
    }
    return result
  }

  /**
   * 获取所有凭据 ID 列表（不含敏感信息）
   */
  list(): Array<{ id: string; host: string; username: string; authType: string; lastUsedAt: string }> {
    return Array.from(this.credentials.values()).map((c) => ({
      id: c.id,
      host: c.host,
      username: c.username,
      authType: c.authType,
      lastUsedAt: c.lastUsedAt,
    }))
  }

  /**
   * 持久化到文件
   */
  private persist(): void {
    try {
      const dir = path.dirname(this.storePath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      
      const data = JSON.stringify(Array.from(this.credentials.entries()), null, 2)
      fs.writeFileSync(this.storePath, data, 'utf8')
    } catch (err) {
      console.error('Failed to persist credentials:', err)
    }
  }

  /**
   * 从文件加载
   */
  private load(): void {
    try {
      if (fs.existsSync(this.storePath)) {
        const data = fs.readFileSync(this.storePath, 'utf8')
        const entries = JSON.parse(data) as Array<[string, StoredCredential]>
        this.credentials = new Map(entries)
      }
    } catch (err) {
      console.error('Failed to load credentials:', err)
    }
  }

  // ========== 连接列表管理 ==========

  /**
   * 保存连接信息
   */
  saveConnection(connection: SavedConnectionInfo): void {
    this.connections.set(connection.id, connection)
    this.persistConnections()
  }

  /**
   * 获取所有连接
   */
  getConnections(): SavedConnectionInfo[] {
    return Array.from(this.connections.values())
  }

  /**
   * 获取单个连接
   */
  getConnection(id: string): SavedConnectionInfo | null {
    return this.connections.get(id) || null
  }

  /**
   * 更新连接信息
   */
  updateConnection(id: string, updates: Partial<Omit<SavedConnectionInfo, 'id' | 'createdAt'>>): boolean {
    const connection = this.connections.get(id)
    if (!connection) return false
    
    Object.assign(connection, updates)
    this.persistConnections()
    return true
  }

  /**
   * 删除连接
   */
  deleteConnection(id: string): boolean {
    const result = this.connections.delete(id)
    if (result) {
      // 同时删除凭据
      this.delete(id)
      this.persistConnections()
    }
    return result
  }

  /**
   * 持久化连接列表
   */
  private persistConnections(): void {
    try {
      const dir = path.dirname(this.connectionsPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      
      const data = JSON.stringify(Array.from(this.connections.entries()), null, 2)
      fs.writeFileSync(this.connectionsPath, data, 'utf8')
    } catch (err) {
      console.error('Failed to persist connections:', err)
    }
  }

  /**
   * 加载连接列表
   */
  private loadConnections(): void {
    try {
      if (fs.existsSync(this.connectionsPath)) {
        const data = fs.readFileSync(this.connectionsPath, 'utf8')
        const entries = JSON.parse(data) as Array<[string, SavedConnectionInfo]>
        this.connections = new Map(entries)
      }
    } catch (err) {
      console.error('Failed to load connections:', err)
    }
  }
}

export const credentialStore = new CredentialStore()
