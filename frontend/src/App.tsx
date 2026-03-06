import { useState, useCallback, useEffect, lazy, Suspense, useRef } from 'react'
import { ThemeProvider, ErrorBoundary, setupGlobalErrorHandlers, cleanupTerminal, AccessPasswordDialog, hashPassword } from './components'
import { useTabsStore, useThemeStore } from './store'
import { getSystemThemePreference } from './store/theme'
import { createLogEntry } from './utils/logs'
import type { ConnectionConfig, SessionState } from './types'

// 懒加载页面组件 (性能优化 - Requirements: 7.1)
const ConnectionPage = lazy(() => import('./pages/ConnectionPage').then(m => ({ default: m.ConnectionPage })))
const WorkspacePage = lazy(() => import('./pages/WorkspacePage').then(m => ({ default: m.WorkspacePage })))

/**
 * 加载中组件
 */
function LoadingFallback() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 mx-auto mb-4 bg-gradient-to-br from-primary to-accent flex items-center justify-center animate-pulse">
          <img src="/vite.svg" alt="Flassh" className="w-7 h-7" />
        </div>
        <p className="text-text-secondary">加载中...</p>
      </div>
    </div>
  )
}

/**
 * 主应用组件
 * 整合所有组件，实现路由（连接页面、工作区页面）
 * Requirements: All
 */
