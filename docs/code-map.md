# zupu · code-map（架构鸟瞰 · 改代码前必读）

> **2026-09-02 首次生成**（`code-map` skill 全量流程，扫描范围 = 仓库全部源码 + 部署文件 + 测试）。
> **维护规则**：改了源码就顺手改这里对应的段；**不写行号，只写符号名**（行号会漂）。
> 待办 / bug / 技术债 → `docs/roadmap.md`；已结案事故 → `docs/incident-log.md`；本文件只写「现在是怎么接的」。
> 🔒 不变量在 §14，**动 `server.js` / `mcp.js` / `Dockerfile` / `App.tsx` 删除逻辑之前先读那一节。**

---

## §1 · 30 秒鸟瞰

```
华夏族谱录（zupu）= 一页 React 族谱可视化 + Express/SQLite 后端 + 内嵌 MCP 端点。
一份数据（sqlite members 表），三个入口：

  ① 浏览器  /          React SPA（App.tsx）—— 看谱 / 选人 / 宗主编辑 / AI 三功能 / 导入导出
  ② REST    /api/*     server.js —— SPA 与 zupu_cli.py 都走它
  ③ MCP     /mcp       mcp.js —— 任何 agent（Claude Code / hermes …）10 个工具直读同一 sqlite 句柄

用户做的事 → 代码走的路：

  看谱 / 拖拽 / 缩放
     App.fetchMembers → GET /api/members → activeMembers → <FamilyGraph> calculateLayout(d3.stratify+tree)
     Files: App.tsx · components/FamilyGraph.tsx · utils/familyGraphUtils.ts     Detail: §8-A

  宗主登录 → 增 / 改 / 归档 / 还原
     handleLogin（纯前端口令比对）→ handleAddChildNode / handleAddParentNode / 编辑保存 / executeDelete / handleRestore
     → saveMemberToDb → POST /api/members（upsert）                            Detail: §8-B/C/D

  AI 三功能（亲缘推演 / AI 续写志传 / 灵犀询问）
     services/geminiService.ts 拼 prompt → POST /api/ai/generate → validateAiRequestBody → resolveModel → generateText
     Files: services/geminiService.ts · server.js                                Detail: §8-E · §9-C

  导入 / 导出 JSON
     sanitizeImportedMembers → migrateLegacySpouseData → setMembers + 逐条 POST     Detail: §8-F

  agent 经 MCP 读写
     mountZupuMcp → 每请求一个 StreamableHTTPServerTransport → 工具 handler → loadAll/loadOne/saveOne   Detail: §8-G · §15

横切基建：
  sqlite `members` 表                         → §10 / §16
  localStorage 五个 key（含离线影子）          → §10
  nginx 反代 + Docker 同容器双进程 + CI 探活   → §18
  无鉴权、CORS 白名单是唯一边界                → §17

改代码前先问自己：
  「我在哪条主路上？」                    → 读对应 §8 小节
  「谁在调我要改的函数？」                → §3 / §4
  「我在加一个弹层？」                    → §7（已有 7 个叠在一起）
  「我在碰删除 / AI 端点 / Dockerfile / MCP？」→ §14 不变量，逐条对
```

---

## §2 · 文件布局

```
zupu/                              ← 扁平布局，没有 src/
├── index.html                     Vite 入口（引 Google Fonts；含 SVG ink-bleed 滤镜）
├── index.tsx                      ReactDOM.createRoot → <App/>（StrictMode）
├── App.tsx            (1507 LOC)  ⭐ 唯一页面：全部状态 + 7 个弹层 + REST 调用
├── styles.css                     Tailwind 三层 + 卷轴/宣纸/竖排等自定义 class
├── types.ts                       FamilyMember / Locale / SearchFilters
├── components/
│   ├── FamilyGraph.tsx  (663 LOC) ⭐ d3 布局 + 拖拽 + 缩放 + 连线 + 卡片（DraggableNode）
│   ├── FamilyOverviewPanel.tsx    右上角概览面板（计数 + 搜索候选）
│   └── MarkdownRenderer.tsx       手写的极简 Markdown → JSX（AI 输出用）
├── hooks/usePersistentState.ts    useState + localStorage 同步
├── utils/
│   ├── familyData.ts              导入清洗 / 旧版 spouseName 迁移 / 后代遍历 / id 生成 / 导出
│   ├── familyGraphUtils.ts        亲属称谓推算（中英）/ 年龄 / 兄弟排行
│   └── storage.ts                 localStorage 读写（safeJsonParse）
├── services/geminiService.ts      三个 AI 功能的 prompt 组装 + fetch /api/ai/generate
│
├── server.js          (576 LOC)   ⭐ Express：CORS 白名单 · sqlite 初始化 · 启动迁移 · 4 条路由 · 挂 MCP
├── mcp.js             (547 LOC)   ⭐ McpServer：10 个工具 + 领域逻辑（树 / 亲属 / 待考）+ 无状态挂载
│
├── tests/
│   ├── backend/api.test.ts        supertest 打 server.js（DB_PATH=:memory:）
│   ├── backend/mcp.test.ts        官方 SDK Client 真协议往返打 /mcp
│   ├── backend/setup-env.ts       只做一件事：process.env.DB_PATH=':memory:'
│   ├── frontend/App.test.tsx      jsdom + mock fetch/localStorage
│   ├── frontend/FamilyOverviewPanel.test.tsx   「在谱宗亲」回归测试
│   ├── frontend/familyData.test.ts
│   ├── frontend/Logic.test.ts     calculateRelationshipLabel
│   └── frontend/setup.ts          jest-dom + cleanup
│
├── Dockerfile                     两阶段：builder(vite build) → runtime(node + nginx 同容器)
├── nginx.conf                     → /etc/nginx/http.d/default.conf（alpine 只 include http.d）
├── docker-compose.yml             HOST_PORT / NPM_REGISTRY / API_KEY 走 .env
├── .github/workflows/ci.yml       check（typecheck/lint/前后端测试）+ docker（build 后真起容器探活三入口）
├── .env.example                   全部环境变量说明（唯一的配置文档）
├── seed.example.json              7 人示例数据（README「载入古籍」用）
├── vite.config.ts                 dev proxy /api→3001 · manualChunks(react/d3/icons)
├── vitest.config.ts / vitest.config.api.ts   前端(jsdom) / 后端(node) 两套
├── tailwind.config.cjs · postcss.config.cjs · .eslintrc.cjs · tsconfig.json
├── start.sh                       ⚠️ 死文件：内容是写 start.sh 的 heredoc 壳，Dockerfile 没用它
├── metadata.json                  AI Studio 时代残留（requestFramePermissions），无人引用
├── .dockerignore                  构建上下文瘦身；最要紧的是挡住 node_modules 与 data/*.db
└── vercel.json                    只有一行 ignoreCommand: "exit 0" = 让 Vercel 永远跳过构建（见 §18）
```

