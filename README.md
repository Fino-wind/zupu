# 华夏族谱录 (ChronoGenealogy)

一个极具古风感的家族族谱管理系统，融合了中国传统宗法文化与现代 Web 技术。系统支持交互式数据可视化、AI 智能关系推演及生平传记生成。

## ✨ 主要功能

- **交互式族谱图**：基于 D3.js 的力导向图，支持拖拽、缩放，以古风卷轴形式呈现。
- **宗法关系推演**：利用 AI 智能分析任意两名家族成员之间的复杂亲戚称谓（如“堂叔”、“从堂妹”）。
- **AI 传记撰写**：自动根据成员信息生成仿古文或白话文的生平志传。
- **灵犀一问**：支持以自然语言向 AI 询问家族成员的历史背景。
- **宗主管理模式**：
  - 支持增删改查家族成员。
  - 提供“宗祠秘档”（回收站）功能。
  - 支持 JSON 格式的族谱数据导入与导出。
- **双重存储保障**：
  - **云端/本地数据库**：使用 SQLite 存储核心数据。
  - **离线容灾**：网络异常时自动切换至浏览器本地存储 (localStorage)，并在网络恢复后尝试同步，防止数据丢失。

## 🛠️ 技术栈

- **前端框架**: React 19, TypeScript
- **可视化**: D3.js
- **样式**: TailwindCSS
- **AI 支持**: Vercel AI SDK（`ai` + `@ai-sdk/google` + `@ai-sdk/openai-compatible`）
- **后端**: Node.js (Express) + SQLite
- **构建工具**: Vite

## 🚀 快速开始

### 前置要求

AI 相关功能（宗法关系推演 / AI 传记撰写 / 灵犀一问）需要一个大模型服务。
本项目通过 [Vercel AI SDK](https://github.com/vercel/ai) 接入，**换供应商是改配置、不是改代码**：
默认直连 Google Gemini，也可以指向任何 OpenAI 兼容端点——自建网关（new-api / one-api）、
本地模型（llama.cpp / Ollama）、OpenRouter、DeepSeek、Mistral 等都可以。
**没有密钥时，族谱的增删改查、可视化、导入导出全部可用，仅 AI 功能不可用。**

密钥通过项目根目录的 `.env` 文件提供：

```bash
cp .env.example .env
# 编辑 .env，填入 API_KEY=你的密钥
```

密钥申请：<https://aistudio.google.com/apikey>

`.env.example` 里还列出了全部可选配置项（数据库路径、跨域来源、自定义 AI 端点白名单）。

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

请确保当前目录下有一个 `data` 目录（用于持久化数据库）。如果是首次运行，可以先创建：

```bash
mkdir -p data
```

然后运行容器：

```bash
# 请将 your_api_key_here 替换为您的实际 Google Gemini API Key

docker run -d \
  --name my-genealogy \
  -p 8888:8888 \
  -e API_KEY="your_api_key_here" \
  -e DB_PATH="/app/data/genealogy.db" \
  -v $(pwd)/data:/app/data \
  chrono-genealogy
```

**参数详解：**

- `-d`: 后台运行。
- `-p 8888:8888`: 将容器的 8888 端口映射到宿主机的 8888 端口。您可以通过 `http://localhost:8888` 访问。
- `-e API_KEY="..."`: 注入 AI 功能所需的密钥。
- `-e DB_PATH=...`: 指定数据库文件路径（容器内）。
- `-v $(pwd)/data:/app/data`: **核心配置**。将宿主机的 `data` 目录映射到容器内部。这样，无论您如何更新或重启容器，数据都会保存在宿主机该目录中。

### 本机差异走 `.env`，不要改仓库文件

端口被占用、或需要国内 npm 源时，在项目根目录的 `.env` 里写：

```bash
HOST_PORT=8889                                  # 换宿主机端口
NPM_REGISTRY=https://registry.npmmirror.com     # 构建时用国内源（大陆网络快很多）
```

`docker-compose.yml` 与 `Dockerfile` 都从这里取值并带有默认值，
所以**同一份仓库代码可以直接跑在不同机器上**，本机特有的配置不会污染 git 历史。

### 使用 Docker Compose（推荐）

项目已提供 `docker-compose.yml`，可一键启动：

```bash
# 写入 API_KEY 后启动
API_KEY=your_api_key_here docker compose up -d --build
```

数据将保存到本地 `./data` 目录。

### 第四步：验证与访问

访问 `http://localhost:8888`。

如果您看到“开宗立派”界面，说明部署成功。
您可以尝试创建一个始祖，然后重启容器 `docker restart my-genealogy`。如果重启后数据依然存在，说明数据持久化配置正确。

## 🌱 第一次打开是空的？

系统不预置任何数据——新部署打开时是一片空白的「开宗立派」界面，这是刻意的：
预置的假祖先比空白更让人困惑。

想先看看效果，仓库根目录提供了 `seed.example.json`（7 人、三代，含配偶 / 未婚 /
已归档四种情形）。点界面上的**「载入古籍」**导入它即可。
熟悉之后清空重来，或直接照着它的字段结构准备自己的数据。

⚠️ 导入会**覆盖**当前全部成员，请先用「导出族谱」备份。

## 🔐 安全须知（部署前务必阅读）

**本系统没有登录，也没有任何鉴权。** 凡是能访问到该服务的人，都能读取、修改、归档你的
全部族谱数据。这是刻意的取舍——它被设计成运行在家庭内网或本机的个人工具。

- ✅ 推荐：本机 / 家庭内网 / 局域网内访问
- ⚠️ 如果要放到公网，请自行在前面加一层保护（反向代理的 Basic Auth、Cloudflare Access、
  Tailscale 等），**不要直接把端口暴露到公网**
- 🔑 自定义 AI 端点默认被拒绝：服务端会带着你的 `API_KEY` 去请求该地址，
  若不加限制，任何人填一个自己控制的地址就能拿走密钥。确需使用第三方兼容端点时，
  在 `.env` 的 `AI_ALLOWED_BASE_URLS` 中显式登记

## 💾 关于备份

族谱是不可再生的数据——里面很多内容来自长辈口述，说出来的人不会永远都在。
而它的全部内容就是一个 SQLite 文件（`data/genealogy.db`，通常只有几十 KB）。

- 系统内置「导出族谱」按钮，可随时导出 JSON
- 定期把 `data/` 目录复制到另一台设备或云盘
- 服务器部署建议加一条定时任务，例如：

```bash
# 每天备份一次，热备份必须用 sqlite3 .backup，直接 cp 可能拿到写入中途的损坏文件
sqlite3 data/genealogy.db ".backup './backups/genealogy-$(date +%F).db'"
```

## 📜 许可证

MIT（见 [LICENSE](./LICENSE)）