function AppContent() {
  // 访问密码验证状态
  const [accessVerified, setAccessVerified] = useState<boolean | null>(null)
  
  // 多会话支持：使用 Map 存储多个会话
  const [sessions, setSessions] = useState<Map<string, SessionState>>(new Map())
  // 保存完整的连接配置（包括密码/密钥）用于重连
  const connectionConfigsRef = useRef<Map<string, ConnectionConfig>>(new Map())
  const [showConnectionPage, setShowConnectionPage] = useState(true)
  const { addTab, removeTab, tabs, activeTabId } = useTabsStore()
  const currentThemeId = useThemeStore(s => s.currentThemeId)
  const followSystemTheme = useThemeStore(s => s.followSystemTheme)
  const { getUIFontFamily } = useThemeStore()
  const uiFontFamily = getUIFontFamily()
  const isLight = (followSystemTheme ? getSystemThemePreference() : currentThemeId) === 'light'

  // 获取当前活动的会话
  const activeTab = tabs.find(t => t.id === activeTabId)
  const activeSession = activeTab 
    ? sessions.get(activeTab.sessionId)
    : null

  // 判断是否应该显示工作区（有标签页就显示，不管会话状态）
  const shouldShowWorkspace = tabs.length > 0 && !showConnectionPage

  // 检查是否需要访问密码（后端会自动检查 cookie）
  // 只在首次加载时检查一次
  useEffect(() => {
    // 避免重复检查
    if (accessVerified !== null) return
    
    const checkAccess = async () => {
      try {
        const res = await fetch('/api/access/check', {
          credentials: 'include',  // 携带 cookie
        })
        const { required, verified } = await res.json()
        
        if (!required || verified) {
          setAccessVerified(true)
        } else {
          setAccessVerified(false)
        }
      } catch {
        // 如果检查失败，默认不需要密码
        setAccessVerified(true)
      }
    }
    
    checkAccess()
  }, [accessVerified])

  // 处理密码验证
  const handleAccessVerify = useCallback(async (password: string, remember: boolean): Promise<boolean> => {
    try {
      // 先哈希密码
      const hashedPassword = await hashPassword(password)
      
      const res = await fetch('/api/access/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',  // 携带 cookie
        body: JSON.stringify({ password: hashedPassword, remember }),
      })
      
      const data = await res.json()
      
      if (data.success) {
        setAccessVerified(true)
        return true
      }
      
      return false
    } catch {
      return false
    }
  }, [])

  // 设置全局错误处理
  useEffect(() => {
    const cleanup = setupGlobalErrorHandlers((error, source) => {
      const log = createLogEntry('error', 'system', `全局错误: ${error.message}`, { source, stack: error.stack })
      console.error('Global error logged:', log)
    })
    return cleanup
  }, [])

  // 处理连接
  const handleConnect = useCallback(async (config: ConnectionConfig, connectionName?: string) => {
    const sessionId = `session_${Date.now()}`
    
    // 创建会话状态
    const newSession: SessionState = {
      id: sessionId,
      config: {
        host: config.host,
        port: config.port,
        username: config.username,
        authType: config.authType,
      },
      status: 'connecting',
    }
    
    // 添加到会话列表
    setSessions(prev => new Map(prev).set(sessionId, newSession))

    try {
      // 调用后端 API 创建 SSH 会话
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || '连接失败')
      }

      const data = await response.json()
      
      // 保存完整的连接配置用于重连
      connectionConfigsRef.current.set(data.sessionId, config)
      
      // 更新会话状态
      const connectedSession: SessionState = {
        ...newSession,
        id: data.sessionId,
        status: 'connected',
      }
      
      setSessions(prev => {
        const newMap = new Map(prev)
        newMap.delete(sessionId) // 删除临时 ID
        newMap.set(data.sessionId, connectedSession) // 使用服务器返回的 ID
        return newMap
      })

      // 创建标签页
      const tabName = connectionName || `${config.username}@${config.host}`
      addTab(data.sessionId, tabName)

      // 隐藏连接页面，显示工作区
      setShowConnectionPage(false)

      // 记录日志
      const log = createLogEntry('info', 'connection', `成功连接到 ${config.host}:${config.port}`, { username: config.username })
      console.log('Connection logged:', log)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '连接失败'
      
      // 更新会话状态为错误
      setSessions(prev => {
        const newMap = new Map(prev)
        newMap.set(sessionId, {
          ...newSession,
          status: 'error',
          error: errorMessage,
        })
        return newMap
      })

      // 记录错误日志
      const log = createLogEntry('error', 'connection', `连接失败: ${errorMessage}`, { host: config.host, port: config.port })
      console.error('Connection error logged:', log)

      throw error
    }
  }, [addTab])

  // 处理断开连接（断开当前活动的会话）
  const handleDisconnect = useCallback(async () => {
    if (!activeSession) return

    try {
      // 调用后端 API 关闭会话
      await fetch(`/api/sessions/${activeSession.id}`, {
        method: 'DELETE',
      })
    } catch (error) {
      console.error('Failed to close session:', error)
    }

    // 找到并移除该会话的标签页
    const tabToRemove = tabs.find(t => t.sessionId === activeSession.id)
    if (tabToRemove) {
      removeTab(tabToRemove.id)
    }

    // 清理终端实例
    cleanupTerminal(activeSession.id)

    // 从会话列表中移除
    setSessions(prev => {
      const newMap = new Map(prev)
      newMap.delete(activeSession.id)
      return newMap
    })

    // 记录日志
    const log = createLogEntry('info', 'connection', `已断开连接: ${activeSession.config.host}`)
    console.log('Disconnect logged:', log)
    
    // 清理连接配置
    connectionConfigsRef.current.delete(activeSession.id)
  }, [activeSession, tabs, removeTab])

  // 添加新连接（显示连接页面）
  const handleAddConnection = useCallback(() => {
    setShowConnectionPage(true)
  }, [])

  // 处理会话重连（服务器重启后）
  const handleSessionReconnect = useCallback(async (oldSessionId: string): Promise<string | null> => {
    // 获取保存的连接配置
    const config = connectionConfigsRef.current.get(oldSessionId)
    if (!config) {
      console.log(`[Reconnect] No saved config for session ${oldSessionId}`)
      return null
    }

    try {
      // 用保存的凭据重新创建 SSH 连接
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || '重连失败')
      }

      const data = await response.json()
      const newSessionId = data.sessionId

      // 更新会话映射
      setSessions(prev => {
        const newMap = new Map(prev)
        const oldSession = newMap.get(oldSessionId)
        if (oldSession) {
          newMap.delete(oldSessionId)
          newMap.set(newSessionId, { ...oldSession, id: newSessionId, status: 'connected' })
        }
        return newMap
      })

      // 更新连接配置映射
      connectionConfigsRef.current.delete(oldSessionId)
      connectionConfigsRef.current.set(newSessionId, config)

      // 更新标签页的 sessionId
      const tab = tabs.find(t => t.sessionId === oldSessionId)
      if (tab) {
        const { updateTabSessionId } = useTabsStore.getState()
        updateTabSessionId(tab.id, newSessionId)
      }

      // 清理旧的断开的 session（释放后端内存）
      fetch(`/api/sessions/${oldSessionId}`, { method: 'DELETE' }).catch(() => {})

      console.log(`[Reconnect] Session reconnected: ${oldSessionId} -> ${newSessionId}`)
      return newSessionId
    } catch (error) {
      console.error(`[Reconnect] Failed to reconnect session ${oldSessionId}:`, error)
      return null
    }
  }, [tabs])

  // 当所有标签页关闭时显示连接页面
  useEffect(() => {
    if (tabs.length === 0) {
      setShowConnectionPage(true)
      setSessions(new Map())
    }
  }, [tabs.length])

  // 页面关闭/刷新时断开所有连接
  useEffect(() => {
    const disconnectAllSessions = () => {
      // 使用 sendBeacon 发送断开请求（即使页面关闭也能发送）
      sessions.forEach((session) => {
        if (session.status === 'connected') {
          // sendBeacon 是异步的，但在页面关闭时仍能发送
          navigator.sendBeacon(`/api/sessions/${session.id}/disconnect`, '')
        }
      })
    }

    window.addEventListener('beforeunload', disconnectAllSessions)

    return () => {
      window.removeEventListener('beforeunload', disconnectAllSessions)
    }
  }, [sessions])

  return (
    <div className="min-h-screen bg-background text-text" style={{ fontFamily: uiFontFamily }}>
      {/* 跳过导航链接 (无障碍) */}
      <a href="#main-content" className="skip-link">
        跳过导航
      </a>
      
      {/* 访问密码验证 */}
      {accessVerified === null ? (
        <LoadingFallback />
      ) : !accessVerified ? (
        <AccessPasswordDialog
          isOpen={true}
          onVerify={handleAccessVerify}
          isLight={isLight}
        />
      ) : (
        <Suspense fallback={<LoadingFallback />}>
          {!shouldShowWorkspace ? (
            <ConnectionPage 
              onConnect={handleConnect}
              onBack={tabs.length > 0 || sessions.size > 0 ? () => setShowConnectionPage(false) : undefined}
            />
          ) : (
            <WorkspacePage
              session={activeSession || { id: activeTab?.sessionId || '', config: { host: '', port: 22, username: '', authType: 'password' }, status: 'disconnected' }}
              sessions={sessions}
              onDisconnect={handleDisconnect}
              onAddConnection={handleAddConnection}
              onSessionReconnect={handleSessionReconnect}
            />
          )}
        </Suspense>
      )}
    </div>
  )
}

/**
 * 根应用组件
 * 包含主题提供者和错误边界
 */
function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </ErrorBoundary>
  )
}

export default App