**没有的东西（别去找）**：数据库迁移目录（迁移逻辑在 `server.js` 里，§16）· 埋点（§11）· 服务端鉴权（§17）。

---

## §3 · 模块依赖（谁用了谁 · 改签名先看这）

```
types.ts ← 全部前端文件 + 两个 utils + 测试        改字段 = 全项目编译；后端不引它（JS），要手动对齐 §16

utils/familyData.ts
  ├── App.tsx            generateId / getDescendants / migrateLegacySpouseData / sanitizeImportedMembers / exportMembersAsJson
  └── tests/frontend/familyData.test.ts
  ⚠️ migrateLegacySpouseData 与 server.js 的 migrateLegacySpouseNodes 是【同一算法的两份实现】（前端 / 后端各一份），改一边要改另一边

utils/familyGraphUtils.ts
  ├── components/FamilyGraph.tsx   calculateAge / calculateRelationshipLabel
  └── tests/frontend/Logic.test.ts
  ⚠️ mcp.js 的 computeKinship 是【第三份亲属逻辑】（父系直系/旁系，粒度粗），与这份中文称谓表互不引用

utils/storage.ts
  ├── hooks/usePersistentState.ts  readStorageValue / writeStorageValue
  └── App.tsx                      writeStorageValue ×4（familyMembers_backup）· readStorageValue ×1（离线回落）

hooks/usePersistentState.ts ← App.tsx 四处：familyLocale · familySurname · adminPassphrase · familyAiConfig

services/geminiService.ts ← App.tsx：analyzeRelationship / generateBiography / askAiAboutMember + 类型 AISettings

components/* ← 只有 App.tsx 引用（FamilyGraph / FamilyOverviewPanel / MarkdownRenderer 互不引用）

server.js
  ├── express · cors · sqlite3 · dotenv
  ├── ai(generateText) · @ai-sdk/google · @ai-sdk/openai-compatible
  └── ./mcp.js（mountZupuMcp）— 把 app 与 db 句柄交给它
  导出 app / db / dbReady 给两份后端测试

mcp.js
  ├── @modelcontextprotocol/sdk  server/mcp.js(McpServer) · server/streamableHttp.js(StreamableHTTPServerTransport)
  ├── zod（v4）
  └── 不 import server.js —— db 由参数注入；只依赖 members 表结构（§16）

App.tsx 内部热点（改这些函数先数调用方）：
  saveMemberToDb   ← 10 处：fetchMembers(迁移回写) · handleCreateRoot · executeDelete · handleRestore ·
                      handleAddChildNode · handleAddParentNode×2 · 编辑保存按钮 · AI 续写按钮 · 导入
  setMembers       ← 10 处
  aiCacheRef.clear ← 6 处（每次写操作后清 AI 缓存）
  fetchWithTimeout ← 2 处（GET 2000ms / POST 3000ms）
```

---

## §4 · 关键函数调用链

```
saveMemberToDb(member)                                    [App.tsx]
  ← 上面 10 处调用方
  内部：删 spouseName → POST /api/members（3s 超时）→ !ok 抛错 → catch：toast「已保存至本地」+ return false
  ⚠️ 没有调用方检查返回值 —— 后端失败时前端 state 照样更新、localStorage 影子照样写，
     之后【没有任何重放机制】把它送回后端（README「网络恢复后尝试同步」不成立，见 §12）

fetchMembers()                                            [App.tsx]
  ← 挂载时 useEffect（依赖含 familySurname，所以改姓氏会再拉一次）
  GET /api/members(2s) → sanitizeImportedMembers（坏记录直接 throw → 整批进 catch 走离线分支）
    → migrateLegacySpouseData → setMembers + 写 familyMembers_backup → 迁移产生的 updates 逐条 saveMemberToDb
    → 若 familySurname 仍是默认 '袁'，取第一个无 parentId 成员的 name[0] 当姓氏
  catch → readStorageValue('familyMembers_backup') → 有则用 + toast「已切换至离线备份」

validateMemberPayload(body)                               [server.js]
  ← POST /api/members
  normalizeMemberForStorage（删 spouseName）→ id/name 必填、gender ∈ {male,female,other}
  → 【全量重建】对象：缺失字段一律填默认（biography ''、isHighlight false …）
  ⚠️ 所以 REST 写入是"整条覆盖"，不是合并（MCP upsert_member 才是合并，§14 ⑨）

validateAiRequestBody(body) → resolveModel → generateText  [server.js]
  ← POST /api/ai/generate
  顺序：prompt 非空且 ≤8000 → baseUrl 语法/协议 → isBlockedHost（硬阻断，先于一切）
       → 无 apiKey 且 baseUrl 不在 isAllowedBaseUrl → 400
       → apiKey = 请求带的 || process.env.API_KEY；都没有 → 500 并给两条出路
       → resolveModel：baseUrl || AI_DEFAULT_BASE_URL → openai-compatible；否则 google
       → generateText({ timeout: 15000, maxRetries: 1, temperature: 0.7 })

calculateLayout(forceResetView)                           [FamilyGraph.tsx]
  ← useEffect [data, dimensions]（首次与尺寸变化时 forceResetView=true）· 「天道归位」按钮
  data → 去掉"仅作为配偶存在（无 parentId 且被别人 spouseId 指着）"的成员 = bloodlineData
       → roots>1 时插 synthetic-root「万脉归宗」→ d3.stratify → 子女按 女|男|女 夹心 + 出生日排序
       → d3.tree nodeSize [280,400] → setNodes（去掉 synthetic-root，depth 减 1）
       → forceResetView：算包围盒 → 缩放 0.1~0.8 → zoom.transform 居中
  ⚠️ roots===0 且有数据（全是环）→ 直接 return，画面空白无提示

calculateRelationshipLabel(target, center, all, locale)   [familyGraphUtils.ts]
  ← FamilyGraph.relationLabels（选中某人时对每个渲染节点算一次）
  配偶 / 姻亲三种 → 祖先路径求 LCA → (up,down) 查表：直系 / 兄弟(排行+长幼) / 叔伯姑(与父比生年) / 侄 / 堂 / 族亲

mountZupuMcp(app, '/mcp', db)                             [mcp.js]
  ← server.js 顶层，在路由之后、错误中间件之前
  app.post 回调内【每请求】：createZupuMcpServer(db) + new StreamableHTTPServerTransport({sessionIdGenerator: undefined})
    → res.on('close') 里 transport.close() → server.close()
    → try { server.connect(transport); transport.handleRequest(req,res,req.body) } catch → next(err)
  app.get / app.delete → 405 + Allow: POST
  🔒 §14 ⑬：server 与 transport 都必须每请求新建；守卫是 tests/mcp-burst.mjs
```

