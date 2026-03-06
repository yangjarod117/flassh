import { useState, useCallback, useMemo, memo } from 'react'
import { ConnectionForm, SavedConnectionList, ThemeSelector } from '../components'
import { useConnectionsStore, useThemeStore } from '../store'
import { getSystemThemePreference } from '../store/theme'
import type { ConnectionConfig, SavedConnection } from '../types'

interface ConnectionPageProps {
  onConnect: (config: ConnectionConfig, connectionName?: string) => Promise<void>
  onBack?: () => void
}

// 粒子动画组件 - CSS 动画替代 framer-motion，减少 JS 开销
const ParticleBackground = memo(() => {
  const particles = useMemo(() => 
    Array.from({ length: 20 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 3 + 1,
      duration: Math.random() * 20 + 10,
      delay: Math.random() * 5,
    })), []
  )

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full bg-primary/30 animate-float"
          style={{
            width: p.size,
            height: p.size,
            left: `${p.x}%`,
            top: `${p.y}%`,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  )
})

// 发光圆环装饰 - 纯 CSS 动画
const GlowRings = memo(() => (
  <>
    <div
      className="absolute -top-32 -right-32 w-96 h-96 rounded-full animate-glow-pulse"
      style={{
        background: 'radial-gradient(circle, rgba(0, 212, 255, 0.12) 0%, transparent 70%)',
        animationDuration: '8s',
      }}
    />
    <div
      className="absolute -bottom-32 -left-32 w-80 h-80 rounded-full animate-glow-pulse"
      style={{
        background: 'radial-gradient(circle, rgba(168, 85, 247, 0.1) 0%, transparent 70%)',
        animationDuration: '10s',
        animationDelay: '2s',
      }}
    />
  </>
))

export function ConnectionPage({ onConnect, onBack }: ConnectionPageProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedConnection, setSelectedConnection] = useState<SavedConnection | null>(null)
  
  const { saveConnection, updateLastUsed } = useConnectionsStore()
  const currentThemeId = useThemeStore(s => s.currentThemeId)
  const followSystemTheme = useThemeStore(s => s.followSystemTheme)
  const isLight = (followSystemTheme ? getSystemThemePreference() : currentThemeId) === 'light'

  const handleConnect = useCallback(async (config: ConnectionConfig, saveInfo?: { save: boolean; name: string; saveCredentials?: boolean }) => {
    setIsLoading(true)
    setError(null)
    try {
      await onConnect(config, selectedConnection?.name || saveInfo?.name)
      if (saveInfo?.save) {
        await saveConnection(config, saveInfo.name, saveInfo.saveCredentials)
      }
      if (selectedConnection) {
        updateLastUsed(selectedConnection.id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '连接失败')
    } finally {
      setIsLoading(false)
    }
  }, [onConnect, selectedConnection, updateLastUsed, saveConnection])

  const handleSelectSaved = useCallback((connection: SavedConnection) => {
    setSelectedConnection(connection)
  }, [])

  const handleQuickConnect = useCallback(async (config: ConnectionConfig) => {
    setError(null)
    const connection = useConnectionsStore.getState().savedConnections.find(
      c => c.host === config.host && c.username === config.username && c.port === config.port
    )
    await onConnect(config, connection?.name)
    if (connection) {
      updateLastUsed(connection.id)
    }
  }, [onConnect, updateLastUsed])

  return (
    <div 
      className="h-screen flex flex-col relative overflow-hidden"
      style={{
        background: isLight 
          ? 'linear-gradient(135deg, #f0f4f8 0%, #e2e8f0 50%, #f0f4f8 100%)'
          : 'linear-gradient(135deg, #0a0e17 0%, #1a1a2e 50%, #0d1321 100%)',
      }}
    >
      {/* 动态背景 */}
      <ParticleBackground />
      <GlowRings />

      {/* 顶部工具栏 */}
      <header 
        className="flex items-center justify-between px-4 py-3 backdrop-blur-md shrink-0 relative z-20"
        style={{
          background: isLight ? 'rgba(255, 255, 255, 0.6)' : 'rgba(17, 24, 39, 0.5)',
          borderBottom: `1px solid ${isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(0, 212, 255, 0.1)'}`,
        }}
      >
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 rounded-lg hover:bg-primary/10 text-text-secondary hover:text-primary transition-colors"
              title="返回工作区"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
          )}
          
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-primary to-accent flex items-center justify-center"
              style={{ boxShadow: '0 2px 10px rgba(0, 212, 255, 0.3)' }}
            >
              <img src="/vite.svg" alt="Flassh" className="w-5 h-5" />
            </div>
            <h1 className="text-lg font-semibold text-text">
              {onBack ? '添加新连接' : 'Flassh'}
            </h1>
          </div>
        </div>
        
        <ThemeSelector />
      </header>

      {/* 主内容区 */}
      <main className="flex-1 flex items-center justify-center p-4 md:p-4 p-2 relative z-10 overflow-auto">
        <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* 连接表单 */}
          <div className="animate-in" style={{ animation: 'fadeSlideLeft 0.3s ease-out both' }}>
            <ConnectionForm
              onConnect={handleConnect}
              isLoading={isLoading}
              isEditMode={!!selectedConnection}
              initialConfig={selectedConnection ? {
                host: selectedConnection.host,
                port: selectedConnection.port,
                username: selectedConnection.username,
                authType: selectedConnection.authType,
              } : undefined}
            />
            
            {error && (
              <div
                className="mt-3 p-3 rounded-lg text-error text-sm animate-slide-in"
                style={{
                  background: 'rgba(255, 71, 87, 0.1)',
                  border: '1px solid rgba(255, 71, 87, 0.3)',
                }}
              >
                {error}
              </div>
            )}
          </div>

          {/* 已保存的连接列表 */}
          <div
            className="rounded-xl p-4 backdrop-blur-md animate-in"
            style={{
              background: isLight ? 'rgba(255, 255, 255, 0.7)' : 'rgba(17, 24, 39, 0.5)',
              border: `1px solid ${isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(0, 212, 255, 0.15)'}`,
              animation: 'fadeSlideRight 0.3s ease-out 0.1s both',
            }}
          >
            <SavedConnectionList
              onSelect={handleSelectSaved}
              onQuickConnect={handleQuickConnect}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
