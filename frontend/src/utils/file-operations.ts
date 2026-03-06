/**
 * 文件操作工具函数
 */

/**
 * 创建文件或文件夹
 */
async function createEntry(sessionId: string, path: string, type: 'file' | 'directory'): Promise<void> {
  const response = await fetch(`/api/sessions/${sessionId}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, type }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || (type === 'file' ? '创建文件失败' : '创建文件夹失败'))
  }
}

export const createFile = (sessionId: string, path: string) => createEntry(sessionId, path, 'file')
export const createDirectory = (sessionId: string, path: string) => createEntry(sessionId, path, 'directory')

/**
 * 重命名文件或文件夹
 */
export async function renameFile(
  sessionId: string,
  oldPath: string,
  newPath: string
): Promise<void> {
  const response = await fetch(`/api/sessions/${sessionId}/files`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: oldPath, newPath }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || '重命名失败')
  }
}

/**
 * 删除文件或文件夹
 */
async function deleteEntry(sessionId: string, path: string, type: 'file' | 'directory'): Promise<void> {
  const response = await fetch(
    `/api/sessions/${sessionId}/files?path=${encodeURIComponent(path)}&type=${type}`,
    { method: 'DELETE' }
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || (type === 'file' ? '删除文件失败' : '删除文件夹失败'))
  }
}

export const deleteFile = (sessionId: string, path: string) => deleteEntry(sessionId, path, 'file')
export const deleteDirectory = (sessionId: string, path: string) => deleteEntry(sessionId, path, 'directory')

/**
 * 复制路径到剪贴板
 */
export async function copyPathToClipboard(path: string): Promise<void> {
  await navigator.clipboard.writeText(path)
}

/**
 * 验证文件名
 */
export function validateFileName(name: string): string | null {
  if (!name || !name.trim()) {
    return '文件名不能为空'
  }

  // 检查非法字符
  const invalidChars = /[<>:"/\\|?*\x00-\x1f]/
  if (invalidChars.test(name)) {
    return '文件名包含非法字符'
  }

  // 检查保留名称（Windows）
  const reservedNames = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i
  if (reservedNames.test(name)) {
    return '文件名是系统保留名称'
  }

  // 检查长度
  if (name.length > 255) {
    return '文件名过长（最多 255 个字符）'
  }

  return null
}

/**
 * 获取父目录路径
 */
export function getParentPath(path: string): string {
  const parts = path.split('/').filter(Boolean)
  parts.pop()
  return parts.length === 0 ? '/' : '/' + parts.join('/')
}

/**
 * 拼接路径
 */
export function joinPath(basePath: string, name: string): string {
  if (basePath === '/') {
    return '/' + name
  }
  return basePath + '/' + name
}
