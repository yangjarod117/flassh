import { useEffect, useRef, useCallback, useState } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import { useThemeStore } from '../store'
import { calculateTerminalSize } from '../utils/terminal'
import type { TerminalTheme } from '../types'
import 'xterm/css/xterm.css'

// 全局终端实例存储
const globalTerminals = new Map<string, {
  terminal: Terminal
  fitAddon: FitAddon
  ws: WebSocket | null
}>()

interface TerminalPanelProps {
  sessionId: string
  isActive?: boolean
  onResize?: (cols: number, rows: number) => void
  onData?: (data: string) => void
  onWsReady?: (ws: WebSocket) => void
}

/**
 * 将主题配置转换为 xterm 主题格式
 */
function convertToXtermTheme(terminalTheme: TerminalTheme) {
  return {
    background: terminalTheme.background,
    foreground: terminalTheme.foreground,
    cursor: terminalTheme.cursor,
    cursorAccent: terminalTheme.background,
    selectionBackground: terminalTheme.selection,
    selectionForeground: terminalTheme.foreground,
    black: terminalTheme.black,
    red: terminalTheme.red,
    green: terminalTheme.green,
    yellow: terminalTheme.yellow,
    blue: terminalTheme.blue,
    magenta: terminalTheme.magenta,
    cyan: terminalTheme.cyan,
    white: terminalTheme.white,
    brightBlack: terminalTheme.black,
    brightRed: terminalTheme.red,
    brightGreen: terminalTheme.green,
    brightYellow: terminalTheme.yellow,
    brightBlue: terminalTheme.blue,
    brightMagenta: terminalTheme.magenta,
    brightCyan: terminalTheme.cyan,
    brightWhite: terminalTheme.white,
  }
}

/**
 * 终端面板组件
 */
