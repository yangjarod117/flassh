import { useState, useEffect, useCallback, memo, useRef, forwardRef, useImperativeHandle } from 'react'
import type { FileItem } from '../types'
import { formatFileSize } from '../utils/formatting'

// 收藏项类型
export interface FavoriteItem {
  path: string
  name: string
  type: 'file' | 'directory'
}

// 后端 API 收藏操作
export const loadFavorites = async (serverKey: string): Promise<{ directories: FavoriteItem[]; files: FavoriteItem[] }> => {
  try {
    const res = await fetch(`/api/favorites/${encodeURIComponent(serverKey)}`)
    if (res.ok) return await res.json()
  } catch { /* ignore */ }
  return { directories: [], files: [] }
}

export const saveFavorites = async (serverKey: string, favorites: { directories: FavoriteItem[]; files: FavoriteItem[] }) => {
  try {
    await fetch(`/api/favorites/${encodeURIComponent(serverKey)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(favorites),
    })
  } catch { /* ignore */ }
}

export const addFavorite = async (serverKey: string, item: FavoriteItem) => {
  try {
    await fetch(`/api/favorites/${encodeURIComponent(serverKey)}/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    })
  } catch { /* ignore */ }
}

export const removeFavorite = async (serverKey: string, path: string, type: 'file' | 'directory') => {
  try {
    await fetch(`/api/favorites/${encodeURIComponent(serverKey)}/remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, type }),
    })
  } catch { /* ignore */ }
}

const FILE_COLORS: Record<string, string> = {
  ts: 'text-blue-400', tsx: 'text-blue-400', js: 'text-yellow-400', jsx: 'text-yellow-400',
  py: 'text-green-400', rb: 'text-red-400', go: 'text-cyan-400', rs: 'text-orange-400', java: 'text-red-500',
  json: 'text-yellow-300', yaml: 'text-pink-400', yml: 'text-pink-400', toml: 'text-orange-300', xml: 'text-orange-400',
  md: 'text-blue-300', txt: 'text-gray-400', css: 'text-blue-500', scss: 'text-pink-500', less: 'text-purple-400',
  sh: 'text-green-500', bash: 'text-green-500', html: 'text-orange-500',
}

const FileIcon = ({ type, name }: { type: FileItem['type']; name: string }) => {
  if (type === 'directory') return <svg className="w-4 h-4 text-yellow-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" /></svg>
  if (type === 'symlink') return <svg className="w-4 h-4 text-purple-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
  const ext = name.split('.').pop()?.toLowerCase() || ''
  return <svg className={`w-4 h-4 flex-shrink-0 ${FILE_COLORS[ext] || 'text-secondary'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
}

export { formatFileSize } from '../utils/formatting'

// 树节点数据
interface TreeNode {
  file: FileItem
  children: TreeNode[] | null // null = 未加载, [] = 已加载但为空
  loading: boolean
}

// 排序：文件夹在前，按名称排序
const sortFiles = (files: FileItem[]) => files.sort((a, b) => {
  const aIsDir = a.type === 'directory' ? 0 : 1
  const bIsDir = b.type === 'directory' ? 0 : 1
  if (aIsDir !== bIsDir) return aIsDir - bIsDir
  return a.name.localeCompare(b.name)
})

// 树节点行组件
const TreeRow = memo(({ node, depth, expanded, selected, onToggle, onSelect, onDblClick, onCtx }: {
  node: TreeNode; depth: number; expanded: boolean; selected: boolean
  onToggle: () => void; onSelect: () => void; onDblClick: () => void; onCtx: (e: React.MouseEvent) => void
}) => {
  const isDir = node.file.type === 'directory'
  return (
    <div
      data-file-item
      className={`flex items-center pr-3 cursor-pointer select-none transition-all duration-150 rounded-lg mx-1 relative ${selected ? 'bg-primary/25 text-primary' : 'text-text-secondary hover:text-text hover:bg-primary/15 hover:shadow-[0_0_12px_rgba(0,212,255,0.15)] hover:backdrop-blur-md hover:scale-[1.04]'}`}
      style={{ height: 22, paddingLeft: depth * 18 + 8 }}
      onClick={() => { onSelect(); if (isDir) onToggle() }}
      onDoubleClick={onDblClick}
      onContextMenu={onCtx}
    >
      {/* 树形层级竖线 - 淡蓝色微光 */}
      {Array.from({ length: depth }, (_, i) => (
        <span key={i} className="absolute top-0 bottom-0" style={{ left: i * 18 + 16, width: 1, background: 'rgba(100, 180, 255, 0.2)', boxShadow: '0 0 3px rgba(100, 180, 255, 0.15)' }} />
      ))}
      {/* 展开/收起箭头 */}
      {isDir ? (
        <svg className={`w-3.5 h-3.5 flex-shrink-0 mr-1 text-secondary transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      ) : (
        <span className="w-3.5 h-3.5 flex-shrink-0 mr-1" />
      )}
      <FileIcon type={node.file.type} name={node.file.name} />
      <span className="flex-1 min-w-0 truncate text-sm ml-1.5">{node.file.name}</span>
      <span className="text-xs text-secondary/60 flex-shrink-0 ml-2">{isDir ? '文件夹' : formatFileSize(node.file.size)}</span>
      {node.loading && <svg className="w-3 h-3 animate-spin text-secondary ml-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>}
    </div>
  )
}, (prev, next) => prev.node === next.node && prev.depth === next.depth && prev.expanded === next.expanded && prev.selected === next.selected)

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

export interface FileExplorerHandle {
  expandDir: (file: FileItem) => void
}

export interface FileExplorerProps {
  sessionId: string; currentPath: string; onPathChange: (p: string) => void
  onFileSelect: (f: FileItem) => void; onFileDoubleClick: (f: FileItem) => void
  onContextMenu?: (f: FileItem, pos: { x: number; y: number }) => void
  favoriteKey?: number
  favoriteStoreKey?: string
  refreshKey?: number
}

export const FileExplorer = forwardRef<FileExplorerHandle, FileExplorerProps>(function FileExplorer({ sessionId, currentPath, onPathChange, onFileSelect, onFileDoubleClick, onContextMenu, favoriteKey = 0, favoriteStoreKey, refreshKey = 0 }, ref) {
  const storeKey = favoriteStoreKey || sessionId
  const [rootNodes, setRootNodes] = useState<TreeNode[]>([])
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const [childrenCache, setChildrenCache] = useState<Map<string, TreeNode[]>>(new Map())
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<FileItem | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showFavorites, setShowFavorites] = useState(false)
  const [favTab, setFavTab] = useState<'directories' | 'files'>('directories')
  const [favorites, setFavorites] = useState<{ directories: FavoriteItem[]; files: FavoriteItem[] }>({ directories: [], files: [] })
  const sessionIdRef = useRef(sessionId)
  sessionIdRef.current = sessionId

  useEffect(() => {
    loadFavorites(storeKey).then(setFavorites)
  }, [storeKey, favoriteKey])

  // 加载目录内容
  const loadDir = useCallback(async (path: string): Promise<FileItem[]> => {
    const res = await fetch(`/api/sessions/${sessionIdRef.current}/files?path=${encodeURIComponent(path)}`)
    if (!res.ok) {
      const errData = await res.json()
      throw new Error(errData.message || '加载目录失败')
    }
    const data = await res.json()
    return sortFiles(data.files)
  }, [])

  // 记录上一次的根路径，用于判断是否切换了根目录
  const prevPathRef = useRef(currentPath)

  // 加载根目录
  const loadRoot = useCallback(async () => {
    setLoading(true); setError(null)
    const pathChanged = prevPathRef.current !== currentPath
    prevPathRef.current = currentPath
    try {
      const files = await loadDir(currentPath)
      const nodes: TreeNode[] = files.map(f => ({ file: f, children: null, loading: false }))
      setRootNodes(nodes)

      if (pathChanged) {
        // 切换根目录时清空展开状态和缓存
        setExpandedPaths(new Set())
        setChildrenCache(new Map())
      } else {
        // 刷新时保留展开状态，并行重新加载所有已展开的子目录
        setExpandedPaths(prev => {
          if (prev.size === 0) return prev
          const toRefresh = Array.from(prev)
          // 并行刷新所有已展开目录的缓存
          Promise.all(toRefresh.map(p =>
            loadDir(p).then(subFiles => {
              const subNodes: TreeNode[] = subFiles.map(f => ({ file: f, children: null, loading: false }))
              setChildrenCache(c => new Map(c).set(p, subNodes))
            }).catch(() => { /* 子目录加载失败忽略 */ })
          ))
          return prev
        })
      }
    } catch (e) { setError(e instanceof Error ? e.message : '加载目录失败') }
    finally { setLoading(false) }
  }, [currentPath, loadDir])

  useEffect(() => { loadRoot() }, [loadRoot, refreshKey])

  // 展开/收起文件夹
  const toggleDir = useCallback(async (file: FileItem) => {
    const path = file.path
    setExpandedPaths(prev => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
        // 如果还没加载过子目录，触发加载
        if (!childrenCache.has(path)) {
          setLoadingPaths(lp => new Set(lp).add(path))
          loadDir(path).then(files => {
            const nodes: TreeNode[] = files.map(f => ({ file: f, children: null, loading: false }))
            setChildrenCache(c => new Map(c).set(path, nodes))
            setLoadingPaths(lp => { const n = new Set(lp); n.delete(path); return n })
          }).catch(() => {
            setLoadingPaths(lp => { const n = new Set(lp); n.delete(path); return n })
          })
        }
      }
      return next
    })
  }, [childrenCache, loadDir])

  // 暴露给父组件的方法
  useImperativeHandle(ref, () => ({
    expandDir: (file: FileItem) => {
      if (file.type === 'directory' && !expandedPaths.has(file.path)) {
        toggleDir(file)
      }
    }
  }), [expandedPaths, toggleDir])

  // 面包屑显示的路径：选中文件夹时显示其路径，选中文件时显示其父目录，否则显示根路径
  const breadcrumbPath = selected
    ? (selected.type === 'directory' ? selected.path : selected.path.substring(0, selected.path.lastIndexOf('/')) || '/')
    : currentPath

  const select = useCallback((f: FileItem) => { setSelected(f); onFileSelect(f) }, [onFileSelect])
  const dblClick = useCallback((f: FileItem) => {
    if (f.type === 'directory') return
    onFileDoubleClick(f)
  }, [onFileDoubleClick])
  const ctx = useCallback((e: React.MouseEvent, f: FileItem) => { e.preventDefault(); setSelected(f); onFileSelect(f); onContextMenu?.(f, { x: e.clientX, y: e.clientY }) }, [onFileSelect, onContextMenu])
  const goUp = () => { if (currentPath === '/') return; const p = currentPath.split('/').filter(Boolean); p.pop(); onPathChange(p.length ? '/' + p.join('/') : '/') }

  // 递归渲染树
  const renderTree = (nodes: TreeNode[], depth: number): React.ReactNode => {
    return nodes.map(node => {
      const isDir = node.file.type === 'directory'
      const expanded = expandedPaths.has(node.file.path)
      const isLoading = loadingPaths.has(node.file.path)
      const children = childrenCache.get(node.file.path)

      return (
        <div key={node.file.path}>
          <TreeRow
            node={{ ...node, loading: isLoading }}
            depth={depth}
            expanded={expanded}
            selected={selected?.path === node.file.path}
            onToggle={() => isDir && toggleDir(node.file)}
            onSelect={() => select(node.file)}
            onDblClick={() => dblClick(node.file)}
            onCtx={e => ctx(e, node.file)}
          />
          {isDir && expanded && children && (
            <div>
              {children.length === 0 ? (
                <div className="text-xs text-secondary/50 italic ml-2" style={{ paddingLeft: (depth + 1) * 16 + 8 }}>空目录</div>
              ) : renderTree(children, depth + 1)}
            </div>
          )}
        </div>
      )
    })
  }

  const renderContent = () => {
    if (loading) return <div className="flex items-center justify-center h-32"><div className="flex items-center gap-2 text-secondary"><svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg><span>加载中...</span></div></div>
    if (error) return <div className="flex flex-col items-center justify-center h-32 gap-2"><svg className="w-8 h-8 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg><span className="text-error text-sm">{error}</span><button onClick={loadRoot} className="px-3 py-1 text-sm bg-surface hover:bg-surface/80 rounded transition-colors">重试</button></div>
    if (!rootNodes.length) return <div className="flex flex-col items-center justify-center h-32 text-secondary"><svg className="w-8 h-8 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg><span className="text-sm">空目录</span></div>
    return <div className="h-full overflow-y-auto py-1">{renderTree(rootNodes, 0)}</div>
  }

  const btnCls = (disabled: boolean) => `p-1.5 rounded-lg backdrop-blur-sm transition-all border ${disabled ? 'text-secondary/30 cursor-not-allowed bg-surface/50 border-border' : 'text-secondary hover:text-white bg-surface hover:bg-primary/20 border-border'}`

  const handleFavoriteClick = (item: FavoriteItem) => {
    if (item.type === 'directory') {
      onPathChange(item.path)
    } else {
      const dir = item.path.substring(0, item.path.lastIndexOf('/')) || '/'
      onPathChange(dir)
    }
    setSelected(null)
    setShowFavorites(false)
  }

  const handleRemoveFavorite = async (item: FavoriteItem) => {
    await removeFavorite(storeKey, item.path, item.type)
    setFavorites(await loadFavorites(storeKey))
  }

  return (
    <div className="flex flex-col h-full relative backdrop-blur-md bg-surface/60">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <button onClick={goUp} disabled={currentPath === '/'} className={btnCls(currentPath === '/')} title="返回上级目录">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16l-4-4m0 0l4-4m-4 4h18" /></svg>
        </button>
        <button onClick={loadRoot} disabled={loading} className={`${btnCls(loading)} ${loading ? 'animate-spin' : ''}`} title="刷新">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
        </button>
        <button onClick={() => setShowFavorites(!showFavorites)} className={`${btnCls(false)} ${showFavorites ? 'bg-primary/30 text-primary border-primary/50' : ''}`} title="收藏夹">
          <svg className="w-5 h-5" fill={showFavorites ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
        </button>
        <button onClick={() => { setExpandedPaths(new Set()); setChildrenCache(new Map()) }} disabled={expandedPaths.size === 0} className={btnCls(expandedPaths.size === 0)} title="收起全部">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25" /></svg>
        </button>
        <div className="flex-1" /><span className="text-xs text-secondary">{rootNodes.length} 项</span>
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

      <Breadcrumb path={breadcrumbPath} onNav={onPathChange} />
      <div className="flex-1 overflow-hidden">{renderContent()}</div>
    </div>
  )
})
