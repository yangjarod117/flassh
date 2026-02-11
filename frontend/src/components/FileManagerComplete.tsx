import { useState, useCallback, useRef, useEffect } from 'react'
import { FileExplorer, addFavorite } from './FileExplorer'
import { ContextMenu, generateContextMenuItems } from './ContextMenu'
import { ConfirmDialog, InputDialog } from './Dialog'
import { FileConflictDialog } from './FileConflictDialog'
import { calculateTransferProgress, detectFileConflict, downloadFile } from './FileTransfer'
import { createFile, createDirectory, renameFile, deleteFile, deleteDirectory, copyPathToClipboard, validateFileName, getParentPath, joinPath } from '../utils/file-operations'
import type { FileItem, ContextMenuPosition, TransferProgress, ContextMenuItem } from '../types'

export interface FileManagerCompleteProps {
  sessionId: string
  serverKey?: string // host:port 用于持久化收藏
  onFileOpen?: (file: FileItem) => void
  onFileEdit?: (file: FileItem) => void
  onOpenTerminalInDir?: (path: string) => void
}

const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 B'
  const k = 1024, s = ['B', 'KB', 'MB', 'GB'], i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${s[i]}`
}
const formatSpeed = (bps: number) => bps < 1024 ? `${bps.toFixed(0)} B/s` : bps < 1048576 ? `${(bps / 1024).toFixed(1)} KB/s` : `${(bps / 1048576).toFixed(1)} MB/s`

export function FileManagerComplete({ sessionId, serverKey, onFileOpen, onFileEdit, onOpenTerminalInDir }: FileManagerCompleteProps) {
  const favoriteStoreKey = serverKey || sessionId // 优先使用 serverKey 作为收藏存储 key
  const [currentPath, setCurrentPath] = useState('/')
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null)
  const [files, setFiles] = useState<FileItem[]>([])
  const [refreshKey, setRefreshKey] = useState(0)
  const [favoriteKey, setFavoriteKey] = useState(0)
  const [contextMenu, setContextMenu] = useState<{ file: FileItem; position: ContextMenuPosition } | null>(null)
  const [dialogs, setDialogs] = useState({ newFile: false, newFolder: false, rename: false, delete: false })
  const [isLoading, setIsLoading] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploads, setUploads] = useState<TransferProgress[]>([])
  const [conflictDialog, setConflictDialog] = useState<{ fileName: string; onOverwrite: () => void; onSkip: () => void } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadFiles = useCallback(async () => {
    try {
      const response = await fetch(`/api/sessions/${sessionId}/files?path=${encodeURIComponent(currentPath)}`)
      if (response.ok) setFiles((await response.json()).files || [])
    } catch (e) { console.error('Failed to load files:', e) }
  }, [sessionId, currentPath])

  useEffect(() => { loadFiles() }, [loadFiles, refreshKey])

  const refresh = useCallback(() => setRefreshKey(k => k + 1), [])
  const showToast = (type: 'success' | 'error', message: string) => { setToast({ type, message }); setTimeout(() => setToast(null), 3000) }
  const closeContextMenu = () => setContextMenu(null)
  const getTargetPath = () => selectedFile?.type === 'directory' ? selectedFile.path : currentPath
  const setDialog = (key: keyof typeof dialogs, val: boolean) => setDialogs(d => ({ ...d, [key]: val }))

  const uploadFile = useCallback(async (file: File, targetPath: string, overwrite = false): Promise<boolean> => {
    if (!overwrite && detectFileConflict(files, file.name)) {
      return new Promise(resolve => {
        setConflictDialog({
          fileName: file.name,
          onOverwrite: async () => { setConflictDialog(null); resolve(await uploadFile(file, targetPath, true)) },
          onSkip: () => { setConflictDialog(null); resolve(false) },
        })
      })
    }
    const progress: TransferProgress = { fileName: file.name, totalBytes: file.size, transferredBytes: 0, percentage: 0, speed: 0 }
    setUploads(prev => [...prev, progress])
    const startTime = Date.now()
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('path', targetPath)
      const xhr = new XMLHttpRequest()
      xhr.upload.onprogress = e => {
        if (e.lengthComputable) {
          const elapsed = (Date.now() - startTime) / 1000
          setUploads(prev => prev.map(p => p.fileName === file.name ? { ...p, transferredBytes: e.loaded, percentage: calculateTransferProgress(e.loaded, e.total), speed: elapsed > 0 ? e.loaded / elapsed : 0 } : p))
        }
      }
      await new Promise<void>((resolve, reject) => {
        xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`上传失败: ${xhr.statusText}`))
        xhr.onerror = () => reject(new Error('网络错误'))
        xhr.open('POST', `/api/sessions/${sessionId}/files/upload`)
        xhr.send(formData)
      })
      setTimeout(() => setUploads(prev => prev.filter(p => p.fileName !== file.name)), 1000)
      return true
    } catch (e) {
      console.error('Upload error:', e)
      setUploads(prev => prev.filter(p => p.fileName !== file.name))
      showToast('error', `上传 ${file.name} 失败`)
      return false
    }
  }, [sessionId, files])

  const handleFileSelect = async (fileList: FileList | null) => {
    if (!fileList?.length) return
    const targetPath = getTargetPath()
    let successCount = 0
    for (const file of Array.from(fileList)) if (await uploadFile(file, targetPath)) successCount++
    if (successCount > 0) { showToast('success', `成功上传 ${successCount} 个文件`); refresh() }
  }

  const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true) }
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) setIsDragging(false)
  }
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation() }
  const handleDrop = async (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); await handleFileSelect(e.dataTransfer.files) }

  const handleDownload = async () => {
    if (!selectedFile) return
    if (selectedFile.type === 'directory') { showToast('error', '文件夹下载功能暂未实现'); closeContextMenu(); return }
    try { await downloadFile(sessionId, selectedFile); showToast('success', '下载已开始') }
    catch { showToast('error', '下载失败') }
    closeContextMenu()
  }

  const handleOpen = () => {
    if (!selectedFile) return
    if (selectedFile.type === 'directory') {
      setCurrentPath(selectedFile.path)
    } else {
      onFileOpen?.(selectedFile)
    }
    closeContextMenu()
  }

  const handleEdit = () => { if (selectedFile) { onFileEdit?.(selectedFile); closeContextMenu() } }

  const handleFileOp = async (op: () => Promise<void>, successMsg: string, dialogKey: keyof typeof dialogs) => {
    setIsLoading(true)
    try { await op(); showToast('success', successMsg); refresh(); setDialog(dialogKey, false) }
    catch (e) { showToast('error', e instanceof Error ? e.message : '操作失败') }
    finally { setIsLoading(false) }
  }

  const handleNewFile = (name: string) => handleFileOp(() => createFile(sessionId, joinPath(getTargetPath(), name)), '文件创建成功', 'newFile')
  const handleNewFolder = (name: string) => handleFileOp(() => createDirectory(sessionId, joinPath(getTargetPath(), name)), '文件夹创建成功', 'newFolder')
  const handleRename = (newName: string) => { if (selectedFile) handleFileOp(() => renameFile(sessionId, selectedFile.path, joinPath(getParentPath(selectedFile.path), newName)), '重命名成功', 'rename') }
  const handleDelete = () => { if (selectedFile) handleFileOp(async () => { await (selectedFile.type === 'directory' ? deleteDirectory : deleteFile)(sessionId, selectedFile.path); setSelectedFile(null) }, '删除成功', 'delete') }

  const handleCopyPath = async () => {
    if (!selectedFile) return
    try { await copyPathToClipboard(selectedFile.path); showToast('success', '路径已复制到剪贴板') }
    catch { showToast('error', '复制路径失败') }
    closeContextMenu()
  }

  const handleOpenTerminal = () => { if (selectedFile?.type === 'directory') { onOpenTerminalInDir?.(selectedFile.path); closeContextMenu() } }

  const handleFavorite = () => {
    if (!selectedFile) return
    addFavorite(favoriteStoreKey, {
      path: selectedFile.path,
      name: selectedFile.name,
      type: selectedFile.type === 'directory' ? 'directory' : 'file'
    })
    showToast('success', '已添加到收藏')
    setFavoriteKey(k => k + 1) // 触发 FileExplorer 刷新收藏
    closeContextMenu()
  }

  const menuItems = contextMenu ? generateContextMenuItems({
    file: contextMenu.file, onOpen: handleOpen, onEdit: handleEdit,
    onRename: () => { setDialog('rename', true); closeContextMenu() },
    onDelete: () => { setDialog('delete', true); closeContextMenu() },
    onCopyPath: handleCopyPath, onDownload: handleDownload,
    onUpload: () => fileInputRef.current?.click(),
    onNewFile: () => { setDialog('newFile', true); closeContextMenu() },
    onNewFolder: () => { setDialog('newFolder', true); closeContextMenu() },
    onOpenTerminal: handleOpenTerminal,
    onFavorite: handleFavorite,
  }) : []

  // 空白处右键菜单
  const handleBlankContextMenu = (e: React.MouseEvent) => {
    // 只在空白处触发（不是文件项）
    if ((e.target as HTMLElement).closest('[data-file-item]')) return
    e.preventDefault()
    e.stopPropagation()
    setSelectedFile(null)
    setContextMenu({
      file: { name: '', path: currentPath, type: 'directory', size: 0, modifiedTime: new Date(), permissions: '' },
      position: { x: e.clientX, y: e.clientY }
    })
  }

  // 空白处菜单项
  const blankMenuItems: ContextMenuItem[] = !contextMenu?.file.name ? [
    { id: 'newFolder', label: '新建文件夹', icon: 'newFolder', onClick: () => { setDialog('newFolder', true); closeContextMenu() } },
    { id: 'newFile', label: '新建文件', icon: 'newFile', onClick: () => { setDialog('newFile', true); closeContextMenu() } },
    { id: 'upload', label: '上传文件', icon: 'upload', onClick: () => { fileInputRef.current?.click(); closeContextMenu() } },
    { id: 'refresh', label: '刷新', icon: 'refresh', onClick: () => { refresh(); closeContextMenu() } },
  ] : menuItems

  return (
    <div className="relative h-full" onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop} onContextMenu={handleBlankContextMenu}>
      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => handleFileSelect(e.target.files)} />
      
      <FileExplorer sessionId={sessionId} currentPath={currentPath} onPathChange={setCurrentPath} onFileSelect={setSelectedFile}
        onFileDoubleClick={file => { if (file.type !== 'directory') onFileEdit?.(file) }}
        onContextMenu={(file, pos) => { setSelectedFile(file); setContextMenu({ file, position: pos }) }}
        favoriteKey={favoriteKey} favoriteStoreKey={favoriteStoreKey} refreshKey={refreshKey} />

      {isDragging && (
        <div className="absolute inset-0 z-40 bg-primary/20 border-2 border-dashed border-primary flex items-center justify-center">
          <div className="text-center">
            <svg className="w-16 h-16 mx-auto text-primary mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
            <p className="text-lg text-white">释放文件以上传</p>
          </div>
        </div>
      )}

      {contextMenu && <ContextMenu items={blankMenuItems} position={contextMenu.position} onClose={closeContextMenu} />}

      <InputDialog isOpen={dialogs.newFile} onClose={() => setDialog('newFile', false)} onConfirm={handleNewFile} title="新建文件" placeholder="请输入文件名" confirmText="创建" isLoading={isLoading} validator={validateFileName} />
      <InputDialog isOpen={dialogs.newFolder} onClose={() => setDialog('newFolder', false)} onConfirm={handleNewFolder} title="新建文件夹" placeholder="请输入文件夹名" confirmText="创建" isLoading={isLoading} validator={validateFileName} />
      <InputDialog isOpen={dialogs.rename} onClose={() => setDialog('rename', false)} onConfirm={handleRename} title="重命名" placeholder="请输入新名称" defaultValue={selectedFile?.name || ''} confirmText="重命名" isLoading={isLoading} validator={validateFileName} />
      <ConfirmDialog isOpen={dialogs.delete} onClose={() => setDialog('delete', false)} onConfirm={handleDelete} title="确认删除" message={`确定要删除 "${selectedFile?.name}" 吗？此操作无法撤销。`} confirmText="删除" danger isLoading={isLoading} />

      {conflictDialog && <FileConflictDialog isOpen={true} fileName={conflictDialog.fileName} onOverwrite={conflictDialog.onOverwrite} onSkip={conflictDialog.onSkip} onCancel={() => { conflictDialog.onSkip(); setConflictDialog(null) }} />}

      {uploads.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 w-80 bg-surface border border-border rounded-lg shadow-xl overflow-hidden">
          <div className="px-3 py-2 border-b border-border bg-surface/50"><span className="text-sm font-medium text-white">上传中 ({uploads.length})</span></div>
          <div className="max-h-60 overflow-y-auto">
            {uploads.map(u => (
              <div key={u.fileName} className="px-3 py-2 border-b border-border/30 last:border-0">
                <div className="flex items-center justify-between mb-1"><span className="text-sm text-white truncate flex-1 mr-2">{u.fileName}</span><span className="text-xs text-secondary">{u.percentage}%</span></div>
                <div className="h-1.5 bg-background rounded-full overflow-hidden"><div className="h-full bg-primary transition-all duration-300" style={{ width: `${u.percentage}%` }} /></div>
                <div className="flex items-center justify-between mt-1 text-xs text-secondary"><span>{formatSize(u.transferredBytes)} / {formatSize(u.totalBytes)}</span><span>{formatSpeed(u.speed)}</span></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {toast && <div className={`fixed bottom-4 left-4 z-50 px-4 py-2 rounded-lg shadow-lg animate-slide-in ${toast.type === 'success' ? 'bg-success' : 'bg-error'} text-white text-sm`}>{toast.message}</div>}
    </div>
  )
}
