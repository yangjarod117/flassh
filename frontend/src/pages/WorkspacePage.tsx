import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import {
  TabBar,
  SplitLayout,
  FileManagerComplete,
  FileEditor,
  TerminalPanel,
  LogPanel,
  ThemeSelector,
  LargeFileWarningDialog,
  isLargeFile,
  SystemMonitor,
} from '../components'
import { useTabsStore, useEditorStore } from '../store'
import { createLogEntry, addLog as addLogToList, clearLogs as clearLogsList } from '../utils/logs'
import type { FileItem, LogEntry, SessionState } from '../types'

interface WorkspacePageProps {
  session: SessionState
  sessions: Map<string, SessionState>
  onDisconnect: () => void
  onAddConnection: () => void
}

/**
 * 工作区页面组件
 * 集成终端、文件管理器、编辑器和日志面板
 * Requirements: 2.1-2.5, 3.1-3.8, 4.1-4.6, 10.1-10.7, 11.1-11.6, 12.1-12.7
 */
export function WorkspacePage({ session, sessions, onDisconnect, onAddConnection }: WorkspacePageProps) {
  const [showLogPanel, setShowLogPanel] = useState(false)
  const terminalWsRef = useRef<WebSocket | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [largeFileWarning, setLargeFileWarning] = useState<{ file: FileItem } | null>(null)
  const [showEditor, setShowEditor] = useState(false)
  
  const { tabs, activeTabId, updateTabConnection } = useTabsStore()
  const { openFile, closeFile, activeFileId, openFiles } = useEditorStore()

  // 获取当前标签页对应的会话（提前声明，避免使用前未定义）
  const activeTab = tabs.find(t => t.id === activeTabId)
  const currentSession = useMemo(() => {
    return activeTab ? sessions.get(activeTab.sessionId) || session : session
  }, [activeTab, sessions, session])

  // 添加日志的辅助函数
  const addLog = useCallback((log: Omit<LogEntry, 'id' | 'timestamp'>) => {
    const newLog = createLogEntry(log.level, log.category, log.message, log.details)
    setLogs(prev => addLogToList(prev, newLog))
  }, [])

  // 初始化日志
  useEffect(() => {
    // 记录连接日志
    addLog({
      level: 'info',
      category: 'connection',
      message: `已连接到 ${session.config.host}:${session.config.port}`,
      details: {
        host: session.config.host,
        port: session.config.port,
        username: session.config.username,
      },
    })
  }, [session, addLog])

  // 更新标签页连接状态
  useEffect(() => {
    if (activeTabId) {
      updateTabConnection(activeTabId, session.status === 'connected')
    }
  }, [activeTabId, session.status, updateTabConnection])

  // 加载文件内容
  const loadFileContent = useCallback(async (file: FileItem) => {
    // 检查大文件
    if (isLargeFile(file.size)) {
      setLargeFileWarning({ file })
      return
    }

    await doLoadFile(file)
  }, [])

  // 实际加载文件
  const doLoadFile = useCallback(async (file: FileItem) => {
    try {
      const response = await fetch(
        `/api/sessions/${currentSession.id}/files/content?path=${encodeURIComponent(file.path)}`
      )
      if (response.ok) {
        const data = await response.json()
        openFile(file.path, data.content || '')
        setShowEditor(true) // 打开编辑器弹窗
        
        // 记录日志
        addLog({
          level: 'info',
          category: 'file',
          message: `打开文件: ${file.path}`,
        })
      } else {
        throw new Error('加载文件失败')
      }
    } catch (error) {
      addLog({
        level: 'error',
        category: 'file',
        message: `打开文件失败: ${file.path}`,
        details: { error: error instanceof Error ? error.message : '未知错误' },
      })
    }
  }, [currentSession.id, openFile, addLog])

  // 保存文件
  const handleSaveFile = useCallback(async (path: string, content: string) => {
    try {
      const response = await fetch(`/api/sessions/${currentSession.id}/files/content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, content }),
      })
      
      if (!response.ok) {
        throw new Error('保存失败')
      }
      
      // 记录日志
      addLog({
        level: 'info',
        category: 'file',
        message: `保存文件: ${path}`,
      })
    } catch (error) {
      addLog({
        level: 'error',
        category: 'file',
        message: `保存文件失败: ${path}`,
        details: { error: error instanceof Error ? error.message : '未知错误' },
      })
      throw error
    }
  }, [currentSession.id, addLog])

  // 关闭编辑器
  const handleCloseEditor = useCallback(() => {
    if (activeFileId) {
      closeFile(activeFileId)
    }
    setShowEditor(false)
  }, [activeFileId, closeFile])

  // 清空日志
  const handleClearLogs = useCallback(() => {
    setLogs(clearLogsList())
  }, [])

  // 处理断开连接
  const handleDisconnect = useCallback(() => {
    addLog({
      level: 'info',
      category: 'connection',
      message: `断开连接: ${session.config.host}`,
    })
    onDisconnect()
  }, [session.config.host, onDisconnect, addLog])

  // 处理大文件警告确认
  const handleLargeFileConfirm = useCallback(() => {
    if (largeFileWarning) {
      doLoadFile(largeFileWarning.file)
      setLargeFileWarning(null)
    }
  }, [largeFileWarning, doLoadFile])

  const hasOpenFile = activeFileId && openFiles.has(activeFileId)

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* 顶部工具栏 */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-border bg-surface/50">
        <div className="flex items-center gap-3">
          {/* Logo */}
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          
          {/* 连接信息 */}
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${currentSession.status === 'connected' ? 'bg-success' : 'bg-error'}`} />
            <span className="text-sm text-text">
              {currentSession.config.username}@{currentSession.config.host}:{currentSession.config.port}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* 添加新连接按钮 */}
          <button
            onClick={onAddConnection}
            className="p-2 rounded-lg hover:bg-surface text-text-secondary hover:text-success transition-colors"
            title="添加新连接"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          
          {/* 日志按钮 */}
          <button
            onClick={() => setShowLogPanel(!showLogPanel)}
            className={`p-2 rounded-lg transition-colors ${showLogPanel ? 'bg-primary text-white' : 'hover:bg-surface text-text-secondary'}`}
            title="日志面板"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </button>
          
          {/* 主题切换 */}
          <ThemeSelector />
          
          {/* 断开连接按钮 */}
          <button
            onClick={handleDisconnect}
            className="px-3 py-1.5 rounded-lg bg-error/10 text-error hover:bg-error/20 transition-colors text-sm"
          >
            断开连接
          </button>
        </div>
      </header>

      {/* 标签页栏 */}
      <TabBar onAddConnection={onAddConnection} />

      {/* 主内容区 */}
      <main className="flex-1 overflow-hidden">
        {showLogPanel ? (
          /* 日志面板模式 */
          <div className="h-full flex">
            <div className="flex-1">
              <SplitLayout
                left={
                  <FileManagerComplete
                    sessionId={currentSession.id}
                    onFileEdit={loadFileContent}
                    onFileOpen={loadFileContent}
                    onOpenTerminalInDir={(path) => {
                      // 在终端中执行 cd 命令
                      const ws = terminalWsRef.current
                      if (ws?.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({
                          type: 'input',
                          sessionId: activeTab?.sessionId || currentSession.id,
                          data: `cd "${path}"\n`,
                        }))
                      }
                    }}
                  />
                }
                right={
                  <TerminalPanel
                    sessionId={activeTab?.sessionId || currentSession.id}
                    onWsReady={(ws) => { terminalWsRef.current = ws }}
                  />
                }
              />
            </div>
            <div className="w-80 border-l border-border">
              <LogPanel
                logs={logs}
                onClear={handleClearLogs}
              />
            </div>
          </div>
        ) : (
          /* 正常模式 */
          <SplitLayout
            left={
              <FileManagerComplete
                sessionId={currentSession.id}
                onFileEdit={loadFileContent}
                onFileOpen={loadFileContent}
                onOpenTerminalInDir={(path) => {
                  // 在终端中执行 cd 命令
                  const ws = terminalWsRef.current
                  if (ws?.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                      type: 'input',
                      sessionId: activeTab?.sessionId || currentSession.id,
                      data: `cd "${path}"\n`,
                    }))
                  }
                }}
              />
            }
            right={
              <TerminalPanel
                sessionId={activeTab?.sessionId || currentSession.id}
                onWsReady={(ws) => { terminalWsRef.current = ws }}
              />
            }
          />
        )}
      </main>

      {/* 文件编辑器弹窗 */}
      {showEditor && hasOpenFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div 
            className="bg-surface rounded-xl shadow-2xl border border-border overflow-hidden"
            style={{ width: '80vw', height: '80vh', maxWidth: '1200px', maxHeight: '800px' }}
          >
            {/* 弹窗标题栏 */}
            <div className="flex items-center justify-between px-4 py-2 bg-surface/80 border-b border-border">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="text-sm font-medium text-text truncate max-w-md">
                  {activeFileId}
                </span>
              </div>
              <button
                onClick={handleCloseEditor}
                className="p-1.5 rounded-lg hover:bg-surface text-text-secondary hover:text-text transition-colors"
                title="关闭"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* 编辑器内容 */}
            <div className="h-[calc(100%-44px)]">
              <FileEditor
                fileId={activeFileId!}
                onSave={handleSaveFile}
                onClose={handleCloseEditor}
              />
            </div>
          </div>
        </div>
      )}

      {/* 大文件警告对话框 */}
      {largeFileWarning && (
        <LargeFileWarningDialog
          isOpen={true}
          onClose={() => setLargeFileWarning(null)}
          onConfirm={handleLargeFileConfirm}
          fileName={largeFileWarning.file.name}
          fileSize={largeFileWarning.file.size}
        />
      )}

      {/* 系统监控面板 */}
      <SystemMonitor sessionId={currentSession.id} />
    </div>
  )
}
