/**
 * zupu MCP server —— 让任何 agent 读写这份族谱。
 *
 * 形态：内嵌在 zupu 自己的进程里，挂在 /mcp，Streamable HTTP 无状态模式。
 *   · 不需要单独安装：zupu 起来了，MCP 就在；客户端加一个 URL 即可
 *   · 与 server.js 同进程、直读同一个 sqlite 句柄，不经 HTTP 绕回自己
 *
 * 协议版本：2025-11-25（SDK 1.30.0 所支持的最新版）。
 * 2026-07-28 规范已发布但尚无任何 SDK / 客户端实现；本文件按其设计原则写：
 *   · 无状态（sessionIdGenerator: undefined），不依赖 Mcp-Session-Id
 *   · 不使用已被废弃的 Roots / Sampling / Logging
 *   · 工具列表顺序确定（利于客户端缓存与 prompt cache）
 *   · 结构化输出（outputSchema + structuredContent）
 * 待 SDK 发布 2026-07-28 支持时，迁移成本应只是换传输层。
 *
 * 审核标准（claude.com/docs/connectors/building/review-criteria）：
 *   每个工具必须有 title；只读工具 readOnlyHint:true，改数据的 destructiveHint:true。
 *   这决定 Claude 是否每次向用户确认——只读免确认，破坏性必确认。
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

const PENDING_NAME_MARKERS = ['待补', '佚名', '名讳'];

// ─────────────────────────── 数据层（直读 sqlite）───────────────────────────

const dbAll = (db, sql, params = []) =>
  new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)))
  );
const dbGet = (db, sql, params = []) =>
  new Promise((resolve, reject) =>
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)))
  );
const dbRun = (db, sql, params = []) =>
  new Promise((resolve, reject) =>
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    })
  );

function parseRow(row) {
  try {
    return JSON.parse(row.json_content);
  } catch {
    return null;
  }
}

async function loadAll(db, { includeArchived = false } = {}) {
  const rows = await dbAll(db, 'SELECT json_content FROM members ORDER BY id');
  const members = rows.map(parseRow).filter(Boolean);
  return includeArchived ? members : members.filter((m) => !m.isDeleted);
}

async function loadOne(db, id) {
  const row = await dbGet(db, 'SELECT json_content FROM members WHERE id = ?', [id]);
  return row ? parseRow(row) : null;
}

async function saveOne(db, member) {
  await dbRun(
    db,
    `INSERT INTO members (id, json_content, is_deleted) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET json_content = excluded.json_content, is_deleted = excluded.is_deleted`,
    [member.id, JSON.stringify(member), member.isDeleted ? 1 : 0]
  );
}

// ─────────────────────────── 领域逻辑（自 zupu_cli.py 搬入）───────────────────────────

function summarize(m) {
  return {
    id: m.id,
    name: m.name,
    gender: m.gender,
    birthDate: m.birthDate || null,
    address: m.address || null,
    parentId: m.parentId ?? null,
    spouseId: m.spouseId ?? null,
    isHighlight: Boolean(m.isHighlight),
    hasBiography: Boolean((m.biography || '').trim()),
  };
}

function ancestorChain(id, index) {
  const chain = [];
  const seen = new Set();
  let cur = id;
  while (cur && index.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    chain.push(cur);
    cur = index.get(cur).parentId;
  }
  return chain;
}

function computeKinship(a, b, index) {
  const chainA = ancestorChain(a, index);
  const chainB = ancestorChain(b, index);
  const pos = new Map(chainA.map((id, i) => [id, i]));
  for (let j = 0; j < chainB.length; j += 1) {
    const id = chainB[j];
    if (pos.has(id)) {
      const da = pos.get(id);
      const db_ = j;
      const na = index.get(a).name;
      const nb = index.get(b).name;
      if (da === 0) {
        return {
          relation: 'lineal_ascendant',
          commonAncestorId: id,
          generationsA: da,
          generationsB: db_,
          description: `${na} 是 ${nb} 的直系尊长，上溯 ${db_} 代`,
        };
      }
      if (db_ === 0) {
        return {
          relation: 'lineal_descendant',
          commonAncestorId: id,
          generationsA: da,
          generationsB: db_,
          description: `${na} 是 ${nb} 的直系卑亲，下延 ${da} 代`,
        };
      }
      return {
        relation: 'collateral',
        commonAncestorId: id,
        generationsA: da,
        generationsB: db_,
        description: `旁系：共同祖先为 ${index.get(id).name}；${na} 距 ${da} 代、${nb} 距 ${db_} 代`,
      };
    }
  }
  return {
    relation: 'unrelated',
    commonAncestorId: null,
    generationsA: null,
    generationsB: null,
    description: `${index.get(a).name} 与 ${index.get(b).name} 无父系交集（不同支，或数据尚缺）`,
  };
}

function buildTree(members) {
  const index = new Map(members.map((m) => [m.id, m]));
  const children = new Map();
  const roots = [];
  for (const m of members) {
    if (m.parentId && index.has(m.parentId)) {
      if (!children.has(m.parentId)) children.set(m.parentId, []);
      children.get(m.parentId).push(m.id);
    } else {
      roots.push(m.id);
    }
  }
  const node = (id, generation) => {
    const m = index.get(id);
    return {
      id,
      name: m.name,
      generation,
      birthDate: m.birthDate || null,
      isHighlight: Boolean(m.isHighlight),
      spouse: m.spouseId && index.has(m.spouseId) ? index.get(m.spouseId).name : null,
      children: (children.get(id) || []).map((c) => node(c, generation + 1)),
    };
  };
  return roots.map((r) => node(r, 1));
}

function renderTreeText(nodes, depth = 0) {
  return nodes
    .map((n) => {
      const star = n.isHighlight ? ' ⭐' : '';
      const bd = n.birthDate ? ` (${n.birthDate})` : '';
      const sp = n.spouse ? ` ＝ ${n.spouse}` : '';
      return (
        `${'    '.repeat(depth)}- ${n.name}${bd}${sp}${star}` +
        (n.children.length ? `\n${renderTreeText(n.children, depth + 1)}` : '')
      );
    })
    .join('\n');
}

function pendingOf(m) {
  const missing = [];
  if (PENDING_NAME_MARKERS.some((k) => (m.name || '').includes(k))) missing.push('name');
  if (!(m.birthDate || '').trim()) missing.push('birthDate');
  if (!(m.biography || '').trim()) missing.push('biography');
  return missing;
}

// ─────────────────────────── Schema ───────────────────────────

const MemberSummary = z.object({
  id: z.string(),
  name: z.string(),
  gender: z.enum(['male', 'female', 'other']),
  birthDate: z.string().nullable(),
  address: z.string().nullable(),
  parentId: z.string().nullable(),
  spouseId: z.string().nullable(),
  isHighlight: z.boolean(),
  hasBiography: z.boolean(),
});

const MemberFull = MemberSummary.extend({
  biography: z.string(),
  isMarried: z.boolean(),
  isDeleted: z.boolean(),
});

const TreeNode = z.lazy(() =>
  z.object({
    id: z.string(),
    name: z.string(),
    generation: z.number().int(),
    birthDate: z.string().nullable(),
    isHighlight: z.boolean(),
    spouse: z.string().nullable(),
    children: z.array(TreeNode),
  })
);

const textAndStructured = (structured, text) => ({
  content: [{ type: 'text', text }],
  structuredContent: structured,
});

// ─────────────────────────── Server ───────────────────────────

export function createZupuMcpServer(db) {
  const server = new McpServer(
    { name: 'zupu', version: '1.0.0' },
    {
      instructions: [
        '这是一份中国式家族族谱（華夏族譜錄）。成员以 id 标识，父系通过 parentId 串联，配偶通过 spouseId 双向关联。',
        '读取前先用 list_members 或 get_lineage_tree 了解全貌；id 不可猜测。',
        '志传（biography）常来自长辈口述，是不可再生的记录：upsert_member 采用合并语义，只更新你传入的字段，绝不会清空未传的字段。',
        '删除在这里只有归档（archive_member，可用 restore_member 还原），没有不可逆的抹除。',
        '姓名中含「待补」「佚名」「名讳」表示尚未考证，list_pending 可列出所有待考项。',
      ].join('\n'),
    }
  );

  // ── 只读 ──────────────────────────────────────────────

  server.registerTool(
    'list_members',
    {
      title: '列出在谱成员',
      description:
        '列出全部在谱成员的摘要（不含志传正文，不含已归档者）。用于了解族谱规模与取得成员 id。',
      inputSchema: {},
      outputSchema: { members: z.array(MemberSummary), total: z.number().int() },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const members = (await loadAll(db)).map(summarize);
      const text = members
        .map((m) => `${m.id}  ${m.name}${m.birthDate ? ` (${m.birthDate})` : ''}${m.isHighlight ? ' ⭐' : ''}`)
        .join('\n');
      return textAndStructured({ members, total: members.length }, text || '（族谱为空）');
    }
  );

  server.registerTool(
    'get_member',
    {
      title: '查看成员完整记录',
      description: '按 id 取得一名成员的完整记录，含志传全文。已归档者也可查看。',
      inputSchema: { id: z.string().describe('成员 id，可由 list_members 取得') },
      outputSchema: { member: MemberFull.nullable() },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      const m = await loadOne(db, id);
      if (!m) return textAndStructured({ member: null }, `未找到 id 为 ${id} 的成员`);
      const full = {
        ...summarize(m),
        biography: m.biography || '',
        isMarried: Boolean(m.isMarried),
        isDeleted: Boolean(m.isDeleted),
      };
      const text = [
        `${m.name}（${m.id}）${m.isDeleted ? '【已归档】' : ''}`,
        m.birthDate ? `生于 ${m.birthDate}` : null,
        m.address ? `籍贯 ${m.address}` : null,
        m.biography ? `\n${m.biography}` : '（尚无志传）',
      ]
        .filter(Boolean)
        .join('\n');
      return textAndStructured({ member: full }, text);
    }
  );

  server.registerTool(
    'search_members',
    {
      title: '检索成员',
      description: '在姓名、籍贯、志传中做子串检索（不区分大小写）。返回摘要。',
      inputSchema: {
        query: z.string().min(1).describe('关键词'),
        limit: z.number().int().min(1).max(50).default(10),
      },
      outputSchema: { members: z.array(MemberSummary), total: z.number().int() },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ query, limit }) => {
      const q = query.toLowerCase();
      const hits = (await loadAll(db)).filter((m) =>
        [m.name, m.address, m.biography].filter(Boolean).join(' ').toLowerCase().includes(q)
      );
      const members = hits.slice(0, limit).map(summarize);
      const text = members.map((m) => `${m.id}  ${m.name}`).join('\n');
      return textAndStructured(
        { members, total: hits.length },
        text || `没有成员匹配「${query}」`
      );
    }
  );

  server.registerTool(
    'get_lineage_tree',
    {
      title: '查看世系树',
      description: '以树形返回整部族谱的父系世系，从始祖起逐代展开，附配偶与出生年。',
      inputSchema: {},
      outputSchema: { roots: z.array(TreeNode) },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const roots = buildTree(await loadAll(db));
      return textAndStructured({ roots }, renderTreeText(roots) || '（族谱为空）');
    }
  );

  server.registerTool(
    'get_ancestors',
    {
      title: '上溯直系祖先',
      description: '列出某成员的父系直系祖先链，从其本人到能追溯的最早一代。',
      inputSchema: { id: z.string() },
      outputSchema: {
        chain: z.array(z.object({ id: z.string(), name: z.string(), generationsAbove: z.number().int() })),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      const members = await loadAll(db);
      const index = new Map(members.map((m) => [m.id, m]));
      if (!index.has(id)) return textAndStructured({ chain: [] }, `未找到 id 为 ${id} 的在谱成员`);
      const chain = ancestorChain(id, index).map((cid, i) => ({
        id: cid,
        name: index.get(cid).name,
        generationsAbove: i,
      }));
      const text = chain.map((c) => `${'  '.repeat(c.generationsAbove)}${c.name}`).join('\n');
      return textAndStructured({ chain }, text);
    }
  );

  server.registerTool(
    'get_kinship',
    {
      title: '推算两人亲属关系',
      description:
        '依父系世系推算两名成员的关系：直系尊长 / 直系卑亲 / 旁系（含共同祖先与各自代数）/ 无交集。',
      inputSchema: { idA: z.string(), idB: z.string() },
      outputSchema: {
        relation: z.enum(['lineal_ascendant', 'lineal_descendant', 'collateral', 'unrelated']),
        commonAncestorId: z.string().nullable(),
        generationsA: z.number().int().nullable(),
        generationsB: z.number().int().nullable(),
        description: z.string(),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ idA, idB }) => {
      const members = await loadAll(db);
      const index = new Map(members.map((m) => [m.id, m]));
      if (!index.has(idA) || !index.has(idB)) {
        return {
          content: [{ type: 'text', text: '有成员 id 不存在或已归档' }],
          isError: true,
        };
      }
      const result = computeKinship(idA, idB, index);
      return textAndStructured(result, result.description);
    }
  );

  server.registerTool(
    'list_pending',
    {
      title: '列出待考成员',
      description:
        '列出资料不全的成员：姓名待考（含「待补」「佚名」「名讳」）、缺出生年、缺志传。用于安排口述采访的优先级。',
      inputSchema: {},
      outputSchema: {
        pending: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            missing: z.array(z.enum(['name', 'birthDate', 'biography'])),
          })
        ),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const pending = (await loadAll(db))
        .map((m) => ({ id: m.id, name: m.name, missing: pendingOf(m) }))
        .filter((p) => p.missing.length > 0);
      const text = pending.map((p) => `${p.id}  ${p.name}  缺: ${p.missing.join(', ')}`).join('\n');
      return textAndStructured({ pending }, text || '（无待考项，资料齐全）');
    }
  );

  // ── 写入 ──────────────────────────────────────────────

  server.registerTool(
    'upsert_member',
    {
      title: '新增或更新成员',
      description:
        '新增成员，或按 id 合并更新已有成员。合并语义：只覆盖你传入的字段，未传入的字段原样保留——尤其不会清空已有志传。' +
        '新增时 name 必填；更新时可只传要改的字段。',
      inputSchema: {
        id: z.string().describe('成员 id。新增时自拟（建议拼音，如 yuan-yeye）'),
        name: z.string().optional(),
        gender: z.enum(['male', 'female', 'other']).optional(),
        birthDate: z.string().optional().describe('YYYY 或 YYYY-MM-DD'),
        address: z.string().optional().describe('籍贯 / 住址'),
        parentId: z.string().nullable().optional().describe('父辈 id；始祖传 null'),
        spouseId: z.string().nullable().optional(),
        biography: z.string().optional().describe('志传，Markdown'),
        isHighlight: z.boolean().optional().describe('是否标为显赫宗亲'),
        isMarried: z.boolean().optional(),
      },
      outputSchema: { member: MemberFull, created: z.boolean() },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (input) => {
      const existing = await loadOne(db, input.id);
      if (!existing && !input.name) {
        return { content: [{ type: 'text', text: '新增成员必须提供 name' }], isError: true };
      }
      const base = existing || {
        id: input.id,
        name: '',
        birthDate: '',
        isMarried: false,
        address: '',
        gender: 'other',
        parentId: null,
        spouseId: null,
        biography: '',
        isDeleted: false,
        isHighlight: false,
      };
      const merged = { ...base };
      for (const [k, v] of Object.entries(input)) {
        if (k !== 'id' && v !== undefined) merged[k] = v;
      }
      await saveOne(db, merged);
      const full = {
        ...summarize(merged),
        biography: merged.biography || '',
        isMarried: Boolean(merged.isMarried),
        isDeleted: Boolean(merged.isDeleted),
      };
      return textAndStructured(
        { member: full, created: !existing },
        `${existing ? '已更新' : '已新增'}：${merged.name}（${merged.id}）`
      );
    }
  );

  server.registerTool(
    'archive_member',
    {
      title: '归档成员（移入宗祠秘档）',
      description:
        '把成员移入宗祠秘档（回收站）。这是本系统唯一的"删除"，可用 restore_member 还原，不会抹除任何数据。',
      inputSchema: { id: z.string() },
      outputSchema: { id: z.string(), archived: z.boolean() },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      const m = await loadOne(db, id);
      if (!m) return { content: [{ type: 'text', text: `未找到 id 为 ${id} 的成员` }], isError: true };
      await saveOne(db, { ...m, isDeleted: true });
      return textAndStructured({ id, archived: true }, `已将 ${m.name} 移入宗祠秘档`);
    }
  );

  server.registerTool(
    'restore_member',
    {
      title: '从宗祠秘档还原',
      description: '把已归档的成员还原到在谱状态。',
      inputSchema: { id: z.string() },
      outputSchema: { id: z.string(), restored: z.boolean() },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      const m = await loadOne(db, id);
      if (!m) return { content: [{ type: 'text', text: `未找到 id 为 ${id} 的成员` }], isError: true };
      await saveOne(db, { ...m, isDeleted: false });
      return textAndStructured({ id, restored: true }, `已将 ${m.name} 还原至在谱`);
    }
  );

  return server;
}

/**
 * 挂到 Express 上。无状态：每个请求一套全新的 server + transport，用完即弃。
 *
 * ⚠️ server 必须每请求新建，不能在函数外建一个共用的（2026-09-02 之前就是那么写的）。
 * SDK 的 Protocol.connect() 有硬检查：_transport 已存在就抛
 * "Already connected to a transport"。共用一个 server 时请求串行还撑得住
 * （靠 res.on('close') 及时清空），但两个并发请求里的后一个必然抛错 —— 而
 * Express 4 不接 async 处理器抛出的错误，于是升级成 unhandledRejection，
 * Node 进程退出。容器里 nginx 是另一个进程、照样活着，所以从外面看网页一切正常，
 * 只有 /api 与 /mcp 静默 502。agent 并行发工具调用就会命中，实测 8 并发即中。
 *
 * 规范要求 GET（服务端推送流）与 DELETE（结束会话）也要有响应；无状态模式下
 * 前者无流可开、后者无会话可结束，各回 405 并注明。
 */
export function mountZupuMcp(app, path, db) {
  app.post(path, async (req, res, next) => {
    const server = createZupuMcpServer(db);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    // 请求一结束就把这套拆掉，否则每个请求都留下一个活着的 server
    res.on('close', () => {
      Promise.resolve()
        .then(() => transport.close())
        .then(() => server.close())
        .catch(() => {});
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      // 必须显式转交给错误中间件：Express 4 不会自己接住 async 处理器抛出的错误
      next(err);
    }
  });

  const notInStateless = (_req, res) => {
    res.set('Allow', 'POST').status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: '本服务运行于无状态模式：无服务端推送流，也无会话可结束。' },
      id: null,
    });
  };
  app.get(path, notInStateless);
  app.delete(path, notInStateless);
}
