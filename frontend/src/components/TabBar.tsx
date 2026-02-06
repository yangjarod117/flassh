import { useState, useRef, useEffect, useCallback } from 'react'
import { useTabsStore } from '../store'
import type { Tab } from '../types'

/**
 * 计算标签页是否溢出
 */
export function calculateTabOverflow(
  tabCount: number,
  tabWidth: number,
  containerWidth: number,
  buttonWidth: number = 40
): boolean {
  if (containerWidth <= 0 || tabCount <= 0) return false
  const totalTabsWidth = tabCount * tabWidth
  const availableWidth = containerWidth - buttonWidth // 减去新建按钮宽度
  return totalTabsWidth > availableWidth
}

interface TabItemProps {
  tab: Tab
  isActive: boolean
  onSelect: () => void
  onClose: () => void
  onRename: (name: string) => void
  onDragStart: (e: React.DragEvent, index: number) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent, index: number) => void
  index: number
}

/**
 * 单个标签页组件
 */
function TabItem({
  tab,
  isActive,
  onSelect,
  onClose,
  onRename,
  onDragStart,
  onDragOver,
  onDrop,
  index,
}: TabItemProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(tab.name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleDoubleClick = () => {
    setEditName(tab.name)
    setIsEditing(true)
  }

  const handleBlur = () => {
    if (editName.trim()) {
      onRename(editName.trim())
    } else {
      setEditName(tab.name)
    }
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleBlur()
    } else if (e.key === 'Escape') {
      setEditName(tab.name)
      setIsEditing(false)
    }
  }

  const handleCloseClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onClose()
  }

  return (
    <div
      className={`
        group flex items-center gap-1 md:gap-2 px-2 md:px-3 py-1.5 md:py-2 min-w-[80px] md:min-w-[120px] max-w-[150px] md:max-w-[200px]
        cursor-pointer select-none transition-all duration-200 ease-out
        relative rounded-lg md:rounded-xl
        ${isActive
          ? 'bg-primary/20 text-text scale-105'
          : 'bg-transparent text-text-muted opacity-40 hover:opacity-80 hover:text-text hover:bg-surface/50'
        }
      `}
      style={isActive ? {
        boxShadow: '0 0 20px rgba(0, 212, 255, 0.4), inset 0 0 10px rgba(0, 212, 255, 0.1)',
      } : undefined}
      onClick={onSelect}
      onDoubleClick={handleDoubleClick}
      draggable={!isEditing}
      onDragStart={(e) => onDragStart(e, index)}
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, index)}
    >
      {/* 连接状态指示器 */}
      <span
        className={`
          w-1.5 h-1.5 md:w-2 md:h-2 rounded-full flex-shrink-0 transition-shadow duration-300
          ${tab.isConnected ? 'bg-success' : 'bg-secondary'}
        `}
        style={tab.isConnected ? { boxShadow: '0 0 8px rgba(0, 255, 136, 0.6)' } : undefined}
      />

      {/* 标签名称 */}
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="
            flex-1 min-w-0 bg-transparent border-b border-primary
            outline-none text-xs md:text-sm text-white
          "
          style={{ boxShadow: '0 1px 0 var(--color-primary)' }}
        />
      ) : (
        <span className={`flex-1 min-w-0 truncate ${isActive ? 'text-sm md:text-lg font-bold' : 'text-xs md:text-sm'}`}>{tab.name}</span>
      )}

      {/* 关闭按钮 */}
      <button
        onClick={handleCloseClick}
        className={`
          flex-shrink-0 w-4 h-4 md:w-5 md:h-5 rounded flex items-center justify-center
          transition-all duration-150
          ${isActive
            ? 'hover:bg-error/20 text-secondary hover:text-error hover:shadow-[0_0_8px_rgba(255,71,87,0.4)]'
            : 'opacity-0 group-hover:opacity-100 hover:bg-error/20 text-secondary hover:text-error'
          }
        `}
        title="关闭标签页"
      >
        <svg className="w-2.5 h-2.5 md:w-3 md:h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

interface TabBarProps {
  onAddConnection?: () => void
}

/**
 * 标签页栏组件
 */
