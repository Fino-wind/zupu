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

## ⚠️ 先说一句：这个项目不能部署到 Vercel / Netlify 这类纯静态托管

它**必须有一个常驻的 Node 进程**：族谱存在 SQLite 里，`/api` 与 `/mcp` 都由 `server.js` 提供。
放到纯静态托管上，你会得到一个能打开、能点、看着一切正常的页面 ——
但 `/api` 和 `/mcp` 全是 404，所有数据只活在**你当前这个浏览器的 localStorage** 里：
换台设备就没了，清一次网站数据就没了，而且没有任何提示。

所以仓库里那份 `vercel.json` 写的是：

```json
{ "ignoreCommand": "exit 0" }
```

意思是「**永远跳过构建**」（Vercel 的约定：这个命令 exit 0 = 忽略本次构建，exit 1 = 正常构建）。
本仓库连着一个历史遗留的 Vercel 项目，每次 push 都会白白重建一个没有后端的空壳，
所以直接把它关掉了。**你 fork 之后如果确实想在 Vercel 上构建，删掉这个文件即可。**

正确的部署方式是下面这套 Docker（Node + Nginx 同容器），或者任何能跑常驻 Node 进程的地方。

## 🐳 Docker 部署指南 (详细教学)

为了确保您能在生产环境中顺利部署本系统，我们推荐使用 **Node.js + Nginx** 的混合部署方案。此方案将后端 API 与前端静态资源打包在同一个容器中，通过 Nginx 进行反向代理，既保证了性能又简化了配置。

### 第一步：确认 Dockerfile

**不需要自己写 —— 仓库根目录已经有一份能跑的 `Dockerfile`，直接用它。**

> 📌 这里刻意不再贴一份「示例 Dockerfile」。
> 早先版本贴过，结果它和真实那份逐渐对不上：示例里写的是 `COPY server.js ./`，
> 而后端其实是 `server.js` + `mcp.js` 两个文件 —— 照着示例抄，
> **镜像能构建成功、容器也能启动（nginx 起来了），但 `/api` 和 `/mcp` 全是 502**。
> 一份会过时的副本比没有更糟，所以现在只留仓库里那一份。

它做的事，简单说：

| 阶段 | 干什么 |
|---|---|
| builder | `node:20-alpine` → `npm ci` → `npm run build` 出前端静态文件 |
| runtime | `node:20-alpine` + nginx → 只装生产依赖 → 复制 `server.js`、`mcp.js` 与前端产物 |
| 运行 | nginx 在 8888 收所有请求：静态文件自己发，`/api` 与 `/mcp` 反代给 3001 的 Node |

两个值得知道的细节：

- **后端源码是逐个文件复制的**（`COPY server.js mcp.js ./`）。以后新增后端文件，
  必须在那一行登记，否则就是上面说的「构建成功但 502」。CI 里有一步真的启动容器探活，专门挡这个。
- **Node 是容器的 1 号进程，nginx 在后台**。这样 Node 崩了容器会整个退出，
  Docker 的 `restart` 策略才拉得起来；反过来的话 Node 死了容器还是 Up，
  网页照样打开，只有 API 静默失败，从外面完全看不出来。

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

**如果你用的不是 Google Gemini**（比如指向自建的 new-api / llama.cpp / 任意 OpenAI 兼容网关），再加两个变量：

```bash
  -e AI_DEFAULT_BASE_URL="http://192.168.1.10:3000/v1" \
  -e AI_DEFAULT_MODEL="你的模型名" \
```

⚠️ **容器只认显式传进去的环境变量**。把它们写进 `.env` 是不够的 —— `.env` 不进镜像，
用 `docker run` 就得 `-e`，用 compose 就得列在 `environment:` 里（仓库那份已经列好了）。
这个坑很难查，因为 `cat .env` 看着一切正常，但容器里读到的是空字符串。
完整变量清单见 `.env.example`。

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

## 🤖 MCP：让任何 AI agent 读写这份族谱

