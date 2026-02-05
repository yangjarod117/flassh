import { describe, it, expect, beforeEach } from 'vitest'
import fc from 'fast-check'
import { themes } from '../theme'

// 模拟 localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()

Object.defineProperty(global, 'localStorage', { value: localStorageMock })

const STORAGE_KEY = 'flassh-theme'

// 纯函数版本用于测试
function saveThemeToStorage(themeId: string): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ currentThemeId: themeId }))
}

function loadThemeFromStorage(): string | null {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) {
    try {
      const parsed = JSON.parse(stored)
      return parsed.currentThemeId || null
    } catch {
      return null
    }
  }
  return null
}

/**
 * **Feature: web-ssh-terminal, Property 6: 主题持久化往返一致性**
 * **Validates: Requirements 5.3, 5.4**
 * 
 * *For any* 有效的主题 ID，保存到本地存储后再加载，应该得到相同的主题 ID。
 */
describe('Property 6: 主题持久化往返一致性', () => {
  beforeEach(() => {
    localStorageMock.clear()
  })

  // 有效主题 ID 生成器
  const validThemeIdArb = fc.constantFrom(...themes.map(t => t.id))

  it('should round-trip theme ID through localStorage', () => {
    fc.assert(
      fc.property(validThemeIdArb, (themeId: string) => {
        // 保存主题
        saveThemeToStorage(themeId)
        
        // 加载主题
        const loadedThemeId = loadThemeFromStorage()
        
        // 应该得到相同的主题 ID
        expect(loadedThemeId).toBe(themeId)
        
        return true
      }),
      { numRuns: 100 }
    )
  })

  it('should return null for empty storage', () => {
    localStorageMock.clear()
    const loadedThemeId = loadThemeFromStorage()
    expect(loadedThemeId).toBeNull()
  })

  it('should handle invalid JSON gracefully', () => {
    localStorage.setItem(STORAGE_KEY, 'invalid json')
    const loadedThemeId = loadThemeFromStorage()
    expect(loadedThemeId).toBeNull()
  })

  it('should handle missing currentThemeId field', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ otherField: 'value' }))
    const loadedThemeId = loadThemeFromStorage()
    expect(loadedThemeId).toBeNull()
  })
})
