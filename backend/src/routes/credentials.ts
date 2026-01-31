import { Router, Request, Response, NextFunction } from 'express'
import { credentialStore, SavedConnectionInfo } from '../services/credential-store.js'
import type { ApiError } from '../types/index.js'

const router = Router()

// ========== 连接列表 API ==========

/**
 * 获取所有保存的连接
 * GET /api/credentials/connections
 */
router.get('/connections', (_req: Request, res: Response) => {
  const connections = credentialStore.getConnections()
  res.json({ connections })
})

/**
 * 保存新连接
 * POST /api/credentials/connections
 */
router.post('/connections', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, name, host, port, username, authType, hasStoredCredentials } = req.body

    if (!id || !name || !host || !port || !username || !authType) {
      const error: ApiError = {
        code: 'INVALID_REQUEST',
        message: '缺少必填字段',
      }
      return res.status(400).json(error)
    }

    const connection: SavedConnectionInfo = {
      id,
      name,
      host,
      port,
      username,
      authType,
      hasStoredCredentials: hasStoredCredentials || false,
      createdAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
    }

    credentialStore.saveConnection(connection)
    res.status(201).json({ success: true, connection })
  } catch (err) {
    next(err)
  }
})

/**
 * 更新连接信息
 * PUT /api/credentials/connections/:id
 */
router.put('/connections/:id', (req: Request, res: Response) => {
  const { id } = req.params
  const updates = req.body

  const success = credentialStore.updateConnection(id, {
    ...updates,
    lastUsedAt: new Date().toISOString(),
  })

  if (!success) {
    const error: ApiError = {
      code: 'CONNECTION_NOT_FOUND',
      message: '连接不存在',
    }
    return res.status(404).json(error)
  }

  res.json({ success: true })
})

/**
 * 删除连接
 * DELETE /api/credentials/connections/:id
 */
router.delete('/connections/:id', (req: Request, res: Response) => {
  const { id } = req.params
  const success = credentialStore.deleteConnection(id)

  if (!success) {
    const error: ApiError = {
      code: 'CONNECTION_NOT_FOUND',
      message: '连接不存在',
    }
    return res.status(404).json(error)
  }

  res.status(204).send()
})

// ========== 凭据 API ==========

/**
 * 保存凭据
 * POST /api/credentials
 */
router.post('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, host, port, username, authType, password, privateKey, passphrase } = req.body

    if (!id || !host || !port || !username || !authType) {
      const error: ApiError = {
        code: 'INVALID_REQUEST',
        message: '缺少必填字段',
      }
      return res.status(400).json(error)
    }

    credentialStore.save(id, {
      host,
      port,
      username,
      authType,
      password,
      privateKey,
      passphrase,
    })

    res.status(201).json({ success: true, id })
  } catch (err) {
    next(err)
  }
})

/**
 * 获取凭据（用于快速连接）
 * GET /api/credentials/:id
 */
router.get('/:id', (req: Request, res: Response) => {
  const { id } = req.params
  const credential = credentialStore.get(id)

  if (!credential) {
    const error: ApiError = {
      code: 'CREDENTIAL_NOT_FOUND',
      message: '凭据不存在',
    }
    return res.status(404).json(error)
  }

  res.json(credential)
})

/**
 * 检查凭据是否存在
 * GET /api/credentials/:id/exists
 */
router.get('/:id/exists', (req: Request, res: Response) => {
  const { id } = req.params
  const exists = credentialStore.has(id)
  res.json({ exists })
})

/**
 * 删除凭据
 * DELETE /api/credentials/:id
 */
router.delete('/:id', (req: Request, res: Response) => {
  const { id } = req.params
  const success = credentialStore.delete(id)

  if (!success) {
    const error: ApiError = {
      code: 'CREDENTIAL_NOT_FOUND',
      message: '凭据不存在',
    }
    return res.status(404).json(error)
  }

  res.status(204).send()
})

/**
 * 列出所有已保存的凭据（不含敏感信息）
 * GET /api/credentials
 */
router.get('/', (_req: Request, res: Response) => {
  const list = credentialStore.list()
  res.json({ credentials: list })
})

export default router
