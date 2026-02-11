import { useEffect, useRef } from 'react'
import type { ContextMenuItem, ContextMenuPosition } from '../types'
import type { FileItem } from '../types'

/**
 * 上下文菜单组件属性
 */
export interface ContextMenuProps {
  items: ContextMenuItem[]
  position: ContextMenuPosition
  onClose: () => void
}

/**
 * 上下文菜单组件
 * Requirements: 8.1, 8.2 - 现代化 UI 设计和平滑动画
 */
export function ContextMenu({ items, position, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  // 调整菜单位置，确保不超出视口
  useEffect(() => {
    if (menuRef.current) {
      const menu = menuRef.current
      const rect = menu.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight

      let adjustedX = position.x
      let adjustedY = position.y

      // 如果菜单超出右边界
      if (position.x + rect.width > viewportWidth) {
        adjustedX = viewportWidth - rect.width - 8
      }

      // 如果菜单超出下边界
      if (position.y + rect.height > viewportHeight) {
        adjustedY = viewportHeight - rect.height - 8
      }

      menu.style.left = `${adjustedX}px`
      menu.style.top = `${adjustedY}px`
    }
  }, [position])

  const handleItemClick = (item: ContextMenuItem) => {
    if (!item.disabled) {
      item.onClick()
      onClose()
    }
  }

  return (
    <div
      ref={menuRef}
      className="fixed z-dropdown min-w-[180px] py-1 rounded-lg overflow-hidden bg-surface border border-border"
      style={{ 
        left: position.x, 
        top: position.y,
        backdropFilter: 'blur(16px)',
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2), 0 0 20px rgba(0, 0, 0, 0.1)',
        animation: 'dropdownEnter 200ms cubic-bezier(0.34, 1.56, 0.64, 1)'
      }}
    >
      <div className="stagger-children">
        {items.map((item, index) => (
          <button
            key={item.id}
            onClick={() => handleItemClick(item)}
            disabled={item.disabled}
            className={`
              w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm
              transition-all duration-150 relative
              ${item.disabled
                ? 'text-text-muted cursor-not-allowed'
                : item.danger
                  ? 'text-error hover:bg-error/15'
                  : 'text-text-secondary hover:text-text hover:bg-primary/10'
              }
            `}
            style={{ 
              animationDelay: `${index * 30}ms`,
              transition: 'all 150ms ease-out'
            }}
            onMouseEnter={(e) => {
              if (!item.disabled && !item.danger) {
                e.currentTarget.style.boxShadow = 'inset 2px 0 0 var(--color-primary)'
              } else if (!item.disabled && item.danger) {
                e.currentTarget.style.boxShadow = 'inset 2px 0 0 var(--color-error)'
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            {item.icon && (
              <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                {getMenuIcon(item.icon)}
              </span>
            )}
            <span className="flex-1">{item.label}</span>
            {item.shortcut && (
              <span className="text-xs text-text-muted ml-2">{item.shortcut}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * 获取菜单图标
 */
function getMenuIcon(iconName: string): React.ReactNode {
  const icons: Record<string, React.ReactNode> = {
    open: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
      </svg>
    ),
    favorite: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
      </svg>
    ),
    edit: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    ),
    rename: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
    ),
    delete: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
    ),
    copy: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
      </svg>
    ),
    download: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
    ),
    upload: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
      </svg>
    ),
    newFile: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    newFolder: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      </svg>
    ),
    terminal: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    refresh: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    ),
  }

  return icons[iconName] || null
}


/**
 * 根据文件类型生成上下文菜单项
 * 
 * 文件菜单项：打开、编辑、重命名、删除、复制路径、下载
 * 文件夹菜单项：打开、上传、下载、在此目录打开终端、新建文件、新建文件夹、重命名、删除、复制路径
 */
