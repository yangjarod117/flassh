import { useState, useEffect, useRef, useCallback } from 'react'

interface MonitorData {
  cpu: { usage: number }
  memory: { total: number; used: number; free: number; available: number; usagePercent: number }
  disk: { total: number; used: number; free: number; usagePercent: number }
  network: { rxBytes: number; txBytes: number }
  system: { uptime: string; load: { load1: number; load5: number; load15: number } }
  timestamp: number
}

interface SystemMonitorProps {
  sessionId: string
}

/**
 * 格式化字节数
 */
function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i]
}

/**
 * 格式化速率
 */
function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec === 0) return '0 B/s'
  const k = 1024
  const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s']
  const i = Math.floor(Math.log(bytesPerSec) / Math.log(k))
  return parseFloat((bytesPerSec / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

/**
 * 进度条组件
 */
function ProgressBar({ value, color }: { value: number; color: string }) {
  const getColorClass = () => {
    if (value >= 90) return 'bg-error'
    if (value >= 70) return 'bg-warning'
    return color
  }
  
  return (
    <div className="h-1.5 bg-border rounded-full overflow-hidden">
      <div
        className={`h-full ${getColorClass()} transition-all duration-300`}
        style={{ width: `${Math.min(value, 100)}%` }}
      />
    </div>
  )
}

/**
 * 系统监控组件
 */
export function SystemMonitor({ sessionId }: SystemMonitorProps) {
  const [data, setData] = useState<MonitorData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isExpanded, setIsExpanded] = useState(true)
  const prevNetworkRef = useRef<{ rx: number; tx: number; time: number } | null>(null)
  const [networkSpeed, setNetworkSpeed] = useState({ rx: 0, tx: 0 })

  const fetchMonitorData = useCallback(async () => {
    try {
      const response = await fetch(`/api/sessions/${sessionId}/monitor`)
      if (!response.ok) {
        throw new Error('获取监控数据失败')
      }
      const newData: MonitorData = await response.json()
      
      // 计算网络速率
      if (prevNetworkRef.current) {
        const timeDiff = (newData.timestamp - prevNetworkRef.current.time) / 1000
        if (timeDiff > 0) {
          const rxSpeed = (newData.network.rxBytes - prevNetworkRef.current.rx) / timeDiff
          const txSpeed = (newData.network.txBytes - prevNetworkRef.current.tx) / timeDiff
          setNetworkSpeed({
            rx: Math.max(0, rxSpeed),
            tx: Math.max(0, txSpeed),
          })
        }
      }
      
      prevNetworkRef.current = {
        rx: newData.network.rxBytes,
        tx: newData.network.txBytes,
        time: newData.timestamp,
      }
      
      setData(newData)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误')
    }
  }, [sessionId])

  useEffect(() => {
    fetchMonitorData()
    const interval = setInterval(fetchMonitorData, 3000) // 每3秒刷新
    return () => clearInterval(interval)
  }, [fetchMonitorData])

  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="fixed bottom-4 right-4 p-2 bg-surface border border-border rounded-lg shadow-lg hover:bg-surface/80 transition-colors z-40"
        title="展开监控面板"
      >
        <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      </button>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 w-72 bg-surface border border-border rounded-lg shadow-lg z-40">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <span className="text-sm font-medium text-text">系统监控</span>
        </div>
        <button
          onClick={() => setIsExpanded(false)}
          className="p-1 rounded hover:bg-border/50 text-text-secondary"
          title="收起"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* 内容 */}
      <div className="p-3 space-y-3">
        {error ? (
          <div className="text-sm text-error text-center py-2">{error}</div>
        ) : !data ? (
          <div className="text-sm text-text-secondary text-center py-2">加载中...</div>
        ) : (
          <>
            {/* CPU */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-text-secondary">CPU</span>
                <span className="text-xs font-medium text-text">{data.cpu.usage.toFixed(1)}%</span>
              </div>
              <ProgressBar value={data.cpu.usage} color="bg-primary" />
            </div>

            {/* 内存 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-text-secondary">内存</span>
                <span className="text-xs font-medium text-text">
                  {formatBytes(data.memory.used)} / {formatBytes(data.memory.total)}
                </span>
              </div>
              <ProgressBar value={data.memory.usagePercent} color="bg-accent" />
            </div>

            {/* 磁盘 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-text-secondary">磁盘</span>
                <span className="text-xs font-medium text-text">
                  {formatBytes(data.disk.used)} / {formatBytes(data.disk.total)}
                </span>
              </div>
              <ProgressBar value={data.disk.usagePercent} color="bg-success" />
            </div>

            {/* 网络流量 */}
            <div className="pt-1 border-t border-border">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-text-secondary">网络</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-1">
                  <svg className="w-3 h-3 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                  <span className="text-text-secondary">下载</span>
                  <span className="text-text font-medium ml-auto">{formatSpeed(networkSpeed.rx)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <svg className="w-3 h-3 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                  <span className="text-text-secondary">上传</span>
                  <span className="text-text font-medium ml-auto">{formatSpeed(networkSpeed.tx)}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs mt-1 text-text-secondary">
                <span>总计: {formatBytes(data.network.rxBytes)}</span>
                <span>总计: {formatBytes(data.network.txBytes)}</span>
              </div>
            </div>

            {/* 系统信息 */}
            <div className="pt-1 border-t border-border text-xs">
              <div className="flex justify-between text-text-secondary">
                <span>运行时间</span>
                <span className="text-text">{data.system.uptime}</span>
              </div>
              <div className="flex justify-between text-text-secondary mt-1">
                <span>负载</span>
                <span className="text-text">
                  {data.system.load.load1.toFixed(2)} / {data.system.load.load5.toFixed(2)} / {data.system.load.load15.toFixed(2)}
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
