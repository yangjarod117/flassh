import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useThemeStore } from '../store'
import { getSystemThemePreference } from '../store/theme'
import type { ConnectionConfig } from '../types'

interface ConnectionFormProps {
  onConnect: (config: ConnectionConfig, saveConnection?: { save: boolean; name: string; saveCredentials?: boolean }) => Promise<void>
  isLoading?: boolean
  initialConfig?: Partial<ConnectionConfig>
  isEditMode?: boolean
}

export function ConnectionForm({ onConnect, isLoading = false, initialConfig, isEditMode = false }: ConnectionFormProps) {
  const [host, setHost] = useState(initialConfig?.host || '')
  const [port, setPort] = useState(String(initialConfig?.port || 22))
  const [username, setUsername] = useState(initialConfig?.username || '')
  const [authType, setAuthType] = useState<'password' | 'key'>(initialConfig?.authType || 'password')
  const [password, setPassword] = useState('')
  const [privateKey, setPrivateKey] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [saveConnection, setSaveConnection] = useState(false)
  const [saveCredentials, setSaveCredentials] = useState(false)
  const [connectionName, setConnectionName] = useState('')
  const [error, setError] = useState('')
  
  const currentThemeId = useThemeStore(s => s.currentThemeId)
  const followSystemTheme = useThemeStore(s => s.followSystemTheme)
  const isLight = (followSystemTheme ? getSystemThemePreference() : currentThemeId) === 'light'

  useEffect(() => {
    if (initialConfig) {
      setHost(initialConfig.host || '')
      setPort(String(initialConfig.port || 22))
      setUsername(initialConfig.username || '')
      setAuthType(initialConfig.authType || 'password')
      setPassword('')
      setPrivateKey('')
      setPassphrase('')
      setSaveConnection(false)
      setConnectionName('')
    }
  }, [initialConfig])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!host.trim()) { setError('请输入服务器地址'); return }
    if (!username.trim()) { setError('请输入用户名'); return }
    if (authType === 'password' && !password) { setError('请输入密码'); return }
    if (authType === 'key' && !privateKey) { setError('请选择或粘贴私钥'); return }

    const config: ConnectionConfig = {
      host: host.trim(),
      port: parseInt(port, 10) || 22,
      username: username.trim(),
      authType,
      ...(authType === 'password' ? { password } : { privateKey, passphrase: passphrase || undefined }),
    }

    try {
      await onConnect(config, saveConnection ? { save: true, name: connectionName.trim() || `${username}@${host}`, saveCredentials } : undefined)
    } catch (err) {
      setError(err instanceof Error ? err.message : '连接失败')
    }
  }

  const handleKeyFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (event) => setPrivateKey(event.target?.result as string)
      reader.readAsText(file)
    }
  }

  const inputClass = "w-full px-3 py-2 rounded-lg text-text placeholder:text-text-muted/60 transition-all outline-none border focus:ring-2 focus:ring-primary/20"
  const inputStyle = {
    background: isLight ? 'rgba(255, 255, 255, 0.5)' : 'rgba(30, 41, 59, 0.5)',
    borderColor: isLight ? 'rgba(0, 0, 0, 0.1)' : 'rgba(100, 116, 139, 0.3)',
  }

  return (
    <form
      className="w-full max-w-md mx-auto p-5 rounded-xl backdrop-blur-md"
      style={{
        background: isLight ? 'rgba(255, 255, 255, 0.7)' : 'rgba(17, 24, 39, 0.5)',
        border: `1px solid ${isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(0, 212, 255, 0.15)'}`,
      }}
      onSubmit={handleSubmit}
    >
      <h2 className="text-lg font-semibold text-text text-center mb-4">SSH 连接</h2>

      {/* 服务器地址 */}
      <div className="mb-3">
        <label className="block text-sm text-text-secondary mb-1">服务器地址</label>
        <input
          type="text"
          value={host}
          onChange={(e) => setHost(e.target.value)}
          placeholder="example.com"
          className={inputClass}
          style={inputStyle}
          disabled={isLoading}
        />
      </div>

      {/* 用户名和端口 */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-sm text-text-secondary mb-1">用户名</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="root"
            className={inputClass}
            style={inputStyle}
            disabled={isLoading}
          />
        </div>
        <div>
          <label className="block text-sm text-text-secondary mb-1">端口</label>
          <input
            type="number"
            value={port}
            onChange={(e) => setPort(e.target.value)}
            placeholder="22"
            className={inputClass}
            style={inputStyle}
            disabled={isLoading}
          />
        </div>
      </div>

      {/* 认证方式 */}
      <div className="mb-3">
        <label className="block text-sm text-text-secondary mb-2">认证方式</label>
        <div className="flex gap-2">
          {(['password', 'key'] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setAuthType(type)}
              className={`flex-1 py-2 px-3 rounded-lg text-sm transition-all ${
                authType === type
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'text-text-secondary border hover:bg-surface/30'
              }`}
              style={authType !== type ? { 
                borderColor: isLight ? 'rgba(0, 0, 0, 0.1)' : 'rgba(100, 116, 139, 0.3)',
                background: isLight ? 'rgba(255, 255, 255, 0.3)' : 'rgba(30, 41, 59, 0.3)',
              } : undefined}
              disabled={isLoading}
            >
              {type === 'password' ? '🔑 密码' : '🔐 密钥'}
            </button>
          ))}
        </div>
      </div>

      {/* 密码/密钥输入 */}
      <AnimatePresence mode="wait">
        {authType === 'password' ? (
          <motion.div
            key="password"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-3 overflow-hidden"
          >
            <label className="block text-sm text-text-secondary mb-1">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="输入密码"
              className={inputClass}
              style={inputStyle}
              disabled={isLoading}
            />
          </motion.div>
        ) : (
          <motion.div
            key="key"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-3 overflow-hidden space-y-2"
          >
            <label className="block text-sm text-text-secondary">私钥</label>
            <label 
              className="flex items-center justify-center gap-2 py-2 px-3 rounded-lg cursor-pointer text-primary text-sm transition-colors"
              style={{
                background: isLight ? 'rgba(14, 165, 233, 0.1)' : 'rgba(0, 212, 255, 0.1)',
                border: `1px dashed ${isLight ? 'rgba(14, 165, 233, 0.3)' : 'rgba(0, 212, 255, 0.3)'}`,
              }}
            >
              <span>📁 选择私钥文件</span>
              <input type="file" onChange={handleKeyFileChange} className="sr-only" disabled={isLoading} />
            </label>
            <textarea
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              placeholder="或粘贴私钥内容..."
              rows={3}
              className={`${inputClass} font-mono text-xs resize-none`}
              style={inputStyle}
              disabled={isLoading}
            />
            <input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="私钥密码（可选）"
              className={inputClass}
              style={inputStyle}
              disabled={isLoading}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 错误提示 */}
      {error && (
        <div className="mb-3 p-2 rounded-lg bg-error/10 border border-error/30 text-error text-sm">
          {error}
        </div>
      )}

      {/* 保存连接选项 */}
      {!isEditMode && (
        <div className="mb-4">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-text-secondary hover:text-text">
            <input
              type="checkbox"
              checked={saveConnection}
              onChange={(e) => setSaveConnection(e.target.checked)}
              className="w-4 h-4 accent-primary"
              disabled={isLoading}
            />
            保存此连接
          </label>
          
          {saveConnection && (
            <div className="mt-2 space-y-2 pl-6">
              <input
                type="text"
                value={connectionName}
                onChange={(e) => setConnectionName(e.target.value)}
                placeholder={`连接名称（默认：${username || 'user'}@${host || 'host'}）`}
                className={`${inputClass} text-sm`}
                style={inputStyle}
                disabled={isLoading}
              />
              <label className="flex items-center gap-2 cursor-pointer text-sm text-text-secondary hover:text-text">
                <input
                  type="checkbox"
                  checked={saveCredentials}
                  onChange={(e) => setSaveCredentials(e.target.checked)}
                  className="w-4 h-4 accent-primary"
                  disabled={isLoading}
                />
                记住凭据（加密存储）
              </label>
            </div>
          )}
        </div>
      )}

      {/* 连接按钮 */}
      <button
        type="submit"
        disabled={isLoading}
        className="w-full py-2.5 rounded-lg text-white font-medium flex items-center justify-center gap-2 transition-all disabled:opacity-60"
        style={{
          background: 'linear-gradient(135deg, var(--color-primary) 0%, #0099cc 100%)',
          boxShadow: isLoading ? 'none' : '0 4px 15px rgba(0, 212, 255, 0.3)',
        }}
      >
        {isLoading ? (
          <>
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            连接中...
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            连接
          </>
        )}
      </button>
    </form>
  )
}
