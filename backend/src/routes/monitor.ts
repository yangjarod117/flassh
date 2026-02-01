import { Router, Request, Response, NextFunction } from 'express'
import { sshManager } from '../services/ssh-manager.js'
import type { ApiError } from '../types/index.js'

const router = Router()

/** 在 SSH 连接上执行命令 */
const execCommand = (client: any, cmd: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    client.exec(cmd, (err: Error, stream: any) => {
      if (err) return reject(err)
      let output = ''
      stream.on('data', (d: Buffer) => output += d.toString())
      stream.on('close', () => resolve(output.trim()))
      stream.stderr.on('data', () => {})
    })
  })
}

/** 获取会话或返回 404 错误 */
const getSessionOrError = (id: string, res: Response) => {
  const session = sshManager.getSession(id)
  if (!session?.connection) {
    res.status(404).json({ code: 'SESSION_NOT_FOUND', message: '会话不存在' } as ApiError)
    return null
  }
  return session
}

/** GET /api/sessions/:id/monitor - 获取系统监控数据 */
router.get('/:id/monitor', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const session = getSessionOrError(req.params.id, res)
    if (!session) return
    res.json(await executeMonitorCommands(session.connection))
  } catch (err) { next(err) }
})

/** GET /api/sessions/:id/login-history - 获取登录历史 */
router.get('/:id/login-history', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const session = getSessionOrError(req.params.id, res)
    if (!session) return
    res.json({ history: await getLoginHistory(session.connection) })
  } catch (err) { next(err) }
})

/** GET /api/sessions/:id/top-processes - 获取内存占用前10进程 */
router.get('/:id/top-processes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const session = getSessionOrError(req.params.id, res)
    if (!session) return
    res.json({ processes: await getTopProcesses(session.connection) })
  } catch (err) { next(err) }
})

/** 获取内存占用前10进程 */
async function getTopProcesses(client: any) {
  try {
    const output = await execCommand(client, "ps aux --sort=-%mem | head -11 | tail -10 | awk '{print $1,$11,$6,$4}'")
    return output.split('\n').filter(l => l.trim()).map(line => {
      const [user, cmd, kb, pct] = line.split(/\s+/)
      return {
        user,
        name: (cmd?.split('/').pop() || cmd || '').substring(0, 20),
        memoryMB: (parseInt(kb) || 0) / 1024,
        memoryPercent: parseFloat(pct) || 0
      }
    }).filter(p => p.user)
  } catch { return [] }
}

/** 执行监控命令获取系统信息 */
async function executeMonitorCommands(client: any) {
  const exec = (cmd: string) => execCommand(client, cmd).catch(() => '')
  
  try {
    const [cpuInfo, memInfo, diskInfo, netInfo, uptimeInfo, loadInfo] = await Promise.all([
      exec("top -bn1 | grep 'Cpu(s)' | awk '{print $2}' | cut -d'%' -f1"),
      exec("free -b | grep Mem | awk '{print $2,$3,$4,$7}'"),
      exec("df -B1 / | tail -1 | awk '{print $2,$3,$4,$5}'"),
      exec("cat /proc/net/dev | grep -E 'eth0|ens|enp' | head -1 | awk '{print $2,$10}'"),
      exec("uptime -p 2>/dev/null || uptime | sed 's/.*up //' | cut -d',' -f1-2"),
      exec("cat /proc/loadavg | awk '{print $1,$2,$3}'"),
    ])

    const mem = memInfo.split(' ').map(n => parseInt(n) || 0)
    const disk = diskInfo.split(' ')
    const net = netInfo.split(' ').map(n => parseInt(n) || 0)
    const load = loadInfo.split(' ').map(n => parseFloat(n) || 0)

    return {
      cpu: { usage: parseFloat(cpuInfo) || 0 },
      memory: {
        total: mem[0], used: mem[1], free: mem[2], available: mem[3] || mem[2],
        usagePercent: mem[0] > 0 ? Math.round((mem[1] / mem[0]) * 100) : 0,
      },
      disk: {
        total: parseInt(disk[0]) || 0, used: parseInt(disk[1]) || 0, free: parseInt(disk[2]) || 0,
        usagePercent: parseInt(disk[3]) || 0,
      },
      network: { rxBytes: net[0], txBytes: net[1] },
      system: { uptime: uptimeInfo || 'unknown', load: { load1: load[0], load5: load[1], load15: load[2] } },
      timestamp: Date.now(),
    }
  } catch {
    return {
      cpu: { usage: 0 }, memory: { total: 0, used: 0, free: 0, available: 0, usagePercent: 0 },
      disk: { total: 0, used: 0, free: 0, usagePercent: 0 }, network: { rxBytes: 0, txBytes: 0 },
      system: { uptime: 'unknown', load: { load1: 0, load5: 0, load15: 0 } }, timestamp: Date.now(),
    }
  }
}

