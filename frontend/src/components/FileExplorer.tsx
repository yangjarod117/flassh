import { useState, useEffect, useCallback, useRef } from 'react'
import type { FileItem } from '../types'
import { VirtualList } from './VirtualList'

/** 文件列表项高度（像素） */
const FILE_ITEM_HEIGHT = 24

/** 启用虚拟滚动的文件数量阈值 */
const VIRTUAL_SCROLL_THRESHOLD = 100

/** 默认列宽 */
const DEFAULT_COLUMN_WIDTHS = {
  size: 80,
  time: 140,
}

/** 最小列宽 */
const MIN_COLUMN_WIDTH = 50

/** 最大列宽 */
const MAX_COLUMN_WIDTH = 200

/**
 * 文件图标组件
 */
function FileIcon({ type, name }: { type: FileItem['type']; name: string }) {
  // 根据文件扩展名获取图标颜色
  const getFileColor = (fileName: string): string => {
    const ext = fileName.split('.').pop()?.toLowerCase()
    const colorMap: Record<string, string> = {
      // 代码文件
      ts: 'text-blue-400',
      tsx: 'text-blue-400',
      js: 'text-yellow-400',
      jsx: 'text-yellow-400',
      py: 'text-green-400',
      rb: 'text-red-400',
      go: 'text-cyan-400',
      rs: 'text-orange-400',
      java: 'text-red-500',
      // 配置文件
      json: 'text-yellow-300',
      yaml: 'text-pink-400',
      yml: 'text-pink-400',
      toml: 'text-orange-300',
      xml: 'text-orange-400',
      // 文档
      md: 'text-blue-300',
      txt: 'text-gray-400',
      // 样式
      css: 'text-blue-500',
      scss: 'text-pink-500',
      less: 'text-purple-400',
      // 其他
      sh: 'text-green-500',
      bash: 'text-green-500',
      html: 'text-orange-500',
    }
    return colorMap[ext || ''] || 'text-secondary'
  }

  if (type === 'directory') {
    return (
      <svg className="w-5 h-5 text-yellow-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
      </svg>
    )
  }

  if (type === 'symlink') {
    return (
      <svg className="w-5 h-5 text-purple-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
    )
  }

  return (
    <svg className={`w-5 h-5 flex-shrink-0 ${getFileColor(name)}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  )
}

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

/**
 * 格式化日期时间
 */
function formatDateTime(date: Date): string {
  // 检查日期是否有效
  if (isNaN(date.getTime())) {
    return '--'
  }
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)
  } catch {
    return '--'
  }
}


/**
 * 文件项组件
 */
interface FileItemRowProps {
  file: FileItem
  isSelected: boolean
  onSelect: () => void
  onDoubleClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
  columnWidths: { size: number; time: number }
}

function FileItemRow({ file, isSelected, onSelect, onDoubleClick, onContextMenu, columnWidths }: FileItemRowProps) {
  return (
    <div
      className={`
        flex items-center px-3 cursor-pointer
        transition-colors duration-150 select-none
        ${isSelected
          ? 'bg-primary/20 text-primary'
          : 'hover:bg-surface/50 text-secondary hover:text-primary'
        }
      `}
      style={{ height: `${FILE_ITEM_HEIGHT}px` }}
      onClick={onSelect}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0 h-full">
        <FileIcon type={file.type} name={file.name} />
        <span className="flex-1 min-w-0 truncate text-sm">{file.name}</span>
      </div>
      {/* 分隔线 - 全高 */}
      <div className="w-px h-full flex-shrink-0 bg-border" />
      <span 
        className="text-xs text-secondary/70 text-left flex-shrink-0 px-2 truncate"
        style={{ width: columnWidths.size }}
      >
        {file.type === 'directory' ? '文件夹' : formatFileSize(file.size)}
      </span>
      {/* 分隔线 - 全高 */}
      <div className="w-px h-full flex-shrink-0 hidden md:block bg-border" />
      <span 
        className="text-xs text-secondary/70 text-left flex-shrink-0 px-2 truncate hidden md:block"
        style={{ width: columnWidths.time }}
      >
        {formatDateTime(new Date(file.modifiedTime))}
      </span>
    </div>
  )
}

/**
 * 路径导航组件
 */
interface PathBreadcrumbProps {
  path: string
  onNavigate: (path: string) => void
}

function PathBreadcrumb({ path, onNavigate }: PathBreadcrumbProps) {
  const parts = path.split('/').filter(Boolean)

  return (
    <div className="flex items-center gap-1 px-3 py-2 bg-surface/30 border-b border-border overflow-x-auto">
      <button
        onClick={() => onNavigate('/')}
        className="
          flex items-center gap-1 px-2 py-1 rounded text-sm
          text-secondary hover:text-white hover:bg-surface
          transition-colors duration-150
        "
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
        <span>/</span>
      </button>
      {parts.map((part, index) => {
        const partPath = '/' + parts.slice(0, index + 1).join('/')
        const isLast = index === parts.length - 1
        return (
          <div key={partPath} className="flex items-center gap-1">
            <svg className="w-4 h-4 text-secondary/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <button
              onClick={() => onNavigate(partPath)}
              className={`
                px-2 py-1 rounded text-sm transition-colors duration-150
                ${isLast
                  ? 'text-white font-medium'
                  : 'text-secondary hover:text-white hover:bg-surface'
                }
              `}
            >
              {part}
            </button>
          </div>
        )
      })}
    </div>
  )
}


/**
 * 文件管理器属性
 */
export interface FileExplorerProps {
  sessionId: string
  currentPath: string
  onPathChange: (path: string) => void
  onFileSelect: (file: FileItem) => void
  onFileDoubleClick: (file: FileItem) => void
  onContextMenu?: (file: FileItem, position: { x: number; y: number }) => void
}

/**
 * 文件管理器组件
 */
export function FileExplorer({
  sessionId,
  currentPath,
  onPathChange,
  onFileSelect,
  onFileDoubleClick,
  onContextMenu,
}: FileExplorerProps) {
  const [files, setFiles] = useState<FileItem[]>([])
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // 列宽状态
  const [columnWidths, setColumnWidths] = useState(DEFAULT_COLUMN_WIDTHS)
  const resizingRef = useRef<'size' | 'time' | null>(null)
  const resizeStartX = useRef(0)
  const resizeStartWidth = useRef(0)

  // 处理列宽拖拽开始 - 独立于 SplitLayout 的拖拽
  const handleResizeStart = (column: 'size' | 'time', e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    resizingRef.current = column
    resizeStartX.current = e.clientX
    resizeStartWidth.current = columnWidths[column]
    
    // 添加拖拽中的样式
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault()
      moveEvent.stopPropagation()
      if (!resizingRef.current) return
      const diff = resizeStartX.current - moveEvent.clientX // 反向，因为列在右边
      const newWidth = Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, resizeStartWidth.current + diff))
      setColumnWidths(prev => ({ ...prev, [resizingRef.current!]: newWidth }))
    }

    const handleMouseUp = (upEvent: MouseEvent) => {
      upEvent.preventDefault()
      upEvent.stopPropagation()
      resizingRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', handleMouseMove, true)
      document.removeEventListener('mouseup', handleMouseUp, true)
    }

    // 使用捕获阶段，确保事件不会传播到 SplitLayout
    document.addEventListener('mousemove', handleMouseMove, true)
    document.addEventListener('mouseup', handleMouseUp, true)
  }

  // 加载目录内容
  const loadDirectory = useCallback(async (path: string) => {
    if (!sessionId) return

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `/api/sessions/${sessionId}/files?path=${encodeURIComponent(path)}`
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || '加载目录失败')
      }

      const data = await response.json()
      // 排序：文件夹在前，然后按名称排序
      const sortedFiles = (data.files as FileItem[]).sort((a, b) => {
        if (a.type === 'directory' && b.type !== 'directory') return -1
        if (a.type !== 'directory' && b.type === 'directory') return 1
        return a.name.localeCompare(b.name)
      })
      setFiles(sortedFiles)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载目录失败')
    } finally {
      setIsLoading(false)
    }
  }, [sessionId])

  // 当路径变化时加载目录
  useEffect(() => {
    loadDirectory(currentPath)
  }, [currentPath, loadDirectory])

  // 处理文件选择
  const handleSelect = (file: FileItem) => {
    setSelectedFile(file)
    onFileSelect(file)
  }

  // 处理双击
  const handleDoubleClick = (file: FileItem) => {
    if (file.type === 'directory') {
      const newPath = currentPath === '/'
        ? `/${file.name}`
        : `${currentPath}/${file.name}`
      onPathChange(newPath)
    } else {
      onFileDoubleClick(file)
    }
  }

  // 处理右键菜单
  const handleContextMenu = (e: React.MouseEvent, file: FileItem) => {
    e.preventDefault()
    setSelectedFile(file)
    onFileSelect(file)
    onContextMenu?.(file, { x: e.clientX, y: e.clientY })
  }

  // 返回上级目录
  const handleGoUp = () => {
    if (currentPath === '/') return
    const parts = currentPath.split('/').filter(Boolean)
    parts.pop()
    const parentPath = parts.length === 0 ? '/' : '/' + parts.join('/')
    onPathChange(parentPath)
  }

  // 刷新目录
  const handleRefresh = () => {
    loadDirectory(currentPath)
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* 工具栏 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <button
          onClick={handleGoUp}
          disabled={currentPath === '/'}
          className={`
            p-1.5 rounded transition-colors duration-150
            ${currentPath === '/'
              ? 'text-secondary/30 cursor-not-allowed'
              : 'text-secondary hover:text-white hover:bg-surface'
            }
          `}
          title="返回上级目录"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16l-4-4m0 0l4-4m-4 4h18" />
          </svg>
        </button>
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className={`
            p-1.5 rounded transition-colors duration-150
            ${isLoading
              ? 'text-secondary/30 cursor-not-allowed animate-spin'
              : 'text-secondary hover:text-white hover:bg-surface'
            }
          `}
          title="刷新"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
        <div className="flex-1" />
        <span className="text-xs text-secondary">
          {files.length} 项
        </span>
      </div>

      {/* 路径导航 */}
      <PathBreadcrumb path={currentPath} onNavigate={onPathChange} />

      {/* 列表表头 */}
      <div className="flex items-center px-3 border-b border-border bg-surface/30 text-xs text-secondary/70" style={{ height: '28px' }}>
        <div className="flex items-center gap-2 flex-1 min-w-0 h-full">
          <span className="w-5 flex-shrink-0"></span>
          <span className="flex-1 min-w-0">名称</span>
        </div>
        {/* 大小列分隔线 - 增加拖拽区域 */}
        <div 
          className="relative h-full flex-shrink-0 cursor-col-resize group"
          style={{ width: '9px', marginLeft: '-4px', marginRight: '-4px' }}
          onMouseDown={(e) => handleResizeStart('size', e)}
          title="拖拽调整列宽"
        >
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border group-hover:bg-primary transition-colors" style={{ transform: 'translateX(-50%)' }} />
        </div>
        <span className="text-left flex-shrink-0 px-2" style={{ width: columnWidths.size }}>大小</span>
        {/* 修改时间列分隔线 - 增加拖拽区域 */}
        <div 
          className="relative h-full flex-shrink-0 cursor-col-resize group hidden md:block"
          style={{ width: '9px', marginLeft: '-4px', marginRight: '-4px' }}
          onMouseDown={(e) => handleResizeStart('time', e)}
          title="拖拽调整列宽"
        >
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border group-hover:bg-primary transition-colors" style={{ transform: 'translateX(-50%)' }} />
        </div>
        <span className="text-left flex-shrink-0 px-2 hidden md:block" style={{ width: columnWidths.time }}>修改时间</span>
      </div>

      {/* 文件列表 */}
      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="flex items-center gap-2 text-secondary">
              <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>加载中...</span>
            </div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <svg className="w-8 h-8 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="text-error text-sm">{error}</span>
            <button
              onClick={handleRefresh}
              className="px-3 py-1 text-sm bg-surface hover:bg-surface/80 rounded transition-colors"
            >
              重试
            </button>
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-secondary">
            <svg className="w-8 h-8 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <span className="text-sm">空目录</span>
          </div>
        ) : files.length > VIRTUAL_SCROLL_THRESHOLD ? (
          /* 大文件列表使用虚拟滚动 - Requirements: 7.3 */
          <VirtualList
            items={files}
            itemHeight={FILE_ITEM_HEIGHT}
            renderItem={(file) => (
              <FileItemRow
                key={file.path}
                file={file}
                isSelected={selectedFile?.path === file.path}
                onSelect={() => handleSelect(file)}
                onDoubleClick={() => handleDoubleClick(file)}
                onContextMenu={(e) => handleContextMenu(e, file)}
                columnWidths={columnWidths}
              />
            )}
            getKey={(file) => file.path}
            className="h-full"
          />
        ) : (
          /* 小文件列表使用普通渲染 */
          <div className="h-full overflow-y-auto">
            {files.map((file) => (
              <FileItemRow
                key={file.path}
                file={file}
                isSelected={selectedFile?.path === file.path}
                onSelect={() => handleSelect(file)}
                onDoubleClick={() => handleDoubleClick(file)}
                onContextMenu={(e) => handleContextMenu(e, file)}
                columnWidths={columnWidths}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
