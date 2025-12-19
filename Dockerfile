# --- 构建前端 ---
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci || npm install

COPY . .
RUN npm run build

# --- 运行：Node + Nginx 同容器 ---
FROM node:20-alpine
WORKDIR /app

# 安装 nginx
RUN apk add --no-cache nginx

# 只安装生产依赖（给后端用）
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# 后端文件
COPY server.js ./
COPY start.sh ./

# SQLite 数据文件：建议用 volume 挂载到 /app/data
RUN mkdir -p /app/data

# 前端产物 + nginx 配置
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8888

# 关键：API_KEY 从环境变量传入
ENV NODE_ENV=production

CMD ["./start.sh"]
