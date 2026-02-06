import { useState, useCallback, useEffect, useMemo, useRef, memo } from 'react'
import { motion } from 'framer-motion'
import { TabBar, SplitLayout, FileManagerComplete, FileEditor, TerminalPanel, LogPanel, ThemeSelector, LargeFileWarningDialog, isLargeFile, SidePanel } from '../components'
import { useTabsStore, useEditorStore, useThemeStore } from '../store'
import { createLogEntry, addLog as addLogToList, clearLogs as clearLogsList } from '../utils/logs'
import type { FileItem, LogEntry, SessionState } from '../types'

// 当前版本号
const CURRENT_VERSION = '1.1.5'

// 版本检测组件
const VersionBadge = memo(() => {
  const [latestVersion, setLatestVersion] = useState<string | null>(null)
  const [showTooltip, setShowTooltip] = useState(false)
  
  useEffect(() => {
    // 从 GitHub API 获取最新版本
    const checkVersion = async () => {
      try {
        const res = await fetch('https://api.github.com/repos/yangjarod117/flassh/releases/latest')
        if (res.ok) {
          const data = await res.json()
          const version = data.tag_name?.replace('v', '') || null
          if (version && version !== CURRENT_VERSION) {
            setLatestVersion(version)
          }
        }
      } catch {
        // 忽略错误
      }
    }
    checkVersion()
    // 每小时检查一次
    const interval = setInterval(checkVersion, 3600000)
    return () => clearInterval(interval)
  }, [])
  
  const hasUpdate = latestVersion && latestVersion !== CURRENT_VERSION
  
  return (
    <div className="relative" onMouseEnter={() => setShowTooltip(true)} onMouseLeave={() => setShowTooltip(false)}>
      <div className={`px-2 py-1 rounded-lg text-xs font-mono cursor-default transition-all ${hasUpdate ? 'bg-warning/20 text-warning border border-warning/30' : 'bg-surface text-text-secondary border border-border'}`}>
        v{CURRENT_VERSION}
        {hasUpdate && <span className="ml-1 inline-block w-1.5 h-1.5 bg-warning rounded-full animate-pulse" />}
      </div>
      {showTooltip && hasUpdate && (
        <div className="absolute top-full left-0 mt-2 px-3 py-2 bg-surface border border-border rounded-lg shadow-xl z-50 whitespace-nowrap">
          <div className="text-xs text-warning font-medium mb-1">🎉 发现新版本</div>
          <div className="text-xs text-text-secondary">
            当前: <span className="text-text">v{CURRENT_VERSION}</span>
          </div>
          <div className="text-xs text-text-secondary">
            最新: <span className="text-success font-medium">v{latestVersion}</span>
          </div>
          <div className="text-xs text-text-muted mt-1">请更新 Docker 镜像</div>
        </div>
      )}
    </div>
  )
})

// 粒子动画
const ParticleBackground = memo(() => {
  const particles = useMemo(() => Array.from({ length: 20 }, (_, i) => ({
    id: i, x: Math.random() * 100, y: Math.random() * 100,
    size: Math.random() * 2 + 1, duration: Math.random() * 25 + 15, delay: Math.random() * 5,
  })), [])
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map(p => (
        <motion.div key={p.id} className="absolute rounded-full bg-primary/20"
          style={{ width: p.size, height: p.size, left: `${p.x}%`, top: `${p.y}%` }}
          animate={{ y: [0, -20, 0], opacity: [0.1, 0.3, 0.1], scale: [1, 1.1, 1] }}
          transition={{ duration: p.duration, delay: p.delay, repeat: Infinity, ease: 'easeInOut' }} />
      ))}
    </div>
  )
})

// 发光装饰
const GlowAccents = memo(() => (
  <>
    <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(0, 212, 255, 0.06) 0%, transparent 70%)' }} />
    <div className="absolute -bottom-20 -left-20 w-56 h-56 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(168, 85, 247, 0.05) 0%, transparent 70%)' }} />
  </>
))

const MemoizedTerminalPanel = memo(TerminalPanel, (prev, next) => prev.sessionId === next.sessionId && prev.isActive === next.isActive)

