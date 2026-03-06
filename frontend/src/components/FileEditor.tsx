import { useEffect, useRef, useCallback, useState } from 'react'
import Editor, { OnMount, OnChange } from '@monaco-editor/react'
import type * as Monaco from 'monaco-editor'
import { useEditorStore } from '../store/editor'
import { useThemeStore } from '../store/theme'
import { formatFileSize } from '../utils/formatting'
import { ConfirmDialog } from './Dialog'

/**
 * 文件编辑器组件属性
 */
export interface FileEditorProps {
  fileId: string
  onSave: (path: string, content: string) => Promise<void>
  onClose: () => void
}

/**
 * 根据文件扩展名获取 Monaco 语言
 */
export function getLanguageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || ''
  const languageMap: Record<string, string> = {
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    json: 'json',
    html: 'html',
    htm: 'html',
    css: 'css',
    scss: 'scss',
    less: 'less',
    md: 'markdown',
    markdown: 'markdown',
    py: 'python',
    rb: 'ruby',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    cs: 'csharp',
    go: 'go',
    rs: 'rust',
    php: 'php',
    sql: 'sql',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    yml: 'yaml',
    yaml: 'yaml',
    xml: 'xml',
    svg: 'xml',
    ini: 'ini',
    conf: 'ini',
    cfg: 'ini',
    toml: 'ini',
    dockerfile: 'dockerfile',
    makefile: 'makefile',
    gitignore: 'plaintext',
    env: 'plaintext',
    txt: 'plaintext',
  }
  return languageMap[ext] || 'plaintext'
}

/**
 * 大文件阈值（10MB）
 */
export const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024

/**
 * 检测是否为大文件
 */
export function isLargeFile(size: number): boolean {
  return size > LARGE_FILE_THRESHOLD
}

/**
 * 文件编辑器组件
 */
export function FileEditor({ fileId, onSave, onClose }: FileEditorProps) {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const { openFiles, updateFileContent, markFileSaved, getFile } = useEditorStore()
  const { currentThemeId } = useThemeStore()
  
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showCloseConfirm, setShowCloseConfirm] = useState(false)
  
  const file = openFiles.get(fileId)
  
  // 获取 Monaco 主题
  const monacoTheme = currentThemeId === 'light' ? 'vs' : 'vs-dark'
  
  // 处理编辑器挂载
  const handleEditorMount: OnMount = useCallback((editor) => {
    editorRef.current = editor
    editor.focus()
  }, [])
  
  // 处理内容变化
  const handleContentChange: OnChange = useCallback((value) => {
    if (value !== undefined) {
      updateFileContent(fileId, value)
    }
  }, [fileId, updateFileContent])

  // 保存文件
  const handleSave = useCallback(async () => {
    const currentFile = getFile(fileId)
    if (!currentFile) return
    
    setIsSaving(true)
    setSaveMessage(null)
    
    try {
      await onSave(currentFile.path, currentFile.content)
      markFileSaved(fileId)
      setSaveMessage({ type: 'success', text: '保存成功' })
      setTimeout(() => setSaveMessage(null), 2000)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '保存失败'
      setSaveMessage({ type: 'error', text: errorMessage })
    } finally {
      setIsSaving(false)
    }
  }, [fileId, getFile, markFileSaved, onSave])
  
  // 处理关闭
  const handleClose = useCallback(() => {
    const currentFile = getFile(fileId)
    if (currentFile?.isDirty) {
      setShowCloseConfirm(true)
    } else {
      onClose()
    }
  }, [fileId, getFile, onClose])
  
  // 确认关闭（不保存）
  const handleConfirmClose = useCallback(() => {
    setShowCloseConfirm(false)
    onClose()
  }, [onClose])

  // 保存并关闭
  const handleSaveAndClose = useCallback(async () => {
    await handleSave()
    const currentFile = getFile(fileId)
    if (!currentFile?.isDirty) {
      setShowCloseConfirm(false)
      onClose()
    }
  }, [handleSave, fileId, getFile, onClose])
  
  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSave])
  
  if (!file) {
    return (
      <div className="flex items-center justify-center h-full text-secondary">
        文件未找到
      </div>
    )
  }
  
  const language = getLanguageFromPath(file.path)
  const fileName = file.path.split('/').pop() || file.path

  return (
    <div className="flex flex-col h-full bg-background">
      {/* 编辑器头部 */}
      <div className="flex items-center justify-between px-4 py-2 bg-surface border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-white font-medium">
            {fileName}
            {file.isDirty && <span className="text-primary ml-1">●</span>}
          </span>
          <span className="text-secondary text-sm">{file.path}</span>
        </div>
        
        <div className="flex items-center gap-2">
          {/* 保存状态消息 */}
          {saveMessage && (
            <span className={`text-sm ${
              saveMessage.type === 'success' ? 'text-success' : 'text-error'
            }`}>
              {saveMessage.text}
            </span>
          )}
          
          {/* 保存按钮 */}
          <button
            onClick={handleSave}
            disabled={isSaving || !file.isDirty}
            className="
              px-3 py-1 rounded text-sm
              bg-primary hover:bg-primary/80 text-white
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-colors duration-150
            "
          >
            {isSaving ? '保存中...' : '保存'}
          </button>

          {/* 关闭按钮 */}
          <button
            onClick={handleClose}
            className="
              p-1 rounded text-secondary hover:text-white hover:bg-surface/80
              transition-colors duration-150
            "
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      
      {/* Monaco 编辑器 */}
      <div className="flex-1">
        <Editor
          height="100%"
          language={language}
          theme={monacoTheme}
          value={file.content}
          onChange={handleContentChange}
          onMount={handleEditorMount}
          options={{
            fontSize: 14,
            fontFamily: "'Fira Code', 'Consolas', 'Monaco', monospace",
            minimap: { enabled: true },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            automaticLayout: true,
            tabSize: 2,
            insertSpaces: true,
            renderWhitespace: 'selection',
            lineNumbers: 'on',
            folding: true,
            bracketPairColorization: { enabled: true },
          }}
        />
      </div>

      {/* 未保存确认对话框 */}
      <ConfirmDialog
        isOpen={showCloseConfirm}
        onClose={() => setShowCloseConfirm(false)}
        onConfirm={handleConfirmClose}
        title="未保存的更改"
        message={`文件 "${fileName}" 有未保存的更改。是否放弃更改并关闭？`}
        confirmText="放弃更改"
        cancelText="取消"
        danger
      />
      
      {/* 保存并关闭按钮（在对话框中额外显示） */}
      {showCloseConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-none">
          <div className="pointer-events-auto">
            <button
              onClick={handleSaveAndClose}
              disabled={isSaving}
              className="
                fixed bottom-4 right-4 px-4 py-2 rounded text-sm font-medium
                bg-success hover:bg-success/80 text-white
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-colors duration-150 shadow-lg
              "
            >
              {isSaving ? '保存中...' : '保存并关闭'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}


/**
 * 大文件警告对话框属性
 */
export interface LargeFileWarningDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  fileName: string
  fileSize: number
}

/**
 * 大文件警告对话框组件
 */
export function LargeFileWarningDialog({
  isOpen,
  onClose,
  onConfirm,
  fileName,
  fileSize,
}: LargeFileWarningDialogProps) {
  return (
    <ConfirmDialog
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={onConfirm}
      title="大文件警告"
      message={`文件 "${fileName}" 大小为 ${formatFileSize(fileSize)}，超过 ${formatFileSize(LARGE_FILE_THRESHOLD)}。打开大文件可能会影响性能。是否继续打开？`}
      confirmText="继续打开"
      cancelText="取消"
      danger
    />
  )
}
