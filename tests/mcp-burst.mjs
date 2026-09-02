/**
 * MCP 并发回归守卫 —— 对应 docs/code-map.md §14 ⑬。
 *
 * 背景：/mcp 曾经共用一个 McpServer 单例（2026-09-02 修）。SDK 的 Protocol.connect
 * 有硬检查，_transport 已存在就抛 "Already connected to a transport"；并发时后一个
 * 请求必然抛错，而 Express 4 不接 async 处理器的错误 → unhandledRejection → Node 退出。
 * 容器里 nginx 是另一个进程，所以网页照样 200，只有 /api /mcp 静默 502。
 *
 * ⚠️ 这个 bug 用 curl 测不出来。实测：8 个 curl 进程并发打 initialize，
 * 有 bug 的旧代码也能全部 200 —— 进程 fork 的时间差让它们实际是串行的，
 * res.on('close') 每次都来得及清空 transport。必须满足两个条件才能复现：
 *   ① 单进程 Promise.all 发起（同一个事件循环 tick，真重叠）
 *   ② 用 tools/call 而不是 initialize（要查库，处理时间长，重叠窗口才够大）
 * 满足后旧代码的表现：第 1 个 200，其余全部 ECONNRESET，进程当场退出。
 *
 * 用法：node tests/mcp-burst.mjs [baseUrl] [并发数]
 *   本地  node tests/mcp-burst.mjs http://127.0.0.1:3001 16
 *   CI    node tests/mcp-burst.mjs http://127.0.0.1:8888 16
 */
const baseUrl = process.argv[2] || 'http://127.0.0.1:3001';
const n = Number(process.argv[3] || 16);

const statuses = await Promise.all(
  Array.from({ length: n }, (_, i) =>
    fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: i + 1,
        method: 'tools/call',
        params: { name: 'list_members', arguments: {} },
      }),
    })
      .then((r) => String(r.status))
      .catch((e) => `ERR(${e.cause?.code || e.message})`)
  )
);

console.log(`MCP ${n} 并发 tools/call → ${statuses.join(' ')}`);

const bad = statuses.filter((s) => s !== '200');
if (bad.length) {
  console.error(`❌ ${bad.length}/${n} 个请求没拿到 200`);
  process.exit(1);
}

// 真正的判据：并发打完之后后端进程还得活着。
// 旧代码在这一步已经死了，而容器仍然是 Up、网页仍然 200。
const alive = await fetch(`${baseUrl}/api/members`)
  .then((r) => r.ok)
  .catch(() => false);
if (!alive) {
  console.error('❌ 并发之后后端已死 —— P0（MCP 单例）复发了');
  process.exit(1);
}
console.log(`✅ ${n} 并发全部 200，且后端存活`);
