import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SplitLayoutState } from '../types'

// 分栏比例的有效范围
export const MIN_SPLIT_RATIO = 0.1
export const MAX_SPLIT_RATIO = 0.9
export const DEFAULT_SPLIT_RATIO = 0.2

interface LayoutState extends SplitLayoutState {
  // Actions
  setRatio: (ratio: number) => void
  collapse: () => void
  expand: () => void
  resetRatio: () => void
}

const STORAGE_KEY = 'flassh-layout'

/**
 * 布局状态管理
 */
export const useLayoutStore = create<LayoutState>()(
  persist(
    (set: (fn: (state: LayoutState) => Partial<LayoutState> | LayoutState) => void, get: () => LayoutState) => ({
      ratio: DEFAULT_SPLIT_RATIO,
      isCollapsed: false,
      collapsedRatio: DEFAULT_SPLIT_RATIO,
      
      setRatio: (ratio: number) => {
        const clampedRatio = clampRatio(ratio)
        set(() => ({ ratio: clampedRatio }))
      },
      
      collapse: () => {
        const state = get()
        if (!state.isCollapsed) {
          set(() => ({
            isCollapsed: true,
            collapsedRatio: state.ratio,
            ratio: 0,
          }))
        }
      },
      
      expand: () => {
        const state = get()
        if (state.isCollapsed) {
          set(() => ({
            isCollapsed: false,
            ratio: state.collapsedRatio,
          }))
        }
      },
      
      resetRatio: () => {
        set(() => ({
          ratio: DEFAULT_SPLIT_RATIO,
          isCollapsed: false,
        }))
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({
        ratio: state.ratio,
        isCollapsed: state.isCollapsed,
        collapsedRatio: state.collapsedRatio,
      }),
    }
  )
)

// 纯函数用于测试

/**
 * 将比例限制在有效范围内
 */
export function clampRatio(ratio: number): number {
  return Math.max(MIN_SPLIT_RATIO, Math.min(MAX_SPLIT_RATIO, ratio))
}

/**
 * 检查比例是否在有效范围内
 */
export function isValidRatio(ratio: number): boolean {
  return ratio >= MIN_SPLIT_RATIO && ratio <= MAX_SPLIT_RATIO
}

/**
 * 根据拖动位置计算分栏比例
 */
export function calculateRatioFromPosition(
  position: number,
  containerWidth: number
): number {
  if (containerWidth <= 0) return DEFAULT_SPLIT_RATIO
  const ratio = position / containerWidth
  return clampRatio(ratio)
}

/**
 * 折叠分栏
 */
export function collapseLayout(state: SplitLayoutState): SplitLayoutState {
  if (state.isCollapsed) return state
  return {
    ratio: 0,
    isCollapsed: true,
    collapsedRatio: state.ratio,
  }
}

/**
 * 展开分栏
 */
export function expandLayout(state: SplitLayoutState): SplitLayoutState {
  if (!state.isCollapsed) return state
  return {
    ratio: state.collapsedRatio,
    isCollapsed: false,
    collapsedRatio: state.collapsedRatio,
  }
}

/**
 * 折叠后再展开（往返操作）
 */
export function collapseAndExpand(state: SplitLayoutState): SplitLayoutState {
  const collapsed = collapseLayout(state)
  return expandLayout(collapsed)
}

/**
 * 序列化布局状态
 */
export function serializeLayout(state: SplitLayoutState): string {
  return JSON.stringify({
    ratio: state.ratio,
    isCollapsed: state.isCollapsed,
    collapsedRatio: state.collapsedRatio,
  })
}

/**
 * 反序列化布局状态
 */
export function deserializeLayout(json: string): SplitLayoutState | null {
  try {
    const parsed = JSON.parse(json)
    if (
      typeof parsed.ratio === 'number' &&
      typeof parsed.isCollapsed === 'boolean' &&
      typeof parsed.collapsedRatio === 'number'
    ) {
      return {
        ratio: parsed.ratio,
        isCollapsed: parsed.isCollapsed,
        collapsedRatio: parsed.collapsedRatio,
      }
    }
    return null
  } catch {
    return null
  }
}
