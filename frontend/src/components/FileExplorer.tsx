import { useState, useEffect, useCallback } from 'react'
import type { FileItem } from '../types'
import { VirtualList } from './VirtualList'

const FILE_ITEM_HEIGHT = 24, VIRTUAL_THRESHOLD = 100, COL_WIDTHS = { size: 55, time: 120 }

// 收藏项类型
export interface FavoriteItem {
  path: string
  name: string
  type: 'file' | 'directory'
}

// 收藏存储 key - 使用 host:port 作为标识，这样刷新后不会丢失
const getFavoritesKey = (sessionId: string) => `flassh-favorites-${sessionId}`

// 加载收藏
export const loadFavorites = (sessionId: string): { directories: FavoriteItem[]; files: FavoriteItem[] } => {
  try {
    const data = localStorage.getItem(getFavoritesKey(sessionId))
    if (data) return JSON.parse(data)
  } catch {}
  return { directories: [], files: [] }
}

// 保存收藏
export const saveFavorites = (sessionId: string, favorites: { directories: FavoriteItem[]; files: FavoriteItem[] }) => {
  localStorage.setItem(getFavoritesKey(sessionId), JSON.stringify(favorites))
}

// 添加收藏
export const addFavorite = (sessionId: string, item: FavoriteItem) => {
  const favorites = loadFavorites(sessionId)
  const list = item.type === 'directory' ? favorites.directories : favorites.files
  if (!list.some(f => f.path === item.path)) {
    list.push(item)
    saveFavorites(sessionId, favorites)
  }
}

// 移除收藏
export const removeFavorite = (sessionId: string, path: string, type: 'file' | 'directory') => {
  const favorites = loadFavorites(sessionId)
  if (type === 'directory') {
    favorites.directories = favorites.directories.filter(f => f.path !== path)
  } else {
    favorites.files = favorites.files.filter(f => f.path !== path)
  }
  saveFavorites(sessionId, favorites)
}

const FILE_COLORS: Record<string, string> = {
  ts: 'text-blue-400', tsx: 'text-blue-400', js: 'text-yellow-400', jsx: 'text-yellow-400',
  py: 'text-green-400', rb: 'text-red-400', go: 'text-cyan-400', rs: 'text-orange-400', java: 'text-red-500',
  json: 'text-yellow-300', yaml: 'text-pink-400', yml: 'text-pink-400', toml: 'text-orange-300', xml: 'text-orange-400',
  md: 'text-blue-300', txt: 'text-gray-400', css: 'text-blue-500', scss: 'text-pink-500', less: 'text-purple-400',
  sh: 'text-green-500', bash: 'text-green-500', html: 'text-orange-500',
}

