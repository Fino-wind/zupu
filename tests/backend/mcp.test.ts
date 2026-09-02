import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
// @ts-expect-error server.js 是纯 JS，没有类型声明（api.test.ts 同款处理）
import { app, dbReady } from '../../server.js';

// 用官方 SDK 的 client 连自己的 server —— 测的是真实协议往返，不是函数调用
let http: Server;
let client: Client;
const call = async (name: string, args: Record<string, unknown> = {}) =>
  client.callTool({ name, arguments: args }) as Promise<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 各工具返回形状不同，测试里按需下钻
    structuredContent?: Record<string, any>;
    content: { type: string; text?: string }[];
    isError?: boolean;
  }>;

beforeAll(async () => {
  await dbReady;
  await new Promise<void>((resolve) => {
    http = app.listen(0, resolve);
  });
  const port = (http.address() as { port: number }).port;
  client = new Client({ name: 'vitest', version: '0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
});

afterAll(async () => {
  await client.close();
  await new Promise<void>((resolve) => http.close(() => resolve()));
});

describe('MCP · 工具清单符合 Claude connector 审核标准', () => {
  it('10 个工具，全部带 title / annotations / outputSchema，名字 ≤64', async () => {
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(10);
    for (const t of tools) {
      expect(t.title, t.name).toBeTruthy();
      expect(t.annotations, t.name).toBeDefined();
      expect('readOnlyHint' in (t.annotations ?? {}), t.name).toBe(true);
      expect(t.outputSchema, t.name).toBeDefined();
      expect(t.name.length).toBeLessThanOrEqual(64);
    }
  });

  it('工具顺序确定（利于客户端缓存）', async () => {
    const a = (await client.listTools()).tools.map((t) => t.name);
    const b = (await client.listTools()).tools.map((t) => t.name);
    expect(a).toEqual(b);
  });

  it('归档是唯一标了 destructiveHint 的工具', async () => {
    const { tools } = await client.listTools();
    const destructive = tools.filter((t) => t.annotations?.destructiveHint).map((t) => t.name);
    expect(destructive).toEqual(['archive_member']);
  });
});

describe('MCP · 读写闭环', () => {
  it('upsert 三代 → 树 / 称谓 / 上溯 / 待考 / 检索', async () => {
    let r = await call('upsert_member', { id: 'gz', name: '示例·高祖', gender: 'male', birthDate: '1900', parentId: null, isHighlight: true });
    expect(r.structuredContent?.created).toBe(true);
    await call('upsert_member', { id: 'zf', name: '示例·祖父', gender: 'male', parentId: 'gz', biography: '口述志传第一版' });
    await call('upsert_member', { id: 'fq', name: '示例·父', gender: 'male', parentId: 'zf' });
    await call('upsert_member', { id: 'sf', name: '示例·叔父', gender: 'male', parentId: 'zf' });

    r = await call('get_lineage_tree');
    expect(r.structuredContent?.roots[0].children[0].children).toHaveLength(2);

    r = await call('get_kinship', { idA: 'gz', idB: 'fq' });
    expect(r.structuredContent?.relation).toBe('lineal_ascendant');
    expect(r.structuredContent?.generationsB).toBe(2); // 父→祖父→高祖，两代

    r = await call('get_kinship', { idA: 'fq', idB: 'sf' });
    expect(r.structuredContent?.relation).toBe('collateral');
    expect(r.structuredContent?.commonAncestorId).toBe('zf');

    r = await call('get_ancestors', { id: 'fq' });
    expect(r.structuredContent?.chain.map((c: { id: string }) => c.id)).toEqual(['fq', 'zf', 'gz']);

    r = await call('list_pending');
    // 此时祖父尚未补 birthDate，四人各缺一两项，全在待考清单里
    expect(r.structuredContent?.pending).toHaveLength(4);

    r = await call('search_members', { query: '祖' });
    expect(r.structuredContent?.total).toBe(2);
  });

  it('upsert 是合并语义：只传 birthDate 不能清空已有志传', async () => {
    const r = await call('upsert_member', { id: 'zf', birthDate: '1930' });
    expect(r.structuredContent?.created).toBe(false);
    expect(r.structuredContent?.member.biography).toBe('口述志传第一版');
    expect(r.structuredContent?.member.birthDate).toBe('1930');
  });

  it('归档不是删除：仍可查、可还原', async () => {
    let r = await call('archive_member', { id: 'sf' });
    expect(r.structuredContent?.archived).toBe(true);
    r = await call('list_members');
    expect(r.structuredContent?.total).toBe(3);
    r = await call('get_member', { id: 'sf' });
    expect(r.structuredContent?.member.isDeleted).toBe(true);
    r = await call('restore_member', { id: 'sf' });
    expect(r.structuredContent?.restored).toBe(true);
    r = await call('list_members');
    expect(r.structuredContent?.total).toBe(4);
  });

  it('错误走 isError，不抛协议级异常', async () => {
    let r = await call('get_kinship', { idA: 'gz', idB: 'nope' });
    expect(r.isError).toBe(true);
    r = await call('upsert_member', { id: 'new-no-name' });
    expect(r.isError).toBe(true);
  });
});

describe('MCP · 无状态传输', () => {
  it('GET / DELETE 返回 405 并说明原因', async () => {
    const port = (http.address() as { port: number }).port;
    for (const method of ['GET', 'DELETE']) {
      const res = await fetch(`http://127.0.0.1:${port}/mcp`, { method });
      expect(res.status, method).toBe(405);
      expect(res.headers.get('allow')).toBe('POST');
    }
  });
});