---

## §5 · 逐文件职责

```
前端
  index.html                 壳 + 字体 + viewport 禁缩放 + #root.scroll-container（卷轴边框在 styles.css）
  index.tsx                  挂载
  App.tsx                    页面本体。三块：状态与派生（§6）· 事件 handler（§8）· JSX（图 + 7 个弹层，§7）
  components/FamilyGraph.tsx d3 只管布局（stratify/tree）与手势（drag/zoom）；DOM 由 React 渲染；连线是 SVG 路径
  components/FamilyOverviewPanel.tsx  纯展示：四个计数 + 搜索框 + ≤6 条候选；不持有状态
  components/MarkdownRenderer.tsx     行级解析：# ## ### / - * 列表 / 1. 列表 / **粗** *斜* `code`；不做嵌套、不做链接
  hooks/usePersistentState.ts         initialValue 若是函数会被 useMemo 缓存；每次 value 变就写 localStorage
  utils/familyData.ts        见 §9-A / §9-B
  utils/familyGraphUtils.ts  见 §4
  utils/storage.ts           SSR 守卫（window 不存在返回 fallback）；deserialize 抛错 → fallback
  services/geminiService.ts  三个 export 各自 try/catch 吞错返回古风占位文案（所以 App 里的 catch 几乎不会触发，§8-E）
  types.ts                   FamilyMember 是前后端的隐性契约（后端不 import 它）
  styles.css                 .scroll-container 卷轴边 · .scroll-node 卡片 · .writing-v 竖排 · .glass-panel · .ink-path 墨线动画 · .watermark-text

后端
  server.js                  §15 / §16 / §17；导出 app/db/dbReady 供测试；NODE_ENV=test 时不 listen
                             末尾三件兜底：错误中间件（4 参）· unhandledRejection（记录，不退出）· uncaughtException（记录后 shutdown(1)）
  mcp.js                     §15 MCP 段；领域函数 summarize / ancestorChain / computeKinship / buildTree / renderTreeText / pendingOf

配置与部署
  Dockerfile / nginx.conf / docker-compose.yml / ci.yml   → §18
  .env.example               变量清单；⚠️ 它描述的是【裸跑 node】能读到的变量，Docker 下只有 compose 转发的那几个生效（§18）
  seed.example.json          与 §16 字段一一对应，含一个 isDeleted:true 示例
  vite.config.ts             dev 时 /api 与 /mcp 都反代到 3001（2026-09-02 补的 /mcp，此前 dev 下只能直连 3001）
  .eslintrc.cjs              --ext ts,tsx → server.js / mcp.js 两份后端 JS【零 lint 覆盖】
  start.sh                   死文件（heredoc 壳），删掉不影响任何东西
  metadata.json              AI Studio 残留，无引用
```

---

## §6 · 状态管理（三个最大文件）

### App.tsx（1507 LOC）

```
服务端镜像
  members: FamilyMember[]              全量（含 isDeleted），来源 fetchMembers / 各 handler 本地更新
  isLoading                            首屏；为 false 且 activeMembers 为空 → 显示「开宗立派」

派生（useMemo）
  selectedMember / selectedSpouse
  activeMembers  = members.filter(!isDeleted)      → 传给 FamilyGraph、计数、候选
  deletedMembers = members.filter(isDeleted)       → 回收站
  highlightCount / rootCount(无 parentId)
  overviewMembers = 搜索命中前 6 条；无关键词 → []  ⚠️ 不是总数（§14 ④）

持久化（usePersistentState → localStorage，§10）
  locale('familyLocale')  familySurname('familySurname')  adminPassphrase('adminPassphrase')  aiConfig('familyAiConfig')

会话态
  selectedMemberId · isDetailsOpen · isEditing · formData(Partial<FamilyMember>)
  compareMemberId · aiAnalysis · analysisStyle · loadingAi · loadingDeduction
  inquiry · inquiryStyle · aiResponse
  isSettingsOpen · isRecycleBinOpen · showLogin · passphraseInput · isAdmin
  isCreatingRoot · setupSurname · setupPassphrase
  memberSearchQuery
  notification({message,type}) —— 3s 自动清
  deleteModal({isOpen, memberId, memberName})

ref
  aiCacheRef: Map<cacheKey,string>   key = [kind, locale, ids…, style, 问题].join('::')；任何写操作后 clear

关键方法（调用方见 §3/§4）
  fetchMembers · saveMemberToDb · handleLogin · handleCreateRoot · handleAiInquiry
  onSelect（同一人再点 = 打开详情）· handleOverviewSelect · onDeselect
  executeDelete（本人 + getDescendants 全部 isDeleted:true）· handleRestore（只还原本人，不还原后代）
  handleAddChildNode · handleAddParentNode（新祖先插在 child 与其原 parent 之间）· handleDeleteNode（只开确认框）
  renderDetailsModal（内含编辑表单与「保存录入」的配偶双向绑定逻辑，§9-B）
```

### FamilyGraph.tsx（663 LOC）

