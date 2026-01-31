import { create } from 'zustand'
import type { SavedConnection, ConnectionConfig } from '../types'

interface ConnectionsState {
  savedConnections: SavedConnection[]
  isLoading: boolean
  isLoaded: boolean
  
  // Actions
  loadConnections: () => Promise<void>
  saveConnection: (config: ConnectionConfig, name: string, saveCredentials?: boolean) => Promise<string>
  deleteConnection: (id: string) => Promise<void>
  updateConnectionName: (id: string, name: string) => void
  updateConnection: (id: string, updates: Partial<Omit<SavedConnection, 'id' | 'createdAt'>>) => void
  updateLastUsed: (id: string) => void
  getConnection: (id: string) => SavedConnection | undefined
  hasStoredCredentials: (id: string) => Promise<boolean>
  getStoredCredentials: (id: string) => Promise<ConnectionConfig | null>
}

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return `conn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * 连接配置状态管理 - 服务端存储，支持跨设备同步
 */
export const useConnectionsStore = create<ConnectionsState>()((set, get) => ({
  savedConnections: [],
  isLoading: false,
  isLoaded: false,
  
  // 从服务端加载连接列表
  loadConnections: async () => {
    if (get().isLoaded || get().isLoading) return
    
    set({ isLoading: true })
    try {
      const response = await fetch('/api/credentials/connections')
      if (response.ok) {
        const data = await response.json()
        const connections = (data.connections || []).map((c: SavedConnection) => ({
          ...c,
          createdAt: new Date(c.createdAt),
          lastUsedAt: new Date(c.lastUsedAt),
        }))
        set({ savedConnections: connections, isLoaded: true })
      }
    } catch (err) {
      console.error('Failed to load connections:', err)
    } finally {
      set({ isLoading: false })
    }
  },
  
  saveConnection: async (config: ConnectionConfig, name: string, saveCredentials = false) => {
    const id = generateId()
    const now = new Date()
    
    // 保存连接信息到服务端
    try {
      await fetch('/api/credentials/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          name,
          host: config.host,
          port: config.port,
          username: config.username,
          authType: config.authType,
          hasStoredCredentials: saveCredentials,
        }),
      })
    } catch (err) {
      console.error('Failed to save connection:', err)
    }
    
    // 如果选择保存凭据，发送到后端加密存储
    if (saveCredentials) {
      try {
        await fetch('/api/credentials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id,
            host: config.host,
            port: config.port,
            username: config.username,
            authType: config.authType,
            password: config.password,
            privateKey: config.privateKey,
            passphrase: config.passphrase,
          }),
        })
      } catch (err) {
        console.error('Failed to save credentials:', err)
      }
    }
    
    // 更新本地状态
    const savedConnection: SavedConnection = {
      id,
      name,
      host: config.host,
      port: config.port,
      username: config.username,
      authType: config.authType,
      hasStoredCredentials: saveCredentials,
      createdAt: now,
      lastUsedAt: now,
    }
    
    set((state) => ({
      savedConnections: [...state.savedConnections, savedConnection],
    }))
    
    return id
  },
  
  deleteConnection: async (id: string) => {
    // 从服务端删除（会同时删除凭据）
    try {
      await fetch(`/api/credentials/connections/${id}`, { method: 'DELETE' })
    } catch (err) {
      console.error('Failed to delete connection:', err)
    }
    
    set((state) => ({
      savedConnections: state.savedConnections.filter((c) => c.id !== id),
    }))
  },
  
  updateConnectionName: (id: string, name: string) => {
    // 更新服务端
    fetch(`/api/credentials/connections/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }).catch(err => console.error('Failed to update connection:', err))
    
    set((state) => ({
      savedConnections: state.savedConnections.map((c) =>
        c.id === id ? { ...c, name } : c
      ),
    }))
  },
  
  updateConnection: (id: string, updates: Partial<Omit<SavedConnection, 'id' | 'createdAt'>>) => {
    // 更新服务端
    fetch(`/api/credentials/connections/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    }).catch(err => console.error('Failed to update connection:', err))
    
    set((state) => ({
      savedConnections: state.savedConnections.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    }))
  },
  
  updateLastUsed: (id: string) => {
    const now = new Date()
    
    // 更新服务端
    fetch(`/api/credentials/connections/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lastUsedAt: now.toISOString() }),
    }).catch(err => console.error('Failed to update last used:', err))
    
    set((state) => ({
      savedConnections: state.savedConnections.map((c) =>
        c.id === id ? { ...c, lastUsedAt: now } : c
      ),
    }))
  },
  
  getConnection: (id: string) => {
    return get().savedConnections.find((c) => c.id === id)
  },
  
  hasStoredCredentials: async (id: string) => {
    try {
      const response = await fetch(`/api/credentials/${id}/exists`)
      const data = await response.json()
      return data.exists
    } catch {
      return false
    }
  },
  
  getStoredCredentials: async (id: string) => {
    try {
      const response = await fetch(`/api/credentials/${id}`)
      if (!response.ok) return null
      return await response.json()
    } catch {
      return null
    }
  },
}))

// 纯函数用于测试

/**
 * 序列化连接配置（不包含密码）
 */
export function serializeConnection(config: ConnectionConfig, name: string, id: string): SavedConnection {
  return {
    id,
    name,
    host: config.host,
    port: config.port,
    username: config.username,
    authType: config.authType,
    createdAt: new Date(),
    lastUsedAt: new Date(),
  }
}

/**
 * 检查序列化后的连接是否包含密码
 */
export function connectionContainsPassword(connection: SavedConnection): boolean {
  const hasPasswordField = 'password' in connection && (connection as Record<string, unknown>).password !== undefined
  const hasPrivateKeyField = 'privateKey' in connection && (connection as Record<string, unknown>).privateKey !== undefined
  return hasPasswordField || hasPrivateKeyField
}

/**
 * 从列表中删除连接
 */
export function removeConnection(connections: SavedConnection[], id: string): SavedConnection[] {
  return connections.filter((c) => c.id !== id)
}

/**
 * 检查连接是否存在于列表中
 */
export function connectionExists(connections: SavedConnection[], id: string): boolean {
  return connections.some((c) => c.id === id)
}
