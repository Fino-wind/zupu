# npm 源可选。中国大陆构建时可传 --build-arg NPM_REGISTRY=https://registry.npmmirror.com
# 默认走官方源，避免把某一地区的镜像地址固化进镜像。
ARG NPM_REGISTRY=https://registry.npmjs.org

# --- 构建前端 ---
FROM node:20-alpine AS builder
ARG NPM_REGISTRY
ENV NPM_CONFIG_REGISTRY=$NPM_REGISTRY
WORKDIR /app

# 用 lock 文件安装：CI 的 check job 跑的是 npm ci，这里也用 ci，
# 两边解析出同一棵依赖树，避免"CI 绿了但镜像里是另一组版本"
COPY package.json package-lock.json ./
RUN npm ci

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
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

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

# 一个 CMD 同时启动后端和 nginx，但谁当 PID 1 是有讲究的：
#
#   nginx 后台  +  exec node  →  node 是 PID 1
#
# ⚠️ 2026-09-02 之前是反过来的（nginx 当 PID 1、node 在后台），代价有两个：
#   ① node 崩了容器不退出 → restart 策略只看 PID 1，永远不会拉起它。
#      从外面看网页 200、容器 Up、健康，只有 /api /mcp 静默 502，直到有人手动重启。
#   ② docker stop 的 SIGTERM 发给 PID 1 = nginx，server.js 里的 SIGTERM 处理器
#      根本收不到 → sqlite 从不优雅关闭。
#
# 换成 exec node 之后：node 崩 → 容器退出 → restart: unless-stopped 自动拉起；
# 停容器时 node 直接收到 SIGTERM，走 db.close()。
# 代价是 nginx 挂了容器不退出 —— 但那是"网页整个打不开"的显性故障，
# 而 node 挂是隐性的，所以让隐性的那个当 PID 1 更划算。
CMD ["sh", "-c", "nginx -g 'daemon off;' & exec node server.js"]