```
FamilyGraph
  nodes: GraphNode[]          d3 算出的血脉节点坐标（可被拖拽覆盖）
  transform {x,y,k}           d3.zoom 的变换，同时驱动画布容器与水印缩放
  dimensions {width,height}   容器尺寸（resize 监听）
  memberMap / selectedMember  派生
  spouseNodes                 派生：每个血脉节点的配偶若不在 nodes 里，放在旁边 ±220px（女左男右）
  renderedNodes = nodes + spouseNodes
  relationLabels              选中时对每个节点算称谓（Map）
  renderedLinks               父子贝塞尔曲线（parent.y+110 → child.y-110）+ 配偶虚线（去重 pairKey）
  handleNodeDrag              只改 nodes 坐标；配偶节点跟着血脉节点走（因为是派生）

DraggableNode（memo）
  propsRef                    让 d3.drag 回调永远拿到最新 props，不重绑
  dragInitialized             drag 行为只绑一次（useEffect []）
  isDragging                  样式
  点击 vs 拖拽判据：位移 >3px 才算拖；否则 end 时 onSelect
  ⚠️ 三个 admin 按钮要同时 stopPropagation onMouseDown + onPointerDown，否则 d3.drag 抢事件
  名字字号分档：≤4 字 text-2xl / ≤7 字 text-xl / 更长 text-base，永远一列竖排（.writing-v）
```

### server.js / mcp.js（进程内共享状态）

```
db: sqlite3.Database         一个句柄，REST 与 MCP 共用；serialize 只在启动迁移里用
dbReady: Promise             initTable → migrateLegacySpouseNodes；app.listen 在它 resolve 之后才调（§14 ⑫）
process.env                  API_KEY / AI_DEFAULT_BASE_URL / AI_DEFAULT_MODEL / AI_ALLOWED_BASE_URLS / ALLOWED_ORIGINS / DB_PATH
                             ⚠️ isAllowedBaseUrl 每次请求现读 env（测试里靠这个临时改）
McpServer                    【无】进程级实例：每个 /mcp 请求现建现弃（§14 ⑬）
```

---

## §7 · 弹层与叠放顺序（App.tsx 里 7 个 absolute 层）

```
  z-[100] notification 吐司       任何 showToast；3s 自清；pointer-events-none，不挡操作
  z-[60]  deleteModal「宗法警告」  handleDeleteNode；确认 → executeDelete
  z-50    「开宗立派」建谱卡        activeMembers.length===0 && !isLoading；不是弹层是全屏态
  z-50    showLogin 登录框         「宗主认证」；Enter 触发 handleLogin
  z-50    isRecycleBinOpen 回收站  仅 isAdmin
  z-40    renderDetailsModal 详情  selectedMember && isDetailsOpen；内部 isEditing 切换表单；点遮罩关
  z-40    isSettingsOpen 设置      仅 isAdmin；同 z 但在 JSX 里排在详情之后 → 叠在详情上面
  z-20    左上标题 / 右上概览面板 / 底部工具条（常驻，非弹层）

互斥：没有状态机，靠各自 boolean。已知可同时打开：详情 + 设置、详情 + 回收站、任意 + 删除确认。
      退出 admin（setIsAdmin(false)）不会关闭已开的设置/回收站，但它们的渲染条件带 isAdmin → 立刻消失。
⚠️ 加第 8 个弹层：先决定 z 层、是否要 isAdmin 门、是否要在 onSelect/handleOverviewSelect 里被重置。
```

---

## §8 · 端到端数据流

**A · 首屏加载**
```
index.tsx → <App/> → useEffect fetchMembers
  → GET /api/members（nginx → node；dev 走 vite proxy）
  → server: db.all(全表) → JSON.parse 每行（坏行跳过）→ 返回【含归档者】的数组
  → 前端 sanitize → migrate → setMembers → 写 familyMembers_backup
  → activeMembers 进 FamilyGraph → dimensions>0 后 calculateLayout(true) → 居中
  失败分支：2s 超时 / 非 2xx / sanitize 抛错 → 读 localStorage 影子 → 有则用（toast）/ 无则 toast 错误
```

**B · 新增子/父节点（admin）**
```
卡片悬停「+」→ onAddChild/onAddParent → App.handleAddChildNode / handleAddParentNode
  → 生成 id `M-<ts>-<rand>` → saveMemberToDb（POST upsert）→ setMembers → 选中 + 打开详情 + 进入编辑
  AddParent 特殊：新祖先 parentId = child 原 parentId；child.parentId 改指新祖先 —— 两次 POST，非事务
```

**C · 编辑保存（含配偶）**
```
「保存录入」→ 校验目标配偶未被别人占用 → 构造 updates[]：
   新配偶（填了姓名）→ 新建成员 spouseId 指回本人
   旧配偶被换 → 旧配偶 spouseId:null, isMarried:false
   目标配偶 → spouseId 指回本人, isMarried:true
   本人 → {...selectedMember, ...formData, spouseId, isMarried}，删 spouseName
  → Promise.all(updates.map(saveMemberToDb)) → setMembers 合并 → aiCache 清空 → 退出编辑
```

**D · 归档 / 还原**
```
归档：handleDeleteNode → deleteModal → executeDelete
   → 本人 + getDescendants（只算未归档后代）全部 isDeleted:true → 逐条 POST upsert → 选中若在其中则取消选中
还原：回收站「恢复」→ handleRestore → 仅本人 isDeleted:false → POST
   ⚠️ 不级联还原后代（后代仍在回收站，需逐个恢复）
DELETE /api/members/:id（REST 直调 / zupu_cli.py）→ 后端把 json 里 isDeleted 置 true + is_deleted=1 —— 同样是归档
```

**E · AI 三功能**
```
亲缘推演：选对比人 → analyzeRelationship(selected, target, activeMembers, style, aiConfig, locale)
AI 续写：generateBiography(member) → 结果直接 saveMemberToDb 覆盖 biography
灵犀询问：askAiAboutMember(member, question, style)
  三者 → geminiService.generateContent → POST /api/ai/generate {prompt, modelName, baseUrl, apiKey}（15s 客户端超时）
  → server §4 那条链 → {content}
  缓存：aiCacheRef 按 key 命中则不请求；任何写操作 clear
  ⚠️ geminiService 三个函数各自吞错返回占位文案 → App 层的 toast「请检查 AI 配置」几乎不会出现，
     用户看到的是「宗法司暂歇」这类古风句子，且它会被当成正常结果写进缓存 / 志传
```

