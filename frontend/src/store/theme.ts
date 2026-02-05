import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ThemeConfig, TerminalTheme } from '../types'

// 深色主题终端配置
const darkTerminalTheme: TerminalTheme = {
  background: '#0d1321',
  foreground: '#e4e4e7',
  cursor: '#00d4ff',
  selection: 'rgba(0, 212, 255, 0.3)',
  black: '#1e3a5f',
  red: '#ef4444',
  green: '#22c55e',
  yellow: '#eab308',
  blue: '#3b82f6',
  magenta: '#a855f7',
  cyan: '#06b6d4',
  white: '#f4f4f5',
}

// 浅色主题终端配置
const lightTerminalTheme: TerminalTheme = {
  background: '#ffffff',
  foreground: '#18181b',
  cursor: '#000000',
  selection: 'rgba(37, 99, 235, 0.2)',
  black: '#18181b',
  red: '#dc2626',
  green: '#16a34a',
  yellow: '#ca8a04',
  blue: '#2563eb',
  magenta: '#9333ea',
  cyan: '#0891b2',
  white: '#fafafa',
}

// 预定义主题
export const themes: ThemeConfig[] = [
  {
    id: 'dark',
    name: '深色主题',
    type: 'dark',
    colors: {
      primary: '#00d4ff',
      secondary: '#6b7280',
      background: '#0a0e17',
      surface: '#0d1321',
      text: '#e4e4e7',
      textSecondary: '#a1a1aa',
      border: '#1e3a5f',
      accent: '#8b5cf6',
      error: '#ef4444',
      success: '#22c55e',
    },
    terminal: darkTerminalTheme,
  },
  {
    id: 'light',
    name: '浅色主题',
    type: 'light',
    colors: {
      primary: '#2563eb',
      secondary: '#4b5563',
      background: '#f8fafc',
      surface: '#ffffff',
      text: '#18181b',
      textSecondary: '#71717a',
      border: '#e5e7eb',
      accent: '#7c3aed',
      error: '#dc2626',
      success: '#16a34a',
    },
    terminal: lightTerminalTheme,
  },
]

// 终端字体大小范围
export const MIN_TERMINAL_FONT_SIZE = 10
export const MAX_TERMINAL_FONT_SIZE = 24
export const DEFAULT_TERMINAL_FONT_SIZE = 14

// 可选字体列表
export const TERMINAL_FONTS = [
  { id: 'jetbrains', name: 'JetBrains Mono', value: "'JetBrains Mono', monospace" },
  { id: 'firacode', name: 'Fira Code', value: "'Fira Code', monospace" },
  { id: 'sourcecodepro', name: 'Source Code Pro', value: "'Source Code Pro', monospace" },
  { id: 'menlo', name: 'Menlo', value: "Menlo, Monaco, monospace" },
  { id: 'consolas', name: 'Consolas', value: "Consolas, monospace" },
  { id: 'courier', name: 'Courier New', value: "'Courier New', monospace" },
]

export const UI_FONTS = [
  { id: 'system', name: '系统默认', value: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" },
  { id: 'inter', name: 'Inter', value: "'Inter', sans-serif" },
  { id: 'noto', name: 'Noto Sans SC', value: "'Noto Sans SC', sans-serif" },
  { id: 'pingfang', name: '苹方', value: "'PingFang SC', sans-serif" },
  { id: 'microsoft', name: '微软雅黑', value: "'Microsoft YaHei', sans-serif" },
]

export const DEFAULT_TERMINAL_FONT = TERMINAL_FONTS[0].id
export const DEFAULT_UI_FONT = UI_FONTS[0].id

interface ThemeState {
  currentThemeId: string
  followSystemTheme: boolean
  terminalFontSize: number
  terminalFontId: string
  uiFontId: string
  
  // Actions
  setTheme: (themeId: string) => void
  setFollowSystemTheme: (follow: boolean) => void
  setTerminalFontSize: (size: number) => void
  setTerminalFont: (fontId: string) => void
  setUIFont: (fontId: string) => void
  getCurrentTheme: () => ThemeConfig
  getTerminalFontFamily: () => string
  getUIFontFamily: () => string
}

const STORAGE_KEY = 'flassh-theme'

/**
 * 获取系统主题偏好
 */
export function getSystemThemePreference(): 'dark' | 'light' {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'dark'
}

/**
 * 主题状态管理
 */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      currentThemeId: 'dark',
      followSystemTheme: false,
      terminalFontSize: DEFAULT_TERMINAL_FONT_SIZE,
      terminalFontId: DEFAULT_TERMINAL_FONT,
      uiFontId: DEFAULT_UI_FONT,
      
      setTheme: (themeId: string) => {
        const themeExists = themes.some(t => t.id === themeId)
        if (themeExists) {
          set({ currentThemeId: themeId, followSystemTheme: false })
        }
      },
      
      setFollowSystemTheme: (follow: boolean) => {
        set({ followSystemTheme: follow })
        if (follow) {
          const systemTheme = getSystemThemePreference()
          set({ currentThemeId: systemTheme })
        }
      },
      
      setTerminalFontSize: (size: number) => {
        const clampedSize = Math.max(MIN_TERMINAL_FONT_SIZE, Math.min(MAX_TERMINAL_FONT_SIZE, size))
        set({ terminalFontSize: clampedSize })
      },
      
      setTerminalFont: (fontId: string) => {
        const fontExists = TERMINAL_FONTS.some(f => f.id === fontId)
        if (fontExists) {
          set({ terminalFontId: fontId })
        }
      },
      
      setUIFont: (fontId: string) => {
        const fontExists = UI_FONTS.some(f => f.id === fontId)
        if (fontExists) {
          set({ uiFontId: fontId })
        }
      },
      
      getCurrentTheme: () => {
        const state = get()
        let themeId = state.currentThemeId
        
        if (state.followSystemTheme) {
          themeId = getSystemThemePreference()
        }
        
        return themes.find(t => t.id === themeId) || themes[0]
      },
      
      getTerminalFontFamily: () => {
        const state = get()
        const font = TERMINAL_FONTS.find(f => f.id === state.terminalFontId)
        return font?.value || TERMINAL_FONTS[0].value
      },
      
      getUIFontFamily: () => {
        const state = get()
        const font = UI_FONTS.find(f => f.id === state.uiFontId)
        return font?.value || UI_FONTS[0].value
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({
        currentThemeId: state.currentThemeId,
        followSystemTheme: state.followSystemTheme,
        terminalFontSize: state.terminalFontSize,
        terminalFontId: state.terminalFontId,
        uiFontId: state.uiFontId,
      }),
    }
  )
)

// 纯函数用于测试
export function saveThemeToStorage(themeId: string): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ currentThemeId: themeId }))
  }
}

export function loadThemeFromStorage(): string | null {
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        return parsed.currentThemeId || null
      } catch {
        return null
      }
    }
  }
  return null
}
