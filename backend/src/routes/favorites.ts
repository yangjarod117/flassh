import { Router } from 'express'
import fs from 'fs'
import path from 'path'

const router = Router()

interface FavoriteItem {
  path: string
  name: string
  type: 'file' | 'directory'
}

interface FavoritesData {
  directories: FavoriteItem[]
  files: FavoriteItem[]
}

// 存储路径
const FAVORITES_PATH = process.env.FAVORITES_STORE_PATH || path.join(process.cwd(), 'data', 'favorites.json')

// 内存缓存: serverKey -> FavoritesData
let favoritesMap: Map<string, FavoritesData> = new Map()

function loadAll(): void {
  try {
    if (fs.existsSync(FAVORITES_PATH)) {
      const raw = fs.readFileSync(FAVORITES_PATH, 'utf8')
      const entries = JSON.parse(raw) as Array<[string, FavoritesData]>
      favoritesMap = new Map(entries)
    }
  } catch (err) {
    console.error('Failed to load favorites:', err)
  }
}

function persistAll(): void {
  try {
    const dir = path.dirname(FAVORITES_PATH)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(FAVORITES_PATH, JSON.stringify(Array.from(favoritesMap.entries()), null, 2), 'utf8')
  } catch (err) {
    console.error('Failed to persist favorites:', err)
  }
}

// 启动时加载
loadAll()

// GET /api/favorites/:serverKey
router.get('/:serverKey', (req, res) => {
  const key = decodeURIComponent(req.params.serverKey)
  const data = favoritesMap.get(key) || { directories: [], files: [] }
  res.json(data)
})

// PUT /api/favorites/:serverKey
router.put('/:serverKey', (req, res) => {
  const key = decodeURIComponent(req.params.serverKey)
  const data = req.body as FavoritesData
  if (!data || !Array.isArray(data.directories) || !Array.isArray(data.files)) {
    res.status(400).json({ message: '无效的收藏数据' })
    return
  }
  favoritesMap.set(key, data)
  persistAll()
  res.json({ success: true })
})

// POST /api/favorites/:serverKey/add
router.post('/:serverKey/add', (req, res) => {
  const key = decodeURIComponent(req.params.serverKey)
  const item = req.body as FavoriteItem
  if (!item?.path || !item?.name || !item?.type) {
    res.status(400).json({ message: '无效的收藏项' })
    return
  }
  const data = favoritesMap.get(key) || { directories: [], files: [] }
  const list = item.type === 'directory' ? data.directories : data.files
  if (!list.some(f => f.path === item.path)) {
    list.push(item)
    favoritesMap.set(key, data)
    persistAll()
  }
  res.json({ success: true })
})

// POST /api/favorites/:serverKey/remove
router.post('/:serverKey/remove', (req, res) => {
  const key = decodeURIComponent(req.params.serverKey)
  const { path: itemPath, type } = req.body as { path: string; type: 'file' | 'directory' }
  if (!itemPath || !type) {
    res.status(400).json({ message: '无效的参数' })
    return
  }
  const data = favoritesMap.get(key)
  if (data) {
    if (type === 'directory') {
      data.directories = data.directories.filter(f => f.path !== itemPath)
    } else {
      data.files = data.files.filter(f => f.path !== itemPath)
    }
    favoritesMap.set(key, data)
    persistAll()
  }
  res.json({ success: true })
})

export default router
