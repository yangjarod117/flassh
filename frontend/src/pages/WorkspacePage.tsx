import { useState, useCallback, useEffect, useMemo, useRef, memo } from 'react'
import { TabBar, SplitLayout, FileManagerComplete, FileEditor, TerminalPanel, LogPanel, ThemeSelector, LargeFileWarningDialog, isLargeFile, SidePanel } from '../components'
import { useTabsStore, useEditorStore, useThemeStore } from '../store'
import { getSystemThemePreference } from '../store/theme'
import { createLogEntry, addLog as addLogToList, clearLogs as clearLogsList } from '../utils/logs'
import type { FileItem, LogEntry, SessionState } from '../types'

// 当前版本号
const CURRENT_VERSION = '1.2.2'

// 版本检测组件 - 优化：减少重渲染
const VersionBadge = memo(() => {
  const [latestVersion, setLatestVersion] = useState<string | null>(null)
  const [showTooltip, setShowTooltip] = useState(false)
  
  useEffect(() => {
    let mounted = true
    const checkVersion = async () => {
      try {
        const res = await fetch('https://api.github.com/repos/yangjarod117/flassh/releases/latest')
        if (res.ok && mounted) {
          const data = await res.json()
          const version = data.tag_name?.replace('v', '') || null
          if (version && version !== CURRENT_VERSION) setLatestVersion(version)
        }
      } catch { /* ignore */ }
    }
    checkVersion()
    const interval = setInterval(checkVersion, 3600000)
    return () => { mounted = false; clearInterval(interval) }
  }, [])
  
  const hasUpdate = latestVersion && latestVersion !== CURRENT_VERSION
  
  return (
    <div className="relative" onMouseEnter={() => setShowTooltip(true)} onMouseLeave={() => setShowTooltip(false)}>
      <div className={`px-2 py-1 rounded-lg text-xs font-mono cursor-default transition-all ${hasUpdate ? 'bg-warning/20 text-warning border border-border' : 'bg-surface text-text-secondary border border-border'}`}>
        v{CURRENT_VERSION}
        {hasUpdate && <span className="ml-1 inline-block w-1.5 h-1.5 bg-warning rounded-full animate-pulse" />}
      </div>
      {showTooltip && hasUpdate && (
        <div className="absolute top-full left-0 mt-2 px-3 py-2 bg-surface border border-border rounded-lg shadow-xl z-50 whitespace-nowrap">
          <div className="text-xs text-warning font-medium mb-1">🎉 发现新版本</div>
          <div className="text-xs text-text-secondary">当前: <span className="text-text">v{CURRENT_VERSION}</span></div>
          <div className="text-xs text-text-secondary">最新: <span className="text-success font-medium">v{latestVersion}</span></div>
          <div className="text-xs text-text-muted mt-1">请更新 Docker 镜像</div>
        </div>
      )}
    </div>
  )
})

// 粒子动画 - 优化：使用 CSS 动画替代 framer-motion，减少 JS 开销
const ParticleBackground = memo(() => {
  const particles = useMemo(() => Array.from({ length: 15 }, (_, i) => ({
    id: i, x: Math.random() * 100, y: Math.random() * 100,
    size: Math.random() * 2 + 1, duration: Math.random() * 25 + 15, delay: Math.random() * 5,
  })), [])
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map(p => (
        <div key={p.id} className="absolute rounded-full bg-primary/20 animate-float"
          style={{ width: p.size, height: p.size, left: `${p.x}%`, top: `${p.y}%`, animationDuration: `${p.duration}s`, animationDelay: `${p.delay}s` }} />
      ))}
    </div>
  )
})

// 发光装饰 - 静态组件
const GlowAccents = memo(() => (
  <>
    <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(0, 212, 255, 0.06) 0%, transparent 70%)' }} />
    <div className="absolute -bottom-20 -left-20 w-56 h-56 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(168, 85, 247, 0.05) 0%, transparent 70%)' }} />
  </>
))

