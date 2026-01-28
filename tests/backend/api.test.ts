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
      db.run("DELETE FROM members", (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>(resolve => db.close(() => resolve()));
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
      isDeleted: false
    };

    const res = await request(app).post('/api/members').send(member);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('test-1');

    // Verify it exists
    const getRes = await request(app).get('/api/members');
    expect(getRes.body.length).toBe(1);
    expect(getRes.body[0].name).toBe('Test Member');
  });

  it('DELETE /api/members/:id should remove member', async () => {
    // Insert first
    const member = { id: 'del-1', name: 'To Delete', gender: 'female', birthDate: '1990-01-01', isDeleted: false, address: '', isMarried: false, parentId: null };
    await request(app).post('/api/members').send(member);

    const delRes = await request(app).delete('/api/members/del-1');
    expect(delRes.status).toBe(200);

    const getRes = await request(app).get('/api/members');
    expect(getRes.body.length).toBe(0);
  });
  
  it('POST /api/members should update existing member (Upsert)', async () => {
     const member = { id: 'up-1', name: 'Original', gender: 'male', birthDate: '1990-01-01', isDeleted: false, address: '', isMarried: false, parentId: null };
     await request(app).post('/api/members').send(member);
     
     const updated = { ...member, name: 'Updated Name' };
     await request(app).post('/api/members').send(updated);
     
     const getRes = await request(app).get('/api/members');
     expect(getRes.body.length).toBe(1);
     expect(getRes.body[0].name).toBe('Updated Name');
  });
});
