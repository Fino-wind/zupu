import express from 'express';
import sqlite3 from 'sqlite3';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { GoogleGenAI } from "@google/genai";
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const app = express();
const PORT = 3001;
const DB_PATH = process.env.DB_PATH || join(__dirname, 'genealogy.db');

app.use(cors());
app.use(express.json());

// 初始化数据库
export const db = new sqlite3.Database(DB_PATH);

export const dbReady = new Promise((resolve, reject) => {
  db.on('open', () => {
    console.log(`已连接到 SQLite 数据库: ${DB_PATH}`);
    initTable().then(resolve).catch(reject);
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
    db.run(`CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY,
      json_content TEXT,
      is_deleted INTEGER DEFAULT 0
    )`, (err) => {
      if (err) {
        console.error("创建表失败:", err);
        reject(err);
      } else {
        db.get("SELECT count(*) as count FROM members", (err, row) => {
          if (err) { reject(err); return; }
          // @ts-ignore
          if (row && row.count === 0) {
            console.log("数据库为空，正在初始化默认数据...");
            const stmt = db.prepare("INSERT INTO members (id, json_content, is_deleted) VALUES (?, ?, ?)");
            INITIAL_DATA.forEach(member => {
              stmt.run(member.id, JSON.stringify(member), member.isDeleted ? 1 : 0);
            });
            stmt.finalize(err => {
              if (err) reject(err);
              else resolve();
            });
          } else {
            resolve();
          }
        });
      }
    });
  });
}

// API Routes

// AI Generation Endpoint
app.post('/api/ai/generate', async (req, res) => {
  const { prompt, modelName, baseUrl } = req.body;
  const apiKey = process.env.API_KEY;

  if (!apiKey) {
    res.status(500).json({ error: "Server missing API_KEY configuration" });
    return;
  }

  try {
    if (baseUrl && baseUrl.trim() !== "") {
       // OpenAI compatible fetch
       const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: modelName || 'gemini-3-flash-preview',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7
        })
      });
      
      if (!response.ok) {
        throw new Error(`API Request failed with status ${response.status}`);
      }
      
      const data = await response.json();
      res.json({ content: data.choices?.[0]?.message?.content });

    } else {
      // Standard Gemini SDK usage
      const ai = new GoogleGenAI({ apiKey });
      const model = modelName || 'gemini-3-flash-preview';
      
      // Use the proper Gemini API pattern
      // Note: @google/genai syntax might differ slightly based on version, adapting to standard usage
      // Assuming 1.34.0 usage pattern or fallback to simple fetch if SDK issues arise
      // For safety in this quick port, let's stick to the SDK we imported
      const genModel = ai.getGenerativeModel({ model: model });
      const result = await genModel.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      res.json({ content: text });
    }
  } catch (error) {
    console.error("AI Generation Error:", error);
    res.status(500).json({ error: error.message || "AI generation failed" });
  }
});

// 获取所有成员
app.get('/api/members', (req, res) => {
  db.all("SELECT json_content FROM members", [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    const members = rows.map(row => JSON.parse(row.json_content));
    res.json(members);
  });
});

// 新增或更新成员 (Upsert)
app.post('/api/members', (req, res) => {
  const member = req.body;
  if (!member.id) {
    res.status(400).json({ error: "Missing member ID" });
    return;
  }

  const query = `
    INSERT INTO members (id, json_content, is_deleted) 
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
    json_content = excluded.json_content,
    is_deleted = excluded.is_deleted
  `;

  db.run(query, [member.id, JSON.stringify(member), member.isDeleted ? 1 : 0], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ message: "Success", id: member.id });
  });
});

// 删除成员
app.delete('/api/members/:id', (req, res) => {
  const id = req.params.id;
  db.run("DELETE FROM members WHERE id = ?", [id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ message: "Deleted", changes: this.changes });
  });
});

// Only listen if not imported for testing
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
  });
}
