import express from 'express';
import sqlite3 from 'sqlite3';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const AI_TIMEOUT_MS = 15000;
const VALID_GENDERS = new Set(['male', 'female', 'other']);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const app = express();
const PORT = 3001;
const DB_PATH = process.env.DB_PATH || join(__dirname, 'genealogy.db');

if (DB_PATH !== ':memory:') {
  const dbDir = dirname(DB_PATH);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }
}

app.use(cors());
app.use(express.json({ limit: '512kb' }));

// 初始化数据库
export const db = new sqlite3.Database(DB_PATH);

export const dbReady = new Promise((resolve, reject) => {
  db.on('open', () => {
    console.log(`已连接到 SQLite 数据库: ${DB_PATH}`);
    initTable().then(migrateLegacySpouseNodes).then(resolve).catch(reject);
  });
  db.on('error', (err) => {
    console.error('无法连接到 SQLite 数据库:', err.message);
    reject(err);
  });
});

const INITIAL_DATA = [
  // ...
];

function initTable() {
  return new Promise((resolve, reject) => {
    db.run(
      `CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY,
      json_content TEXT,
      is_deleted INTEGER DEFAULT 0
    )`,
      (err) => {
        if (err) {
          console.error('创建表失败:', err);
          reject(err);
        } else {
          db.get('SELECT count(*) as count FROM members', (err, row) => {
            if (err) {
              reject(err);
              return;
            }
            if (row && row.count === 0) {
              console.log('数据库为空，正在初始化默认数据...');
              const stmt = db.prepare(
                'INSERT INTO members (id, json_content, is_deleted) VALUES (?, ?, ?)'
              );
              INITIAL_DATA.forEach((member) => {
                stmt.run(member.id, JSON.stringify(member), member.isDeleted ? 1 : 0);
              });
              stmt.finalize((err) => {
                if (err) reject(err);
                else resolve();
              });
            } else {
              resolve();
            }
          });
        }
      }
    );
  });
}

function safeParseMember(jsonText) {
  try {
    return JSON.parse(jsonText);
  } catch (error) {
    console.warn('成员数据解析失败，已跳过该记录。', error);
    return null;
  }
}

function normalizeMemberForStorage(member) {
  if (!member || typeof member !== 'object') return member;
  const normalized = { ...member };
  if (Object.prototype.hasOwnProperty.call(normalized, 'spouseName')) {
    delete normalized.spouseName;
  }
  return normalized;
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : 'Unknown error';
}

function validateAiRequestBody(body) {
  if (!body || typeof body !== 'object') {
    return { error: 'Invalid AI request payload' };
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) {
    return { error: 'Prompt is required' };
  }

  return {
    prompt,
    modelName:
      typeof body.modelName === 'string' && body.modelName.trim()
        ? body.modelName.trim()
        : 'gemini-3-flash-preview',
    baseUrl: typeof body.baseUrl === 'string' ? body.baseUrl.trim() : '',
  };
}

function validateMemberPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return { error: 'Invalid member payload' };
  }

  const rawMember = normalizeMemberForStorage(payload);
  const id = typeof rawMember.id === 'string' ? rawMember.id.trim() : '';
  const name = typeof rawMember.name === 'string' ? rawMember.name.trim() : '';
  const gender = typeof rawMember.gender === 'string' ? rawMember.gender : 'other';

  if (!id) {
    return { error: 'Missing member ID' };
  }

  if (!name) {
    return { error: 'Missing member name' };
  }

  if (!VALID_GENDERS.has(gender)) {
    return { error: 'Invalid gender value' };
  }

  return {
    member: {
      id,
      name,
      birthDate: typeof rawMember.birthDate === 'string' ? rawMember.birthDate : '',
      isMarried: Boolean(rawMember.isMarried),
      address: typeof rawMember.address === 'string' ? rawMember.address : '',
      gender,
      parentId:
        typeof rawMember.parentId === 'string' || rawMember.parentId === null
          ? rawMember.parentId
          : null,
      spouseId:
        typeof rawMember.spouseId === 'string' || rawMember.spouseId === null
          ? rawMember.spouseId
          : null,
      biography: typeof rawMember.biography === 'string' ? rawMember.biography : '',
      isDeleted: Boolean(rawMember.isDeleted),
      isHighlight: Boolean(rawMember.isHighlight),
    },
  };
}

