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
    // 从环境变量获取密钥，或从文件加载，或生成一个
    const keyEnv = process.env.CREDENTIAL_KEY
    if (keyEnv) {
      this.encryptionKey = Buffer.from(keyEnv, 'hex')
      console.log('Using encryption key from environment variable')
    } else {
      // 尝试从文件加载密钥
      const keyFilePath = process.env.CREDENTIAL_KEY_PATH || path.join(process.cwd(), 'data', '.encryption_key')
      try {
        if (fs.existsSync(keyFilePath)) {
          const keyHex = fs.readFileSync(keyFilePath, 'utf8').trim()
          this.encryptionKey = Buffer.from(keyHex, 'hex')
          console.log('Loaded encryption key from file')
        } else {
          // 生成新密钥并保存到文件
          this.encryptionKey = crypto.randomBytes(32)
          const dir = path.dirname(keyFilePath)
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true })
          }
          fs.writeFileSync(keyFilePath, this.encryptionKey.toString('hex'), { mode: 0o600 })
          console.log('Generated and saved new encryption key')
        }
      } catch (err) {
        console.error('Failed to load/save encryption key, using random key:', err)
        this.encryptionKey = crypto.randomBytes(32)
      }
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
   * 每个字段单独加密，IV 和 tag 都保存在加密字符串中
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
    const credential: StoredCredential = {
      id,
      host: config.host,
      port: config.port,
      username: config.username,
      authType: config.authType,
      iv: '', // 不再使用共享 IV
      createdAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
    }

    // 加密敏感数据 - 每个字段包含自己的 IV 和 tag
    // 格式: iv:encrypted:tag
    if (config.password) {
      const { encrypted, iv, tag } = this.encrypt(config.password)
      credential.encryptedPassword = `${iv}:${encrypted}:${tag}`
    }
    
    if (config.privateKey) {
      const { encrypted, iv, tag } = this.encrypt(config.privateKey)
      credential.encryptedPrivateKey = `${iv}:${encrypted}:${tag}`
    }
    
    if (config.passphrase) {
      const { encrypted, iv, tag } = this.encrypt(config.passphrase)
      credential.encryptedPassphrase = `${iv}:${encrypted}:${tag}`
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
    // 新格式: iv:encrypted:tag
    // 旧格式: encrypted:tag (使用 credential.iv)
    try {
      if (credential.encryptedPassword) {
        const parts = credential.encryptedPassword.split(':')
        if (parts.length === 3) {
          // 新格式
          const [iv, encrypted, tag] = parts
          result.password = this.decrypt(encrypted, iv, tag)
        } else {
          // 旧格式兼容
          const [encrypted, tag] = parts
          result.password = this.decrypt(encrypted, credential.iv, tag)
        }
      }
      
      if (credential.encryptedPrivateKey) {
        const parts = credential.encryptedPrivateKey.split(':')
        if (parts.length === 3) {
          const [iv, encrypted, tag] = parts
          result.privateKey = this.decrypt(encrypted, iv, tag)
        } else {
          const [encrypted, tag] = parts
          result.privateKey = this.decrypt(encrypted, credential.iv, tag)
        }
      }
      
      if (credential.encryptedPassphrase) {
        const parts = credential.encryptedPassphrase.split(':')
        if (parts.length === 3) {
          const [iv, encrypted, tag] = parts
          result.passphrase = this.decrypt(encrypted, iv, tag)
        } else {
          const [encrypted, tag] = parts
          result.passphrase = this.decrypt(encrypted, credential.iv, tag)
        }
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
    
    // 自动迁移：从凭据数据同步到连接列表
    this.migrateFromCredentials()
  }

  /**
   * 从凭据数据迁移到连接列表（自动同步）
   */
  private migrateFromCredentials(): void {
    let migrated = false
    
    for (const [id, credential] of this.credentials) {
      // 如果连接列表中没有这个连接，从凭据创建
      if (!this.connections.has(id)) {
        const connection: SavedConnectionInfo = {
          id,
          name: `${credential.username}@${credential.host}`,
          host: credential.host,
          port: credential.port,
          username: credential.username,
          authType: credential.authType,
          hasStoredCredentials: true,
          createdAt: credential.createdAt,
          lastUsedAt: credential.lastUsedAt,
        }
        this.connections.set(id, connection)
        migrated = true
        console.log(`Migrated connection: ${connection.name}`)
      }
    }
    
    if (migrated) {
      this.persistConnections()
    }
  }
}

export const credentialStore = new CredentialStore()
