import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useConnectionsStore } from '../store'
import type { SavedConnection, ConnectionConfig } from '../types'

interface SavedConnectionListProps {
  onSelect: (connection: SavedConnection) => void
  onQuickConnect?: (config: ConnectionConfig) => Promise<void>
}

/**
 * 编辑连接弹窗组件
 */
function EditConnectionDialog({
  connection,
  onSave,
  onCancel,
}: {
  connection: SavedConnection
  onSave: (updates: Partial<Omit<SavedConnection, 'id' | 'createdAt'>>) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(connection.name)
  const [host, setHost] = useState(connection.host)
  const [port, setPort] = useState(connection.port)
  const [username, setUsername] = useState(connection.username)
  const [authType, setAuthType] = useState<'password' | 'key'>(connection.authType)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !host.trim() || !username.trim()) return
    
    onSave({
      name: name.trim(),
      host: host.trim(),
      port,
      username: username.trim(),
      authType,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-surface rounded-xl shadow-2xl border border-border p-6 w-full max-w-md"
      >
        <h3 className="text-lg font-semibold mb-4">编辑连接</h3>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 连接名称 */}
          <div>
            <label className="block text-sm font-medium mb-1.5 text-text-secondary">连接名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="我的服务器"
              className="input"
              autoFocus
            />
          </div>

          {/* 主机地址 */}
          <div>
            <label className="block text-sm font-medium mb-1.5 text-text-secondary">主机地址</label>
            <input
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="example.com 或 192.168.1.1"
              className="input"
            />
          </div>

          {/* 端口 */}
          <div>
            <label className="block text-sm font-medium mb-1.5 text-text-secondary">端口</label>
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(parseInt(e.target.value) || 22)}
              min={1}
              max={65535}
              className="input"
            />
          </div>

          {/* 用户名 */}
          <div>
            <label className="block text-sm font-medium mb-1.5 text-text-secondary">用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="root"
              className="input"
            />
          </div>

          {/* 认证方式 */}
          <div>
            <label className="block text-sm font-medium mb-1.5 text-text-secondary">认证方式</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="authType"
                  checked={authType === 'password'}
                  onChange={() => setAuthType('password')}
                  className="w-4 h-4 text-primary"
                />
                <span className="text-sm">密码</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="authType"
                  checked={authType === 'key'}
                  onChange={() => setAuthType('key')}
                  className="w-4 h-4 text-primary"
                />
                <span className="text-sm">SSH 密钥</span>
              </label>
            </div>
            {/* 安全提示 */}
            <p className="mt-2 text-xs text-text-muted">
              🔒 {authType === 'password' ? '密码' : '私钥和密钥密码'}将在连接时输入，不会保存
            </p>
          </div>

          {/* 按钮 */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2 bg-surface border border-border rounded-lg hover:bg-surface-hover transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors"
            >
              保存
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

/**
 * 快速连接弹窗组件
 */
function QuickConnectDialog({
  connection,
  onConnect,
  onCancel,
  isLoading,
}: {
  connection: SavedConnection
  onConnect: (config: ConnectionConfig) => Promise<void>
  onCancel: () => void
  isLoading: boolean
}) {
  const [password, setPassword] = useState('')
  const [privateKey, setPrivateKey] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [error, setError] = useState('')
  const [saveCredentials, setSaveCredentials] = useState(false)
  const { getStoredCredentials, updateConnection } = useConnectionsStore()
  const [isLoadingCredentials, setIsLoadingCredentials] = useState(true)
  const [hasTriedAutoConnect, setHasTriedAutoConnect] = useState(false)

  // 尝试加载已保存的凭据并自动连接
  useEffect(() => {
    const tryAutoConnect = async () => {
      if (hasTriedAutoConnect) return
      setHasTriedAutoConnect(true)
      
      if (connection.hasStoredCredentials) {
        setIsLoadingCredentials(true)
        try {
          const creds = await getStoredCredentials(connection.id)
          if (creds && (creds.password || creds.privateKey)) {
            // 有完整凭据，直接连接
            await onConnect(creds as ConnectionConfig)
            return // 连接成功，不需要显示表单
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : '连接失败')
        }
      }
      // 没有保存凭据或凭据不完整，显示表单
      setIsLoadingCredentials(false)
    }
    
    tryAutoConnect()
  }, [connection.id, connection.hasStoredCredentials, getStoredCredentials, onConnect, hasTriedAutoConnect])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (connection.authType === 'password' && !password) {
      setError('请输入密码')
      return
    }
    if (connection.authType === 'key' && !privateKey) {
      setError('请选择或粘贴私钥')
      return
    }

    const config: ConnectionConfig = {
      host: connection.host,
      port: connection.port,
      username: connection.username,
      authType: connection.authType,
      ...(connection.authType === 'password'
        ? { password }
        : { privateKey, passphrase: passphrase || undefined }),
    }

    // 如果选择保存凭据
    if (saveCredentials) {
      try {
        await fetch('/api/credentials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: connection.id,
            ...config,
          }),
        })
        // 更新连接状态
        updateConnection(connection.id, { hasStoredCredentials: true })
      } catch (err) {
        console.error('Failed to save credentials:', err)
      }
    }

    try {
      await onConnect(config)
    } catch (err) {
      setError(err instanceof Error ? err.message : '连接失败')
    }
  }

  const handleKeyFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (event) => {
        setPrivateKey(event.target?.result as string)
      }
      reader.readAsText(file)
    }
  }

  // 如果正在加载已保存的凭据，显示加载状态
  if (isLoadingCredentials) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-surface rounded-xl shadow-2xl border border-border p-6 w-full max-w-md text-center"
        >
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4" />
          <p className="text-text">正在连接 {connection.name}...</p>
          <button
            onClick={onCancel}
            className="mt-4 px-4 py-2 text-sm text-text-secondary hover:text-text transition-colors"
          >
            取消
          </button>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-surface rounded-xl shadow-2xl border border-border p-6 w-full max-w-md"
      >
        <h3 className="text-lg font-semibold mb-4">快速连接</h3>
        
        {/* 连接信息 */}
        <div className="mb-4 p-3 bg-background rounded-lg">
          <div className="text-sm font-medium">{connection.name}</div>
          <div className="text-xs text-secondary">
            {connection.username}@{connection.host}:{connection.port}
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {connection.authType === 'password' ? (
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1.5 text-text-secondary">密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="输入密码"
                className="input"
                disabled={isLoading}
                autoFocus
              />
            </div>
          ) : (
            <>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1.5 text-text-secondary">私钥</label>
                <div className="space-y-2">
                  <input
                    type="file"
                    onChange={handleKeyFileChange}
                    className="
                      w-full text-sm text-text-secondary
                      file:mr-4 file:py-2 file:px-4 
                      file:rounded-lg file:border-0 
                      file:bg-primary file:text-white 
                      file:cursor-pointer file:transition-all
                      file:hover:bg-primary-hover
                    "
                    disabled={isLoading}
                  />
                  <textarea
                    value={privateKey}
                    onChange={(e) => setPrivateKey(e.target.value)}
                    placeholder="或粘贴私钥内容..."
                    rows={3}
                    className="input font-mono text-xs resize-none"
                    disabled={isLoading}
                  />
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1.5 text-text-secondary">私钥密码（可选）</label>
                <input
                  type="password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder="如果私钥有密码保护，请输入"
                  className="input"
                  disabled={isLoading}
                />
              </div>
            </>
          )}

          {/* 保存凭据选项 */}
          <div className="mb-4">
            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={saveCredentials}
                onChange={(e) => setSaveCredentials(e.target.checked)}
                className="w-4 h-4 text-primary accent-primary rounded"
                disabled={isLoading}
              />
              <span className="text-sm text-text-secondary group-hover:text-text transition-colors">
                记住凭据（加密存储在服务器）
              </span>
            </label>
            <p className="mt-1 text-xs text-text-muted ml-6">
              🔒 凭据将使用 AES-256 加密存储，下次可一键连接
            </p>
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="mb-4 p-3 bg-error/10 border border-error/30 rounded-lg text-error text-sm">
              {error}
            </div>
          )}

          {/* 按钮 */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={isLoading}
              className="flex-1 px-4 py-2 bg-surface border border-border rounded-lg hover:bg-surface-hover transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  连接中...
                </>
              ) : (
                '连接'
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

/**
 * 已保存连接列表组件
 */
export function SavedConnectionList({ onSelect, onQuickConnect }: SavedConnectionListProps) {
  const { savedConnections, deleteConnection, updateConnection, loadConnections, isLoading: isLoadingConnections } = useConnectionsStore()
  const [editingConnection, setEditingConnection] = useState<SavedConnection | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [quickConnectConnection, setQuickConnectConnection] = useState<SavedConnection | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)

  // 组件挂载时加载连接列表
  useEffect(() => {
    loadConnections()
  }, [loadConnections])

  const handleSaveEdit = (updates: Partial<Omit<SavedConnection, 'id' | 'createdAt'>>) => {
    if (editingConnection) {
      updateConnection(editingConnection.id, updates)
      setEditingConnection(null)
    }
  }

  const handleDelete = (id: string) => {
    deleteConnection(id)
    setDeleteConfirmId(null)
  }

  const handleQuickConnect = async (config: ConnectionConfig) => {
    if (!onQuickConnect) return
    setIsConnecting(true)
    try {
      await onQuickConnect(config)
      setQuickConnectConnection(null)
    } finally {
      setIsConnecting(false)
    }
  }

  if (isLoadingConnections) {
    return (
      <div className="text-center py-8 text-secondary">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm">加载连接列表...</p>
      </div>
    )
  }

  if (savedConnections.length === 0) {
    return (
      <div className="text-center py-8 text-secondary">
        <svg
          className="w-12 h-12 mx-auto mb-3 opacity-50"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"
          />
        </svg>
        <p className="text-sm">暂无保存的连接</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-secondary mb-3">已保存的连接</h3>
      <AnimatePresence>
        {savedConnections.map((connection) => (
          <motion.div
            key={connection.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="p-3 bg-surface rounded-lg border border-border hover:border-primary transition-colors group"
          >
            {deleteConfirmId === connection.id ? (
              // 删除确认
              <div className="flex items-center justify-between">
                <span className="text-sm text-error">确定删除？</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleDelete(connection.id)}
                    className="px-3 py-1 bg-error text-white rounded text-sm hover:bg-opacity-90"
                  >
                    删除
                  </button>
                  <button
                    onClick={() => setDeleteConfirmId(null)}
                    className="px-3 py-1 bg-secondary bg-opacity-20 rounded text-sm hover:bg-opacity-30"
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              // 正常显示
              <div className="flex items-center justify-between">
                <button
                  onClick={() => onSelect(connection)}
                  className="flex-1 text-left"
                >
                  <div className="font-medium text-sm flex items-center gap-2">
                    {connection.name}
                    {connection.hasStoredCredentials && (
                      <span className="text-xs text-success" title="已保存凭据，可一键连接">🔑</span>
                    )}
                  </div>
                  <div className="text-xs text-secondary">
                    {connection.username}@{connection.host}:{connection.port}
                  </div>
                </button>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {/* 快速连接按钮 */}
                  {onQuickConnect && (
                    <button
                      onClick={() => setQuickConnectConnection(connection)}
                      className="p-1.5 text-secondary hover:text-success hover:bg-success hover:bg-opacity-10 rounded"
                      title="快速连接"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </button>
                  )}
                  <button
                    onClick={() => setEditingConnection(connection)}
                    className="p-1.5 text-secondary hover:text-primary hover:bg-primary hover:bg-opacity-10 rounded"
                    title="编辑"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={() => setDeleteConfirmId(connection.id)}
                    className="p-1.5 text-secondary hover:text-error hover:bg-error hover:bg-opacity-10 rounded"
                    title="删除"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        ))}
      </AnimatePresence>

      {/* 编辑连接弹窗 */}
      <AnimatePresence>
        {editingConnection && (
          <EditConnectionDialog
            connection={editingConnection}
            onSave={handleSaveEdit}
            onCancel={() => setEditingConnection(null)}
          />
        )}
      </AnimatePresence>

      {/* 快速连接弹窗 */}
      <AnimatePresence>
        {quickConnectConnection && (
          <QuickConnectDialog
            connection={quickConnectConnection}
            onConnect={handleQuickConnect}
            onCancel={() => setQuickConnectConnection(null)}
            isLoading={isConnecting}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
