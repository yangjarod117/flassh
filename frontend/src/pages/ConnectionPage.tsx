import { useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ConnectionForm, SavedConnectionList, ThemeSelector } from '../components'
import { useConnectionsStore, useThemeStore } from '../store'
import type { ConnectionConfig, SavedConnection } from '../types'

interface ConnectionPageProps {
  onConnect: (config: ConnectionConfig, connectionName?: string) => Promise<void>
  onBack?: () => void
}

// 粒子动画组件
function ParticleBackground() {
  const particles = useMemo(() => 
    Array.from({ length: 30 }, (_, i) => ({
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
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          className="absolute rounded-full bg-primary/30"
          style={{
            width: particle.size,
            height: particle.size,
            left: `${particle.x}%`,
            top: `${particle.y}%`,
          }}
          animate={{
            y: [0, -30, 0],
            opacity: [0.2, 0.5, 0.2],
            scale: [1, 1.2, 1],
          }}
          transition={{
            duration: particle.duration,
            delay: particle.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  )
}

// 发光圆环装饰
function GlowRings() {
  return (
    <>
      <motion.div
        className="absolute -top-32 -right-32 w-96 h-96 rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(0, 212, 255, 0.12) 0%, transparent 70%)',
        }}
        animate={{
          scale: [1, 1.1, 1],
          opacity: [0.4, 0.6, 0.4],
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
      <motion.div
        className="absolute -bottom-32 -left-32 w-80 h-80 rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(168, 85, 247, 0.1) 0%, transparent 70%)',
        }}
        animate={{
          scale: [1, 1.15, 1],
          opacity: [0.3, 0.5, 0.3],
        }}
        transition={{
          duration: 10,
          delay: 2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
    </>
  )
}

export function ConnectionPage({ onConnect, onBack }: ConnectionPageProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedConnection, setSelectedConnection] = useState<SavedConnection | null>(null)
  
  const { saveConnection, updateLastUsed } = useConnectionsStore()
  const { currentThemeId } = useThemeStore()
  const isLight = currentThemeId === 'light'

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
    try {
      const connection = useConnectionsStore.getState().savedConnections.find(
        c => c.host === config.host && c.username === config.username && c.port === config.port
      )
      await onConnect(config, connection?.name)
      if (connection) {
        updateLastUsed(connection.id)
      }
    } catch (err) {
      throw err
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
        className="flex items-center justify-between px-4 py-3 backdrop-blur-md shrink-0 relative z-10"
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
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center"
              style={{ boxShadow: '0 2px 10px rgba(0, 212, 255, 0.3)' }}
            >
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
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
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
          >
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
            
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="mt-3 p-3 rounded-lg text-error text-sm"
                  style={{
                    background: 'rgba(255, 71, 87, 0.1)',
                    border: '1px solid rgba(255, 71, 87, 0.3)',
                  }}
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* 已保存的连接列表 */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="rounded-xl p-4 backdrop-blur-md max-h-[40vh] lg:max-h-none overflow-auto"
            style={{
              background: isLight ? 'rgba(255, 255, 255, 0.7)' : 'rgba(17, 24, 39, 0.5)',
              border: `1px solid ${isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(0, 212, 255, 0.15)'}`,
            }}
          >
            <SavedConnectionList
              onSelect={handleSelectSaved}
              onQuickConnect={handleQuickConnect}
            />
          </motion.div>
        </div>
      </main>
    </div>
  )
}
