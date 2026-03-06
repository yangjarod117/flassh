import type { FileItem } from '../types'

/**
 * 计算传输进度百分比
 */
export function calculateTransferProgress(
  transferredBytes: number,
  totalBytes: number
): number {
  if (totalBytes <= 0) return 0
  const percentage = (transferredBytes / totalBytes) * 100
  return Math.min(100, Math.max(0, Math.round(percentage * 10) / 10))
}

/**
 * 检测文件冲突
 */
export function detectFileConflict(
  existingFiles: FileItem[],
  uploadFileName: string
): boolean {
  return existingFiles.some(
    (file) => file.name.toLowerCase() === uploadFileName.toLowerCase()
  )
}

/**
 * 下载文件
 */
export async function downloadFile(sessionId: string, file: FileItem): Promise<void> {
  const url = `/api/sessions/${sessionId}/files/download?path=${encodeURIComponent(file.path)}`
  const response = await fetch(url)
  if (!response.ok) throw new Error('下载失败')

  const blob = await response.blob()
  const downloadUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = downloadUrl
  link.download = file.name
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(downloadUrl)
}