**F · 导入 / 导出**
```
导出：exportMembersAsJson(members) → data URL 下载（含归档者）
导入：FileReader → JSON.parse → sanitizeImportedMembers（任一坏记录整批 throw）→ migrateLegacySpouseData
   → setMembers（【替换】前端 state）→ 写影子 → 逐条 POST upsert
   ⚠️ 后端不删旧记录：导入文件里没有的成员仍在库里 → 下次 fetch 又回来。README 写的「导入会覆盖」只对当前会话成立
```

**G · MCP 工具调用**
```
客户端 POST /mcp（JSON-RPC）→ nginx location = /mcp（无缓冲，300s）→ mountZupuMcp 的 app.post
  → 新 transport → server.connect → handleRequest → 工具 handler
     读类：loadAll(db)（默认过滤 isDeleted）→ 领域函数 → textAndStructured
     写类：loadOne → 合并 → saveOne(upsert)
  → 响应为 SSE（event: message）或 JSON，取决于 Accept
```

---

## §9 · 业务逻辑管线

**A · 成员写入（REST 侧）**
```
请求 body → normalizeMemberForStorage(删 spouseName) → validateMemberPayload
  → id/name trim 非空 · gender 合法 · parentId/spouseId 只接受 string|null · 其余字段填默认
  → INSERT … ON CONFLICT(id) DO UPDATE（json_content + is_deleted 同写）
不变量：REST 永远整条覆盖；biography 缺失 = 被清空（§14 ⑨）
```

**B · 旧版 spouseName → 独立配偶成员（两处实现）**
```
server.js migrateLegacySpouseNodes（启动时一次，事务）    utils/familyData.migrateLegacySpouseData（每次 fetch/导入）
  有 spouseName 且无 spouseId → 新建 `spouse-<id>[-n]`，性别取反，parentId null，双向 spouseId，isMarried true
  有 spouseName 且有 spouseId → 只删 spouseName
两份代码必须保持同构；前端那份跑完还会把 updates POST 回去
```

**C · AI 端点安全管线**（顺序不能换）
```
prompt 非空/长度 → baseUrl 语法 → 协议 http(s) → isBlockedHost（169.254/16 · fe80::/10 · metadata.google.internal · metadata）
→ [无 apiKey] isAllowedBaseUrl（AI_ALLOWED_BASE_URLS ∪ AI_DEFAULT_BASE_URL，按 origin 比）
→ 密钥优先级：请求 apiKey > env API_KEY
→ 模型：modelName > AI_DEFAULT_MODEL > 'gemini-3-flash-preview'
```

**D · 亲属推算（三套并存，别以为改一处就全改了）**
```
utils/familyGraphUtils.calculateRelationshipLabel   图上角标（中文称谓细到"二叔/堂姐"，英文到 cousin 级）
mcp.js computeKinship                                直系尊长/卑亲/旁系/无交集 + 各自代数（粗粒度，给 agent 用）
services/geminiService.analyzeRelationship          交给模型自由发挥（把全部成员列表塞进 prompt）
```

**E · 图布局**
```
activeMembers → 剔除纯配偶 → 多根插 synthetic-root → stratify（parentId 指向不存在者视为根）→ 子女夹心排序 → tree
坐标单位 = 像素（nodeSize 280×400），卡片 120×220，父子连线锚点 ±110
```

---

## §10 · 存储布局

```
SQLite（DB_PATH；默认 ./genealogy.db；Docker 为 /app/data/genealogy.db ← volume ./data）
  members  id TEXT PK · json_content TEXT · is_deleted INTEGER DEFAULT 0
  · 全部业务字段都在 json_content 里；is_deleted 列只是冗余副本（读取从不 WHERE 它，§14 ⑦）
  · 写者：server.js POST/DELETE 路由 · migrateLegacySpouseNodes · mcp.js saveOne
  · 读者：GET /api/members（全表含归档）· DELETE 先 get · mcp loadAll/loadOne
  · 备份：README 建议 sqlite3 .backup；fino 上另有 cron（见 personal/services.md）

localStorage（浏览器，key 名不带前缀）
  familyLocale          'zh'|'en' 原始字符串        读写：usePersistentState
  familySurname         单字                          同上；fetchMembers 在默认值'袁'时自动改写
  adminPassphrase       明文口令（默认 'miling'）      同上；handleCreateRoot / 设置页可改  ⚠️ 明文
  familyAiConfig        JSON {modelName, baseUrl, apiKey}  ⚠️ apiKey 明文（README 已声明）
  familyMembers_backup  JSON 全量成员数组             写：fetchMembers 成功 / 导入 / members 变化(非空时)；读：fetchMembers 失败
```

---

## §11 · 埋点 / 日志

**零埋点**（无 PostHog，无任何远程日志）。后端只有 `console.log/error/warn`，Docker 下进 `docker logs`。
前端错误全靠 `console.warn` + 吐司。这是自托管个人工具的刻意状态；要加可观测性时先看 roadmap 有没有已定方案。

---

## §12 · 跨进程 / 跨端状态同步

```
                ┌──────────── 同一 Node 进程 ────────────┐
浏览器 SPA ──REST──▶ server.js 路由 ──┐                  │
zupu_cli.py ──REST──▶                 ├──▶ db 句柄 ──▶ sqlite 文件
agent ────────MCP──▶ mcp.js 工具 ─────┘
浏览器 localStorage 影子 ◀── 单向：只从"成功拉取/本地改动"写入，只在"拉取失败"读出
```

- 三个写者没有任何锁 / 版本号；最后写入者赢。sqlite 串行化保证单条 upsert 原子，**跨条不原子**（AddParent 两次 POST、归档 N 条、导入 N 条）。
- REST 与 MCP 对 `isDeleted` 语义一致（都是归档），对**写入语义不一致**：REST 整条覆盖，MCP 合并（§14 ⑨）。
- 前端影子**只读不回写**：离线期间的改动留在影子里，联网后 fetchMembers 成功会用服务端数据**覆盖影子**，离线改动丢失。README「网络恢复后尝试同步」与代码不符。
- MCP 读默认过滤归档者（`loadAll` 无 includeArchived），`get_member` 例外可查归档者；REST GET 不过滤。

---

## §13 · 子系统触发器

