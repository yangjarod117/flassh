import { useState, useEffect, useRef, useCallback } from 'react'

interface MonitorData {
  cpu: { usage: number; model?: string }
  memory: { total: number; used: number; usagePercent: number }
  disk: { total: number; used: number; usagePercent: number }
  network: { rxBytes: number; txBytes: number }
  system: { uptime: string; load: { load1: number; load5: number; load15: number }; hostname?: string; os?: string; osVersion?: string; kernel?: string }
  timestamp: number
}
interface ProcessInfo { user: string; name: string; memoryMB: number; memoryPercent: number }
interface LoginRecord { user: string; ip: string; time: string; duration: string; status: 'success' | 'failed' | 'current' }

const formatBytes = (bytes: number, d = 1) => {
  if (bytes === 0) return '0 B'
  const k = 1024, s = ['B', 'KB', 'MB', 'GB', 'TB'], i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(d)) + ' ' + s[i]
}
const formatSpeed = (bps: number) => bps === 0 ? '0 B/s' : formatBytes(bps) + '/s'

const ProgressBar = ({ value, color }: { value: number; color: string }) => {
  const c = value >= 90 ? 'bg-error' : value >= 70 ? 'bg-warning' : color
  const g = value >= 90 ? 'rgba(255,71,87,0.5)' : value >= 70 ? 'rgba(255,190,11,0.5)' : 'rgba(0,212,255,0.5)'
  return <div className="h-1.5 bg-border/30 rounded-full overflow-hidden"><div className={`h-full ${c} transition-all duration-500 rounded-full`} style={{ width: `${Math.min(value, 100)}%`, boxShadow: `0 0 8px ${g}` }} /></div>
}

const InfoRow = ({ label, value }: { label: string; value?: string }) => value && value !== 'unknown' && value !== '' ? (
  <div className="text-text-secondary"><span className="block mb-0.5">{label}</span><span className="text-text break-all">{value}</span></div>
) : null

