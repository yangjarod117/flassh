# WebSSH Terminal

基于 Web 的 SSH 终端客户端，支持文件管理和多会话。

## 功能特性

- �️ Web置 终端 - 基于 xterm.js 的完整终端体验
- 📁 文件管理 - SFTP 文件浏览、上传、下载
- � 完多种认证 - 支持密码和私钥认证
- � 结响应式设计 - 适配桌面和移动设备
- 🔄 自动重连 - 断线自动重连机制
- 💾 会话保存 - 保存常用连接配置

## 快速部署

### Docker 部署（推荐）

```bash
docker run -d --name webssh -p 4000:4000 --restart unless-stopped yangjarod117/webssh:latest
```

或使用 Docker Compose：

```yaml
services:
  webssh:
    image: yangjarod117/webssh:latest
    container_name: webssh
    ports:
      - "4000:4000"
    restart: unless-stopped
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

## 技术栈

- 前端：React + TypeScript + Tailwind CSS + xterm.js
- 后端：Node.js + Express + ssh2
- 部署：Docker

## 使用说明

1. 打开浏览器访问 `http://your-server:4000`
2. 输入 SSH 连接信息（主机、端口、用户名）
3. 选择认证方式（密码或私钥）
4. 点击连接

## 许可证

MIT License © 2026
