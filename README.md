# 华夏族谱录 (ChronoGenealogy)

一个极具古风感的家族族谱管理系统，融合了中国传统宗法文化与现代 Web 技术。系统支持交互式数据可视化、AI 智能关系推演及生平传记生成。

## ✨ 主要功能

*   **交互式族谱图**：基于 D3.js 的力导向图，支持拖拽、缩放，以古风卷轴形式呈现。
*   **宗法关系推演**：利用 AI 智能分析任意两名家族成员之间的复杂亲戚称谓（如“堂叔”、“从堂妹”）。
*   **AI 传记撰写**：自动根据成员信息生成仿古文或白话文的生平志传。
*   **灵犀一问**：支持以自然语言向 AI 询问家族成员的历史背景。
*   **宗主管理模式**：
    *   支持增删改查家族成员。
    *   提供“宗祠秘档”（回收站）功能。
    *   支持 JSON 格式的族谱数据导入与导出。
*   **双重存储保障**：
    *   **云端/本地数据库**：使用 SQLite 存储核心数据。
    *   **离线容灾**：网络异常时自动切换至浏览器本地存储 (localStorage)，并在网络恢复后尝试同步，防止数据丢失。

## 🛠️ 技术栈

*   **前端框架**: React 19, TypeScript
*   **可视化**: D3.js
*   **样式**: TailwindCSS
*   **AI 支持**: Google Gemini API (@google/genai)
*   **后端**: Node.js (Express) + SQLite
*   **构建工具**: Vite

## 🚀 快速开始

### 前置要求

本项目依赖 Google Gemini API 进行智能分析。请确保您拥有有效的 `API_KEY`。

### 1. 开发环境运行 (端口 5021)

```bash
# 安装依赖
npm install

# 启动开发服务器 (同时启动后端 API 和前端)
npm run dev
```

启动后访问: `http://localhost:5021`

---

## 🐳 Docker 部署指南 (详细教学)

为了确保您能在生产环境中顺利部署本系统，我们推荐使用 **Node.js + Nginx** 的混合部署方案。此方案将后端 API 与前端静态资源打包在同一个容器中，通过 Nginx 进行反向代理，既保证了性能又简化了配置。

### 第一步：准备 Dockerfile

在项目根目录下创建一个名为 `Dockerfile` 的文件（如果没有），并将以下内容复制进去：

```dockerfile
# --- 构建阶段 ---
FROM node:20-alpine as builder
WORKDIR /app
# 复制依赖配置
COPY package*.json ./
RUN npm install
# 复制源码
COPY . .
# 构建前端 (生成 dist 目录)
RUN npm run build

# --- 运行阶段 ---
FROM node:18-alpine
WORKDIR /app

# 安装 Nginx
RUN apk add --no-cache nginx

# 准备后端环境
COPY package*.json ./
RUN npm install --production
COPY server.js ./
# 初始化空的数据库文件(如果不存在)以避免启动报错
RUN touch genealogy.db

# 从构建阶段复制前端产物到 Nginx 目录
COPY --from=builder /app/dist /usr/share/nginx/html

# 配置 Nginx: 静态文件走 Nginx，/api 请求转发给 Node 后端
RUN echo 'server { \
    listen 80; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html index.htm; \
        try_files $uri $uri/ /index.html; \
    } \
    location /api { \
        proxy_pass http://127.0.0.1:3001; \
        proxy_http_version 1.1; \
        proxy_set_header Upgrade $http_upgrade; \
        proxy_set_header Connection "upgrade"; \
    } \
}' > /etc/nginx/http.d/default.conf

# 暴露 80 端口
EXPOSE 80

# 启动脚本: 并行启动 Nginx 和 Node 后端
CMD nginx && node server.js
```

### 第二步：构建镜像

在项目根目录下执行以下命令构建 Docker 镜像。构建过程包含前端编译，可能需要 1-2 分钟。

```bash
docker build -t chrono-genealogy .
```

### 第三步：运行容器 (关键步骤)

运行容器时，我们需要特别注意 **数据持久化**。如果不挂载卷 (Volume)，重启容器后您的族谱数据将会丢失！

请确保当前目录下有一个 `genealogy.db` 文件。如果是首次运行，可以先创建一个空文件：
```bash
touch genealogy.db
```

然后运行容器：

```bash
# 请将 your_api_key_here 替换为您的实际 Google Gemini API Key

docker run -d \
  --name my-genealogy \
  -p 8888:80 \
  -e API_KEY="your_api_key_here" \
  -v $(pwd)/genealogy.db:/app/genealogy.db \
  chrono-genealogy
```

**参数详解：**
*   `-d`: 后台运行。
*   `-p 8888:80`: 将容器的 80 端口映射到宿主机的 8888 端口。您可以通过 `http://localhost:8888` 访问。
*   `-e API_KEY="..."`: 注入 AI 功能所需的密钥。
*   `-v $(pwd)/genealogy.db:/app/genealogy.db`: **核心配置**。将宿主机的 `genealogy.db` 文件映射到容器内部。这样，无论您如何更新或重启容器，数据都会保存在您宿主机的这个文件中。

### 第四步：验证与访问

访问 `http://localhost:8888`。

如果您看到“开宗立派”界面，说明部署成功。
您可以尝试创建一个始祖，然后重启容器 `docker restart my-genealogy`。如果重启后数据依然存在，说明数据持久化配置正确。

## 📜 许可证

MIT