| 触发 | 条件 | 耦合 |
|---|---|---|
| 启动迁移 `migrateLegacySpouseNodes` | 每次进程启动，全表扫描，有 spouseName 才写 | 与前端 `migrateLegacySpouseData` 同构；空库时 `initTable` 走 `INITIAL_DATA=[]` 等于什么都不种 |
| 姓氏自动识别 | `fetchMembers` 成功且 `familySurname==='袁'` | 取首个根成员 name[0]；名字是「示例·始祖」会得到「示」；改姓氏会触发 fetchMembers 重跑（依赖数组含 familySurname）|
| AI 缓存失效 | 任何写操作（6 处 clear）| 缓存 key 含 locale/style/ids，切语言不清但 key 不同 |
| 吐司自清 | notification 变化后 3s | 连发时后一条重置计时 |
| 「开宗立派」全屏态 | `activeMembers.length===0 && !isLoading` | 全部归档后也会出现（回收站按钮此时在工具条上仍可见，但 isAdmin 已在建谱流程重置为 true）|
| d3.zoom 重绑 | dimensions 变化 | 缩放状态保留在 transform state，不丢 |
| CI 探活 | docker job 起容器后轮询 `/api/members` ≤20s | 三入口任一不通即失败（§18）|

---

## §14 · 🔒 不变量（破了就是事故；每条写明破了会怎样）

**① 删除只有软删除，`DELETE /api/members/:id` 也是归档。**
路径三条：UI「斩断此脉」= 本人 + 后代 upsert `isDeleted:true`；REST DELETE = 读出 → 置 `isDeleted:true` + `is_deleted=1`；MCP `archive_member`。**仓库里不存在任何 `DELETE FROM members` 的运行时路径**（只有测试 `beforeEach` 清表）。破了 = 长辈口述的志传不可再生。加新写路径先问「它能不能把一行抹掉」。

**② `AI_ALLOWED_BASE_URLS` 白名单只约束「用服务端密钥」的请求；请求自带 `apiKey` 时放行任意端点；但 link-local / 云元数据地址无论如何阻断。**
实现顺序在 `validateAiRequestBody`：`isBlockedHost` 先于 `isAllowedBaseUrl`，且 `isAllowedBaseUrl` 只在 `baseUrl && !apiKey` 时执行。破了 = 任何人填一个自己的地址就能拿走服务端 `API_KEY`（无白名单时），或让服务端去打 `169.254.169.254` 换云凭据（无阻断时）。测试 `api.test.ts` 有对应用例，改这段先跑 `npm run test:api`。

**③ 私有网段与 localhost 是故意放行的，不是漏网。**
自托管指向同内网的 new-api / llama.cpp 是主场景（fino 就是 `192.168.8.111:3000`）。代价 = 不防 DNS rebinding，README 安全须知已声明「公网部署自己加鉴权层」。**别"顺手"把 10/8、192.168/16 加进 `isBlockedHost`。**

**④ `overviewMembers` 是搜索结果（≤6 条，空搜索为 `[]`），不是总数；面板计数一律用 `totalCount = activeMembers.length`。**
`FamilyOverviewPanel` 的 `members` prop 只喂候选列表。破了 = 「在谱宗亲 0」（2026-09-02 修过一次，`FamilyOverviewPanel.test.tsx` 是回归测试）。

**⑤ 新增后端源码文件必须登记进 `Dockerfile` 的 `COPY server.js mcp.js ./`。**
运行镜像是逐文件复制，builder 阶段的 `COPY . .` 不会带到运行阶段。破了 = 镜像能构建、容器能起（nginx 是 PID 1）、`/api` `/mcp` 全 502（→ `docs/incident-log.md` PM-2026-09-02-dockerfile-copy-mcp）。CI 的探活步骤是这条的机械守卫。

**⑥ MCP 协议版本 = 2025-11-25 = SDK 1.30.0 上限；按 2026-07-28 规范原则写：无状态（`sessionIdGenerator: undefined`）、不用 Roots / Sampling / Logging、工具列表顺序确定、`outputSchema` + `structuredContent`、GET/DELETE 回 405。**
升 SDK 前看 `npm view @modelcontextprotocol/sdk dist-tags`（roadmap 有复查节点）。破了 = Claude connector 审核标准不过（每个工具要 title + readOnlyHint/destructiveHint；只有 `archive_member` 标 destructive），`mcp.test.ts` 逐条断言。

**⑦ `is_deleted` 列与 `json_content.isDeleted` 必须同写；读取只信 json。**
三处写（POST upsert / DELETE / mcp saveOne）都同时写两处。破了 = 列与 json 打架，而没有任何读者看列，所以错误会静默潜伏到有人加 `WHERE is_deleted=0` 那天。

**⑧ `spouseName` 永不落库；配偶关系是双向 `spouseId`。**
`normalizeMemberForStorage`（后端）与 `saveMemberToDb`（前端）都删它；旧数据由两份 migrate 转成独立成员。编辑保存必须维护双向：换配偶要解开旧配偶。破了 = 图上只画一条虚线的一端、称谓推算失灵。

**⑨ REST `POST /api/members` 是整条覆盖，MCP `upsert_member` 是字段合并。**
走 REST 写必须发**全量对象**（前端总是这么做；`zupu_cli.py` 也要）——少传 `biography` 就等于清空志传。MCP 那边保证「未传字段原样保留」，`mcp.test.ts` 有用例。别把两边改成一样之前，先想清楚 CLI 与前端谁依赖哪种语义。

**⑩ `GET /api/members` 返回含归档者的全量；前端靠它填回收站。MCP `list_members` / `search_members` / 树 / 亲属默认不含归档者。**
给 REST GET 加过滤 = 回收站永远是空的。

**⑪ 前端写入不等待后端成功，且离线影子不回写。**
`saveMemberToDb` 失败只吐司；state 与 `familyMembers_backup` 照常更新；下次成功 fetch 用服务端数据覆盖。这是现状不是设计目标（README 的「恢复后同步」说法不成立），改它要先决定冲突策略。

**⑫ `app.listen` 必须等 `dbReady` resolve 之后再调。**（2026-09-02 修，此前不等）
建表是异步的（`CREATE TABLE IF NOT EXISTS`），先 listen 的话启动头几毫秒的请求会撞 `no such table`；CI 探活是轮询，看不见这个窗口。现在写法是 `dbReady.then(() => app.listen(...))`，失败则打日志 + `exit(1)`（容器会拉起重试）。
测试不受影响：`NODE_ENV==='test'` 时根本不 listen，两份后端测试各自 `await dbReady`。

