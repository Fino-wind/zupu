# zupu · incident-log（已结案事故 · 只增不改）

> 每条一个稳定 ID `PM-YYYY-MM-DD-slug`，别处引用用 ID。
> 记的是**过程与证据**，不是待办 —— 没修完的东西去 `docs/roadmap.md`；改架构的结论去 `docs/code-map.md`。
> 三条都发生在 2026-09-01 ~ 09-02 那 36 小时里，且**前两条是同一形状的病**：镜像能构建、容器 Up、首页 200，但后端根本没起来。

---

## PM-2026-09-01-nginx-confd

**症状**：clone 下来 `docker compose up`，容器 Up，但访问不到应用 / API 502。

**根因（两个独立 bug 叠在一起）**：
1. `Dockerfile` 把 `nginx.conf` COPY 到 `/etc/nginx/conf.d/`。alpine 的 nginx 主配置只在 `http{}` 里 `include http.d/*.conf`；`conf.d` 的 include 在顶层（`main` 上下文），放一个 `server{}` 块进去会被拒绝加载。容器里实测只存在 `http.d/` 目录。
2. `proxy_pass http://127.0.0.1:3001/;` 带尾斜杠 → nginx 把 location 前缀剥掉后拼接，`/api/members` 变成 `/members` → 后端 404。README 里那段示例 Dockerfile 写的 `proxy_pass http://127.0.0.1:3001;`（无尾斜杠）本来就是对的，仓库里的 `nginx.conf` 反而写错了。

**处理**：commit `1716507`（2026-09-01 22:04）—— 目标目录改 `http.d/`，`proxy_pass` 去尾斜杠。

**背景**：fino 上有人早就本地改好了没提交 —— 所以 fino 一直能跑、仓库一直是坏的，直到在另一台机器 clone 才暴露。

**教训**：
- 「某台机器上能跑」证明不了仓库能跑。**判据 = 干净 clone + `docker compose up`**，CI 那个 docker job 就是这个判据的自动化（09-02 又补了探活）。
- alpine nginx 与 debian nginx 的目录约定不同（`http.d` vs `conf.d`），基础镜像换了要重看。
- `proxy_pass` 尾斜杠是 nginx 经典坑：有尾斜杠 = 替换 location 前缀，无尾斜杠 = 原样透传。本项目要的是透传。

→ 固化为 code-map §14 ⑮。

---

## PM-2026-09-02-dockerfile-copy-mcp

**症状**：加完 `mcp.js`（commit `8568f87`）部署到 fino，首页 200，`/api` 与 `/mcp` 全部 502。

**根因**：`Dockerfile` 运行阶段是**逐文件** `COPY server.js ./`，新文件 `mcp.js` 没登记 → 容器里 `node server.js` 启动即 `ERR_MODULE_NOT_FOUND /app/mcp.js` → Node 退出。但 CMD 是 `node server.js & nginx -g 'daemon off;'`，**nginx 是 PID 1**，node 死了容器照样 Up、`restart: unless-stopped` 不触发，nginx 继续服务静态文件 —— 于是首页正常、反代目标不存在 → 502。

**当时 CI 是绿的**：docker job 只 `docker build`，从不 `docker run`。镜像构建完全成功（COPY 不存在的依赖不会在构建期报错，`import './mcp.js'` 要到运行时才解析）。

**处理**：commit `a54fa30`（2026-09-02 12:49）——
1. `COPY server.js mcp.js ./`，并在 Dockerfile 里写明「新增后端文件必须在这里登记」；
2. CI docker job 加「启动容器并探活」：`docker run` → 轮询 `/api/members` 最多 20s → 静态页 / REST / MCP `initialize` 三个入口都要 200 才算过，任一失败 `docker logs` 后退出非零。

**教训**：
- **「构建成功 ≠ 能起来」**。凡是运行期才解析的东西（ESM import、动态 require、缺失的 env），build 阶段永远绿。守卫必须真起一次。
- 这个容器的形态决定了故障特征：**首页 200 + 其余 502 = 后端进程死了，不是 nginx 的事**。先 `docker logs` 找 Node 退出栈。
- 逐文件 COPY 的代价是「每加一个文件要记得登记」；换成 `COPY *.js ./` 会把风险换成「误带进不该带的文件」。现在选的是前者 + 探活兜底。

→ 固化为 code-map §14 ⑤ ⑯。同日发现的另一条同形态故障（MCP 并发导致 Node 退出）见 code-map §14 ⑬，待办在 roadmap。

---

## PM-2026-09-02-git-clone-truncated

**症状**：Mac 上 2026-09-01 22:00 clone 的仓库，`git log` / `git status` / `git diff` 全部正常，连续 3 次 commit + push 成功；约 11 小时后一次需要读 `components/FamilyGraph.tsx` 旧 blob 的 commit 才炸出 `fatal: packfile … is far too short`。检查发现 packfile 对应的 `.idx` 只有 2976 字节，整个 pack 被截断。同时 `node_modules` 凭空消失。

**根因**：仓库当时在 `~/Desktop` 下，而 Desktop 由 iCloud 管理。磁盘用到 92% 时 iCloud「优化存储」把大文件驱逐成 dataless 占位（`node_modules` 整个消失、`.git/objects/pack/*.pack` 被截）。git 只在**真正需要读那个对象**时才会碰 pack —— 新 commit 只写新对象、`status/diff` 只比工作区与 index，所以 11 小时里一切正常，直到某次 diff 要拿旧 blob。

**处理**：
1. 把工作区里未提交的 6 个改动文件抢救到 `/tmp`；
2. 从 GitHub 重新 clone；
3. 把 6 个文件放回，逐个 diff 复核后提交；
4. 全量复验（typecheck / lint / 前后端测试 / docker 起容器）。
5. 老大随后把**所有项目从 `~/Desktop` 迁到 `~/projects`** 根治（iCloud 不管这个目录）。

**教训**：
- **git 的健康检查（`status/log/diff`）不能证明对象库完整** —— 它们大多数时候不读 pack。要验就 `git fsck`，或直接看 `.git/objects/pack/*.idx` 的大小是否合理。
- iCloud 驱逐是**静默的、按文件大小挑的**：先吃 `node_modules` 和 pack 这类大块头，小文件（源码）反而完好，所以工作区看起来毫发无损。
- 判据：**任何 git 仓库 / node 项目都不该放在 iCloud 管辖的目录下**（`~/Desktop`、`~/Documents` 在开了「桌面与文稿」同步时都算）。相关工具与背景 → `~/.claude/bin/icloud-materialize`、`debug` skill ②。
