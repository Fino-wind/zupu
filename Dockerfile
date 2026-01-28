# --- 构建前端 ---
FROM node:20-alpine AS builder
WORKDIR /app

# 不使用 lock 文件，直接安装
COPY package.json ./
RUN npm install

# 复制全部源码并构建前端
COPY . .
RUN npm run build

# --- 运行阶段：Node + Nginx 同容器 ---
FROM node:20-alpine
WORKDIR /app

# 安装 nginx
RUN apk add --no-cache nginx

# 仅安装生产依赖（后端用）
COPY package.json ./
RUN npm install --omit=dev

# 后端代码
COPY server.js ./

# SQLite 数据目录（挂载 volume）
RUN mkdir -p /app/data

# 前端构建产物 + nginx 配置
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 对外端口
EXPOSE 8888
ENV NODE_ENV=production

# 关键：一个 CMD 同时启动后端和 nginx
# - node server.js 在后台
# - nginx 以前台方式运行，成为 PID 1
CMD ["sh", "-lc", "node server.js & nginx -g 'daemon off;'"]
