import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useThemeStore, themes, MIN_TERMINAL_FONT_SIZE, MAX_TERMINAL_FONT_SIZE, TERMINAL_FONTS, UI_FONTS } from '../store'

/**
 * 主题选择器组件
 */
export function ThemeSelector() {
  const [isOpen, setIsOpen] = useState(false)
  const { 
    currentThemeId, 
    followSystemTheme, 
    terminalFontSize,
    terminalFontId,
    uiFontId,
    setTheme, 
    setFollowSystemTheme,
    setTerminalFontSize,
    setTerminalFont,
    setUIFont,
  } = useThemeStore()

  const currentTheme = themes.find((t) => t.id === currentThemeId) || themes[0]

  const handleFontSizeChange = (delta: number) => {
    setTerminalFontSize(terminalFontSize + delta)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface hover:bg-opacity-80 transition-colors border border-border"
      >
        <span className="text-sm">{currentTheme.name}</span>
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* 背景遮罩 */}
            <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />

            {/* 下拉菜单 */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 mt-2 w-56 rounded-lg bg-surface border border-border shadow-lg z-20 overflow-hidden"
            >
              {/* 主题列表 */}
              <div className="py-1">
                {themes.map((theme) => (
                  <button
                    key={theme.id}
                    onClick={() => {
                      setTheme(theme.id)
                      setIsOpen(false)
                    }}
                    className={`w-full px-4 py-2 text-left text-sm hover:bg-primary hover:bg-opacity-10 transition-colors flex items-center gap-2 ${
                      currentThemeId === theme.id && !followSystemTheme ? 'text-primary' : ''
                    }`}
                  >
                    <span
                      className="w-4 h-4 rounded-full border border-border"
                      style={{ backgroundColor: theme.colors.background }}
                    />
                    {theme.name}
                    {currentThemeId === theme.id && !followSystemTheme && (
                      <svg className="w-4 h-4 ml-auto" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </button>
                ))}
              </div>

              {/* 分隔线 */}
              <div className="border-t border-border" />

              {/* 跟随系统设置 */}
              <div className="py-1">
                <button
                  onClick={() => {
                    setFollowSystemTheme(!followSystemTheme)
                    setIsOpen(false)
                  }}
                  className={`w-full px-4 py-2 text-left text-sm hover:bg-primary hover:bg-opacity-10 transition-colors flex items-center gap-2 ${
                    followSystemTheme ? 'text-primary' : ''
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                  跟随系统
                  {followSystemTheme && (
                    <svg className="w-4 h-4 ml-auto" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </button>
              </div>

              {/* 分隔线 */}
              <div className="border-t border-border" />

              {/* 终端字体大小调整 */}
              <div className="py-2 px-4">
                <div className="text-xs text-textSecondary mb-2">终端字体大小</div>
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => handleFontSizeChange(-1)}
                    disabled={terminalFontSize <= MIN_TERMINAL_FONT_SIZE}
                    className="w-8 h-8 flex items-center justify-center rounded-md bg-background hover:bg-primary hover:bg-opacity-10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                    </svg>
                  </button>
                  <span className="text-sm font-mono min-w-[3rem] text-center">{terminalFontSize}px</span>
                  <button
                    onClick={() => handleFontSizeChange(1)}
                    disabled={terminalFontSize >= MAX_TERMINAL_FONT_SIZE}
                    className="w-8 h-8 flex items-center justify-center rounded-md bg-background hover:bg-primary hover:bg-opacity-10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* 分隔线 */}
              <div className="border-t border-border" />

              {/* 终端字体选择 */}
              <div className="py-2 px-4">
                <div className="text-xs text-textSecondary mb-2">终端字体</div>
                <select
                  value={terminalFontId}
                  onChange={(e) => setTerminalFont(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm rounded-md bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {TERMINAL_FONTS.map((font) => (
                    <option key={font.id} value={font.id}>
                      {font.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 分隔线 */}
              <div className="border-t border-border" />

              {/* 界面字体选择 */}
              <div className="py-2 px-4">
                <div className="text-xs text-textSecondary mb-2">界面字体</div>
                <select
                  value={uiFontId}
                  onChange={(e) => setUIFont(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm rounded-md bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {UI_FONTS.map((font) => (
                    <option key={font.id} value={font.id}>
                      {font.name}
                    </option>
                  ))}
                </select>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