服务启动后，`/mcp` 就是一个 [MCP](https://modelcontextprotocol.io) 端点（Streamable HTTP，无状态）。
**不需要额外安装任何东西** —— 在你的 AI 工具里加一个 URL 即可：

```bash
# Claude Code
claude mcp add --transport http zupu http://localhost:8888/mcp

# 其它支持 MCP 的客户端（Claude Desktop / Cursor / hermes …）
# 传输选 Streamable HTTP，地址填 http://<主机>:<端口>/mcp
```

之后你可以直接对 AI 说「把爷爷口述的这段补进族谱」「算一下我和堂叔是什么关系」「还有谁的资料没填齐」。

**10 个工具**，7 读 3 写：

| 工具 | 做什么 |
|---|---|
| `list_members` / `get_member` / `search_members` | 列表、单人完整记录（含志传）、检索 |
| `get_lineage_tree` | 整部世系树，逐代展开 |
| `get_ancestors` | 某人的直系祖先链 |
| `get_kinship` | 推算两人关系：直系尊长 / 直系卑亲 / 旁系 / 无交集 |
| `list_pending` | 谁的姓名 / 生年 / 志传还没考证 —— 安排口述采访用 |
| `upsert_member` | 新增或**合并**更新（只改你传的字段，绝不清空已有志传）|
| `archive_member` / `restore_member` | 归档到宗祠秘档 / 还原。**没有不可逆的删除** |

每个工具都带 `title` 与 `readOnlyHint` / `destructiveHint` 标注，且返回结构化数据（`structuredContent`），
符合 [Claude connector 审核标准](https://claude.com/docs/connectors/building/review-criteria)。
只有 `archive_member` 标为 destructive —— 也就是说，Claude 只会在归档时向你确认，其余操作直接执行。

> **协议版本**：2025-11-25（当前 SDK 所支持的最新版）。2026-07-28 规范已发布但尚无 SDK 与客户端实现；
> 本实现已按其原则（无状态、不用 Roots/Sampling/Logging、工具顺序确定）编写，届时迁移只需换传输层。

⚠️ MCP 端点与 REST API 一样**无鉴权** —— 见下方安全须知。

## 🌱 第一次打开是空的？

系统不预置任何数据——新部署打开时是一片空白的「开宗立派」界面，这是刻意的：
预置的假祖先比空白更让人困惑。

想先看看效果，仓库根目录提供了 `seed.example.json`（7 人、三代，含配偶 / 未婚 /
已归档四种情形）。点界面上的**「载入古籍」**导入它即可。
熟悉之后清空重来，或直接照着它的字段结构准备自己的数据。

⚠️ 导入会**覆盖**当前全部成员，请先用「导出族谱」备份。

## 🔑 两种用法，按你的部署形态选

**① 部署者配一次，所有人共用**（家庭内网的常见做法）
在服务端 `.env` 填 `API_KEY`，用的人什么都不用管，打开就能用 AI 功能。

**② 每人用自己的密钥**
界面「AI 模型配置」里填自己的 API 密钥即可，**优先于服务端配置**。
密钥存在你自己浏览器的 localStorage，只会发给这个项目自己的后端，不经过任何第三方。

两者可以并存：填了用自己的，没填用服务端的。

> **为什么密钥不直接在浏览器里调模型？**
> 因为不是所有厂商都允许跨域直连——Google Gemini 与 OpenAI 允许，
> **Anthropic 不允许**。经由自己的后端转发，才能对所有供应商一视同仁。
> 在自托管场景下这不增加暴露面：那台后端本来就是你自己的机器。

> **无论密钥属于谁，服务端都不会去请求 link-local 地址**
> （`169.254.0.0/16`、`fe80::/10`、`metadata.google.internal`）。
> 云厂商的实例元数据就挂在 `169.254.169.254`，一次请求即可换到该主机的云凭据。
> 私有网段（`192.168.*` 等）与 `localhost` 则**故意放行**——指向自己内网的
> 网关或本机模型服务，正是本项目的典型用法。

> **自带密钥时，端点白名单不生效**，这是刻意的。
> 白名单存在的理由是"别让人拿服务端的密钥去打任意地址"；
> 当密钥是你自己带的，用自己的钥匙开自己想开的门，不该由服务端裁决。

## 🔐 安全须知（部署前务必阅读）

**本系统没有登录，也没有任何鉴权。** 凡是能访问到该服务的人，都能读取、修改、归档你的
全部族谱数据。这是刻意的取舍——它被设计成运行在家庭内网或本机的个人工具。

- ✅ 推荐：本机 / 家庭内网 / 局域网内访问
- ⚠️ 如果要放到公网，请自行在前面加一层保护（反向代理的 Basic Auth、Cloudflare Access、
  Tailscale 等），**不要直接把端口暴露到公网**
- 🔑 **使用服务端密钥时**，自定义 AI 端点默认被拒绝：服务端会带着你的 `API_KEY`
  去请求该地址，若不加限制，任何人填一个自己控制的地址就能拿走密钥。
  确需让所有人共用服务端密钥访问某个端点时，在 `.env` 的 `AI_ALLOWED_BASE_URLS` 中登记。
  （用户自带密钥时不受此限——那时花的是他自己的额度）

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
