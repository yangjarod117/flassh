/**
 * 统一格式化工具函数
 * 消除 FileExplorer / FileManagerComplete / FileTransfer / SidePanel / SystemMonitor 中的重复实现
 */

const SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB']

/** 格式化字节数为可读字符串 */
export function formatFileSize(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${SIZE_UNITS[i]}`
}

/** 格式化传输速度 */
export function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond === 0) return '0 B/s'
  return `${formatFileSize(bytesPerSecond)}/s`
}

// 缓存日期格式化器
const dateFormatter = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
const timeFormatter = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' })

/** 格式化日期时间 */
export function formatDateTime(date: Date): string {
  if (isNaN(date.getTime())) return '--'
  try {
    return `${dateFormatter.format(date)} ${timeFormatter.format(date)}`
  } catch { return '--' }
}
