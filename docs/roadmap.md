# zupu roadmap — 待办 / bug / 摩擦点（⛔ 不进 CLAUDE.md）

## ⏳ 待 debrief 清单（2026-09-02 14:14 落盘，上下文 15% 时写的；做完一条删一条）

- [x] `docs/code-map.md` —— 派子 agent 跑 code-map skill（server.js / mcp.js / FamilyGraph / 测试 / Dockerfile / nginx 全动过）
- [x] `docs/incident-log.md` —— PM-2026-09-01-nginx-confd（镜像能构建容器起不来）· PM-2026-09-02-dockerfile-copy-mcp（同形态第二次，CI 因此加探活）· PM-2026-09-02-git-clone-truncated（iCloud 驱逐）
- [x] CLAUDE.md（现在只有 272 字节"用中文"）→ 加文档路由：code-map / roadmap / incident-log / README 的 MCP 段
- [ ] 本文件下面的待办逐条核实

## 🔴 P0

- **`mcp.js:527-534` 共享 `McpServer` 单例 → 并发工具调用把 Node 打死**（code-map 子 agent 2026-09-02 14:2x 实测：8 个并发 `list_members` 打 fino:8889，Node 退出、nginx 仍 Up、`/api` `/mcp` 全 502，已 `docker restart` 恢复）。SDK `protocol.js` 硬检查 `Already connected to a transport`，第二个 `server.connect` 抛错，Express 4 不接 async 错 → unhandledRejection → 进程死。**任何 agent 并行发工具就会中。修法**：`mountZupuMcp` 里每请求 `createZupuMcpServer(db)`（官方无状态示例写法）+ `process.on('unhandledRejection')` + Express 错误中间件兜底。详 code-map §14 ⑬。

- **fino 实例 AI 功能仍死**：`fino:~/projects/zupu/.env` 的 `API_KEY=` 空。解法不是申请 Gemini key —— fino:3000 的 new-api 上有两个启用中的 Gemini 渠道，签个令牌填 `API_KEY` + `AI_DEFAULT_BASE_URL=http://192.168.8.111:3000/v1` + `AI_DEFAULT_MODEL=gemini-3.5-flash`（默认模型名 `gemini-3-flash-preview` 在 new-api 上不存在）。**或者**在界面「置换乾坤」里填（前端密钥优先于 .env，2026-09-02 方案 B）。链路 09-02 已实测通（new-api 回了 Invalid token）。

## 🟡 P1

- **`.env` 里的 `AI_DEFAULT_BASE_URL` / `AI_DEFAULT_MODEL` 在 docker compose 下不生效** —— `docker-compose.yml` 只转发 `API_KEY` / `DB_PATH`。上面 P0 的填法必须同步加进 compose `environment:`。
- **无 `.dockerignore`**：`COPY . .` 把 node_modules / `data/genealogy.db`（族谱本体）/ `.env` / `.git` 全送进构建上下文。
- **`README.md:71-121` 示例 Dockerfile 与真实的严重漂移**（node18 / 端口 80 / `COPY server.js` 没 mcp.js）—— 照它抄会重演 PM-2026-09-02。
- `server.js` 无错误中间件（CORS 拒绝走默认 500 HTML）；`app.listen` 不等 `dbReady`；Dockerfile `npm install` vs CI `npm ci` 两套解析。
- `vite.config.ts` 没反代 `/mcp`（dev 下 MCP 只能直连 3001）。

- **Vercel 站上老大说"有记录"，但记录不在 Mac 任何浏览器里**（09-02 扫了日常 Chrome / 专用 Chrome / Safari / Edge 的 localStorage 与 leveldb，零命中）。Vercel 部署 14 次全是纯静态（12s-2m），从没跑过 server.js，数据只能在某浏览器 `localStorage['familyMembers_backup']`。大概率 iPhone Safari。**老大自查路径**：手机开 `zupu-nine.vercel.app` → 宗主认证 `miling` → 📤导出族谱 → JSON 发我 → 对比 fino 那 5 条合并。⚠️ 别清手机 Safari 网站数据。
- **Vercel 连着 GitHub 自动部署**：每次 push 都重建（09-02 一天 10 次）。它没有后端，`/api` `/mcp` 都 404 —— 那个站现在只是个"空壳演示"。要么在 Vercel 关掉自动部署，要么接受它一直是空的。
- **默认口令 `miling` 明晃晃写在设置页**（「当前密令（默认为 miling）」）且是纯前端比对。不是安全边界（README 已写明无鉴权），但界面上就能改，建议改掉。
- `zupu_cli.py delete` 现在是归档不是抹除（后端 09-01 改软删除）—— skill 文档已注，CLI 本身没改名。

## 🟢 P2（code-map 扫出，详见 code-map 对应段）

- REST `POST /api/members` 是整条覆盖（缺 `biography` = 清空志传），MCP `upsert_member` 是合并 —— 两套语义并存；`zupu_cli.py` 走 REST，要确认发全量。
- AI 三函数吞错返回「笔墨干涸」占位文案，`App.tsx:815` 会把它当传记存进志传。
- `handleRestore` 不级联还原后代，而归档是级联的。导入不删库里多余记录（README「覆盖」只对当前会话成立）。用 `seed.example.json` 会把姓氏自动设成「示」。
- 三套互不引用的亲属推算逻辑并存（familyGraphUtils / mcp.js / geminiService）。`start.sh` `metadata.json` 是 AI Studio 死残留。后端 `.js` 零 lint 覆盖。全环数据时画布静默空白。

- 卡片名字仍是「袁公（高祖父·名讳待补）」这种 12 字占位。09-02 已让长名一列到底、按字数分档，但**真解是把名讳考证出来**：`list_pending` 显示 5 人全部待考（4 缺名 / 4 缺生年，只有爷爷有生年；5 人都有传记）。
- `INITIAL_DATA = []`：新部署空白。已用 `seed.example.json` + README 引导替代，不预置。
- MCP 协议 2025-11-25（SDK 1.30.0 上限）。**2026-07-28 规范已发**（无状态化 / 删 initialize / MRTR / 废弃 Roots·Sampling·Logging），SDK v2 在 main 分支（`packages/{server,server-legacy,client,core}`），npm 未发。`mcp.js` 已按新原则写；**SDK 发 v2 时迁移 = 换传输层**。复查节点：看 `npm view @modelcontextprotocol/sdk dist-tags`。
- dengcao（issue #2）9-01 已回复；README 现在写清了部署/安全/备份/MCP。他若再来，看 issue。
