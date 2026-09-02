import express from 'express';
import sqlite3 from 'sqlite3';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { generateText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import dotenv from 'dotenv';
import { mountZupuMcp } from './mcp.js';

dotenv.config();

const AI_TIMEOUT_MS = 15000;
const MAX_PROMPT_LENGTH = 8000;
const VALID_GENDERS = new Set(['male', 'female', 'other']);

// 本地开发默认放行的来源（Vite 5021 / 预览 4173 / 容器内 nginx 8888）
const DEFAULT_DEV_ORIGINS = [
  'http://localhost:5021',
  'http://127.0.0.1:5021',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:8888',
  'http://127.0.0.1:8888',
];

/**
 * 无论密钥属于谁，都不允许服务端去请求的地址。
 *
 * 只堵一类：link-local（169.254/16 与 fe80::/10）。云厂商的实例元数据服务
 * 就挂在 169.254.169.254 上，一次请求就能换到该主机的云凭据——那是比本项目
 * 全部数据加起来更大的损失，且没有任何正当用途需要从这里访问它。
 *
 * 🔴 私有网段（192.168/10/172.16-31）和 localhost 是【故意放行】的：
 * 本项目的典型部署就是家里那台机器指向同一内网的自建网关或本机模型服务，
 * 把它们一并封掉等于砍掉主场景。这是知情的取舍，不是遗漏。
 * ⚠️ 因此这不能挡住 DNS rebinding（域名解析到内网）。真要部署到公网，
 * 请按 README「安全须知」在前面加一层鉴权——那才是这个项目的边界。
 */
function isBlockedHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  // IPv4 link-local: 169.254.0.0/16（含云元数据 169.254.169.254）
  if (/^169\.254\./.test(host)) return true;
  // IPv6 link-local: fe80::/10
  if (/^fe[89ab][0-9a-f]:/.test(host)) return true;
  // 各云厂商的元数据域名
  if (host === 'metadata.google.internal' || host === 'metadata') return true;
  return false;
}

/**
 * 自定义 AI 端点白名单。
 * 不设白名单时一律拒绝自定义 baseUrl —— 因为服务端会带着自己的 API_KEY 去请求它，
 * 任何人传一个自己控制的地址就能把密钥拿走（SSRF + 凭据外泄）。
 * 需要用第三方兼容端点时，在 .env 里写：
 *   AI_ALLOWED_BASE_URLS=https://openrouter.ai/api/v1,https://api.deepseek.com/v1
 */
function isAllowedBaseUrl(baseUrl) {
  const allowed = (process.env.AI_ALLOWED_BASE_URLS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  // 服务端自己配的默认端点天然可信（来自 .env，不是请求方能控制的输入）
  const configuredDefault = (process.env.AI_DEFAULT_BASE_URL || '').trim();
  if (configuredDefault) allowed.push(configuredDefault);
  if (allowed.length === 0) return false;

  let target;
  try {
    target = new URL(baseUrl);
  } catch {
    return false;
  }
  if (target.protocol !== 'https:' && target.protocol !== 'http:') return false;

  return allowed.some((entry) => {
    try {
      return new URL(entry).origin === target.origin;
    } catch {
      return false;
    }
  });
}

/**
 * 把「用哪家 AI」收敛成一处。
 *
 * 换供应商 = 换这张表里的一行，业务代码只认 generateText。
 * 之所以只列两条就够：@ai-sdk/openai-compatible 覆盖了所有 OpenAI 兼容端点
 * ——自建网关（new-api / one-api）、llama.cpp、Ollama、OpenRouter、DeepSeek、
 * Mistral、月之暗面等都属此列，不需要一家装一个包。
 *
 * 选择顺序：
 *   1. 请求里带 baseUrl（且通过白名单校验）→ 该端点
 *   2. 服务端配了 AI_DEFAULT_BASE_URL       → 默认网关（用户无需在界面填）
 *   3. 都没有                                → Google Gemini 直连
 */
function resolveModel({ modelName, baseUrl, apiKey }) {
  const endpoint = (baseUrl || process.env.AI_DEFAULT_BASE_URL || '').trim();

  if (endpoint) {
    const gateway = createOpenAICompatible({
      name: 'gateway',
      baseURL: endpoint,
      apiKey,
    });
    return gateway(modelName);
  }

  const google = createGoogleGenerativeAI({ apiKey });
  return google(modelName);
}

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

// CORS 白名单。默认只放行同源与本地开发端口；
// 原先是无参数 cors()，等于 Access-Control-Allow-Origin: *，
// 任何网页的脚本都能读写本机族谱（配合无鉴权，风险不只是"被看到"）。
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // 无 Origin 头 = 同源请求 / curl / 服务端调用，放行
      if (!origin) return callback(null, true);
      if (DEFAULT_DEV_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Origin not allowed'));
    },
  })
);
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
    return { error: 'AI 请求格式不正确' };
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) {
    return { error: '请求缺少 prompt 内容' };
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return { error: `请求内容过长（上限 ${MAX_PROMPT_LENGTH} 字）` };
  }

  const baseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim() : '';
  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';

  // 硬性阻断先于一切：自带密钥也不能让服务端去访问云元数据地址
  if (baseUrl) {
    let parsed;
    try {
      parsed = new URL(baseUrl);
    } catch {
      return { error: 'AI 端点地址格式不正确' };
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { error: 'AI 端点必须是 http 或 https 地址' };
    }
    if (isBlockedHost(parsed.hostname)) {
      return { error: '该地址不允许访问' };
    }
  }

  // 白名单只约束「花服务端的钱」这种情况。
  // 自带密钥时放行任意端点——用自己的钥匙开自己想开的门，本来就不该由服务端裁决；
  // 而白名单存在的理由（别人拿服务端的 API_KEY 去打他控制的地址）此时并不成立。
  if (baseUrl && !apiKey && !isAllowedBaseUrl(baseUrl)) {
    return {
      error:
        '该 AI 端点不在允许列表中。你可以在界面里填入自己的 API 密钥后使用任意端点；' +
        '若想让所有人共用服务端密钥访问该端点，请在 .env 的 AI_ALLOWED_BASE_URLS 中登记。',
    };
  }

  return {
    prompt,
    apiKey,
    modelName:
      typeof body.modelName === 'string' && body.modelName.trim()
        ? body.modelName.trim()
        : process.env.AI_DEFAULT_MODEL || 'gemini-3-flash-preview',
    baseUrl,
  };
}

function validateMemberPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return { error: '成员数据格式不正确' };
  }

  const rawMember = normalizeMemberForStorage(payload);
  const id = typeof rawMember.id === 'string' ? rawMember.id.trim() : '';
  const name = typeof rawMember.name === 'string' ? rawMember.name.trim() : '';
  const gender = typeof rawMember.gender === 'string' ? rawMember.gender : 'other';

  if (!id) {
    return { error: '缺少成员 ID' };
  }

  if (!name) {
    return { error: '缺少成员姓名' };
  }

  if (!VALID_GENDERS.has(gender)) {
    return { error: '性别取值不合法' };
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

  const { prompt, modelName, baseUrl, apiKey: userApiKey } = requestBody;

  // 自带密钥优先。这样同一个部署既能"管理员配一次、全家共用"，
  // 也能"每人用自己的额度"，两种用法不必二选一。
  const apiKey = userApiKey || process.env.API_KEY;

  if (!apiKey) {
    res.status(500).json({
      error:
        '没有可用的 AI 密钥。二选一：① 在界面的「AI 模型配置」里填入你自己的 API 密钥' +
        '（只存在本浏览器）；② 由部署者在服务端 .env 中设置 API_KEY 后重启服务。',
    });
    return;
  }

  try {
    const { text } = await generateText({
      model: resolveModel({ modelName, baseUrl, apiKey }),
      prompt,
      temperature: 0.7,
      timeout: AI_TIMEOUT_MS,
      maxRetries: 1,
    });
    res.json({ content: text || '' });
  } catch (error) {
    console.error('AI Generation Error:', error);
    res.status(500).json({ error: getErrorMessage(error) || 'AI 生成失败' });
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

// 移入宗祠秘档（软删除）
//
// 这里过去执行的是 DELETE FROM members —— 物理删除、不可恢复。
// 而前端从来不调用它：UI 上的"删除"走的是 POST upsert + isDeleted=true，
// 也就是"宗祠秘档"回收站。换句话说，界面精心保护了数据，
// 后端却敞着一个能绕过回收站、把人永久抹掉的接口，且没有任何鉴权。
// 族谱是不可再生的记录，这里改为与前端一致的软删除：进回收站，可还原。
app.delete('/api/members/:id', (req, res) => {
  const id = typeof req.params.id === 'string' ? req.params.id.trim() : '';
  if (!id) {
    res.status(400).json({ error: '缺少成员 ID' });
    return;
  }

  db.get('SELECT json_content FROM members WHERE id = ?', [id], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (!row) {
      res.status(404).json({ error: '未找到该成员' });
      return;
    }

    const member = safeParseMember(row.json_content);
    if (!member) {
      res.status(500).json({ error: '成员数据已损坏，无法处理' });
      return;
    }

    const archived = { ...member, isDeleted: true };
    db.run(
      'UPDATE members SET json_content = ?, is_deleted = 1 WHERE id = ?',
      [JSON.stringify(archived), id],
      function (updateErr) {
        if (updateErr) {
          res.status(500).json({ error: updateErr.message });
          return;
        }
        res.json({ message: 'Archived', id, changes: this.changes });
      }
    );
  });
});

// MCP：让任何 agent 通过 Streamable HTTP 读写族谱。见 mcp.js 顶部说明。
mountZupuMcp(app, '/mcp', db);

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