/** 获取登录历史 - 多种备选方案兼容各种系统 */
async function getLoginHistory(client: any) {
  const exec = (cmd: string) => execCommand(client, cmd).catch(() => '')
  type LoginRecord = { user: string; ip: string; time: string; duration: string; status: 'success' | 'failed' | 'current' }
  const history: LoginRecord[] = []

  const parseIp = (parts: string[], max = 5) => {
    for (let i = 1; i < Math.min(parts.length, max); i++) {
      if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(parts[i])) return parts[i]
      if (parts[i].includes(':') && !parts[i].includes('(') && parts[i].length > 2) return parts[i]
    }
    return '-'
  }

  const parseTime = (parts: string[]) => {
    const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    for (let i = 1; i < parts.length; i++) {
      if (weekDays.includes(parts[i])) return parts.slice(i, i + 4).join(' ')
    }
    return parts.slice(2, 6).join(' ')
  }

  try {
    // 方案1: last 命令
    const lastOutput = await exec('last -20 -i 2>/dev/null || last -20 2>/dev/null || last -n 20 2>/dev/null')
    if (lastOutput && !lastOutput.includes('command not found') && lastOutput.length > 10) {
      for (const line of lastOutput.split('\n').slice(0, 15)) {
        if (!line.trim() || line.includes('wtmp') || line.includes('reboot')) continue
        const parts = line.split(/\s+/).filter(p => p)
        if (parts.length < 4) continue
        const user = parts[0]
        if (['reboot', 'shutdown', 'runlevel'].includes(user)) continue
        
        const lineL = line.toLowerCase()
        const isCurrent = lineL.includes('still logged in') || lineL.includes('still running')
        const durationMatch = line.match(/\(([^)]+)\)\s*$/)
        
        history.push({
          user, ip: parseIp(parts), time: parseTime(parts),
          duration: isCurrent ? '在线中' : (durationMatch?.[1] || '-'),
          status: isCurrent ? 'current' : 'success'
        })
      }
    }

    // 方案2: auth.log / secure
    if (history.length === 0) {
      const authLog = await exec('tail -100 /var/log/auth.log 2>/dev/null || tail -100 /var/log/secure 2>/dev/null')
      if (authLog) {
        const seen = new Set<string>()
        for (const line of authLog.split('\n').reverse()) {
          if (history.length >= 15) break
          const accepted = line.match(/(\w+\s+\d+\s+[\d:]+).*Accepted\s+\w+\s+for\s+(\w+)\s+from\s+([\d.]+)/)
          if (accepted) {
            const key = `${accepted[2]}@${accepted[3]}`
            if (!seen.has(key)) { seen.add(key); history.push({ user: accepted[2], ip: accepted[3], time: accepted[1], duration: '-', status: 'success' }) }
            continue
          }
          const failed = line.match(/(\w+\s+\d+\s+[\d:]+).*Failed\s+password\s+for\s+(?:invalid user\s+)?(\w+)\s+from\s+([\d.]+)/)
          if (failed) history.push({ user: failed[2], ip: failed[3], time: failed[1], duration: '-', status: 'failed' })
        }
      }
    }

    // 方案3: journalctl
    if (history.length === 0) {
      const journal = await exec('journalctl -u sshd -n 50 --no-pager 2>/dev/null || journalctl -u ssh -n 50 --no-pager 2>/dev/null')
      if (journal && !journal.includes('No journal files')) {
        const seen = new Set<string>()
        for (const line of journal.split('\n').reverse()) {
          if (history.length >= 15) break
          const accepted = line.match(/(\w+\s+\d+\s+[\d:]+).*Accepted\s+\w+\s+for\s+(\w+)\s+from\s+([\d.]+)/)
          if (accepted) {
            const key = `${accepted[2]}@${accepted[3]}`
            if (!seen.has(key)) { seen.add(key); history.push({ user: accepted[2], ip: accepted[3], time: accepted[1], duration: '-', status: 'success' }) }
            continue
          }
          const failed = line.match(/(\w+\s+\d+\s+[\d:]+).*Failed\s+password\s+for\s+(?:invalid user\s+)?(\w+)\s+from\s+([\d.]+)/)
          if (failed) history.push({ user: failed[2], ip: failed[3], time: failed[1], duration: '-', status: 'failed' })
        }
      }
    }

    // 方案4: who 命令获取当前在线用户
    const whoOutput = await exec('who 2>/dev/null')
    if (whoOutput) {
      for (const line of whoOutput.split('\n').filter(l => l.trim())) {
        const parts = line.split(/\s+/).filter(p => p)
        if (parts.length < 3) continue
        const user = parts[0]
        const ipMatch = line.match(/\(([\d.]+)\)/)
        const timeMatch = line.match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/)
        const ip = ipMatch?.[1] || '-'
        if (!history.some(h => h.user === user && h.ip === ip && h.status === 'current')) {
          history.unshift({ user, ip, time: timeMatch?.[1] || parts.slice(2, 4).join(' '), duration: '在线中', status: 'current' })
        }
      }
    }

    return history
  } catch { return [] }
}

export default router
