import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
// @ts-expect-error Mocking module import
import { app, db, dbReady } from '../../server.js';
import sqlite3 from 'sqlite3'; // eslint-disable-line @typescript-eslint/no-unused-vars

// ...

describe('Backend API', () => {
  // Wait for DB init
  beforeAll(async () => {
    await dbReady;
  });

  // Clear members table before each test to ensure isolation
  beforeEach(async () => {
    await new Promise<void>((resolve, reject) => {
      db.run('DELETE FROM members', (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => db.close(() => resolve()));
  });

  it('GET /api/members should return empty array initially', async () => {
    const res = await request(app).get('/api/members');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(0);
  });

  it('POST /api/members should create a new member', async () => {
    const member = {
      id: 'test-1',
      name: 'Test Member',
      birthDate: '2000-01-01',
      isMarried: false,
      address: 'Test Address',
      gender: 'male',
      parentId: null,
      isDeleted: false,
    };

    const res = await request(app).post('/api/members').send(member);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('test-1');

    // Verify it exists
    const getRes = await request(app).get('/api/members');
    expect(getRes.body.length).toBe(1);
    expect(getRes.body[0].name).toBe('Test Member');
  });

  it('DELETE /api/members/:id 应移入回收站而非物理删除', async () => {
    // Insert first
    const member = {
      id: 'del-1',
      name: 'To Delete',
      gender: 'female',
      birthDate: '1990-01-01',
      isDeleted: false,
      address: '',
      isMarried: false,
      parentId: null,
    };
    await request(app).post('/api/members').send(member);

    const delRes = await request(app).delete('/api/members/del-1');
    expect(delRes.status).toBe(200);

    // 记录必须还在（族谱数据不可再生，删除只应是"移入宗祠秘档"）
    const getRes = await request(app).get('/api/members');
    expect(getRes.body.length).toBe(1);
    expect(getRes.body[0].id).toBe('del-1');
    expect(getRes.body[0].isDeleted).toBe(true);
  });

  it('DELETE 不存在的成员应返回 404', async () => {
    const res = await request(app).delete('/api/members/does-not-exist');
    expect(res.status).toBe(404);
  });

  it('自定义 AI baseUrl 不在白名单时必须被拒绝（防止服务端密钥被转发给任意地址）', async () => {
    const res = await request(app)
      .post('/api/ai/generate')
      .send({ prompt: 'hi', baseUrl: 'http://attacker.example.com' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('允许列表');
  });

  it('服务端配置的默认端点应自动可信（它来自 .env，不是请求方可控输入）', async () => {
    process.env.AI_DEFAULT_BASE_URL = 'https://gateway.internal/v1';
    try {
      const res = await request(app)
        .post('/api/ai/generate')
        .send({ prompt: 'hi', baseUrl: 'https://gateway.internal/v1' });
      // 不该被白名单拦下（400）；没有真实 key 时会走到后面的 500，那是另一回事
      expect(res.status).not.toBe(400);
    } finally {
      delete process.env.AI_DEFAULT_BASE_URL;
    }
  });

  it('自带密钥时可使用任意端点（白名单只约束"花服务端的钱"）', async () => {
    // 端口 1 上不会有服务，连接被立即拒绝——这里要断言的是"没被白名单挡在门外"，
    // 不是"能连上"。用能立即失败的地址，避免走 DNS 把测试拖到超时。
    const res = await request(app).post('/api/ai/generate').send({
      prompt: 'hi',
      baseUrl: 'http://127.0.0.1:1/v1',
      apiKey: 'user-supplied-key',
    });
    expect(res.status).not.toBe(400);
    expect(res.status).toBe(500); // 放行了，然后才因为连不上而失败
  }, 20000);

  it('未带密钥时，非白名单端点仍必须拒绝', async () => {
    const res = await request(app)
      .post('/api/ai/generate')
      .send({ prompt: 'hi', baseUrl: 'http://attacker.example.com' });
    expect(res.status).toBe(400);
  });

  it('两边都没有密钥时，报错要同时指出两条出路', async () => {
    const saved = process.env.API_KEY;
    delete process.env.API_KEY;
    try {
      const res = await request(app).post('/api/ai/generate').send({ prompt: 'hi' });
      expect(res.status).toBe(500);
      expect(res.body.error).toContain('界面');
      expect(res.body.error).toContain('.env');
    } finally {
      if (saved !== undefined) process.env.API_KEY = saved;
    }
  });

  it('超长 prompt 应被拒绝', async () => {
    const res = await request(app)
      .post('/api/ai/generate')
      .send({ prompt: 'x'.repeat(9000) });
    expect(res.status).toBe(400);
  });

  it('POST /api/members should update existing member (Upsert)', async () => {
    const member = {
      id: 'up-1',
      name: 'Original',
      gender: 'male',
      birthDate: '1990-01-01',
      isDeleted: false,
      address: '',
      isMarried: false,
      parentId: null,
    };
    await request(app).post('/api/members').send(member);

    const updated = { ...member, name: 'Updated Name' };
    await request(app).post('/api/members').send(updated);

    const getRes = await request(app).get('/api/members');
    expect(getRes.body.length).toBe(1);
    expect(getRes.body[0].name).toBe('Updated Name');
  });

  it('POST /api/members should reject invalid payloads', async () => {
    const res = await request(app).post('/api/members').send({ id: '', name: '' });
    expect(res.status).toBe(400);
  });

  it('POST /api/ai/generate should validate prompt before processing', async () => {
    const res = await request(app).post('/api/ai/generate').send({ prompt: '' });
    expect(res.status).toBe(400);
  });
});