export interface GenerateMenuItemsOptions {
  file: FileItem
  onOpen: () => void
  onEdit: () => void
  onRename: () => void
  onDelete: () => void
  onCopyPath: () => void
  onDownload: () => void
  onUpload: () => void
  onNewFile: () => void
  onNewFolder: () => void
  onOpenTerminal?: () => void
  onFavorite?: () => void
}

export function generateContextMenuItems(options: GenerateMenuItemsOptions): ContextMenuItem[] {
  const {
    file,
    onOpen,
    onEdit,
    onRename,
    onDelete,
    onCopyPath,
    onDownload,
    onUpload,
    onNewFile,
    onNewFolder,
    onOpenTerminal,
    onFavorite,
  } = options

  if (file.type === 'directory') {
    // 文件夹菜单项
    const items: ContextMenuItem[] = [
      {
        id: 'open',
        label: '打开',
        icon: 'open',
        onClick: onOpen,
      },
    ]

    // 添加收藏选项
    if (onFavorite) {
      items.push({
        id: 'favorite',
        label: '添加到收藏',
        icon: 'favorite',
        onClick: onFavorite,
      })
    }

    items.push(
      {
        id: 'upload',
        label: '上传文件',
        icon: 'upload',
        onClick: onUpload,
      },
      {
        id: 'download',
        label: '下载文件夹',
        icon: 'download',
        onClick: onDownload,
      },
    )

    // 添加"在此目录打开终端"选项
    if (onOpenTerminal) {
      items.push({
        id: 'openTerminal',
        label: '在此目录打开终端',
        icon: 'terminal',
        onClick: onOpenTerminal,
      })
    }

    items.push(
      {
        id: 'newFile',
        label: '在此目录下新建文件',
        icon: 'newFile',
        onClick: onNewFile,
      },
      {
        id: 'newFolder',
        label: '在此目录下新建文件夹',
        icon: 'newFolder',
        onClick: onNewFolder,
      },
      {
        id: 'rename',
        label: '重命名',
        icon: 'rename',
        onClick: onRename,
      },
      {
        id: 'delete',
        label: '删除',
        icon: 'delete',
        danger: true,
        onClick: onDelete,
      },
      {
        id: 'copyPath',
        label: '复制路径',
        icon: 'copy',
        onClick: onCopyPath,
      }
    )

    return items
  } else {
    // 文件菜单项（包括普通文件和符号链接）
    const items: ContextMenuItem[] = [
      {
        id: 'open',
        label: '打开',
        icon: 'open',
        onClick: onOpen,
      },
    ]

    // 添加收藏选项
    if (onFavorite) {
      items.push({
        id: 'favorite',
        label: '添加到收藏',
        icon: 'favorite',
        onClick: onFavorite,
      })
    }

    items.push(
      {
        id: 'edit',
        label: '编辑',
        icon: 'edit',
        onClick: onEdit,
      },
      {
        id: 'download',
        label: '下载',
        icon: 'download',
        onClick: onDownload,
      },
      {
        id: 'rename',
        label: '重命名',
        icon: 'rename',
        onClick: onRename,
      },
      {
        id: 'delete',
        label: '删除',
        icon: 'delete',
        danger: true,
        onClick: onDelete,
      },
      {
        id: 'copyPath',
        label: '复制路径',
        icon: 'copy',
        onClick: onCopyPath,
      },
    )

    return items
  }
}

/**
 * 获取文件菜单必需项 ID 列表
 */
export function getRequiredFileMenuItems(): string[] {
  return ['open', 'edit', 'rename', 'delete', 'copyPath', 'download']
}

/**
 * 获取文件夹菜单必需项 ID 列表
 */
export function getRequiredFolderMenuItems(): string[] {
  return ['open', 'newFile', 'newFolder', 'rename', 'delete', 'copyPath', 'upload']
}

/**
 * 验证菜单项是否包含所有必需项
 */
export function validateMenuItems(items: ContextMenuItem[], requiredIds: string[]): boolean {
  const itemIds = new Set(items.map(item => item.id))
  return requiredIds.every(id => itemIds.has(id))
}
