import { useEffect, type ReactNode } from 'react'
import { useThemeStore, themes, getSystemThemePreference } from '../store'

interface ThemeProviderProps {
  children: ReactNode
}

/** 根据 themeId 应用 CSS 变量到 DOM */
function applyThemeToDom(themeId: string) {
  const theme = themes.find(t => t.id === themeId) || themes[0]
  const root = document.documentElement

  if (theme.type === 'dark') {
    root.classList.add('dark')
    root.classList.remove('light')
  } else {
    root.classList.add('light')
    root.classList.remove('dark')
  }

  Object.entries(theme.colors).forEach(([key, value]) => {
    root.style.setProperty(`--color-${key}`, value)
  })

  Object.entries(theme.terminal).forEach(([key, value]) => {
    root.style.setProperty(`--terminal-${key}`, value)
  })
}

// 立即应用当前主题（避免闪烁）
const initState = useThemeStore.getState()
const initThemeId = initState.followSystemTheme ? getSystemThemePreference() : initState.currentThemeId
applyThemeToDom(initThemeId)

// 订阅 store 变化，任何主题相关状态变化都立即应用
useThemeStore.subscribe((state, prevState) => {
  if (state.currentThemeId !== prevState.currentThemeId || state.followSystemTheme !== prevState.followSystemTheme) {
    const themeId = state.followSystemTheme ? getSystemThemePreference() : state.currentThemeId
    applyThemeToDom(themeId)
  }
})

/**
 * 主题提供者组件
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  const followSystemTheme = useThemeStore(s => s.followSystemTheme)
  const setTheme = useThemeStore(s => s.setTheme)

  // 监听系统主题变化
  useEffect(() => {
    if (!followSystemTheme) return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (e: MediaQueryListEvent) => {
      setTheme(e.matches ? 'dark' : 'light')
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [followSystemTheme, setTheme])

  return <>{children}</>
}