async function withTimeout(factory, timeoutMs, timeoutMessage) {
  let timeoutId;
  try {
    return await Promise.race([
      factory(),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

function inferSpouseGender(gender) {
  if (gender === 'male') return 'female';
  if (gender === 'female') return 'male';
  return 'other';
}

function generateSpouseId(baseId, existingIds) {
  let candidate = `spouse-${baseId}`;
  if (!existingIds.has(candidate)) return candidate;
  let index = 1;
  while (existingIds.has(`${candidate}-${index}`)) {
    index += 1;
  }
  return `${candidate}-${index}`;
}

function migrateLegacySpouseNodes() {
  return new Promise((resolve, reject) => {
    db.all('SELECT id, json_content FROM members', [], (err, rows) => {
      if (err) {
        reject(err);
        return;
      }

      const members = [];
      const existingIds = new Set();
      rows.forEach((row) => {
        const member = safeParseMember(row.json_content);
        if (member && member.id) {
          members.push(member);
          existingIds.add(member.id);
        }
      });

      const updates = [];
      const inserts = [];

      members.forEach((member) => {
        if (member.spouseName && !member.spouseId) {
          const spouseId = generateSpouseId(member.id, existingIds);
          existingIds.add(spouseId);

          const spouseMember = {
            id: spouseId,
            name: member.spouseName,
            birthDate: '',
            isMarried: true,
            address: member.address || '',
            gender: inferSpouseGender(member.gender),
            parentId: null,
            isDeleted: false,
            spouseId: member.id,
          };

          const updatedMember = normalizeMemberForStorage({
            ...member,
            spouseId,
            isMarried: true,
          });

          inserts.push(spouseMember);
          updates.push(updatedMember);
        } else if (member.spouseName && member.spouseId) {
          updates.push(normalizeMemberForStorage(member));
        }
      });

      if (updates.length === 0 && inserts.length === 0) {
        resolve();
        return;
      }

      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        const stmt = db.prepare(`
          INSERT INTO members (id, json_content, is_deleted)
          VALUES (?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
          json_content = excluded.json_content,
          is_deleted = excluded.is_deleted
        `);

        updates.forEach((member) => {
          stmt.run(member.id, JSON.stringify(member), member.isDeleted ? 1 : 0);
        });
        inserts.forEach((member) => {
          stmt.run(member.id, JSON.stringify(member), member.isDeleted ? 1 : 0);
        });

        stmt.finalize((err) => {
          if (err) {
            db.run('ROLLBACK');
            reject(err);
          } else {
            db.run('COMMIT', (commitErr) => {
              if (commitErr) reject(commitErr);
              else resolve();
            });
          }
        });
      });
    });
  });
}

// API Routes

// AI Generation Endpoint
app.post('/api/ai/generate', async (req, res) => {
  const requestBody = validateAiRequestBody(req.body);
  if (requestBody.error) {
    res.status(400).json({ error: requestBody.error });
    return;
  }

  const { prompt, modelName, baseUrl } = requestBody;
  const apiKey = process.env.API_KEY;

  if (!apiKey) {
    res.status(500).json({ error: 'Server missing API_KEY configuration' });
    return;
  }

  try {
    if (baseUrl && baseUrl.trim() !== '') {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelName,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
        }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      if (!response.ok) {
        throw new Error(`API Request failed with status ${response.status}`);
      }

      const data = await response.json();
      res.json({ content: data.choices?.[0]?.message?.content || '' });
    } else {
      const ai = new GoogleGenAI({ apiKey });
      const response = await withTimeout(
        () =>
          ai.models.generateContent({
            model: modelName,
            contents: prompt,
          }),
        AI_TIMEOUT_MS,
        'AI request timed out'
      );

      res.json({ content: response.text || '' });
    }
  } catch (error) {
    console.error('AI Generation Error:', error);
    res.status(500).json({ error: getErrorMessage(error) || 'AI generation failed' });
  }
});

// 获取所有成员
app.get('/api/members', (req, res) => {
  db.all('SELECT json_content FROM members', [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    const members = rows.map((row) => safeParseMember(row.json_content)).filter(Boolean);
    res.json(members);
  });
});

// 新增或更新成员 (Upsert)
app.post('/api/members', (req, res) => {
  const validated = validateMemberPayload(req.body);
  if (validated.error) {
    res.status(400).json({ error: validated.error });
    return;
  }
  const { member } = validated;

  const query = `
    INSERT INTO members (id, json_content, is_deleted) 
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
    json_content = excluded.json_content,
    is_deleted = excluded.is_deleted
  `;

  db.run(query, [member.id, JSON.stringify(member), member.isDeleted ? 1 : 0], function (err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ message: 'Success', id: member.id });
  });
});

// 删除成员
app.delete('/api/members/:id', (req, res) => {
  const id = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  if (!id) {
    res.status(400).json({ error: 'Missing member ID' });
    return;
  }
  db.run('DELETE FROM members WHERE id = ?', [id], function (err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ message: 'Deleted', changes: this.changes });
  });
});

// Only listen if not imported for testing
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
  });
}

const shutdown = () => {
  db.close(() => {
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
