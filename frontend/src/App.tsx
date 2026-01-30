import { useState, useCallback, useEffect, lazy, Suspense } from 'react'
import { ThemeProvider, ErrorBoundary, setupGlobalErrorHandlers } from './components'
import { useTabsStore, useThemeStore } from './store'
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
        <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center animate-pulse">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
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
  // 多会话支持：使用 Map 存储多个会话
  const [sessions, setSessions] = useState<Map<string, SessionState>>(new Map())
  const [showConnectionPage, setShowConnectionPage] = useState(true)
  const { addTab, removeTab, tabs, activeTabId } = useTabsStore()
  const { getUIFontFamily } = useThemeStore()
  const uiFontFamily = getUIFontFamily()

  // 获取当前活动的会话
  const activeSession = activeTabId 
    ? sessions.get(tabs.find(t => t.id === activeTabId)?.sessionId || '')
    : null

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

    // 从会话列表中移除
    setSessions(prev => {
      const newMap = new Map(prev)
      newMap.delete(activeSession.id)
      return newMap
    })

    // 记录日志
    const log = createLogEntry('info', 'connection', `已断开连接: ${activeSession.config.host}`)
    console.log('Disconnect logged:', log)
  }, [activeSession, tabs, removeTab])

  // 添加新连接（显示连接页面）
  const handleAddConnection = useCallback(() => {
    setShowConnectionPage(true)
  }, [])

  // 当所有标签页关闭时显示连接页面
  useEffect(() => {
    if (tabs.length === 0) {
      setShowConnectionPage(true)
      setSessions(new Map())
    }
  }, [tabs.length])

  return (
    <div className="min-h-screen bg-background text-text" style={{ fontFamily: uiFontFamily }}>
      {/* 跳过导航链接 (无障碍) */}
      <a href="#main-content" className="skip-link">
        跳过导航
      </a>
      
      <Suspense fallback={<LoadingFallback />}>
        {showConnectionPage || tabs.length === 0 ? (
          <ConnectionPage 
            onConnect={handleConnect}
            onBack={tabs.length > 0 || sessions.size > 0 ? () => setShowConnectionPage(false) : undefined}
          />
        ) : activeSession && activeSession.status === 'connected' ? (
          <WorkspacePage
            session={activeSession}
            sessions={sessions}
            onDisconnect={handleDisconnect}
            onAddConnection={handleAddConnection}
          />
        ) : (
          <ConnectionPage 
            onConnect={handleConnect}
            onBack={tabs.length > 0 || sessions.size > 0 ? () => setShowConnectionPage(false) : undefined}
          />
        )}
      </Suspense>
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