export function TerminalPanel({ sessionId, isActive = true, onResize, onData, onWsReady }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const [copyHint, setCopyHint] = useState<string | null>(null)
  const { getCurrentTheme, terminalFontSize, getTerminalFontFamily } = useThemeStore()
  const theme = getCurrentTheme()
  const terminalFontFamily = getTerminalFontFamily()

  // 右键复制/粘贴功能
  const handleContextMenu = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const terminal = xtermRef.current
    const ws = wsRef.current
    if (!terminal) return

    const selection = terminal.getSelection()

    // 如果有选中内容，执行复制
    if (selection && selection.length > 0) {
      try {
        await navigator.clipboard.writeText(selection)
        terminal.clearSelection()
        setCopyHint('已复制')
        setTimeout(() => setCopyHint(null), 800)
      } catch {
        setCopyHint('复制失败')
        setTimeout(() => setCopyHint(null), 800)
      }
    } else {
      // 没有选中内容，直接粘贴
      try {
        const text = await navigator.clipboard.readText()
        if (text && ws?.readyState === WebSocket.OPEN) {
          // 处理换行符，将 \r\n 转换为 \r，避免 nano 等编辑器格式问题
          const normalizedText = text.replace(/\r\n/g, '\r').replace(/\n/g, '\r')
          ws.send(`{"type":"input","sessionId":"${sessionId}","data":${JSON.stringify(normalizedText)}}`)
        }
      } catch {
        // 剪贴板访问失败，静默处理
      }
    }
  }, [sessionId])

  // 监听 paste 事件来处理粘贴
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const ws = wsRef.current
      if (!ws || ws.readyState !== WebSocket.OPEN) return
      
      const text = e.clipboardData?.getData('text')
      if (text) {
        e.preventDefault()
        // 处理换行符，将 \r\n 转换为 \r，避免 nano 等编辑器格式问题
        const normalizedText = text.replace(/\r\n/g, '\r').replace(/\n/g, '\r')
        ws.send(`{"type":"input","sessionId":"${sessionId}","data":${JSON.stringify(normalizedText)}}`)
      }
    }
    
    const container = containerRef.current
    if (container) {
      container.addEventListener('paste', handlePaste)
      return () => container.removeEventListener('paste', handlePaste)
    }
  }, [sessionId])

  // 初始化终端 - 使用全局存储防止重新挂载时丢失
  useEffect(() => {
    if (!terminalRef.current) return

    // 检查是否已有该 session 的终端实例
    const terminalData = globalTerminals.get(sessionId)
    
    if (terminalData) {
      // 已有终端实例，重新附加到 DOM
      terminalRef.current.innerHTML = ''
      terminalData.terminal.open(terminalRef.current)
      
      setTimeout(() => {
        try {
          terminalData.fitAddon.fit()
        } catch { /* ignore */ }
      }, 100)
      
      xtermRef.current = terminalData.terminal
      fitAddonRef.current = terminalData.fitAddon
      wsRef.current = terminalData.ws
      
      return
    }

    // 创建新终端实例
    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      cursorInactiveStyle: 'outline',
      fontSize: terminalFontSize,
      fontFamily: terminalFontFamily,
      theme: convertToXtermTheme(theme.terminal),
      allowTransparency: true,
      scrollback: 3000,
      fastScrollModifier: 'alt',
      fastScrollSensitivity: 5,
      smoothScrollDuration: 0,
      drawBoldTextInBrightColors: false,
      minimumContrastRatio: 1,
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    
    // 添加链接支持
    try {
      const webLinksAddon = new WebLinksAddon()
      terminal.loadAddon(webLinksAddon)
    } catch { /* ignore */ }
    
    terminal.open(terminalRef.current)
    
    // 延迟执行 fit
    setTimeout(() => {
      try {
        fitAddon.fit()
      } catch { /* ignore */ }
    }, 100)

    // 存储到全局
    globalTerminals.set(sessionId, {
      terminal,
      fitAddon,
      ws: null,
    })

    xtermRef.current = terminal
    fitAddonRef.current = fitAddon

    // 处理终端输入 - 直接发送，最小化开销
    terminal.onData((data) => {
      if (onData) onData(data)
      // 发送到 WebSocket - 使用预构建的消息格式
      const termData = globalTerminals.get(sessionId)
      if (termData?.ws?.readyState === WebSocket.OPEN) {
        termData.ws.send(`{"type":"input","sessionId":"${sessionId}","data":${JSON.stringify(data)}}`)
      }
    })

    // 处理 Ctrl+V 粘贴（Windows 支持）
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.ctrlKey && event.key === 'v' && event.type === 'keydown') {
        navigator.clipboard.readText().then((text) => {
          const termData = globalTerminals.get(sessionId)
          if (text && termData?.ws?.readyState === WebSocket.OPEN) {
            // 处理换行符，将 \r\n 转换为 \r，避免 nano 等编辑器格式问题
            const normalizedText = text.replace(/\r\n/g, '\r').replace(/\n/g, '\r')
            termData.ws.send(`{"type":"input","sessionId":"${sessionId}","data":${JSON.stringify(normalizedText)}}`)
          }
        }).catch(() => { /* ignore */ })
        return false
      }
      return true
    })

    // 处理终端大小变化
    terminal.onResize(({ cols, rows }) => {
      if (onResize) onResize(cols, rows)
      // 发送到 WebSocket
      const termData = globalTerminals.get(sessionId)
      if (termData?.ws?.readyState === WebSocket.OPEN) {
        termData.ws.send(`{"type":"resize","sessionId":"${sessionId}","cols":${cols},"rows":${rows}}`)
      }
    })

    // 组件卸载时不销毁终端，保留在全局存储中
    return () => {}
  }, [sessionId])

  // 更新主题
  useEffect(() => {
    if (!xtermRef.current) return

    xtermRef.current.options.theme = convertToXtermTheme(theme.terminal)
  }, [theme])

  // 更新字体大小
  useEffect(() => {
    if (!xtermRef.current) return

    xtermRef.current.options.fontSize = terminalFontSize
    // 重新适配终端大小
    if (fitAddonRef.current) {
      fitAddonRef.current.fit()
    }
  }, [terminalFontSize])

  // 更新终端字体
  useEffect(() => {
    if (!xtermRef.current) return

    xtermRef.current.options.fontFamily = terminalFontFamily
    // 重新适配终端大小
    if (fitAddonRef.current) {
      fitAddonRef.current.fit()
    }
  }, [terminalFontFamily])

  // 连接 WebSocket（带心跳和自动重连）
  useEffect(() => {
    // 检查是否已有 WebSocket 连接
    const existingData = globalTerminals.get(sessionId)
    if (existingData?.ws?.readyState === WebSocket.OPEN) {
      wsRef.current = existingData.ws
      onWsReady?.(existingData.ws)
      return
    }

    let ws: WebSocket | null = null
    let pingInterval: ReturnType<typeof setInterval> | null = null
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null
    let reconnectAttempts = 0
    let hasReceivedOutput = false
    let isReconnecting = false
    let sshSessionLost = false // SSH 会话是否已丢失
    const maxReconnectAttempts = 10
    const baseReconnectDelay = 3000

    const scheduleReconnect = (isServerReboot = false) => {
      if (isReconnecting || sshSessionLost) return
      isReconnecting = true

      if (reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++
        const delay = isServerReboot 
          ? Math.min(baseReconnectDelay * reconnectAttempts, 15000)
          : baseReconnectDelay
        
        xtermRef.current?.write(`\r\n\x1b[33m正在重连 (${reconnectAttempts}/${maxReconnectAttempts})，${Math.round(delay/1000)}秒后重试...\x1b[0m\r\n`)
        
        reconnectTimeout = setTimeout(() => {
          isReconnecting = false
          connect()
        }, delay)
      } else {
        xtermRef.current?.write('\r\n\x1b[31m重连失败，请刷新页面重试\x1b[0m\r\n')
        isReconnecting = false
      }
    }

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//${window.location.host}/ws`
      ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        reconnectAttempts = 0
        isReconnecting = false
        
        const termData = globalTerminals.get(sessionId)
        if (termData) {
          termData.ws = ws
        }
        
        // 发送初始大小
        if (fitAddonRef.current && xtermRef.current) {
          const { cols, rows } = xtermRef.current
          ws?.send(JSON.stringify({
            type: 'resize',
            sessionId,
            cols,
            rows,
          }))
        }

        // 启动心跳
        pingInterval = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping', sessionId }))
          }
        }, 25000)

        if (ws) onWsReady?.(ws)
      }

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          if (message.type === 'pong') return
          if (message.sessionId !== sessionId) return

          switch (message.type) {
            case 'output':
              hasReceivedOutput = true
              xtermRef.current?.write(message.data || '')
              break
            case 'error':
              if (!message.error?.includes('resize')) {
                xtermRef.current?.write(`\r\n\x1b[31mError: ${message.error}\x1b[0m\r\n`)
              }
              // Session not found 表示 SSH 会话已丢失（服务器重启）
              if (message.error?.includes('Session not found') || message.error?.includes('not connected')) {
                sshSessionLost = true
                xtermRef.current?.write('\r\n\x1b[31mSSH 会话已丢失，请关闭此标签页并重新连接\x1b[0m\r\n')
              }
              break
            case 'disconnect':
              // SSH 连接断开（可能是服务器重启）
              if (hasReceivedOutput) {
                xtermRef.current?.write('\r\n\x1b[33m服务器连接已断开\x1b[0m')
                ws?.close()
                scheduleReconnect(true)
              }
              break
          }
        } catch { /* ignore parse errors */ }
      }

      ws.onerror = () => { /* ignore */ }

      ws.onclose = () => {
        const termData = globalTerminals.get(sessionId)
        if (termData) termData.ws = null
        
        if (pingInterval) {
          clearInterval(pingInterval)
          pingInterval = null
        }

        // 只有在没有正在进行的重连且 SSH 会话未丢失时才触发重连
        if (!isReconnecting && !sshSessionLost && hasReceivedOutput && reconnectAttempts < maxReconnectAttempts) {
          scheduleReconnect(false)
        }
      }

      wsRef.current = ws
    }

    connect()

    return () => {
      if (pingInterval) clearInterval(pingInterval)
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
    }
  }, [sessionId])

  // 处理窗口大小变化 - 使用节流
  const handleResize = useCallback(() => {
    if (fitAddonRef.current && xtermRef.current) {
      // 使用 requestAnimationFrame 确保在布局更新后执行
      requestAnimationFrame(() => {
        try {
          fitAddonRef.current?.fit()
        } catch { /* ignore */ }
      })
    }
  }, [])

  useEffect(() => {
    // 节流的 resize 处理
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null
    const throttledResize = () => {
      if (resizeTimeout) return
      resizeTimeout = setTimeout(() => {
        resizeTimeout = null
        handleResize()
      }, 100)
    }
    
    window.addEventListener('resize', throttledResize)
    
    // 使用 ResizeObserver 监听容器大小变化
    const resizeObserver = new ResizeObserver(throttledResize)
    
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }
    
    return () => {
      window.removeEventListener('resize', throttledResize)
      resizeObserver.disconnect()
      if (resizeTimeout) clearTimeout(resizeTimeout)
    }
  }, [handleResize])

  // 聚焦终端
  const focus = useCallback(() => {
    xtermRef.current?.focus()
  }, [])

  // 当终端激活时自动聚焦和刷新
  useEffect(() => {
    if (isActive && xtermRef.current) {
      const timer = setTimeout(() => {
        if (fitAddonRef.current && xtermRef.current) {
          try {
            fitAddonRef.current.fit()
            xtermRef.current.refresh(0, xtermRef.current.rows - 1)
            xtermRef.current.scrollToBottom()
            xtermRef.current.focus()
          } catch { /* ignore */ }
        }
      }, 100)
      
      return () => clearTimeout(timer)
    }
  }, [isActive])

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative"
      style={{ backgroundColor: theme.terminal.background }}
      onClick={focus}
      onContextMenu={handleContextMenu}
    >
      {/* 终端容器，使用 calc 预留底部空间 */}
      <div
        ref={terminalRef}
        className="w-full"
        style={{ height: 'calc(100% - 20px)', padding: '8px 6px 0 6px' }}
      />
      {/* 复制/粘贴提示 */}
      {copyHint && (
        <div className="absolute top-2 right-2 px-3 py-1 bg-surface/90 text-white text-sm rounded shadow-lg z-10">
          {copyHint}
        </div>
      )}
    </div>
  )
}

// 导出工具函数供测试使用
export { calculateTerminalSize }

// 清理指定会话的终端
export function cleanupTerminal(sessionId: string) {
  const termData = globalTerminals.get(sessionId)
  if (termData) {
    termData.ws?.close()
    termData.terminal.dispose()
    globalTerminals.delete(sessionId)
  }
}