interface WorkspacePageProps {
  session: SessionState
  sessions: Map<string, SessionState>
  onDisconnect: () => void
  onAddConnection: () => void
  onSessionReconnect?: (oldSessionId: string, newSessionId: string) => void
}

export function WorkspacePage({ session, sessions, onDisconnect, onAddConnection, onSessionReconnect: _onSessionReconnect }: WorkspacePageProps) {
  const [showLogPanel, setShowLogPanel] = useState(false)
  const [logsMap, setLogsMap] = useState<Map<string, LogEntry[]>>(new Map())
  const [largeFileWarning, setLargeFileWarning] = useState<{ file: FileItem; sessionId: string } | null>(null)
  const [editorState, setEditorState] = useState<{ fileId: string; sessionId: string } | null>(null)
  const terminalWsMapRef = useRef<Map<string, WebSocket>>(new Map())
  
  const { tabs, activeTabId, updateTabConnection } = useTabsStore()
  const { openFile, closeFile, openFiles } = useEditorStore()
  const isLight = useThemeStore().getCurrentTheme().type === 'light'

  const activeTab = tabs.find(t => t.id === activeTabId)
  const currentSession = useMemo(() => activeTab ? sessions.get(activeTab.sessionId) || session : session, [activeTab, sessions, session])
  const activeSessionId = activeTab?.sessionId || currentSession.id
  const sessionEntries = useMemo(() => Array.from(sessions.entries()), [sessions])

  const addLog = useCallback((sessionId: string, log: Omit<LogEntry, 'id' | 'timestamp'>) => {
    setLogsMap(prev => new Map(prev).set(sessionId, addLogToList(prev.get(sessionId) || [], createLogEntry(log.level, log.category, log.message, log.details))))
  }, [])

  useEffect(() => {
    sessions.forEach((s, id) => { if (!logsMap.has(id)) addLog(id, { level: 'info', category: 'connection', message: `已连接到 ${s.config.host}:${s.config.port}`, details: s.config }) })
  }, [sessions, logsMap, addLog])

  useEffect(() => { if (activeTabId) updateTabConnection(activeTabId, session.status === 'connected') }, [activeTabId, session.status, updateTabConnection])

  const loadFile = useCallback(async (file: FileItem, sessionId: string) => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/files/content?path=${encodeURIComponent(file.path)}`)
      if (!res.ok) throw new Error('加载文件失败')
      setEditorState({ fileId: openFile(file.path, (await res.json()).content || ''), sessionId })
      addLog(sessionId, { level: 'info', category: 'file', message: `打开文件: ${file.path}` })
    } catch (e) { addLog(sessionId, { level: 'error', category: 'file', message: `打开文件失败: ${file.path}`, details: { error: e instanceof Error ? e.message : '未知错误' } }) }
  }, [openFile, addLog])

  const openFileHandler = useCallback((file: FileItem, sessionId: string) => {
    isLargeFile(file.size) ? setLargeFileWarning({ file, sessionId }) : loadFile(file, sessionId)
  }, [loadFile])

  const saveFile = useCallback(async (path: string, content: string) => {
    const sid = editorState?.sessionId || activeSessionId
    const res = await fetch(`/api/sessions/${sid}/files/content`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, content }) })
    if (!res.ok) throw new Error('保存失败')
    addLog(sid, { level: 'info', category: 'file', message: `保存文件: ${path}` })
  }, [editorState, activeSessionId, addLog])

  return (
    <div className="h-screen flex flex-col relative overflow-hidden" style={{ background: isLight ? 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 50%, #f8fafc 100%)' : 'linear-gradient(135deg, #0a0e17 0%, #111827 50%, #0d1321 100%)' }}>
      <ParticleBackground />
      <GlowAccents />

      {/* 顶部工具栏 */}
      <header className="flex items-center justify-between px-2 md:px-4 py-2 mx-1 md:mx-2 mt-1 md:mt-2 rounded-xl backdrop-blur-md shrink-0 relative z-[50] bg-surface border border-border">
        <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
          <div className="w-6 h-6 md:w-7 md:h-7 rounded-lg md:rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg flex-shrink-0">
            <svg className="w-3 h-3 md:w-3.5 md:h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
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
          <div className="hidden sm:block"><ThemeSelector /></div>
          <button onClick={() => { addLog(activeSessionId, { level: 'info', category: 'connection', message: `断开连接: ${currentSession.config.host}` }); onDisconnect() }} className="px-2 md:px-3 py-1 md:py-1.5 rounded-lg md:rounded-xl backdrop-blur-sm bg-error/15 text-error hover:bg-error/25 transition-all text-xs md:text-sm border border-error/30">断开</button>
        </div>
      </header>

      <TabBar onAddConnection={onAddConnection} />

      {/* 主内容区 - 使用 pb-2 确保底部不被遮挡 */}
      <main className="flex-1 overflow-hidden relative z-10 pb-2">
        <div className="h-full flex">
          <div className="flex-1">
            <SplitLayout
              left={<div className="w-full h-full relative">{sessionEntries.map(([sid, sess]) => (
                <div key={`fm-${sid}`} className="absolute inset-0 bg-surface" style={{ display: sid === activeSessionId ? 'block' : 'none' }}>
                  <FileManagerComplete sessionId={sid} serverKey={`${sess.config.host}:${sess.config.port}`} onFileEdit={f => openFileHandler(f, sid)} onFileOpen={f => openFileHandler(f, sid)}
                    onOpenTerminalInDir={path => { const ws = terminalWsMapRef.current.get(sid); ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: 'input', sessionId: sid, data: `cd "${path}"\n` })) }} />
                </div>
              ))}</div>}
              right={<div className="w-full h-full relative">{sessionEntries.map(([sid]) => (
                <div key={`term-${sid}`} className="absolute inset-0" style={{ zIndex: sid === activeSessionId ? 10 : 1, pointerEvents: sid === activeSessionId ? 'auto' : 'none' }}>
                  <MemoizedTerminalPanel sessionId={sid} isActive={sid === activeSessionId} onWsReady={ws => terminalWsMapRef.current.set(sid, ws)} />
                </div>
              ))}</div>}
            />
          </div>
          {showLogPanel && <div className="w-80 m-2 ml-0 rounded-2xl overflow-hidden bg-surface border border-border"><LogPanel logs={logsMap.get(activeSessionId) || []} onClear={() => setLogsMap(prev => new Map(prev).set(activeSessionId, clearLogsList()))} /></div>}
        </div>
      </main>

      {/* 文件编辑器弹窗 */}
      {editorState && openFiles.has(editorState.fileId) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-surface/95 backdrop-blur-md rounded-2xl shadow-2xl border border-white/10 overflow-hidden" style={{ width: '80vw', height: '80vh', maxWidth: '1200px', maxHeight: '800px' }}>
            <div className="flex items-center justify-between px-4 py-2 bg-surface/50 border-b border-white/5">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                <span className="text-sm font-medium text-text truncate max-w-md">{editorState.fileId}</span>
              </div>
              <button onClick={() => { closeFile(editorState.fileId); setEditorState(null) }} className="p-1.5 rounded-xl hover:bg-white/10 text-text-secondary hover:text-text transition-colors" title="关闭">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="h-[calc(100%-44px)]"><FileEditor fileId={editorState.fileId} onSave={saveFile} onClose={() => { closeFile(editorState.fileId); setEditorState(null) }} /></div>
          </div>
        </div>
      )}

      {largeFileWarning && <LargeFileWarningDialog isOpen onClose={() => setLargeFileWarning(null)} onConfirm={() => { loadFile(largeFileWarning.file, largeFileWarning.sessionId); setLargeFileWarning(null) }} fileName={largeFileWarning.file.name} fileSize={largeFileWarning.file.size} />}

      {/* 侧边面板 */}
      {sessionEntries.map(([sid]) => sid === activeSessionId && <SidePanel key={`sp-${sid}`} sessionId={sid} />)}
    </div>
  )
}
