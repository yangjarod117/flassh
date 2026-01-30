# WebSSH Terminal

> **⚠️ 声明：此项目为纯 AI 生成，本人不懂编程，也不会编程，纯属自娱自乐。**

基于 Web 的 SSH 终端客户端，支持文件管理、系统监控和多会话。

## 功能特性

- 🖥️ **Web 终端** - 基于 xterm.js 的完整终端体验
- 📁 **文件管理** - SFTP 文件浏览、上传、下载、编辑
- 📊 **系统监控** - 实时 CPU、内存、磁盘、网络流量监控
- 🔐 **多种认证** - 支持密码和私钥认证
- 🔑 **凭据存储** - AES-256 加密存储，支持一键连接
- 📱 **响应式设计** - 适配桌面和移动设备
- 🔄 **自动重连** - 断线自动重连机制
- 💾 **会话保存** - 保存常用连接配置
- 🎨 **主题切换** - 支持亮色/暗色主题
- 📋 **右键菜单** - 终端复制粘贴、文件管理操作

## 快速部署

### Docker 部署（推荐）

```bash
docker run -d \
  --name webssh \
  -p 4000:4000 \
  -v webssh-data:/app/data \
  --restart unless-stopped \
  yangjarod117/webssh:latest
```

或使用 Docker Compose：

```yaml
services:
  webssh:
    image: yangjarod117/webssh:latest
    container_name: webssh
    ports:
      - "4000:4000"
    volumes:
      - webssh-data:/app/data  # 持久化凭据存储
    environment:
      - TZ=Asia/Shanghai
      - CREDENTIAL_KEY=your-32-byte-hex-key  # 可选：自定义加密密钥
    restart: unless-stopped

volumes:
  webssh-data:
```

```bash
docker-compose up -d
```

访问 `http://your-server:4000`

### 从源码构建

```bash
# 克隆代码
git clone https://github.com/yangjarod117/webssh.git
cd webssh

# 安装依赖
cd backend && npm install && cd ..
cd frontend && npm install && cd ..

# 开发模式
cd backend && npm run dev    # 后端 :4000
cd frontend && npm run dev   # 前端 :3000

# 构建生产版本
cd frontend && npm run build
cd ../backend && npm run build
NODE_ENV=production node dist/index.js
```

### 构建 Docker 镜像

```bash
docker build -t yangjarod117/webssh:latest .
docker push yangjarod117/webssh:latest
```

## 功能说明

### 系统监控

连接服务器后，右下角会显示实时监控面板：
- CPU 使用率
- 内存占用（已用/总量）
- 磁盘使用（已用/总量）
- 网络流量（上传/下载速率）
- 系统负载和运行时间

### 凭据存储

保存连接时可选择"记住凭据"：
- 凭据使用 AES-256-GCM 加密存储在服务器
- 下次连接时可一键登录，无需重复输入密码/密钥
- 已保存凭据的连接会显示 🔑 图标

### 终端操作

- 选中文本后右键：复制
- 无选中内容时右键：粘贴
- 支持 Ctrl+C/V 快捷键

### 文件管理

- 支持文件/文件夹的创建、重命名、删除
- 支持文件上传和下载
- 支持在线编辑文本文件
- 右键菜单可在当前目录打开新终端

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| PORT | 服务端口 | 4000 |
| NODE_ENV | 运行环境 | development |
| CREDENTIAL_KEY | 凭据加密密钥（64位hex字符串） | 随机生成 |

### 生成加密密钥

```bash
# 使用 openssl 生成 64 位 hex 密钥
openssl rand -hex 32

# 或使用 Python
python3 -c "import secrets; print(secrets.token_hex(32))"

# 或使用 Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
| CREDENTIAL_STORE_PATH | 凭据存储路径 | ./data/credentials.json |

## 技术栈

- **前端**: React + TypeScript + Tailwind CSS + xterm.js + Framer Motion
- **后端**: Node.js + Express + ssh2 + WebSocket
- **部署**: Docker + Docker Compose

## 安全说明

- 密码和私钥不会存储在浏览器本地
- 凭据使用 AES-256-GCM 加密存储在服务器
- 建议在生产环境设置固定的 CREDENTIAL_KEY
- 建议配合 HTTPS 和反向代理使用

## 许可证

MIT License © 2026
