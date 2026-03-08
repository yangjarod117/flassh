import { useEffect, useRef, useCallback, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { useThemeStore } from '../store'
import type { TerminalTheme } from '../types'
import '@xterm/xterm/css/xterm.css'

// 全局终端实例存储
const globalTerminals = new Map<string, {
  terminal: Terminal
  fitAddon: FitAddon
  ws: WebSocket | null
  inputMsgPrefix?: string // 预构建的输入消息前缀
  container?: HTMLDivElement // 保存终端的 DOM 容器
}>()

// 预构建消息函数 - 避免重复字符串拼接
const buildInputMsg = (prefix: string, data: string) => `${prefix}${JSON.stringify(data)}}`
const buildResizeMsg = (sessionId: string, cols: number, rows: number) => `{"type":"resize","sessionId":"${sessionId}","cols":${cols},"rows":${rows}}`
const buildPingMsg = (sessionId: string) => `{"type":"ping","sessionId":"${sessionId}"}`

interface TerminalPanelProps {
  sessionId: string
  isActive?: boolean
  onResize?: (cols: number, rows: number) => void
  onData?: (data: string) => void
  onWsReady?: (ws: WebSocket) => void
  onSessionReconnect?: (oldSessionId: string) => Promise<string | null>
  onConnectionChange?: (sessionId: string, connected: boolean) => void
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
export function TerminalPanel({ sessionId, isActive = true, onResize, onData, onWsReady, onSessionReconnect, onConnectionChange }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectRef = useRef(onSessionReconnect)
  reconnectRef.current = onSessionReconnect
  const connectionChangeRef = useRef(onConnectionChange)
  connectionChangeRef.current = onConnectionChange
  const currentSessionIdRef = useRef(sessionId)
  currentSessionIdRef.current = sessionId
  const [copyHint, setCopyHint] = useState<string | null>(null)
  const [isMobile] = useState(() => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || ('ontouchstart' in window))
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const touchMoved = useRef(false)
  const { getCurrentTheme, terminalFontSize, getTerminalFontFamily } = useThemeStore()
  const theme = getCurrentTheme()
  const terminalFontFamily = getTerminalFontFamily()

  // 复制操作（复用）
  const doCopy = useCallback(async () => {
    const terminal = xtermRef.current
    if (!terminal) return
    const selection = terminal.getSelection()
    if (selection && selection.length > 0) {
      try {
        await navigator.clipboard.writeText(selection)
        terminal.clearSelection()
        setCopyHint('已复制')
      } catch {
        setCopyHint('复制失败')
      }
      setTimeout(() => setCopyHint(null), 800)
    }
  }, [])

  // 粘贴操作（复用）
  const doPaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText()
      const termData = globalTerminals.get(currentSessionIdRef.current)
      if (text && termData?.ws?.readyState === WebSocket.OPEN && termData.inputMsgPrefix) {
        const normalizedText = text.replace(/\r\n/g, '\r').replace(/\n/g, '\r')
        termData.ws.send(buildInputMsg(termData.inputMsgPrefix, normalizedText))
        setCopyHint('已粘贴')
        setTimeout(() => setCopyHint(null), 800)
      }
    } catch {}
  }, [])

  // 发送特殊按键（移动端不 focus 终端，避免弹出键盘）
  const sendKey = useCallback((data: string) => {
    const termData = globalTerminals.get(currentSessionIdRef.current)
    if (termData?.ws?.readyState === WebSocket.OPEN && termData.inputMsgPrefix) {
      termData.ws.send(buildInputMsg(termData.inputMsgPrefix, data))
    }
  }, [])

  // 右键复制/粘贴功能
  const handleContextMenu = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const terminal = xtermRef.current
    if (!terminal) return

    const selection = terminal.getSelection()

    if (selection && selection.length > 0) {
      await doCopy()
    } else {
      await doPaste()
    }
  }, [doCopy, doPaste])

  // 移动端长按复制/粘贴
  const handleTouchStart = useCallback((_e: React.TouchEvent) => {
    touchMoved.current = false
    longPressTimer.current = setTimeout(async () => {
      if (touchMoved.current) return
      const terminal = xtermRef.current
      if (!terminal) return
      const selection = terminal.getSelection()
      if (selection && selection.length > 0) {
        await doCopy()
      } else {
        await doPaste()
      }
    }, 500)
  }, [doCopy, doPaste])

  const handleTouchMove = useCallback(() => {
    touchMoved.current = true
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
  }, [])

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
  }, [])

  // 监听 paste 事件来处理粘贴（统一处理所有粘贴，包括 Ctrl+V 和右键粘贴）
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const termData = globalTerminals.get(currentSessionIdRef.current)
      if (!termData?.ws || termData.ws.readyState !== WebSocket.OPEN || !termData.inputMsgPrefix) return
      
      const text = e.clipboardData?.getData('text')
      if (text) {
        e.preventDefault()
        const normalizedText = text.replace(/\r\n/g, '\r').replace(/\n/g, '\r')
        termData.ws.send(buildInputMsg(termData.inputMsgPrefix, normalizedText))
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
      // 已有终端实例 — 把保存的 DOM 容器移回来，避免重新 open
      if (terminalData.container && terminalData.container.parentElement !== terminalRef.current) {
        terminalRef.current.innerHTML = ''
        terminalRef.current.appendChild(terminalData.container)
      }
      
      setTimeout(() => {
        try {
          terminalData.fitAddon.fit()
          terminalData.terminal.refresh(0, terminalData.terminal.rows - 1)
          terminalData.terminal.scrollToBottom()
        } catch { /* ignore */ }
      }, 50)
      
      xtermRef.current = terminalData.terminal
      fitAddonRef.current = terminalData.fitAddon
      wsRef.current = terminalData.ws
      
      return () => {
        // 卸载时把终端 DOM 从文档中移除但保留引用
        if (terminalData.container && terminalRef.current?.contains(terminalData.container)) {
          terminalRef.current.removeChild(terminalData.container)
        }
      }
    }

    // 创建新终端实例
    // 创建一个包装 div 来持有终端 DOM
    const container = document.createElement('div')
    container.style.width = '100%'
    container.style.height = '100%'
    terminalRef.current.appendChild(container)

    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      cursorInactiveStyle: 'outline',
      fontSize: terminalFontSize,
      fontFamily: terminalFontFamily,
      theme: convertToXtermTheme(theme.terminal),
      allowTransparency: true,
      scrollback: 1500,
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
    
    // 加载 Unicode11 支持（修复二维码等宽字符显示）
    try {
      const unicode11Addon = new Unicode11Addon()
      terminal.loadAddon(unicode11Addon)
      terminal.unicode.activeVersion = '11'
    } catch { /* ignore */ }
    
    terminal.open(container)
    
    // 等待字体加载完成后再 fit，确保列数计算准确
    const doFit = () => {
      try { fitAddon.fit() } catch { /* ignore */ }
    }
    
    if (document.fonts?.ready) {
      document.fonts.ready.then(() => setTimeout(doFit, 50))
    } else {
      setTimeout(doFit, 200)
    }

    // 存储到全局，预构建输入消息前缀
    const inputMsgPrefix = `{"type":"input","sessionId":"${sessionId}","data":`
    globalTerminals.set(sessionId, {
      terminal,
      fitAddon,
      ws: null,
      inputMsgPrefix,
      container,
    })

    xtermRef.current = terminal
    fitAddonRef.current = fitAddon

    // 处理终端输入 - 使用 ref 获取最新 sessionId
    terminal.onData((data) => {
      if (onData) onData(data)
      const sid = currentSessionIdRef.current
      const termData = globalTerminals.get(sid)
      if (termData?.ws?.readyState === WebSocket.OPEN && termData.inputMsgPrefix) {
        termData.ws.send(buildInputMsg(termData.inputMsgPrefix, data))
      }
    })

    // Ctrl+V 交给浏览器原生 paste 事件处理，避免双重粘贴
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.ctrlKey && event.key === 'v' && event.type === 'keydown') {
        return false // 阻止 xterm 处理，让浏览器触发 paste 事件
      }
      return true
    })

    // 处理终端大小变化
    terminal.onResize(({ cols, rows }) => {
      if (onResize) onResize(cols, rows)
      const sid = currentSessionIdRef.current
      const termData = globalTerminals.get(sid)
      if (termData?.ws?.readyState === WebSocket.OPEN) {
        termData.ws.send(buildResizeMsg(sid, cols, rows))
      }
    })

    // 组件卸载时不销毁终端，保留在全局存储中
    // 把终端 DOM 从文档中移除但保留引用
    return () => {
      if (container && terminalRef.current?.contains(container)) {
        terminalRef.current.removeChild(container)
      }
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
    let sshSessionLost = false
    let sshReconnecting = false
    let sshDisconnected = false // SSH 层面已断开（exit/disconnect）
    const maxReconnectAttempts = 5
    const baseReconnectDelay = 5000

    const scheduleReconnect = (isServerReboot = false) => {
      if (isReconnecting || sshSessionLost) return
      isReconnecting = true

      if (reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++
        const delay = isServerReboot 
          ? Math.min(baseReconnectDelay * reconnectAttempts, 15000)
          : baseReconnectDelay
        
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
        
        const sid = currentSessionIdRef.current
        const termData = globalTerminals.get(sid)
        if (termData) {
          termData.ws = ws
        }
        
        // 发送初始大小
        if (fitAddonRef.current && xtermRef.current) {
          const { cols, rows } = xtermRef.current
          ws?.send(buildResizeMsg(sid, cols, rows))
        }

        // 启动心跳
        pingInterval = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(buildPingMsg(currentSessionIdRef.current))
          }
        }, 25000)

        if (ws) onWsReady?.(ws)
        // 只在 SSH 未断开时标记为 connected
        if (!sshDisconnected && !sshSessionLost) {
          connectionChangeRef.current?.(currentSessionIdRef.current, true)
        }
      }

      ws.onmessage = (event) => {
        try {
          const raw = event.data as string
          if (raw.startsWith('{"type":"output"')) {
            hasReceivedOutput = true
            const marker = ',"data":'
            const dataIdx = raw.indexOf(marker)
            if (dataIdx !== -1) {
              const dataJson = raw.substring(dataIdx + marker.length, raw.length - 1)
              // 使用 globalTerminals 获取终端实例，即使组件卸载了也能缓冲输出
              const term = xtermRef.current || globalTerminals.get(currentSessionIdRef.current)?.terminal
              term?.write(JSON.parse(dataJson))
            }
            return
          }
          
          if (raw.startsWith('{"type":"pong"')) return
          
          const message = JSON.parse(raw)
          // 接受当前 sessionId 或重连后的新 sessionId
          const sid = currentSessionIdRef.current
          if (message.sessionId !== sessionId && message.sessionId !== sid) return

          switch (message.type) {
            case 'error':
              // Session not found 表示 SSH 会话已丢失（服务器重启后）
              if (message.error?.includes('Session not found') || message.error?.includes('not connected')) {
                if (!sshReconnecting) {
                  sshReconnecting = true
                  
                  // SSH 重连：5 次尝试，每次间隔 10 秒
                  const attemptSSHReconnect = async () => {
                    const maxSSHAttempts = 5
                    const sshRetryDelay = 10000
                    
                    for (let attempt = 1; attempt <= maxSSHAttempts; attempt++) {
                      xtermRef.current?.write(`\r\n\x1b[33m第 ${attempt}/${maxSSHAttempts} 次尝试重连...\x1b[0m\r\n`)
                      
                      try {
                        const newSessionId = reconnectRef.current ? await reconnectRef.current(sessionId) : null
                        if (newSessionId) {
                          sshReconnecting = false
                          sshDisconnected = false
                          xtermRef.current?.write('\r\n\x1b[32m✓ SSH 重新连接成功\x1b[0m\r\n')
                          connectionChangeRef.current?.(newSessionId, true)
                          // 更新当前 sessionId 引用
                          currentSessionIdRef.current = newSessionId
                          // 更新 globalTerminals 中的 key
                          const termData = globalTerminals.get(sessionId)
                          if (termData) {
                            termData.inputMsgPrefix = `{"type":"input","sessionId":"${newSessionId}","data":`
                            globalTerminals.set(newSessionId, termData)
                            globalTerminals.delete(sessionId)
                          }
                          // 用新 sessionId 发送 resize 来触发 shell 创建
                          if (ws?.readyState === WebSocket.OPEN && xtermRef.current) {
                            const { cols, rows } = xtermRef.current
                            ws.send(buildResizeMsg(newSessionId, cols, rows))
                          }
                          return
                        }
                      } catch { /* ignore, will retry */ }
                      
                      if (attempt < maxSSHAttempts) {
                        xtermRef.current?.write(`\x1b[33m${sshRetryDelay / 1000} 秒后重试...\x1b[0m\r\n`)
                        await new Promise(r => setTimeout(r, sshRetryDelay))
                      }
                    }
                    
                    // 所有尝试都失败
                    sshReconnecting = false
                    sshSessionLost = true
                    connectionChangeRef.current?.(currentSessionIdRef.current, false)
                    xtermRef.current?.write('\r\n\x1b[31mSSH 重连失败，请关闭此标签页并重新连接\x1b[0m\r\n')
                  }
                  
                  if (reconnectRef.current) {
                    attemptSSHReconnect()
                  } else {
                    sshReconnecting = false
                    sshSessionLost = true
                    connectionChangeRef.current?.(currentSessionIdRef.current, false)
                    xtermRef.current?.write('\r\n\x1b[31mSSH 会话已丢失（无保存的凭据），请关闭此标签页并重新连接\x1b[0m\r\n')
                  }
                }
              } else if (!message.error?.includes('resize')) {
                xtermRef.current?.write(`\r\n\x1b[31mError: ${message.error}\x1b[0m\r\n`)
              }
              break
            case 'disconnect':
              // SSH 连接断开（可能是服务器重启）
              if (hasReceivedOutput) {
                sshDisconnected = true
                connectionChangeRef.current?.(currentSessionIdRef.current, false)
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
        const termData = globalTerminals.get(currentSessionIdRef.current)
        if (termData) termData.ws = null
        
        if (pingInterval) {
          clearInterval(pingInterval)
          pingInterval = null
        }

        // WebSocket 断开时尝试重连（除非 SSH 会话已明确丢失）
        if (!isReconnecting && !sshSessionLost && reconnectAttempts < maxReconnectAttempts) {
          scheduleReconnect(false)
        }
      }

      wsRef.current = ws
    }

    connect()

    return () => {
      // 组件卸载时不关闭 WebSocket 和心跳
      // WebSocket 和终端实例都保留在 globalTerminals 中
      // 重连逻辑也保留，确保后台 WebSocket 断开时能自动恢复
      // 只清理重连定时器中的待执行重连（避免并发重连）
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
    // 防抖的 resize 处理 - 50ms 足够平滑
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null
    const debouncedResize = () => {
      if (resizeTimeout) clearTimeout(resizeTimeout)
      resizeTimeout = setTimeout(() => {
        resizeTimeout = null
        handleResize()
      }, 50)
    }
    
    window.addEventListener('resize', debouncedResize)
    
    // 使用 ResizeObserver 监听容器大小变化
    const resizeObserver = new ResizeObserver(debouncedResize)
    
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }
    
    return () => {
      window.removeEventListener('resize', debouncedResize)
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

  // 页面可见性变化时刷新终端（切换浏览器标签页回来）
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && isActive && xtermRef.current) {
        // 刷新终端渲染
        try {
          xtermRef.current.refresh(0, xtermRef.current.rows - 1)
          xtermRef.current.scrollToBottom()
          fitAddonRef.current?.fit()
        } catch { /* ignore */ }

        // 检查 WebSocket 状态，如果断了会自动重连
        const termData = globalTerminals.get(currentSessionIdRef.current)
        if (termData?.ws?.readyState === WebSocket.OPEN) {
          // 发送 ping 确认连接还活着
          termData.ws.send(buildPingMsg(currentSessionIdRef.current))
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [isActive, sessionId])

  // 移动端工具栏按钮样式
  const toolBtnCls = "flex items-center justify-center px-2.5 py-1.5 rounded-lg bg-surface/80 text-text-secondary active:bg-primary/30 active:text-primary transition-colors text-xs border border-border/50 select-none"

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative flex flex-col"
      style={{ backgroundColor: theme.terminal.background }}
      onClick={focus}
      onContextMenu={handleContextMenu}
      onTouchStart={isMobile ? handleTouchStart : undefined}
      onTouchMove={isMobile ? handleTouchMove : undefined}
      onTouchEnd={isMobile ? handleTouchEnd : undefined}
    >
      {/* 终端容器 */}
      <div
        ref={terminalRef}
        className="w-full flex-1 min-h-0"
        style={{ padding: '8px 6px 0 6px' }}
      />
      {/* 移动端快捷工具栏 */}
      {isMobile && (
        <div className="flex items-center justify-end gap-1.5 px-2 py-1.5" style={{ backgroundColor: theme.terminal.background }}>
          <button className={toolBtnCls} onTouchEnd={e => { e.preventDefault(); e.stopPropagation(); doCopy() }}>Copy</button>
          <button className={toolBtnCls} onTouchEnd={e => { e.preventDefault(); e.stopPropagation(); doPaste() }}>Paste</button>
          <div className="w-px h-5 bg-border/30 flex-shrink-0" />
          <button className={toolBtnCls} onTouchEnd={e => { e.preventDefault(); e.stopPropagation(); sendKey('\t') }}>Tab</button>
          <button className={toolBtnCls} onTouchEnd={e => { e.preventDefault(); e.stopPropagation(); sendKey('\x03') }}>Ctrl+C</button>
          <button className={toolBtnCls} onTouchEnd={e => { e.preventDefault(); e.stopPropagation(); sendKey('\x1b[A') }}>↑</button>
          <button className={toolBtnCls} onTouchEnd={e => { e.preventDefault(); e.stopPropagation(); sendKey('\x1b[B') }}>↓</button>
        </div>
      )}
      {/* 复制/粘贴提示 */}
      {copyHint && (
        <div className="absolute top-2 right-2 px-3 py-1 bg-surface/90 text-white text-sm rounded shadow-lg z-10">
          {copyHint}
        </div>
      )}
    </div>
  )
}

// 清理指定会话的终端
export function cleanupTerminal(sessionId: string) {
  const termData = globalTerminals.get(sessionId)
  if (termData) {
    termData.ws?.close()
    termData.terminal.dispose()
    globalTerminals.delete(sessionId)
  }
}