**⑬ 每个 `/mcp` 请求必须有独立的 transport **和独立的 `McpServer`**；两者都不能跨请求共享。**
SDK 的 `Protocol.connect` 有硬检查：`_transport` 已存在就 `throw 'Already connected to a transport'`，只有前一个 transport `close()` 后才清空。所以 `mountZupuMcp` 里 **`createZupuMcpServer(db)` 必须写在 `app.post` 的回调内部**（每请求新建），不能写在回调外面。
✅ **2026-09-02 已修**（此前是"一个单例 + 每请求 new transport"）。同批加的兜底：`app.post` 用 try/catch → `next(err)`、`server.js` 末尾的错误中间件、`unhandledRejection` / `uncaughtException` 处理器。
🔴 **破了会怎样**：并发时后一个请求在 `server.connect` 抛错 → Express 4 不捕获 async 错误 → unhandledRejection → Node 退出；nginx 是另一个进程、仍然活着，所以**容器 Up、网页 200、只有 `/api` `/mcp` 静默 502**（形态与 ⑤ 相同）。agent 并行发工具调用是常态，必中。
🧪 **守卫 = `tests/mcp-burst.mjs`**（CI docker job 调用，16 并发）。**这个 bug 用 curl 测不出来** —— 实测 8 个 curl 进程并发打 `initialize`，有 bug 的旧代码也全部 200，因为 fork 时间差让它们实际串行。复现必须同时满足：单进程 `Promise.all` 发起 + 用 `tools/call`（要查库，重叠窗口才够大）。旧代码在该条件下的表现：第 1 个 200，其余全部 ECONNRESET，进程当场退出。**改这块之后跑一遍那个脚本，别只跑 vitest。**

**⑭ 环境变量只有经 `docker-compose.yml` 的 `environment:` 转发的那几个能进容器；`.env` 本身不进运行镜像。**
2026-09-02 起转发 6 个：`API_KEY` · `DB_PATH` · `AI_DEFAULT_BASE_URL` · `AI_DEFAULT_MODEL` · `AI_ALLOWED_BASE_URLS` · `ALLOWED_ORIGINS`（后四个带 `:-` 默认空值，没设也不会报错）。
**再加新变量时同样要在 compose 里登记一行**，否则 `.env` 里写了也进不去容器 —— 这个坑极难查，因为 `cat .env` 看着完全正常，得进容器 `echo ${#VAR}` 才看得出是空的。`.env.example` 描述的是裸跑 `node server.js`（dotenv 读 cwd/.env）的行为。

**⑮ nginx 反代 `proxy_pass` 不带尾斜杠；配置文件放 `/etc/nginx/http.d/`。**
带尾斜杠会把 `/api/members` 剥成 `/members` → 404；放 `conf.d/` 在 alpine 镜像里根本不被 include（→ PM-2026-09-01-nginx-confd）。`/mcp` 那个 location 还必须 `proxy_buffering off`，否则 SSE 事件被攒住。

**⑯ 容器里 node 是 PID 1，nginx 是后台子进程。**（2026-09-02 反转，此前是相反的）
`CMD ["sh", "-c", "nginx -g 'daemon off;' & exec node server.js"]` —— `exec` 让 node 顶替 shell 成为 1 号进程。这么排有两个理由：
· **node 崩 → 容器退出 → `restart: unless-stopped` 自动拉起。** 反过来的话 node 死了容器还是 Up，网页照常 200，只有 `/api` `/mcp` 静默 502，从外面完全看不出来，得有人手动 `docker restart`。
· **`docker stop` 的 SIGTERM 直达 node**，`server.js` 的 SIGTERM 处理器才收得到，sqlite 才走得到 `db.close()`。此前 SIGTERM 发给 nginx，那个处理器从来没被触发过。
代价：nginx 挂了容器不退出。**这是有意的取舍** —— nginx 挂是"网页整个打不开"的显性故障，node 挂是隐性的，所以让隐性的那个当 PID 1。
排查「首页 200、其余 502」仍然先 `docker logs` 找 Node 的退出栈，别先怀疑 nginx。

⚠️ **加新的写路径 / 新入口（第四个入口、第二张表）之前，把它画进 §12 再对一遍 ①⑦⑨⑩。**

---

## §15 · 路由清单

```
中间件顺序（server.js 顶层）：cors(白名单函数) → express.json({limit:'512kb'}) → 路由 → mountZupuMcp → 错误中间件
  · 错误中间件写满 4 个参数（Express 靠参数个数认它，少一个就静默退化成普通中间件）；
    headersSent 时只 res.end()（SSE 流写到一半不能再写 JSON）
  · CORS：无 Origin 头放行；DEFAULT_DEV_ORIGINS(5021/4173/8888 的 localhost 与 127.0.0.1) ∪ ALLOWED_ORIGINS；其余 callback(Error)
    → 现由错误中间件接住，回 403 JSON「来源不在白名单内」（此前是 Express 默认的 500 HTML）

METHOD  路径                      处理                          备注
POST    /api/ai/generate          validateAiRequestBody→generateText   400 校验 / 500 无密钥或模型错；15s 超时
GET     /api/members              全表 → JSON 数组                      含归档者
POST    /api/members              validateMemberPayload → upsert       整条覆盖；返回 {message:'Success', id}
DELETE  /api/members/:id          归档（不是删除）                      404 不存在 / 返回 {message:'Archived', id, changes}
POST    /mcp                      StreamableHTTP JSON-RPC             见下
GET     /mcp · DELETE /mcp        405 + Allow: POST                    无状态模式的显式拒绝

MCP 工具（10 个，注册顺序即列表顺序）：
  只读  list_members · get_member · search_members(query, limit≤50) · get_lineage_tree · get_ancestors(id) · get_kinship(idA,idB) · list_pending
  写入  upsert_member(合并语义) · archive_member(destructiveHint) · restore_member
  错误：用 isError:true 的 content 返回，不抛协议异常（mcp.test.ts 断言）

反代与本地开发的路径映射：
  Docker  nginx :8888 →  ^~ /assets/ 静态(30d cache) · = /mcp → 3001(无缓冲) · ^~ /api/ → 3001 · / → SPA fallback
  Dev     vite :5021 → /api 与 /mcp 都反代到 3001（与 Docker 下同端口同路径，两边行为一致）
```

