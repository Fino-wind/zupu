import express from 'express';
import sqlite3 from 'sqlite3';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3001;
const DB_PATH = join(__dirname, 'genealogy.db');

app.use(cors());
app.use(express.json());

// 初始化数据库
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('无法连接到 SQLite 数据库:', err.message);
  } else {
    console.log('已连接到 SQLite 数据库');
    initTable();
  }
});

const INITIAL_DATA = [
  { id: '1', name: '袁鸿儒', birthDate: '1940-01-01', isMarried: true, address: '北京祖籍地', gender: 'male', parentId: null, biography: '袁氏先祖，博学弘志，开创家族之基。', spouseName: '李婉清', isDeleted: false },
  { id: '2', name: '袁希贤', birthDate: '1965-05-20', isMarried: true, address: '上海寓所', gender: 'male', parentId: '1', spouseName: '陈淑慧', isDeleted: false },
  { id: '3', name: '袁静茹', birthDate: '1968-08-12', isMarried: false, address: '杭州西湖', gender: 'female', parentId: '1', isDeleted: false },
  { id: '4', name: '袁思齐', birthDate: '1990-10-10', isMarried: false, address: '广东鹏城', gender: 'male', parentId: '2', isDeleted: false, isHighlight: true, biography: '家族核心人物，承前启后，功绩卓著。' },
  { id: '5', name: '袁嘉懿', birthDate: '1995-02-14', isMarried: false, address: '海外海外', gender: 'female', parentId: '2', isDeleted: false },
];

function initTable() {
  // 创建一个简单的表，存储 ID 和 整个 JSON 对象
  // 这种文档型存储方式在字段变动时非常灵活
  db.run(`CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    json_content TEXT,
    is_deleted INTEGER DEFAULT 0
  )`, (err) => {
    if (err) {
      console.error("创建表失败:", err);
    } else {
      // 检查是否为空，如果为空则插入初始数据
      db.get("SELECT count(*) as count FROM members", (err, row) => {
        if (row && row.count === 0) {
          console.log("数据库为空，正在初始化默认数据...");
          const stmt = db.prepare("INSERT INTO members (id, json_content, is_deleted) VALUES (?, ?, ?)");
          INITIAL_DATA.forEach(member => {
            stmt.run(member.id, JSON.stringify(member), member.isDeleted ? 1 : 0);
          });
          stmt.finalize();
        }
      });
    }
  });
}

// API Routes

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

// 删除成员 (物理删除接口，虽然前端主要用软删除)
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

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});