// 终端面板 memo 优化
const MemoizedTerminalPanel = memo(TerminalPanel, (prev, next) => prev.sessionId === next.sessionId && prev.isActive === next.isActive && prev.onSessionReconnect === next.onSessionReconnect && prev.onConnectionChange === next.onConnectionChange)

// 文件管理器 memo 优化
const MemoizedFileManager = memo(FileManagerComplete, (prev, next) => 
  prev.sessionId === next.sessionId && prev.serverKey === next.serverKey
)

// 日志面板 memo 优化
const MemoizedLogPanel = memo(LogPanel)

// 主题选择器 memo 优化
const MemoizedThemeSelector = memo(ThemeSelector)

interface WorkspacePageProps {
  session: SessionState
  sessions: Map<string, SessionState>
  onDisconnect: () => void
  onAddConnection: () => void
  onSessionReconnect?: (oldSessionId: string) => Promise<string | null>
}

export function WorkspacePage({ session, sessions, onDisconnect, onAddConnection, onSessionReconnect }: WorkspacePageProps) {
  const [showLogPanel, setShowLogPanel] = useState(false)
  const [logsMap, setLogsMap] = useState<Map<string, LogEntry[]>>(new Map())
  const [largeFileWarning, setLargeFileWarning] = useState<{ file: FileItem; sessionId: string } | null>(null)
  const [editorState, setEditorState] = useState<{ fileId: string; sessionId: string } | null>(null)
  const terminalWsMapRef = useRef<Map<string, WebSocket>>(new Map())
  
  const { tabs, activeTabId, updateTabConnection } = useTabsStore()
  const { openFile, closeFile, openFiles } = useEditorStore()
  const currentThemeId = useThemeStore(s => s.currentThemeId)
  const followSystemTheme = useThemeStore(s => s.followSystemTheme)
  const isLight = (followSystemTheme ? getSystemThemePreference() : currentThemeId) === 'light'

  const activeTab = useMemo(() => tabs.find(t => t.id === activeTabId), [tabs, activeTabId])
  const currentSession = useMemo(() => activeTab ? sessions.get(activeTab.sessionId) || session : session, [activeTab, sessions, session])
  const activeSessionId = activeTab?.sessionId || currentSession.id
  const sessionEntries = useMemo(() => Array.from(sessions.entries()), [sessions])

  // 优化：使用 useCallback 缓存 addLog
  const addLog = useCallback((sessionId: string, log: Omit<LogEntry, 'id' | 'timestamp'>) => {
    setLogsMap(prev => {
      const newMap = new Map(prev)
      newMap.set(sessionId, addLogToList(prev.get(sessionId) || [], createLogEntry(log.level, log.category, log.message, log.details)))
      return newMap
    })
  }, [])

  // 优化：只在 sessions 变化时初始化日志
  useEffect(() => {
    sessions.forEach((s, id) => { 
      if (!logsMap.has(id)) {
        addLog(id, { level: 'info', category: 'connection', message: `已连接到 ${s.config.host}:${s.config.port}`, details: s.config })
      }
    })
  }, [sessions.size]) // 只依赖 size 变化

  // 终端连接状态变化回调 — 通过 sessionId 找到对应 tab 并更新
  const handleConnectionChange = useCallback((sid: string, connected: boolean) => {
    const tab = tabs.find(t => t.sessionId === sid)
    if (tab) updateTabConnection(tab.id, connected)
  }, [tabs, updateTabConnection])

  const loadFile = useCallback(async (file: FileItem, sessionId: string) => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/files/content?path=${encodeURIComponent(file.path)}`)
      if (!res.ok) throw new Error('加载文件失败')
      const data = await res.json()
      setEditorState({ fileId: openFile(file.path, data.content || ''), sessionId })
      addLog(sessionId, { level: 'info', category: 'file', message: `打开文件: ${file.path}` })
    } catch (e) { 
      addLog(sessionId, { level: 'error', category: 'file', message: `打开文件失败: ${file.path}`, details: { error: e instanceof Error ? e.message : '未知错误' } }) 
    }
  }, [openFile, addLog])

  const openFileHandler = useCallback((file: FileItem, sessionId: string) => {
    if (isLargeFile(file.size)) {
      setLargeFileWarning({ file, sessionId })
    } else {
      loadFile(file, sessionId)
    }
  }, [loadFile])

  const saveFile = useCallback(async (path: string, content: string) => {
    const sid = editorState?.sessionId || activeSessionId
    const res = await fetch(`/api/sessions/${sid}/files/content`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, content }) })
    if (!res.ok) throw new Error('保存失败')
    addLog(sid, { level: 'info', category: 'file', message: `保存文件: ${path}` })
  }, [editorState, activeSessionId, addLog])

  // 优化：缓存断开连接处理
  const handleDisconnect = useCallback(() => {
    addLog(activeSessionId, { level: 'info', category: 'connection', message: `断开连接: ${currentSession.config.host}` })
    onDisconnect()
  }, [activeSessionId, currentSession.config.host, addLog, onDisconnect])

  // 优化：缓存日志清除处理
  const handleClearLogs = useCallback(() => {
    setLogsMap(prev => new Map(prev).set(activeSessionId, clearLogsList()))
  }, [activeSessionId])

  // 优化：缓存终端目录切换处理
  const handleOpenTerminalInDir = useCallback((sessionId: string) => (path: string) => {
    const ws = terminalWsMapRef.current.get(sessionId)
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(`{"type":"input","sessionId":"${sessionId}","data":"cd \\"${path}\\"\\n"}`)
    }
  }, [])

  // 优化：缓存 WebSocket ready 处理
  const handleWsReady = useCallback((sessionId: string) => (ws: WebSocket) => {
    terminalWsMapRef.current.set(sessionId, ws)
  }, [])

  // 优化：缓存编辑器关闭处理
  const handleCloseEditor = useCallback(() => {
    if (editorState) {
      closeFile(editorState.fileId)
      setEditorState(null)
    }
  }, [editorState, closeFile])

  // 优化：缓存大文件确认处理
  const handleLargeFileConfirm = useCallback(() => {
    if (largeFileWarning) {
      loadFile(largeFileWarning.file, largeFileWarning.sessionId)
      setLargeFileWarning(null)
    }
  }, [largeFileWarning, loadFile])

  // 优化：缓存当前日志
  const currentLogs = useMemo(() => logsMap.get(activeSessionId) || [], [logsMap, activeSessionId])

  // 优化：背景样式缓存
  const bgStyle = useMemo(() => ({
    background: isLight 
      ? 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 50%, #f8fafc 100%)' 
      : 'linear-gradient(135deg, #0a0e17 0%, #111827 50%, #0d1321 100%)'
  }), [isLight])

  return (
    <div className="h-screen flex flex-col relative overflow-hidden" style={bgStyle}>
      <ParticleBackground />
      <GlowAccents />

      {/* 顶部工具栏 */}
      <header className="flex items-center justify-between px-2 md:px-4 py-2 mx-1 md:mx-2 mt-1 md:mt-2 rounded-xl backdrop-blur-md shrink-0 relative z-[50] bg-surface border border-border">
        <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
          <div className="w-7 h-7 bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg flex-shrink-0">
            <img src="/vite.svg" alt="Flassh" className="w-[18px] h-[18px]" />
          </div>
          <div className="flex items-center gap-1 md:gap-2 min-w-0">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${currentSession.status === 'connected' ? 'bg-success' : 'bg-error'}`} />
            <span className="text-xs md:text-sm text-text truncate">{currentSession.config.username}@{currentSession.config.host}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
          <div className="hidden sm:block"><VersionBadge /></div>
          <button onClick={onAddConnection} className="p-1.5 md:p-2 rounded-lg md:rounded-xl backdrop-blur-sm bg-surface hover:bg-primary/20 text-text-secondary hover:text-success transition-all border border-border" title="添加新连接">
            <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          </button>
          <button onClick={() => setShowLogPanel(!showLogPanel)} className={`hidden sm:flex p-1.5 md:p-2 rounded-lg md:rounded-xl backdrop-blur-sm transition-all border ${showLogPanel ? 'bg-primary/30 text-white border-primary/50' : 'bg-surface hover:bg-primary/20 text-text-secondary border-border'}`} title="日志面板">
            <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          </button>
          <div className="hidden sm:block"><MemoizedThemeSelector /></div>
          <button onClick={handleDisconnect} className="px-2 md:px-3 py-1 md:py-1.5 rounded-lg md:rounded-xl backdrop-blur-sm bg-error/15 text-error hover:bg-error/25 transition-all text-xs md:text-sm border border-border">断开</button>
        </div>
      </header>

      <TabBar onAddConnection={onAddConnection} />

      {/* 主内容区 */}
      <main className="flex-1 overflow-hidden relative z-10 pb-2">
        <div className="h-full flex">
          <div className="flex-1">
            <SplitLayout
              left={<div className="w-full h-full relative">{sessionEntries.map(([sid, sess]) => (
                <div key={`fm-${sid}`} className="absolute inset-0 bg-surface" style={{ display: sid === activeSessionId ? 'block' : 'none' }}>
                  <MemoizedFileManager sessionId={sid} serverKey={`${sess.config.host}:${sess.config.port}`} onFileEdit={f => openFileHandler(f, sid)} onFileOpen={f => openFileHandler(f, sid)}
                    onOpenTerminalInDir={handleOpenTerminalInDir(sid)} />
                </div>
              ))}</div>}
              right={<div className="w-full h-full relative">{sessionEntries.map(([sid]) => (
                <div key={`term-${sid}`} className="absolute inset-0" style={{ zIndex: sid === activeSessionId ? 10 : 1, pointerEvents: sid === activeSessionId ? 'auto' : 'none' }}>
                  <MemoizedTerminalPanel sessionId={sid} isActive={sid === activeSessionId} onWsReady={handleWsReady(sid)} onSessionReconnect={onSessionReconnect} onConnectionChange={handleConnectionChange} />
                </div>
              ))}</div>}
            />
          </div>
          {showLogPanel && <div className="w-80 m-2 ml-0 rounded-2xl overflow-hidden bg-surface border border-border"><MemoizedLogPanel logs={currentLogs} onClear={handleClearLogs} /></div>}
        </div>
      </main>

      {/* 文件编辑器弹窗 */}
      {editorState && openFiles.has(editorState.fileId) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-2 md:p-4">
          <div className="bg-surface/95 backdrop-blur-md rounded-xl md:rounded-2xl shadow-2xl border border-white/10 overflow-hidden w-full h-full md:w-[80vw] md:h-[80vh] md:max-w-[1200px] md:max-h-[800px]">
            <div className="flex items-center justify-between px-3 md:px-4 py-2 bg-surface/50 border-b border-white/5">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <svg className="w-4 h-4 text-primary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                <span className="text-xs md:text-sm font-medium text-text truncate">{editorState.fileId}</span>
              </div>
              <button onClick={handleCloseEditor} className="p-2 md:p-1.5 rounded-lg md:rounded-xl hover:bg-white/10 text-text-secondary hover:text-text transition-colors flex-shrink-0 ml-2" title="关闭">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="h-[calc(100%-44px)]"><FileEditor fileId={editorState.fileId} onSave={saveFile} onClose={handleCloseEditor} /></div>
          </div>
        </div>
      )}

      {largeFileWarning && <LargeFileWarningDialog isOpen onClose={() => setLargeFileWarning(null)} onConfirm={handleLargeFileConfirm} fileName={largeFileWarning.file.name} fileSize={largeFileWarning.file.size} />}

      {/* 侧边面板 */}
      {sessionEntries.map(([sid]) => sid === activeSessionId && <SidePanel key={`sp-${sid}`} sessionId={sid} />)}
    </div>
  )
}
