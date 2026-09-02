# npm 源可选。中国大陆构建时可传 --build-arg NPM_REGISTRY=https://registry.npmmirror.com
# 默认走官方源，避免把某一地区的镜像地址固化进镜像。
ARG NPM_REGISTRY=https://registry.npmjs.org

# --- 构建前端 ---
FROM node:20-alpine AS builder
ARG NPM_REGISTRY
ENV NPM_CONFIG_REGISTRY=$NPM_REGISTRY
WORKDIR /app

# 不使用 lock 文件，直接安装
COPY package.json ./
RUN npm install

# 复制全部源码并构建前端
COPY . .
RUN npm run build

# --- 运行阶段：Node + Nginx 同容器 ---
FROM node:20-alpine
ARG NPM_REGISTRY
ENV NPM_CONFIG_REGISTRY=$NPM_REGISTRY
WORKDIR /app

# 安装 nginx
RUN apk add --no-cache nginx

# 仅安装生产依赖（后端用）
COPY package.json ./
RUN npm install --omit=dev

# 后端代码
# ⚠️ 后端源码是逐文件复制的：新增后端文件必须在这里登记，否则镜像能构建、容器起不来
COPY server.js mcp.js ./

# SQLite 数据目录（挂载 volume）
RUN mkdir -p /app/data

# 前端构建产物 + nginx 配置
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/http.d/default.conf

# 对外端口
EXPOSE 8888
ENV NODE_ENV=production
ENV DB_PATH=/app/data/genealogy.db

# 关键：一个 CMD 同时启动后端和 nginx
# - node server.js 在后台
# - nginx 以前台方式运行，成为 PID 1
CMD ["sh", "-lc", "node server.js & nginx -g 'daemon off;'"]
