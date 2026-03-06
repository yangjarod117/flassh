import { Router, Request, Response, NextFunction } from 'express'
import multer from 'multer'
import { sftpManager } from '../services/sftp-manager.js'
import { fileTransferManager } from '../services/file-transfer.js'
import { sshManager } from '../services/ssh-manager.js'
import type { ApiError } from '../types/index.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

/**
 * 列出目录内容
 * GET /api/sessions/:id/files?path=/home/user
 */
router.get('/:id/files', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string
    const path = (req.query.path as string) || '/'

    const files = await sftpManager.listDirectory(id, path)
    
    // 转换字段名以匹配前端期望的格式
    const formattedFiles = files.map(file => ({
      name: file.name,
      path: file.path,
      type: file.type,
      size: file.size,
      modifiedTime: file.mtime, // 前端期望 modifiedTime
    }))
    
    res.json({ path, files: formattedFiles })
  } catch (err) {
    // 提供更详细的错误信息
    const error = err as Error
    if (error.message === 'Session not found') {
      return res.status(404).json({
        code: 'SESSION_NOT_FOUND',
        message: '会话不存在或已断开，请重新连接',
      })
    }
    if (error.message === 'SFTP not initialized') {
      return res.status(500).json({
        code: 'SFTP_ERROR',
        message: 'SFTP 连接失败，请重新连接',
      })
    }
    next(err)
  }
})

/**
 * 创建文件或目录
 * POST /api/sessions/:id/files
 * Body: { path: string, type: 'file' | 'directory' }
 */
router.post('/:id/files', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string
    const { path, type } = req.body

    if (!path || !type) {
      const error: ApiError = {
        code: 'INVALID_REQUEST',
        message: '缺少 path 或 type 参数',
      }
      return res.status(400).json(error)
    }

    if (type === 'directory') {
      await sftpManager.createDirectory(id, path)
    } else {
      await sftpManager.createFile(id, path)
    }

    res.status(201).json({ path, type })
  } catch (err) {
    next(err)
  }
})

/**
 * 重命名/移动文件
 * PUT /api/sessions/:id/files
 * Body: { path: string, newPath: string }
 */
router.put('/:id/files', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string
    const { path, newPath } = req.body

    if (!path || !newPath) {
      const error: ApiError = {
        code: 'INVALID_REQUEST',
        message: '缺少 path 或 newPath 参数',
      }
      return res.status(400).json(error)
    }

    await sftpManager.rename(id, path, newPath)
    res.json({ oldPath: path, newPath })
  } catch (err) {
    next(err)
  }
})

/**
 * 删除文件或目录
 * DELETE /api/sessions/:id/files?path=/home/user/file.txt&type=file
 */
router.delete('/:id/files', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string
    const path = req.query.path as string
    const type = req.query.type as string

    if (!path) {
      const error: ApiError = {
        code: 'INVALID_REQUEST',
        message: '缺少 path 参数',
      }
      return res.status(400).json(error)
    }

    if (type === 'directory') {
      await sftpManager.deleteDirectory(id, path)
    } else {
      await sftpManager.deleteFile(id, path)
    }

    res.status(204).send()
  } catch (err) {
    next(err)
  }
})

/**
 * 读取文件内容
 * GET /api/sessions/:id/files/content?path=/home/user/file.txt
 */
router.get('/:id/files/content', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string
    const path = req.query.path as string

    if (!path) {
      const error: ApiError = {
        code: 'INVALID_REQUEST',
        message: '缺少 path 参数',
      }
      return res.status(400).json(error)
    }

    const content = await sftpManager.readFile(id, path)
    res.json({ path, content })
  } catch (err) {
    next(err)
  }
})

/**
 * 写入文件内容
 * PUT /api/sessions/:id/files/content
 * Body: { path: string, content: string }
 */
router.put('/:id/files/content', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string
    const { path, content } = req.body

    if (!path || content === undefined) {
      const error: ApiError = {
        code: 'INVALID_REQUEST',
        message: '缺少 path 或 content 参数',
      }
      return res.status(400).json(error)
    }

    await sftpManager.writeFile(id, path, content)
    res.json({ path, success: true })
  } catch (err) {
    next(err)
  }
})

/**
 * 上传文件
 * POST /api/sessions/:id/files/upload
 * Form: file (multipart), path (目标目录)
 */
router.post(
  '/:id/files/upload',
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string
      const targetPath = req.body.path || '/'
      const file = req.file

      if (!file) {
        const error: ApiError = {
          code: 'INVALID_REQUEST',
          message: '没有上传文件',
        }
        return res.status(400).json(error)
      }

      const remotePath = `${targetPath}/${file.originalname}`.replace(/\/+/g, '/')

      await fileTransferManager.uploadBuffer(id, file.buffer, remotePath)

      res.status(201).json({
        path: remotePath,
        size: file.size,
        success: true,
      })
    } catch (err) {
      next(err)
    }
  }
)

/**
 * 下载文件
 * GET /api/sessions/:id/files/download?path=/home/user/file.txt
 */
router.get('/:id/files/download', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string
    const path = req.query.path as string

    if (!path) {
      const error: ApiError = {
        code: 'INVALID_REQUEST',
        message: '缺少 path 参数',
      }
      return res.status(400).json(error)
    }

    const buffer = await fileTransferManager.downloadBuffer(id, path)
    const filename = path.split('/').pop() || 'download'

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`)
    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Length', buffer.length)
    res.send(buffer)
  } catch (err) {
    next(err)
  }
})

/**
 * 下载文件夹（tar.gz 流式传输）
 * GET /api/sessions/:id/files/download-dir?path=/home/user/folder
 */
router.get('/:id/files/download-dir', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string
    const dirPath = req.query.path as string

    if (!dirPath) {
      const error: ApiError = { code: 'INVALID_REQUEST', message: '缺少 path 参数' }
      return res.status(400).json(error)
    }

    const session = sshManager.getSession(id)
    if (!session || session.status !== 'connected') {
      const error: ApiError = { code: 'SESSION_NOT_FOUND', message: 'Session not found or not connected' }
      return res.status(404).json(error)
    }

    const dirName = dirPath.split('/').pop() || 'folder'
    const parentDir = dirPath.substring(0, dirPath.lastIndexOf('/')) || '/'

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(dirName)}.tar.gz"`)
    res.setHeader('Content-Type', 'application/gzip')
    res.setHeader('Transfer-Encoding', 'chunked')

    session.connection.exec(`tar czf - -C "${parentDir}" "${dirName}"`, (err, stream) => {
      if (err) {
        return next(err)
      }
      stream.pipe(res)
      stream.stderr.on('data', () => { /* ignore tar warnings */ })
      stream.on('close', () => { if (!res.writableEnded) res.end() })
    })
  } catch (err) {
    next(err)
  }
})

/**
 * 检查文件是否存在
 * GET /api/sessions/:id/files/exists?path=/home/user/file.txt
 */
router.get('/:id/files/exists', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string
    const path = req.query.path as string

    if (!path) {
      const error: ApiError = {
        code: 'INVALID_REQUEST',
        message: '缺少 path 参数',
      }
      return res.status(400).json(error)
    }

    const exists = await sftpManager.exists(id, path)
    res.json({ path, exists })
  } catch (err) {
    next(err)
  }
})

export default router