const FileIcon = ({ type, name }: { type: FileItem['type']; name: string }) => {
  if (type === 'directory') return <svg className="w-5 h-5 text-yellow-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" /></svg>
  if (type === 'symlink') return <svg className="w-5 h-5 text-purple-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
  const ext = name.split('.').pop()?.toLowerCase() || ''
  return <svg className={`w-5 h-5 flex-shrink-0 ${FILE_COLORS[ext] || 'text-secondary'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
}

export const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 B'
  const k = 1024, s = ['B', 'KB', 'MB', 'GB', 'TB'], i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${s[i]}`
}

const formatDateTime = (date: Date) => {
  if (isNaN(date.getTime())) return { date: '--', time: '' }
  try {
    const d = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
    const t = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(date)
    return { date: d, time: t }
  } catch { return { date: '--', time: '' } }
}

const FileRow = ({ file, selected, onSelect, onDblClick, onCtx }: { file: FileItem; selected: boolean; onSelect: () => void; onDblClick: () => void; onCtx: (e: React.MouseEvent) => void }) => {
  const dt = formatDateTime(new Date(file.modifiedTime))
  return (
    <div 
      className={`flex items-center px-3 cursor-pointer select-none ${selected ? 'bg-primary/25 text-primary' : 'text-text-secondary hover:text-text'}`}
      style={{ 
        height: FILE_ITEM_HEIGHT,
        transition: 'background 150ms ease-out, backdrop-filter 150ms ease-out, transform 150ms ease-out',
      }} 
      onClick={onSelect} 
      onDoubleClick={onDblClick} 
      onContextMenu={onCtx}
      onMouseEnter={(e) => {
        if (!selected) {
          e.currentTarget.style.backdropFilter = 'blur(8px)'
          e.currentTarget.style.background = 'rgba(128, 128, 128, 0.15)'
          e.currentTarget.style.transform = 'scale(1.02)'
        }
      }}
      onMouseLeave={(e) => {
        if (!selected) {
          e.currentTarget.style.backdropFilter = ''
          e.currentTarget.style.background = ''
          e.currentTarget.style.transform = ''
        }
      }}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0 h-full"><FileIcon type={file.type} name={file.name} /><span className="flex-1 min-w-0 truncate text-sm">{file.name}</span></div>
      <span className="text-xs text-secondary/70 text-left flex-shrink-0 px-2 truncate" style={{ width: COL_WIDTHS.size }}>{file.type === 'directory' ? '文件夹' : formatFileSize(file.size)}</span>
      <span className="text-xs text-secondary/70 text-right flex-shrink-0 px-2 truncate hidden md:block" style={{ width: COL_WIDTHS.time }}>{dt.date} {dt.time}</span>
    </div>
  )
}

const Breadcrumb = ({ path, onNav }: { path: string; onNav: (p: string) => void }) => {
  const parts = path.split('/').filter(Boolean)
  return (
    <div className="flex items-center gap-1 px-3 py-2 bg-surface/50 border-b border-border overflow-x-auto">
      <button onClick={() => onNav('/')} className="flex items-center gap-1 px-2 py-1 rounded-lg backdrop-blur-sm text-sm text-secondary hover:text-text bg-surface hover:bg-primary/20 transition-all border border-border">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg><span>/</span>
      </button>
      {parts.map((part, i) => {
        const p = '/' + parts.slice(0, i + 1).join('/'), last = i === parts.length - 1
        return (
          <div key={p} className="flex items-center gap-1">
            <svg className="w-4 h-4 text-secondary/50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            <button onClick={() => onNav(p)} className={`px-2 py-1 rounded-lg backdrop-blur-sm text-sm transition-all border ${last ? 'text-text font-medium bg-primary/20 border-primary/40' : 'text-secondary hover:text-text bg-surface hover:bg-primary/20 border-border'}`}>{part}</button>
          </div>
        )
      })}
    </div>
  )
}

export interface FileExplorerProps {
  sessionId: string; currentPath: string; onPathChange: (p: string) => void
  onFileSelect: (f: FileItem) => void; onFileDoubleClick: (f: FileItem) => void
  onContextMenu?: (f: FileItem, pos: { x: number; y: number }) => void
  favoriteKey?: number
  favoriteStoreKey?: string // 用于收藏存储的 key
}

export function FileExplorer({ sessionId, currentPath, onPathChange, onFileSelect, onFileDoubleClick, onContextMenu, favoriteKey = 0, favoriteStoreKey }: FileExplorerProps) {
  const storeKey = favoriteStoreKey || sessionId // 收藏存储用的 key
  const [files, setFiles] = useState<FileItem[]>([])
  const [selected, setSelected] = useState<FileItem | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showFavorites, setShowFavorites] = useState(false)
  const [favTab, setFavTab] = useState<'directories' | 'files'>('directories')
  const [favorites, setFavorites] = useState<{ directories: FavoriteItem[]; files: FavoriteItem[] }>({ directories: [], files: [] })

  // 加载收藏
  useEffect(() => {
    setFavorites(loadFavorites(storeKey))
  }, [storeKey, favoriteKey])

  const load = useCallback(async (path: string) => {
    if (!sessionId) return
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/sessions/${sessionId}/files?path=${encodeURIComponent(path)}`)
      if (!res.ok) throw new Error((await res.json()).message || '加载目录失败')
      setFiles((await res.json()).files.sort((a: FileItem, b: FileItem) => {
        if (a.type === 'directory' && b.type !== 'directory') return -1
        if (a.type !== 'directory' && b.type === 'directory') return 1
        return a.name.localeCompare(b.name)
      }))
    } catch (e) { setError(e instanceof Error ? e.message : '加载目录失败') }
    finally { setLoading(false) }
  }, [sessionId])

  useEffect(() => { load(currentPath) }, [currentPath, load])

  const select = (f: FileItem) => { setSelected(f); onFileSelect(f) }
  const dblClick = (f: FileItem) => f.type === 'directory' ? onPathChange(currentPath === '/' ? `/${f.name}` : `${currentPath}/${f.name}`) : onFileDoubleClick(f)
  const ctx = (e: React.MouseEvent, f: FileItem) => { e.preventDefault(); setSelected(f); onFileSelect(f); onContextMenu?.(f, { x: e.clientX, y: e.clientY }) }
  const goUp = () => { if (currentPath === '/') return; const p = currentPath.split('/').filter(Boolean); p.pop(); onPathChange(p.length ? '/' + p.join('/') : '/') }

  const renderList = () => {
    if (loading) return <div className="flex items-center justify-center h-32"><div className="flex items-center gap-2 text-secondary"><svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg><span>加载中...</span></div></div>
    if (error) return <div className="flex flex-col items-center justify-center h-32 gap-2"><svg className="w-8 h-8 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg><span className="text-error text-sm">{error}</span><button onClick={() => load(currentPath)} className="px-3 py-1 text-sm bg-surface hover:bg-surface/80 rounded transition-colors">重试</button></div>
    if (!files.length) return <div className="flex flex-col items-center justify-center h-32 text-secondary"><svg className="w-8 h-8 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg><span className="text-sm">空目录</span></div>
    const row = (f: FileItem) => <FileRow key={f.path} file={f} selected={selected?.path === f.path} onSelect={() => select(f)} onDblClick={() => dblClick(f)} onCtx={e => ctx(e, f)} />
    return files.length > VIRTUAL_THRESHOLD ? <VirtualList items={files} itemHeight={FILE_ITEM_HEIGHT} renderItem={row} getKey={f => f.path} className="h-full" /> : <div className="h-full overflow-y-auto">{files.map(row)}</div>
  }

  const btnCls = (disabled: boolean) => `p-1.5 rounded-lg backdrop-blur-sm transition-all border ${disabled ? 'text-secondary/30 cursor-not-allowed bg-surface/50 border-border' : 'text-secondary hover:text-white bg-surface hover:bg-primary/20 border-border'}`

  const handleFavoriteClick = (item: FavoriteItem) => {
    if (item.type === 'directory') {
      onPathChange(item.path)
    } else {
      // 导航到文件所在目录
      const dir = item.path.substring(0, item.path.lastIndexOf('/')) || '/'
      onPathChange(dir)
    }
    setShowFavorites(false)
  }

  const handleRemoveFavorite = (item: FavoriteItem) => {
    removeFavorite(storeKey, item.path, item.type)
    setFavorites(loadFavorites(storeKey))
  }

  return (
    <div className="flex flex-col h-full bg-transparent relative">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <button onClick={goUp} disabled={currentPath === '/'} className={btnCls(currentPath === '/')} title="返回上级目录">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16l-4-4m0 0l4-4m-4 4h18" /></svg>
        </button>
        <button onClick={() => load(currentPath)} disabled={loading} className={`${btnCls(loading)} ${loading ? 'animate-spin' : ''}`} title="刷新">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
        </button>
        <button onClick={() => setShowFavorites(!showFavorites)} className={`${btnCls(false)} ${showFavorites ? 'bg-primary/30 text-primary border-primary/50' : ''}`} title="收藏夹">
          <svg className="w-5 h-5" fill={showFavorites ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
        </button>
        <div className="flex-1" /><span className="text-xs text-secondary">{files.length} 项</span>
      </div>

      {/* 收藏面板 */}
      {showFavorites && (
        <div className="absolute top-12 left-2 right-2 z-50 bg-surface border border-border rounded-xl shadow-xl overflow-hidden" style={{ maxHeight: '60%' }}>
          <div className="flex border-b border-border">
            <button onClick={() => setFavTab('directories')} className={`flex-1 px-3 py-2 text-sm transition-all ${favTab === 'directories' ? 'text-primary border-b-2 border-primary' : 'text-secondary hover:text-text'}`}>
              目录 ({favorites.directories.length})
            </button>
            <button onClick={() => setFavTab('files')} className={`flex-1 px-3 py-2 text-sm transition-all ${favTab === 'files' ? 'text-primary border-b-2 border-primary' : 'text-secondary hover:text-text'}`}>
              文件 ({favorites.files.length})
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {(favTab === 'directories' ? favorites.directories : favorites.files).length === 0 ? (
              <div className="p-4 text-center text-secondary text-sm">暂无收藏</div>
            ) : (
              (favTab === 'directories' ? favorites.directories : favorites.files).map(item => (
                <div key={item.path} className="flex items-center gap-2 px-3 py-2 hover:bg-primary/10 cursor-pointer group" onClick={() => handleFavoriteClick(item)}>
                  {item.type === 'directory' ? (
                    <svg className="w-4 h-4 text-yellow-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" /></svg>
                  ) : (
                    <svg className="w-4 h-4 text-secondary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  )}
                  <span className="text-sm text-text truncate flex-1">{item.path}</span>
                  <button onClick={e => { e.stopPropagation(); handleRemoveFavorite(item) }} className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-error/20 text-secondary hover:text-error transition-all flex-shrink-0" title="移除收藏">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <Breadcrumb path={currentPath} onNav={onPathChange} />
      <div className="flex items-center px-3 border-b border-border bg-surface/50 text-xs text-secondary/70" style={{ height: 28 }}>
        <div className="flex items-center gap-2 flex-1 min-w-0 h-full"><span className="w-5 flex-shrink-0" /><span className="flex-1 min-w-0">名称</span></div>
        <span className="text-left flex-shrink-0 px-2" style={{ width: COL_WIDTHS.size }}>大小</span>
        <span className="text-left flex-shrink-0 px-2 hidden md:block" style={{ width: COL_WIDTHS.time }}>修改时间</span>
      </div>
      <div className="flex-1 overflow-hidden">{renderList()}</div>
    </div>
  )
}
