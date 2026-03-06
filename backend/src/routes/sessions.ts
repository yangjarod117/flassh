import { Router, Request, Response, NextFunction } from 'express'
import { sshManager } from '../services/ssh-manager.js'
import { credentialStore } from '../services/credential-store.js'
import type { CreateSessionRequest, CreateSessionResponse, ApiError } from '../types/index.js'

const router = Router()

/**
 * 创建 SSH 会话
 * POST /api/sessions
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    let config: CreateSessionRequest = req.body

    // 如果请求使用保存的凭据
    if (req.body.useStoredCredentials && req.body.host && req.body.username) {
      // 查找匹配的保存凭据
      const connections = credentialStore.getConnections()
      const matchingConnection = connections.find(c => 
        c.host === req.body.host && 
        c.port === req.body.port && 
        c.username === req.body.username &&
        c.hasStoredCredentials
      )
      
      if (matchingConnection) {
        const storedCreds = credentialStore.get(matchingConnection.id)
        if (storedCreds) {
          config = {
            host: storedCreds.host,
            port: storedCreds.port,
            username: storedCreds.username,
            authType: storedCreds.authType,
            password: storedCreds.password,
            privateKey: storedCreds.privateKey,
            passphrase: storedCreds.passphrase,
          }
        }
      }
    }

    // 验证必填字段
    if (!config.host || !config.port || !config.username || !config.authType) {
      const error: ApiError = {
        code: 'INVALID_REQUEST',
        message: '缺少必填字段',
      }
      return res.status(400).json(error)
    }

    // 验证认证信息
    if (config.authType === 'password' && !config.password) {
      const error: ApiError = {
        code: 'INVALID_REQUEST',
        message: '密码认证需要提供密码',
      }
      return res.status(400).json(error)
    }

    if (config.authType === 'key' && !config.privateKey) {
      const error: ApiError = {
        code: 'INVALID_REQUEST',
        message: '密钥认证需要提供私钥',
      }
      return res.status(400).json(error)
    }

    const session = await sshManager.connect(config)

    const response: CreateSessionResponse = {
      sessionId: session.id,
      status: session.status,
    }

    res.status(201).json(response)
  } catch (err) {
    next(err)
  }
})

/**
 * 获取会话状态
 * GET /api/sessions/:id/status
 */
router.get('/:id/status', (req: Request, res: Response) => {
  const id = req.params.id as string
  const status = sshManager.getSessionStatus(id)

  if (!status) {
    const error: ApiError = {
      code: 'SESSION_NOT_FOUND',
      message: '会话不存在',
    }
    return res.status(404).json(error)
  }

  res.json({ sessionId: id, status })
})

/**
 * 关闭 SSH 会话
 * DELETE /api/sessions/:id
 */
router.delete('/:id', (req: Request, res: Response) => {
  const id = req.params.id as string
  const success = sshManager.disconnect(id)

  if (!success) {
    const error: ApiError = {
      code: 'SESSION_NOT_FOUND',
      message: '会话不存在或已关闭',
    }
    return res.status(404).json(error)
  }

  res.status(204).send()
})

/**
 * 断开 SSH 会话（用于 sendBeacon，支持 POST）
 * POST /api/sessions/:id/disconnect
 */
router.post('/:id/disconnect', (req: Request, res: Response) => {
  const id = req.params.id as string
  console.log(`[Sessions] Disconnect request for session ${id}`)
  
  const success = sshManager.disconnect(id)
  
  if (success) {
    console.log(`[Sessions] Session ${id} disconnected successfully`)
  } else {
    console.log(`[Sessions] Session ${id} not found or already disconnected`)
  }

  // 始终返回成功，因为 sendBeacon 不关心响应
  res.status(200).json({ success })
})

export default router
