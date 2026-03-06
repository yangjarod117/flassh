# 多阶段构建 - 前端
FROM node:24-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# 多阶段构建 - 后端
FROM node:24-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

# 生产镜像
FROM node:24-alpine AS production
WORKDIR /app

# 安装生产依赖
COPY backend/package*.json ./
RUN npm ci --only=production

# 复制构建产物
COPY --from=backend-builder /app/backend/dist ./dist
COPY --from=frontend-builder /app/frontend/dist ./public

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=4000

# 暴露端口
EXPOSE 4000

# 启动命令
CMD ["node", "dist/index.js"]