---

## §16 · 数据库

```
表 members
  id            TEXT PRIMARY KEY     业务 id：前端 `M-<epoch>-<rand>` / 迁移 `spouse-<id>[-n]` / agent 自拟（建议拼音）
  json_content  TEXT                 完整 FamilyMember JSON（字段见 types.ts；后端不校验多余字段，原样保存）
  is_deleted    INTEGER DEFAULT 0    冗余标记（§14 ⑦）

FamilyMember 字段（前后端隐性契约，后端是 JS 没有类型）：
  id · name · birthDate('YYYY' 或 'YYYY-MM-DD'，可空串) · isMarried · address · gender('male'|'female'|'other')
  parentId(string|null) · spouseId(string|null) · biography(Markdown) · isDeleted · isHighlight
  spouseName —— 只存在于旧数据与导入文件，落库前必被剥掉

索引：只有主键。全部读取都是全表扫描 + JSON.parse（族谱规模几十到几百人，够用）。

"迁移"：没有迁移目录。唯一的结构演进 = 启动时 migrateLegacySpouseNodes（幂等，事务，spouseName → 配偶成员）。
       改表结构 = 改 initTable 的 CREATE TABLE IF NOT EXISTS（对已有库不生效！）+ 自己写 ALTER 逻辑。
初始化：空表时按 INITIAL_DATA 灌种子 —— 它现在是 []，所以新库就是空的（README「第一次打开是空的」段是刻意的）。
测试：DB_PATH=':memory:'（tests/backend/setup-env.ts），每个测试文件一个独立进程与库。
```

---

## §17 · 鉴权 / 边界

```
服务端：无任何鉴权。REST 与 MCP 对能连到端口的人完全开放（README「安全须知」明写）。
前端：「宗主认证」= passphraseInput === adminPassphrase（localStorage 明文，默认 'miling'，设置页可改）
      isAdmin 只是 React state：控制编辑按钮 / 设置 / 回收站的渲染；刷新即失效；对 API 零约束。
唯一的技术边界：
  · CORS 白名单 —— 挡的是"别的网页里的脚本替你读写"，不挡 curl / 同源 / 无 Origin
  · AI 端点白名单 + link-local 阻断 —— 挡的是"拿服务端密钥打任意地址"（§14 ②③）
公网部署的正确姿势：前面加 Cloudflare Access / Basic Auth / Tailscale（README）。fino 实例只在内网 8889。
⚠️ 加「真鉴权」时：MCP 客户端多数支持 Bearer header；nginx 层加 auth 会同时挡住 /mcp，要给 agent 留通路。
```

---

## §18 · 部署拓扑与构建管线

```
Dockerfile（两阶段）
  builder  node:20-alpine → COPY package.json package-lock.json → npm ci（与 CI check 同一套解析）
           → COPY . .（受 .dockerignore 约束：node_modules / data / *.db / .env / .git / dist / docs / tests 都不进上下文）
           → npm run build（tsc && vite build）
  runtime  node:20-alpine + apk nginx → npm ci --omit=dev → COPY server.js mcp.js ./（§14 ⑤）
           → COPY --from=builder dist → /usr/share/nginx/html · nginx.conf → /etc/nginx/http.d/default.conf
           → CMD sh -c "nginx -g 'daemon off;' & exec node server.js"（node 是 PID 1，§14 ⑯）
  环境：NODE_ENV=production · DB_PATH=/app/data/genealogy.db · EXPOSE 8888

.dockerignore（2026-09-02 补）
  最要紧的两条：node_modules（宿主机编译的 sqlite3 原生模块，进了镜像也用不了）
  与 data/*.db（族谱本体，会被烤进镜像层，谁 pull 谁就拿到全部数据）

docker-compose.yml
  build.args NPM_REGISTRY ← .env · ports ${HOST_PORT:-8888}:8888
  environment 6 个：API_KEY · DB_PATH · AI_DEFAULT_BASE_URL · AI_DEFAULT_MODEL · AI_ALLOWED_BASE_URLS · ALLOWED_ORIGINS（§14 ⑭）
  volume ./data:/app/data · restart unless-stopped（配合 node 当 PID 1 才真的能自愈）
  fino 实例：~/projects/zupu，HOST_PORT=8889，容器名 zupu-chrono-genealogy-1

CI（.github/workflows/ci.yml）
  check  npm ci → typecheck → lint（只 ts/tsx）→ vitest(前端) → test:api(后端两份)
  docker setup-node → build → docker run -p 8888 → 轮询 /api/members ≤20s
         → curl / · /api/members · POST /mcp initialize 必须 200
         → node tests/mcp-burst.mjs（16 并发 tools/call + 之后后端仍存活）→ rm
  🔑 两个守卫各挡一类事故：起容器探活挡 PM-2026-09-02-dockerfile-copy-mcp（build 绿 ≠ 能起）；
     并发脚本挡 §14 ⑬（单发请求测不出来，curl 也测不出来）

Vercel（zupu-nine.vercel.app）
  历史遗留项目，连着 GitHub 自动部署。它是纯静态构建、没有 server.js → /api /mcp 全 404，
  数据只活在访问者浏览器的 localStorage 里。
  🔕 **2026-09-02 起已用 `vercel.json` 的 `ignoreCommand: "exit 0"` 关掉自动构建**
     （Vercel 约定：该命令 exit 0 = 忽略本次构建，exit 1 = 正常构建；vercel.json 覆盖后台的 Ignored Build Step）。
     ⚠️ **只关了构建，站点与既有部署仍在线** —— 这是刻意的：老大手机 Safari 里可能还存着一份
     从没同步到 fino 的族谱记录，得靠打开那个站导出（roadmap P1）。**在他导出之前，别删项目、别改域名。**
     要恢复自动构建就删掉 vercel.json；要更彻底就去 Vercel 后台断开 Git 集成。

本地开发
  npm run dev = concurrently(node server.js, vite --port 5021)；.env 由 dotenv 读；sqlite 在 ./genealogy.db
  部署到 fino：git pull → docker compose up -d --build（deploy 没有脚本，就是这两条）
```
