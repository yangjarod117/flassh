import { useEffect, useRef, useCallback, useState } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { useThemeStore } from '../store'
import { calculateTerminalSize } from '../utils/terminal'
import type { TerminalTheme } from '../types'
import 'xterm/css/xterm.css'

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
    // Bright colors (slightly lighter versions)
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

    const terminal = xtermRef.current
    if (!terminal) return

    const selection = terminal.getSelection()

    // 如果有选中内容，执行复制
    if (selection) {
      try {
        await navigator.clipboard.writeText(selection)
        setCopyHint('已复制')
        setTimeout(() => setCopyHint(null), 1000)
      } catch {
        setCopyHint('复制失败')
        setTimeout(() => setCopyHint(null), 1000)
      }
    } else {
      // 没有选中内容，执行粘贴
      try {
        const text = await navigator.clipboard.readText()
        if (text && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'input',
            sessionId,
            data: text,
          }))
          setCopyHint('已粘贴')
          setTimeout(() => setCopyHint(null), 1000)
        }
      } catch {
        setCopyHint('粘贴失败')
        setTimeout(() => setCopyHint(null), 1000)
      }
    }
  }, [sessionId])

  // 初始化终端
  useEffect(() => {
    if (!terminalRef.current) return

    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      cursorWidth: 2,
      cursorInactiveStyle: 'bar',
      fontSize: terminalFontSize,
      fontFamily: terminalFontFamily,
      theme: convertToXtermTheme(theme.terminal),
      allowTransparency: true,
      scrollback: 10000,
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(terminalRef.current)
    fitAddon.fit()

    xtermRef.current = terminal
    fitAddonRef.current = fitAddon

    // 处理终端输入
    terminal.onData((data) => {
      if (onData) {
        onData(data)
      }
      // 发送到 WebSocket
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'input',
          sessionId,
          data,
        }))
      }
    })

    // 处理终端大小变化
    terminal.onResize(({ cols, rows }) => {
      if (onResize) {
        onResize(cols, rows)
      }
      // 发送到 WebSocket
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'resize',
          sessionId,
          cols,
          rows,
        }))
      }
    })

    return () => {
      terminal.dispose()
    }
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
    let ws: WebSocket | null = null
    let pingInterval: ReturnType<typeof setInterval> | null = null
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null
    let reconnectAttempts = 0
    let hasReceivedOutput = false // 只有收到终端输出才算真正连接成功
    const maxReconnectAttempts = 5
    const reconnectDelay = 3000

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//${window.location.host}/ws`
      ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        console.log('WebSocket connected')
        reconnectAttempts = 0
        
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
        }, 25000) // 每25秒发送一次心跳

        // 通知父组件 WebSocket 已就绪
        if (ws) {
          onWsReady?.(ws)
        }
      }

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          
          // 处理 pong 响应（心跳确认）
          if (message.type === 'pong') return
          
          if (message.sessionId !== sessionId) return

          switch (message.type) {
            case 'output':
              hasReceivedOutput = true // 收到输出才算真正连接成功
              xtermRef.current?.write(message.data || '')
              break
            case 'error':
              // 忽略 resize 相关的错误，不显示给用户
              if (!message.error?.includes('resize')) {
                xtermRef.current?.write(`\r\n\x1b[31mError: ${message.error}\x1b[0m\r\n`)
              }
              break
            case 'disconnect':
              if (hasReceivedOutput) {
                xtermRef.current?.write('\r\n\x1b[33m连接已关闭\x1b[0m\r\n')
              }
              break
          }
        } catch {
          // 忽略解析错误
        }
      }

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
      }

      ws.onclose = () => {
        console.log('WebSocket disconnected')
        
        // 清理心跳
        if (pingInterval) {
          clearInterval(pingInterval)
          pingInterval = null
        }

        // 只有在收到过终端输出后断开才显示重连提示
        if (hasReceivedOutput && reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++
          console.log(`Attempting to reconnect (${reconnectAttempts}/${maxReconnectAttempts})...`)
          xtermRef.current?.write(`\r\n\x1b[33m连接断开，正在重连 (${reconnectAttempts}/${maxReconnectAttempts})...\x1b[0m\r\n`)
          reconnectTimeout = setTimeout(connect, reconnectDelay)
        } else if (hasReceivedOutput) {
          xtermRef.current?.write('\r\n\x1b[31m连接失败，请刷新页面重试\x1b[0m\r\n')
        }
        // 首次连接失败不显示任何提示，静默重试
        else if (reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++
          reconnectTimeout = setTimeout(connect, reconnectDelay)
        }
      }

      wsRef.current = ws
    }

    connect()

    return () => {
      if (pingInterval) clearInterval(pingInterval)
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
      if (ws) ws.close()
    }
  }, [sessionId])

  // 处理窗口大小变化
  const handleResize = useCallback(() => {
    if (fitAddonRef.current) {
      fitAddonRef.current.fit()
    }
  }, [])

  useEffect(() => {
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [handleResize])

  // 聚焦终端
  const focus = useCallback(() => {
    xtermRef.current?.focus()
  }, [])

  // 当终端激活时自动聚焦
  useEffect(() => {
    if (isActive && xtermRef.current) {
      // 延迟聚焦，确保 DOM 更新完成
      const timer = setTimeout(() => {
        xtermRef.current?.focus()
        // 重新适配大小
        if (fitAddonRef.current) {
          fitAddonRef.current.fit()
        }
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [isActive])

  return (
    <div
      ref={terminalRef}
      className="w-full h-full relative"
      style={{ backgroundColor: theme.terminal.background }}
      onClick={focus}
      onContextMenu={handleContextMenu}
    >
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
