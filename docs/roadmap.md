# zupu roadmap — 待办 / bug / 摩擦点（⛔ 不进 CLAUDE.md）

## ⏳ 待 debrief 清单（2026-09-02 14:14 落盘，上下文 15% 时写的；做完一条删一条）

- [x] `docs/code-map.md` —— 派子 agent 跑 code-map skill（server.js / mcp.js / FamilyGraph / 测试 / Dockerfile / nginx 全动过）
- [x] `docs/incident-log.md` —— PM-2026-09-01-nginx-confd（镜像能构建容器起不来）· PM-2026-09-02-dockerfile-copy-mcp（同形态第二次，CI 因此加探活）· PM-2026-09-02-git-clone-truncated（iCloud 驱逐）
- [x] CLAUDE.md（现在只有 272 字节"用中文"）→ 加文档路由：code-map / roadmap / incident-log / README 的 MCP 段
- [x] 本文件下面的待办逐条核实（2026-09-02 20:3x 全部属实；另发现 roadmap 漏记的加重项：nginx 是 PID 1 导致 node 崩了没人拉起，已一并修）

## 🔴 P0

（空）

## ✅ 2026-09-02 晚已修（保留一轮供对照，下次 debrief 删）

- **[x] MCP 共享 `McpServer` 单例 → 并发打死 Node**。改成 `app.post` 回调内每请求 `createZupuMcpServer(db)`；配套加 `next(err)`、`server.js` 错误中间件（4 参）、`unhandledRejection`（记录不退出）/ `uncaughtException`（记录后退出，让容器拉起）。
  🧪 **对照实验做过**：旧代码 16 并发 `tools/call` → 第 1 个 200、其余 15 个 ECONNRESET、进程死于 `Already connected to a transport`；新代码 16 并发全 200，加压 64 并发仍全 200、零错误日志。
  ⚠️ **过程中发现一个更坏的东西并已修掉**：第一版守卫用 8 个 curl 并发打 `initialize`，**连有 bug 的旧代码都能全过**（fork 时间差让它们实际串行）。假守卫比没守卫更坏。现在守卫是 `tests/mcp-burst.mjs`（单进程 `Promise.all` + `tools/call`），CI docker job 调用。

- **[x] node 崩了没有任何东西拉起它**（roadmap 原先漏记的加重项，是它让上一条从"崩一下"变成"静默死到有人手动重启"）。`CMD` 改成 `nginx -g 'daemon off;' & exec node server.js` —— node 成 PID 1，崩了容器退出、`restart: unless-stopped` 自愈；顺带修好 `docker stop` 时 SIGTERM 收不到、sqlite 从不优雅关闭的问题。**不变量 ⑯ 因此反转，code-map 已同步。**

- **[x] `app.listen` 不等 `dbReady`**（不变量 ⑫）→ 改为 `dbReady.then(...)`，失败则 exit(1)。

- **[x] `.env` 的 `AI_DEFAULT_BASE_URL` / `AI_DEFAULT_MODEL` 在 compose 下不生效** → compose `environment:` 现转发 6 个变量（含 `AI_ALLOWED_BASE_URLS` / `ALLOWED_ORIGINS`），全部带 `:-` 默认空值。

- **[x] 无 `.dockerignore`** → 已建。最要紧的两条：`node_modules`（宿主机编译的 sqlite3 原生模块，进镜像也用不了）、`data/*.db`（族谱本体，会被烤进镜像层）。

- **[x] `README.md` 示例 Dockerfile 与真实严重漂移** → **删掉那份副本**，改成指向仓库里唯一的 `Dockerfile` + 说明它做了什么。同一份 Dockerfile 写两处必然腐烂，而且已经烂出过一次事故（照抄 `COPY server.js` 漏 mcp.js）。`docker run` 段补了 AI 环境变量说明。

- **[x] `server.js` 无错误中间件**（CORS 拒绝走默认 500 HTML）→ 现回 403 JSON。
- **[x] Dockerfile `npm install` vs CI `npm ci` 两套解析** → 两阶段都改 `npm ci`。
- **[x] `vite.config.ts` 没反代 `/mcp`** → 已加，dev 与 Docker 下路径行为一致。

## 🟡 P1


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
