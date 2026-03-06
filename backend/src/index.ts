import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import path from 'path'
import { fileURLToPath } from 'url'
import { createServer } from 'http'
import { WebSocketHandler } from './services/websocket-handler.js'
import { sshManager } from './services/ssh-manager.js'
import sessionsRouter from './routes/sessions.js'
import filesRouter from './routes/files.js'
import monitorRouter from './routes/monitor.js'
import credentialsRouter from './routes/credentials.js'
import accessRouter from './routes/access.js'
import favoritesRouter from './routes/favorites.js'
import { errorHandler, notFoundHandler } from './middleware/error-handler.js'

// ESM 兼容的 __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 4000

// Middleware
// 生产环境：前后端同源，不需要 CORS
// 开发环境：前端 3000，后端 4000，需要 CORS
if (process.env.NODE_ENV !== 'production') {
  app.use(cors({
    origin: true,
    credentials: true,
  }))
}

// cookie-parser 只在 access 路由使用
app.use('/api/access', cookieParser())

// JSON 解析
app.use(express.json())

// 生产环境提供前端静态文件
if (process.env.NODE_ENV === 'production') {
  const publicPath = path.join(__dirname, '..', 'public')
  app.use(express.static(publicPath))
}

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Routes
app.use('/api/access', accessRouter)
app.use('/api/sessions', sessionsRouter)
app.use('/api/sessions', filesRouter)
app.use('/api/sessions', monitorRouter)
app.use('/api/credentials', credentialsRouter)
app.use('/api/favorites', favoritesRouter)

// 生产环境 SPA 路由回退
if (process.env.NODE_ENV === 'production') {
  app.get('/{*path}', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'))
  })
}

// Error handling
app.use(notFoundHandler)
app.use(errorHandler)

// Create HTTP server
const server = createServer(app)

// Create WebSocket handler
const wsHandler = new WebSocketHandler(server)

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...')
  wsHandler.shutdown()
  sshManager.shutdown()
  server.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down...')
  wsHandler.shutdown()
  sshManager.shutdown()
  server.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})

// Start server
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})

export { app, server, wsHandler }