export function TabBar({ onAddConnection }: TabBarProps = {}) {
  const { tabs, activeTabId, removeTab, setActiveTab, renameTab, reorderTabs } = useTabsStore()
  const containerRef = useRef<HTMLDivElement>(null)
  const tabsContainerRef = useRef<HTMLDivElement>(null)
  const [isOverflowing, setIsOverflowing] = useState(false)
  const [scrollPosition, setScrollPosition] = useState(0)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)

  // 检测溢出
  const checkOverflow = useCallback(() => {
    if (tabsContainerRef.current && containerRef.current) {
      const containerWidth = containerRef.current.clientWidth
      const tabsWidth = tabsContainerRef.current.scrollWidth
      setIsOverflowing(tabsWidth > containerWidth - 80) // 80 = 新建按钮 + 滚动按钮
    }
  }, [])

  useEffect(() => {
    checkOverflow()
    window.addEventListener('resize', checkOverflow)
    return () => window.removeEventListener('resize', checkOverflow)
  }, [checkOverflow, tabs.length])

  // 滚动处理
  const handleScrollLeft = () => {
    if (tabsContainerRef.current) {
      const newPosition = Math.max(0, scrollPosition - 200)
      tabsContainerRef.current.scrollTo({ left: newPosition, behavior: 'smooth' })
      setScrollPosition(newPosition)
    }
  }

  const handleScrollRight = () => {
    if (tabsContainerRef.current) {
      const maxScroll = tabsContainerRef.current.scrollWidth - tabsContainerRef.current.clientWidth
      const newPosition = Math.min(maxScroll, scrollPosition + 200)
      tabsContainerRef.current.scrollTo({ left: newPosition, behavior: 'smooth' })
      setScrollPosition(newPosition)
    }
  }

  const handleScroll = () => {
    if (tabsContainerRef.current) {
      setScrollPosition(tabsContainerRef.current.scrollLeft)
    }
  }

  // 拖拽处理
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', index.toString())
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e: React.DragEvent, toIndex: number) => {
    e.preventDefault()
    if (draggedIndex !== null && draggedIndex !== toIndex) {
      reorderTabs(draggedIndex, toIndex)
    }
    setDraggedIndex(null)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
  }

  const canScrollLeft = scrollPosition > 0
  const canScrollRight = tabsContainerRef.current
    ? scrollPosition < tabsContainerRef.current.scrollWidth - tabsContainerRef.current.clientWidth
    : false

  return (
    <div
      ref={containerRef}
      className="flex items-center h-8 md:h-10 mx-1 md:mx-2 mt-1 md:mt-2 rounded-lg md:rounded-xl overflow-hidden bg-surface border border-border"
    >
      {/* 左滚动按钮 */}
      {isOverflowing && (
        <button
          onClick={handleScrollLeft}
          disabled={!canScrollLeft}
          className={`
            flex-shrink-0 w-8 h-full flex items-center justify-center
            backdrop-blur-sm transition-all duration-200
            ${canScrollLeft
              ? 'hover:bg-primary/20 text-secondary hover:text-primary bg-surface'
              : 'text-secondary/30 cursor-not-allowed bg-surface/50'
            }
          `}
          title="向左滚动"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {/* 标签页容器 */}
      <div
        ref={tabsContainerRef}
        className="flex-1 flex items-center overflow-x-hidden"
        onScroll={handleScroll}
        onDragEnd={handleDragEnd}
      >
        {tabs.map((tab, index) => (
          <TabItem
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            onSelect={() => setActiveTab(tab.id)}
            onClose={() => removeTab(tab.id)}
            onRename={(name) => renameTab(tab.id, name)}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            index={index}
          />
        ))}
      </div>

      {/* 右滚动按钮 */}
      {isOverflowing && (
        <button
          onClick={handleScrollRight}
          disabled={!canScrollRight}
          className={`
            flex-shrink-0 w-8 h-full flex items-center justify-center
            backdrop-blur-sm transition-all duration-200
            ${canScrollRight
              ? 'hover:bg-primary/20 text-secondary hover:text-primary bg-surface'
              : 'text-secondary/30 cursor-not-allowed bg-surface/50'
            }
          `}
          title="向右滚动"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {/* 新建连接按钮 */}
      {onAddConnection && (
        <button
          onClick={onAddConnection}
          className="
            flex-shrink-0 w-10 h-full flex items-center justify-center
            backdrop-blur-sm transition-all duration-200 bg-surface
            hover:bg-success/20 text-secondary hover:text-success
          "
          style={{ transition: 'all 200ms ease-out' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = '0 0 15px rgba(0, 255, 136, 0.2)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = 'none'
          }}
          title="添加新连接"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      )}
    </div>
  )
}