export function SidePanel({ sessionId }: { sessionId: string }) {
  const [isOpen, setIsOpen] = useState(false)
  const [tab, setTab] = useState<'monitor' | 'history'>('monitor')
  const [data, setData] = useState<MonitorData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [speed, setSpeed] = useState({ rx: 0, tx: 0 })
  const [procs, setProcs] = useState<ProcessInfo[]>([])
  const [showProcs, setShowProcs] = useState(false)
  const [history, setHistory] = useState<LoginRecord[]>([])
  const [histErr, setHistErr] = useState<string | null>(null)
  const [histLoad, setHistLoad] = useState(false)
  const [showTip, setShowTip] = useState(true)
  const prevNet = useRef<{ rx: number; tx: number; time: number } | null>(null)

  const fetchMonitor = useCallback(async () => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/monitor`)
      if (!res.ok) throw new Error('获取监控数据失败')
      const d: MonitorData = await res.json()
      if (prevNet.current) {
        const dt = (d.timestamp - prevNet.current.time) / 1000
        if (dt > 0) setSpeed({ rx: Math.max(0, (d.network.rxBytes - prevNet.current.rx) / dt), tx: Math.max(0, (d.network.txBytes - prevNet.current.tx) / dt) })
      }
      prevNet.current = { rx: d.network.rxBytes, tx: d.network.txBytes, time: d.timestamp }
      setData(d); setError(null)
    } catch (e) { setError(e instanceof Error ? e.message : '未知错误') }
  }, [sessionId])

  const fetchProcs = useCallback(async () => {
    try { const res = await fetch(`/api/sessions/${sessionId}/top-processes`); if (res.ok) setProcs((await res.json()).processes || []) }
    catch { setProcs([]) }
  }, [sessionId])

  const fetchHistory = useCallback(async () => {
    setHistLoad(true)
    try {
      const res = await fetch(`/api/sessions/${sessionId}/login-history`)
      if (!res.ok) throw new Error('获取登录历史失败')
      setHistory((await res.json()).history || []); setHistErr(null)
    } catch (e) { setHistErr(e instanceof Error ? e.message : '未知错误') }
    finally { setHistLoad(false) }
  }, [sessionId])

  // 只在面板打开时才轮询数据
  useEffect(() => {
    if (!isOpen) return
    fetchMonitor()
    if (tab === 'history') fetchHistory()
    const m = setInterval(fetchMonitor, 3000)
    const h = tab === 'history' ? setInterval(fetchHistory, 30000) : null
    return () => { clearInterval(m); if (h) clearInterval(h) }
  }, [fetchMonitor, fetchHistory, isOpen, tab])

  const StatusIcon = ({ s }: { s: LoginRecord['status'] }) => s === 'current' ? <span className="w-2 h-2 bg-success rounded-full animate-pulse" />
    : s === 'failed' ? <svg className="w-3 h-3 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
    : <svg className="w-3 h-3 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>

  const statusColor = (s: LoginRecord['status']) => s === 'current' ? 'text-success' : s === 'failed' ? 'text-error' : 'text-text-secondary'

  return (
    <>
      <button onClick={() => setIsOpen(!isOpen)} className={`fixed top-1/2 -translate-y-1/2 p-1.5 md:p-2 rounded-l-lg md:rounded-l-xl shadow-lg transition-all duration-300 backdrop-blur-sm ${isOpen ? 'right-72 md:right-80 text-white bg-primary' : 'right-0 border border-border hover:border-primary/50 text-text-secondary hover:text-primary bg-surface/80'}`} style={{ zIndex: 70, maxWidth: '100vw' }} title={isOpen ? '收起面板' : '展开面板'}>
        <svg className={`w-4 h-4 md:w-5 md:h-5 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
      </button>

      <div className={`fixed top-0 right-0 h-full w-72 md:w-80 border-l border-border transform transition-all duration-300 ease-out bg-surface ${isOpen ? 'translate-x-0' : 'translate-x-full'}`} style={{ zIndex: 70, boxShadow: isOpen ? '-10px 0 40px rgba(0,0,0,0.3)' : 'none' }}>
        <div className="flex border-b border-border bg-surface/50">
          {(['monitor', 'history'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`flex-1 m-2 px-4 py-2 text-sm font-medium transition-all duration-200 relative rounded-xl ${tab === t ? 'text-primary bg-primary/15' : 'text-text-secondary hover:text-text hover:bg-surface-hover'}`}
              style={tab === t ? { border: '1px solid rgba(0,212,255,0.3)', boxShadow: '0 2px 10px rgba(0,212,255,0.2)' } : { border: '1px solid transparent' }}>
              {t === 'monitor' ? '系统监控' : '登录历史'}
              {t === 'history' && history.some(r => r.status === 'failed') && <span className="absolute top-1 right-1 w-2 h-2 bg-error rounded-full" style={{ boxShadow: '0 0 8px rgba(255,71,87,0.6)' }} />}
            </button>
          ))}
        </div>

        <div className="h-[calc(100%-49px)] overflow-y-auto">
          {tab === 'monitor' ? (
            <div className="p-4 space-y-4">
              {error ? <div className="text-sm text-error text-center py-4">{error}</div>
              : !data ? <div className="text-sm text-text-secondary text-center py-4">加载中...</div>
              : <>
                <div><div className="flex justify-between mb-1 text-xs"><span className="text-text-secondary">CPU</span><span className="font-medium text-text">{data.cpu.usage.toFixed(1)}%</span></div><ProgressBar value={data.cpu.usage} color="bg-primary" /></div>
                <div className="relative" onMouseEnter={() => { setShowProcs(true); fetchProcs() }} onMouseLeave={() => setShowProcs(false)}>
                  <div className="flex justify-between mb-1 text-xs"><span className="text-text-secondary">内存</span><span className="font-medium text-text">{formatBytes(data.memory.used)} / {formatBytes(data.memory.total)}</span></div>
                  <ProgressBar value={data.memory.usagePercent} color="bg-accent" />
                  {showProcs && procs.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-2 bg-background border border-border rounded-lg shadow-lg z-50 p-2">
                      <div className="text-xs font-medium text-text-secondary mb-2 px-1">内存占用 Top 10</div>
                      <table className="w-full text-xs"><thead><tr className="text-text-secondary"><th className="text-left py-1 px-1">用户</th><th className="text-left py-1 px-1">程序</th><th className="text-right py-1 px-1">内存</th><th className="text-right py-1 px-1">占比</th></tr></thead>
                        <tbody>{procs.map((p, i) => <tr key={i} className="text-text hover:bg-surface/50"><td className="py-1 px-1 truncate max-w-[60px]">{p.user}</td><td className="py-1 px-1 truncate max-w-[80px]">{p.name}</td><td className="py-1 px-1 text-right">{p.memoryMB.toFixed(1)}M</td><td className="py-1 px-1 text-right">{p.memoryPercent.toFixed(1)}%</td></tr>)}</tbody>
                      </table>
                    </div>
                  )}
                </div>
                <div><div className="flex justify-between mb-1 text-xs"><span className="text-text-secondary">磁盘</span><span className="font-medium text-text">{formatBytes(data.disk.used)} / {formatBytes(data.disk.total)}</span></div><ProgressBar value={data.disk.usagePercent} color="bg-success" /></div>
                <div className="pt-2 border-t border-border">
                  <div className="text-xs text-text-secondary mb-2">网络流量</div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-1"><svg className="w-3 h-3 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg><span className="text-text-secondary">下载</span><span className="text-text font-medium ml-auto">{formatSpeed(speed.rx)}</span></div>
                    <div className="flex items-center gap-1"><svg className="w-3 h-3 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg><span className="text-text-secondary">上传</span><span className="text-text font-medium ml-auto">{formatSpeed(speed.tx)}</span></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs mt-1 text-text-secondary"><span>总计: {formatBytes(data.network.rxBytes)}</span><span>总计: {formatBytes(data.network.txBytes)}</span></div>
                </div>
                <div className="pt-2 border-t border-border text-xs space-y-2">
                  <InfoRow label="主机名" value={data.system?.hostname} />
                  <InfoRow label="系统" value={data.system?.os ? `${data.system.os}${data.system.osVersion ? ` ${data.system.osVersion}` : ''}` : undefined} />
                  <InfoRow label="内核" value={data.system?.kernel} />
                  <InfoRow label="CPU" value={data.cpu?.model?.replace(/\(R\)|\(TM\)|CPU|@.*$/gi, '').trim()} />
                  <InfoRow label="运行时间" value={data.system?.uptime} />
                  <div className="text-text-secondary"><span className="block mb-0.5">负载</span><span className="text-text">{(data.system?.load?.load1 ?? 0).toFixed(2)} / {(data.system?.load?.load5 ?? 0).toFixed(2)} / {(data.system?.load?.load15 ?? 0).toFixed(2)}</span></div>
                </div>
              </>}
            </div>
          ) : (
            <div className="p-2">
              {histErr ? <div className="text-sm text-error text-center py-4">{histErr}</div>
              : histLoad && !history.length ? <div className="text-sm text-text-secondary text-center py-4">加载中...</div>
              : <>
                <div className="space-y-1">
                  {!history.length && <div className="text-sm text-text-secondary text-center py-4">暂无登录记录</div>}
                  {history.map((r, i) => (
                    <div key={i} className={`p-2 rounded-lg text-xs ${r.status === 'failed' ? 'bg-error/10 border border-error/20' : r.status === 'current' ? 'bg-success/10 border border-success/20' : 'bg-background'}`}>
                      <div className="flex justify-between mb-1"><div className="flex items-center gap-1.5"><StatusIcon s={r.status} /><span className={`font-medium ${statusColor(r.status)}`}>{r.user}</span></div><span className={r.status === 'failed' ? 'text-error' : 'text-text-secondary'}>{r.status === 'failed' ? '失败' : r.duration}</span></div>
                      <div className="flex justify-between text-text-secondary"><span className="font-mono">{r.ip}</span><span>{r.time}</span></div>
                    </div>
                  ))}
                </div>
                {showTip && (!history.length || history.every(r => r.status === 'current')) && (
                  <div className="mt-2 p-3 bg-info/10 border border-info/20 rounded-lg text-xs relative">
                    <button onClick={() => setShowTip(false)} className="absolute top-1 right-1 p-1 text-text-muted hover:text-text transition-colors" title="关闭提示">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                    <div className="text-info font-medium mb-2">💡 如何查看登录历史？</div>
                    <div className="text-text-secondary space-y-1.5">
                      <p>服务器需要安装登录历史工具才能查看完整记录。</p>
                      <p className="font-medium text-text-muted">安装命令：</p>
                      <div className="space-y-1 font-mono text-xs">
                        <p><span className="text-text-muted"># Debian 13+:</span></p><p className="text-primary">apt install wtmpdb</p>
                        <p><span className="text-text-muted"># Debian/Ubuntu 旧版:</span></p><p className="text-primary">apt install login</p>
                        <p><span className="text-text-muted"># CentOS/RHEL:</span></p><p className="text-primary">yum install util-linux</p>
                      </div>
                    </div>
                  </div>
                )}
              </>}
              {history.some(r => r.status === 'failed') && <div className="mt-2 p-2 bg-error/10 border border-error/20 rounded-lg text-xs text-error">⚠️ 检测到失败的登录尝试，请注意安全</div>}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
