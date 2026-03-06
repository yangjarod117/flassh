import type { FileEntry, Stats } from 'ssh2'
import type { FileStats } from '../types/index.js'
import { sshManager } from './ssh-manager.js'

// 目录缓存，减少重复请求
interface DirCache {
  files: FileStats[]
  timestamp: number
}
const dirCache = new Map<string, DirCache>()
const CACHE_TTL = 5000 // 5秒缓存（读操作），写操作会主动失效

/**
 * SFTP 文件操作管理器
 */
export class SFTPManager {
  /**
   * 列出目录内容（带缓存）
   */
  async listDirectory(sessionId: string, path: string): Promise<FileStats[]> {
    const cacheKey = `${sessionId}:${path}`
    const cached = dirCache.get(cacheKey)
    
    // 检查缓存是否有效
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.files
    }

    const session = sshManager.getSession(sessionId)
    if (!session) throw new Error('Session not found')

    // 确保 SFTP 已初始化（只在首次调用时）
    if (!session.sftp) {
      await sshManager.getSFTP(sessionId)
    }
    const sftp = session.sftp
    if (!sftp) throw new Error('SFTP not initialized')

    return new Promise((resolve, reject) => {
      sftp.readdir(path, (err, list) => {
        if (err) {
          reject(err)
          return
        }

    const files: FileStats[] = list.map((item: FileEntry) => ({
          name: item.filename,
          path: `${path}/${item.filename}`.replace(/\/+/g, '/'),
          type: this.getFileType(item.attrs),
          size: item.attrs.size,
          mode: item.attrs.mode,
          uid: item.attrs.uid,
          gid: item.attrs.gid,
          atime: new Date(item.attrs.atime * 1000),
          mtime: new Date(item.attrs.mtime * 1000),
        }))

        // 更新缓存
        dirCache.set(cacheKey, { files, timestamp: Date.now() })
        
        resolve(files)
      })
    })
  }

  /**
   * 清除目录缓存
   */
  invalidateCache(sessionId: string, path?: string): void {
    if (path) {
      dirCache.delete(`${sessionId}:${path}`)
      // 也清除父目录缓存
      const parentPath = path.substring(0, path.lastIndexOf('/')) || '/'
      dirCache.delete(`${sessionId}:${parentPath}`)
    } else {
      // 清除该会话的所有缓存
      for (const key of dirCache.keys()) {
        if (key.startsWith(`${sessionId}:`)) {
          dirCache.delete(key)
        }
      }
    }
  }

  /**
   * 获取 SFTP 客户端（内部使用，带缓存）
   */
  private async ensureSFTP(sessionId: string) {
    const session = sshManager.getSession(sessionId)
    if (!session) throw new Error('Session not found')
    if (!session.sftp) {
      await sshManager.getSFTP(sessionId)
    }
    if (!session.sftp) throw new Error('SFTP not initialized')
    return session.sftp
  }

  /**
   * 读取文件内容
   */
  async readFile(sessionId: string, path: string): Promise<string> {
    const sftp = await this.ensureSFTP(sessionId)

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      const stream = sftp.createReadStream(path)

      stream.on('data', (chunk: Buffer) => {
        chunks.push(chunk)
      })

      stream.on('end', () => {
        resolve(Buffer.concat(chunks).toString('utf-8'))
      })

      stream.on('error', (err: Error) => {
        reject(err)
      })
    })
  }

  /**
   * 写入文件内容（保留原文件权限）
   */
  async writeFile(sessionId: string, path: string, content: string): Promise<void> {
    const sftp = await this.ensureSFTP(sessionId)

    // 获取原文件权限，写入时直接指定 mode 保持不变
    let mode: number | undefined
    try {
      const stats = await new Promise<{ mode: number }>((res, rej) => {
        sftp.stat(path, (err, s) => err ? rej(err) : res(s))
      })
      mode = stats.mode & 0o7777
    } catch { /* 新文件，使用默认权限 */ }

    return new Promise((resolve, reject) => {
      const stream = sftp.createWriteStream(path, mode !== undefined ? { mode } : undefined)
      stream.on('close', () => resolve())
      stream.on('error', (err: Error) => reject(err))
      stream.end(content, 'utf-8')
    })
  }

  /**
   * 创建目录
   */
  async createDirectory(sessionId: string, path: string): Promise<void> {
    const sftp = await this.ensureSFTP(sessionId)

    return new Promise((resolve, reject) => {
      sftp.mkdir(path, (err) => {
        if (err) {
          reject(err)
          return
        }
        this.invalidateCache(sessionId, path)
        resolve()
      })
    })
  }

  /**
   * 创建文件
   */
  async createFile(sessionId: string, path: string): Promise<void> {
    await this.writeFile(sessionId, path, '')
    this.invalidateCache(sessionId, path)
  }

  /**
   * 删除文件
   */
  async deleteFile(sessionId: string, path: string): Promise<void> {
    const sftp = await this.ensureSFTP(sessionId)

    return new Promise((resolve, reject) => {
      sftp.unlink(path, (err) => {
        if (err) {
          reject(err)
          return
        }
        this.invalidateCache(sessionId, path)
        resolve()
      })
    })
  }

  /**
   * 删除目录
   */
  async deleteDirectory(sessionId: string, path: string): Promise<void> {
    const sftp = await this.ensureSFTP(sessionId)

    // 递归删除目录内容
    const files = await this.listDirectory(sessionId, path)
    for (const file of files) {
      if (file.type === 'directory') {
        await this.deleteDirectory(sessionId, file.path)
      } else {
        await this.deleteFile(sessionId, file.path)
      }
    }

    return new Promise((resolve, reject) => {
      sftp.rmdir(path, (err) => {
        if (err) {
          reject(err)
          return
        }
        this.invalidateCache(sessionId, path)
        resolve()
      })
    })
  }

  /**
   * 重命名文件或目录
   */
  async rename(sessionId: string, oldPath: string, newPath: string): Promise<void> {
    const sftp = await this.ensureSFTP(sessionId)

    return new Promise((resolve, reject) => {
      sftp.rename(oldPath, newPath, (err) => {
        if (err) {
          reject(err)
          return
        }
        this.invalidateCache(sessionId, oldPath)
        this.invalidateCache(sessionId, newPath)
        resolve()
      })
    })
  }

  /**
   * 获取文件信息
   */
  async stat(sessionId: string, path: string): Promise<FileStats> {
    const sftp = await this.ensureSFTP(sessionId)

    return new Promise((resolve, reject) => {
      sftp.stat(path, (err, stats) => {
        if (err) {
          reject(err)
          return
        }

        const name = path.split('/').pop() || ''
        resolve({
          name,
          path,
          type: this.getFileTypeFromStats(stats),
          size: stats.size,
          mode: stats.mode,
          uid: stats.uid,
          gid: stats.gid,
          atime: new Date(stats.atime * 1000),
          mtime: new Date(stats.mtime * 1000),
        })
      })
    })
  }

  /**
   * 检查文件是否存在
   */
  async exists(sessionId: string, path: string): Promise<boolean> {
    try {
      await this.stat(sessionId, path)
      return true
    } catch {
      return false
    }
  }

  /**
   * 获取文件类型
   */
  private getFileType(attrs: { mode: number }): FileStats['type'] {
    const mode = attrs.mode
    if ((mode & 0o170000) === 0o040000) return 'directory'
    if ((mode & 0o170000) === 0o120000) return 'symlink'
    return 'file'
  }

  /**
   * 从 Stats 获取文件类型
   */
  private getFileTypeFromStats(stats: Stats): FileStats['type'] {
    if (stats.isDirectory()) return 'directory'
    if (stats.isSymbolicLink()) return 'symlink'
    return 'file'
  }
}

// 单例实例
export const sftpManager = new SFTPManager()
