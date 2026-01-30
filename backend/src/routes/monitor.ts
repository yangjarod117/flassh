import { Router, Request, Response, NextFunction } from 'express'
import { sshManager } from '../services/ssh-manager.js'
import type { ApiError } from '../types/index.js'

const router = Router()

/**
 * 获取系统监控数据
 * GET /api/sessions/:id/monitor
 */
router.get('/:id/monitor', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params
    const session = sshManager.getSession(id)

    if (!session || !session.connection) {
      const error: ApiError = {
        code: 'SESSION_NOT_FOUND',
        message: '会话不存在',
      }
      return res.status(404).json(error)
    }

    // 执行监控命令
    const monitorData = await executeMonitorCommands(session.connection)
    res.json(monitorData)
  } catch (err) {
    next(err)
  }
})

/**
 * 执行监控命令获取系统信息
 */
async function executeMonitorCommands(client: any): Promise<any> {
  const execCommand = (cmd: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      client.exec(cmd, (err: Error, stream: any) => {
        if (err) {
          reject(err)
          return
        }
        let output = ''
        stream.on('data', (data: Buffer) => {
          output += data.toString()
        })
        stream.on('close', () => {
          resolve(output.trim())
        })
        stream.stderr.on('data', () => {
          // 忽略 stderr
        })
      })
    })
  }

  try {
    // 并行执行所有命令
    const [cpuInfo, memInfo, diskInfo, netInfo, uptimeInfo, loadInfo] = await Promise.all([
      // CPU 使用率
      execCommand("top -bn1 | grep 'Cpu(s)' | awk '{print $2}' | cut -d'%' -f1").catch(() => '0'),
      // 内存信息
      execCommand("free -b | grep Mem | awk '{print $2,$3,$4,$7}'").catch(() => '0 0 0 0'),
      // 磁盘信息
      execCommand("df -B1 / | tail -1 | awk '{print $2,$3,$4,$5}'").catch(() => '0 0 0 0%'),
      // 网络流量 (获取主网卡)
      execCommand("cat /proc/net/dev | grep -E 'eth0|ens|enp' | head -1 | awk '{print $2,$10}'").catch(() => '0 0'),
      // 系统运行时间
      execCommand("uptime -p 2>/dev/null || uptime | sed 's/.*up //' | cut -d',' -f1-2").catch(() => 'unknown'),
      // 系统负载
      execCommand("cat /proc/loadavg | awk '{print $1,$2,$3}'").catch(() => '0 0 0'),
    ])

    // 解析内存信息
    const memParts = memInfo.split(' ')
    const memTotal = parseInt(memParts[0]) || 0
    const memUsed = parseInt(memParts[1]) || 0
    const memFree = parseInt(memParts[2]) || 0
    const memAvailable = parseInt(memParts[3]) || memFree

    // 解析磁盘信息
    const diskParts = diskInfo.split(' ')
    const diskTotal = parseInt(diskParts[0]) || 0
    const diskUsed = parseInt(diskParts[1]) || 0
    const diskFree = parseInt(diskParts[2]) || 0
    const diskPercent = diskParts[3] || '0%'

    // 解析网络流量
    const netParts = netInfo.split(' ')
    const netRx = parseInt(netParts[0]) || 0
    const netTx = parseInt(netParts[1]) || 0

    // 解析负载
    const loadParts = loadInfo.split(' ')

    return {
      cpu: {
        usage: parseFloat(cpuInfo) || 0,
      },
      memory: {
        total: memTotal,
        used: memUsed,
        free: memFree,
        available: memAvailable,
        usagePercent: memTotal > 0 ? Math.round((memUsed / memTotal) * 100) : 0,
      },
      disk: {
        total: diskTotal,
        used: diskUsed,
        free: diskFree,
        usagePercent: parseInt(diskPercent) || 0,
      },
      network: {
        rxBytes: netRx,
        txBytes: netTx,
      },
      system: {
        uptime: uptimeInfo,
        load: {
          load1: parseFloat(loadParts[0]) || 0,
          load5: parseFloat(loadParts[1]) || 0,
          load15: parseFloat(loadParts[2]) || 0,
        },
      },
      timestamp: Date.now(),
    }
  } catch (error) {
    console.error('Monitor command error:', error)
    return {
      cpu: { usage: 0 },
      memory: { total: 0, used: 0, free: 0, available: 0, usagePercent: 0 },
      disk: { total: 0, used: 0, free: 0, usagePercent: 0 },
      network: { rxBytes: 0, txBytes: 0 },
      system: { uptime: 'unknown', load: { load1: 0, load5: 0, load15: 0 } },
      timestamp: Date.now(),
    }
  }
}

export default router
