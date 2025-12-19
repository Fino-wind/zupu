# --- 构建前端 ---
FROM node:20-alpine AS builder
WORKDIR /app

# 仅复制 package.json（你不提交 lock 文件）
COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

# --- 运行：Node + Nginx 同容器 ---
FROM node:20-alpine
WORKDIR /app

# 安装 nginx
RUN apk add --no-cache nginx

# 仅安装生产依赖（后端用）
COPY package.json ./
RUN npm install --omit=dev

# 后端文件 + 启动脚本
COPY server.js ./
COPY start.sh ./

# 确保脚本可执行（避免权限坑）
RUN chmod +x /app/start.sh

# SQLite 数据目录（建议 volume 挂载到 /app/data）
RUN mkdir -p /app/data

# 前端产物 + nginx 配置
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8888
ENV NODE_ENV=production

CMD ["sh", "/app/start.sh"]
