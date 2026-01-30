import React, { useRef, useCallback, useState, useEffect } from 'react'
import { useLayoutStore, DEFAULT_SPLIT_RATIO, MIN_SPLIT_RATIO, MAX_SPLIT_RATIO } from '../store/layout'

export interface SplitLayoutProps {
  /** 左侧面板内容 */
  left: React.ReactNode
  /** 右侧面板内容 */
  right: React.ReactNode
  /** 最小左侧宽度比例 */
  minRatio?: number
  /** 最大左侧宽度比例 */
  maxRatio?: number
  /** 自定义类名 */
  className?: string
}

/**
 * 分栏布局组件
 * 支持拖动调整宽度、双击重置、折叠/展开
 * Requirements: 8.3, 11.1, 11.2, 11.3
 */
export function SplitLayout({
  left,
  right,
  minRatio = MIN_SPLIT_RATIO,
  maxRatio = MAX_SPLIT_RATIO,
  className = '',
}: SplitLayoutProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [showMobileSidebar, setShowMobileSidebar] = useState(false)
  
  const { ratio, isCollapsed, setRatio, resetRatio, collapse, expand } = useLayoutStore()

  // 检测移动端
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // 处理拖动开始
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isMobile) return
    e.preventDefault()
    setIsDragging(true)
  }, [isMobile])

  // 处理触摸开始
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (isMobile) return
    e.preventDefault()
    setIsDragging(true)
  }, [isMobile])

  // 处理拖动
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !containerRef.current) return
    
    const containerRect = containerRef.current.getBoundingClientRect()
    const newRatio = (e.clientX - containerRect.left) / containerRect.width
    const clampedRatio = Math.max(minRatio, Math.min(maxRatio, newRatio))
    setRatio(clampedRatio)
  }, [isDragging, minRatio, maxRatio, setRatio])

  // 处理触摸移动
  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isDragging || !containerRef.current) return
    
    const touch = e.touches[0]
    const containerRect = containerRef.current.getBoundingClientRect()
    const newRatio = (touch.clientX - containerRect.left) / containerRect.width
    const clampedRatio = Math.max(minRatio, Math.min(maxRatio, newRatio))
    setRatio(clampedRatio)
  }, [isDragging, minRatio, maxRatio, setRatio])

  // 处理拖动结束
  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  // 双击重置比例
  const handleDoubleClick = useCallback(() => {
    resetRatio()
  }, [resetRatio])

  // 添加全局鼠标/触摸事件监听
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.addEventListener('touchmove', handleTouchMove)
      document.addEventListener('touchend', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    } else {
      // 拖动结束后触发 resize 事件，让终端重新适配
      window.dispatchEvent(new Event('resize'))
    }
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isDragging, handleMouseMove, handleTouchMove, handleMouseUp])

  // 计算左侧宽度
  const leftWidth = isCollapsed ? 0 : `${ratio * 100}%`
  const rightWidth = isCollapsed ? '100%' : `${(1 - ratio) * 100}%`

  // 移动端布局
  if (isMobile) {
    return (
      <div className={`relative h-full w-full overflow-hidden ${className}`}>
        {/* 移动端遮罩 */}
        {showMobileSidebar && (
          <div 
            className="fixed inset-0 bg-black/50 z-30 animate-fade-in"
            onClick={() => setShowMobileSidebar(false)}
          />
        )}
        
        {/* 移动端侧边栏 */}
        <div
          className={`
            fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw]
            bg-surface border-r border-border
            transform transition-transform duration-slow ease-out
            ${showMobileSidebar ? 'translate-x-0' : '-translate-x-full'}
          `}
        >
          <div className="h-full overflow-auto">
            {left}
          </div>
        </div>
        
        {/* 移动端主内容 */}
        <div className="h-full w-full overflow-hidden">
          {right}
        </div>
        
        {/* 移动端切换按钮 */}
        <button
          onClick={() => setShowMobileSidebar(!showMobileSidebar)}
          className="
            fixed bottom-4 left-4 z-50
            w-12 h-12 rounded-full
            bg-primary text-white shadow-theme-lg
            flex items-center justify-center
            transition-all duration-normal
            hover:bg-primary-hover hover:scale-105
            active:scale-95
          "
          aria-label={showMobileSidebar ? '关闭侧边栏' : '打开侧边栏'}
        >
          <svg
            className={`w-6 h-6 transition-transform duration-normal ${showMobileSidebar ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            {showMobileSidebar ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>
    )
  }

  // 桌面端布局
  return (
    <div
      ref={containerRef}
      className={`flex h-full w-full overflow-hidden ${className}`}
    >
      {/* 左侧面板 */}
      <div
        className="h-full overflow-hidden transition-all duration-normal ease-out"
        style={{ 
          width: leftWidth,
          minWidth: isCollapsed ? 0 : undefined,
        }}
      >
        {!isCollapsed && left}
      </div>

      {/* 分隔条 */}
      <div
        className={`
          relative flex-shrink-0 w-1 bg-border
          cursor-col-resize
          transition-colors duration-fast
          hover:bg-primary
          ${isDragging ? 'bg-primary' : ''}
        `}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onDoubleClick={handleDoubleClick}
      >
        {/* 拖动指示器 */}
        <div className={`
          absolute inset-y-0 -left-1 -right-1
          ${isDragging ? 'bg-primary/20' : ''}
        `} />
        
        {/* 折叠/展开按钮 */}
        <button
          onClick={() => {
            if (isCollapsed) {
              expand()
            } else {
              collapse()
            }
            // 延迟触发 resize，等待动画完成
            setTimeout(() => window.dispatchEvent(new Event('resize')), 350)
          }}
          className="
            absolute top-1/2 -translate-y-1/2 -left-3
            w-6 h-12 bg-surface border border-border rounded-theme-md
            flex items-center justify-center
            hover:bg-primary hover:text-white hover:border-primary
            transition-all duration-fast
            active:scale-95
            z-10 shadow-theme-sm
          "
          title={isCollapsed ? '展开' : '折叠'}
        >
          <svg
            className={`w-4 h-4 transition-transform duration-normal ${isCollapsed ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
      </div>

      {/* 右侧面板 */}
      <div
        className="h-full overflow-hidden flex-1 transition-all duration-normal ease-out"
        style={{ width: rightWidth }}
      >
        {right}
      </div>
    </div>
  )
}

/**
 * 计算响应式布局配置
 * 根据屏幕尺寸返回合适的布局参数
 * Property 9: 响应式布局适配正确性
 */
export function calculateResponsiveLayout(
  screenWidth: number,
  _screenHeight: number
): ResponsiveLayoutConfig {
  // 确保返回有效的布局配置
  const validWidth = Math.max(1, screenWidth)
  
  // 移动端 (< 768px)
  if (validWidth < 768) {
    return {
      isMobile: true,
      isTablet: false,
      isDesktop: false,
      defaultRatio: 0, // 移动端默认折叠左侧
      minRatio: 0,
      maxRatio: 0.8,
      showSidebar: false,
      stackLayout: true,
    }
  }
  
  // 平板 (768px - 1024px)
  if (validWidth < 1024) {
    return {
      isMobile: false,
      isTablet: true,
      isDesktop: false,
      defaultRatio: 0.25,
      minRatio: 0.15,
      maxRatio: 0.5,
      showSidebar: true,
      stackLayout: false,
    }
  }
  
  // 桌面端 (>= 1024px)
  return {
    isMobile: false,
    isTablet: false,
    isDesktop: true,
    defaultRatio: DEFAULT_SPLIT_RATIO,
    minRatio: MIN_SPLIT_RATIO,
    maxRatio: MAX_SPLIT_RATIO,
    showSidebar: true,
    stackLayout: false,
  }
}

export interface ResponsiveLayoutConfig {
  isMobile: boolean
  isTablet: boolean
  isDesktop: boolean
  defaultRatio: number
  minRatio: number
  maxRatio: number
  showSidebar: boolean
  stackLayout: boolean
}

/**
 * 验证布局配置是否有效
 * 确保所有组件都在可见区域内
 */
export function isValidLayoutConfig(config: ResponsiveLayoutConfig): boolean {
  // 检查比例范围有效性
  if (config.minRatio < 0 || config.maxRatio > 1) return false
  if (config.minRatio > config.maxRatio) return false
  if (config.defaultRatio < config.minRatio || config.defaultRatio > config.maxRatio) return false
  
  // 检查设备类型互斥性
  const deviceTypes = [config.isMobile, config.isTablet, config.isDesktop]
  const trueCount = deviceTypes.filter(Boolean).length
  if (trueCount !== 1) return false
  
  // 移动端特殊检查
  if (config.isMobile && config.showSidebar) return false
  
  return true
}

export default SplitLayout
