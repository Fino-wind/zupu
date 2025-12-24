# 华夏族谱录 - 项目报告

## 一、项目背景

### 1.1 问题提出

中华民族有着悠久的家族文化传统，族谱是记录家族血脉传承的重要载体。然而，传统的纸质族谱存在以下问题：

- **保存困难**：纸质材料易损坏、丢失
- **更新不便**：新增家庭成员需要重新修订族谱
- **查询低效**：人工查找亲缘关系耗时耗力
- **传承受限**：年轻一代对传统族谱缺乏兴趣

### 1.2 项目目标

本项目旨在利用现代Web技术，打造一个兼具**实用性**和**文化韵味**的数字化族谱管理系统：

1. **数字化保存**：将族谱信息存储在云端/本地数据库
2. **可视化展示**：使用D3.js力导向图呈现家族关系网络
3. **智能化分析**：集成AI自动分析复杂亲缘关系
4. **易用性设计**：提供简洁直观的操作界面

---

## 二、技术方案

### 2.1 技术栈选型

| 层级 | 技术 | 说明 |
|------|------|------|
| **前端框架** | React 19 + TypeScript | 组件化开发，类型安全 |
| **可视化** | D3.js | 强大的数据可视化能力 |
| **样式** | TailwindCSS | 快速构建古风UI |
| **构建工具** | Vite | 快速的开发构建体验 |
| **后端** | Node.js + Express | 轻量级RESTful API |
| **数据库** | SQLite | 轻量级，无需额外部署 |
| **AI服务** | Google Gemini API | 智能关系分析与传记生成 |
| **容器化** | Docker + Nginx | 一键部署方案 |

### 2.2 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                     前端 (React)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  FamilyGraph │  │ DetailsModal │  │  Settings    │  │
│  │   (D3.js)    │  │  (编辑面板)  │  │  (AI配置)    │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│         │                     │                     │      │
│         └─────────────────────┴─────────────────────┘     │
│                              │                            │
└──────────────────────────────┼────────────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │   API Service Layer │
                    │   (useGenealogy)    │
                    └──────────┬──────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
┌───────▼────────┐    ┌────────▼────────┐    ┌────────▼────────┐
│  LocalStorage  │    │  Backend API    │    │  Gemini AI      │
│   (离线备份)    │    │  (Express+SQL)  │    │  (智能分析)      │
└────────────────┘    └─────────────────┘    └─────────────────┘
```

### 2.3 核心设计模式

#### 2.3.1 乐观更新 (Optimistic UI)

```typescript
// 1. 立即更新UI
setMembers(prev => [...prev, newMember]);

// 2. 后台持久化到API
await api.saveMember(newMember);
```

**优势**：用户体验流畅，无需等待网络响应

#### 2.3.2 软删除 (Soft Delete)

```typescript
// 删除时只标记，不真正移除
const updated = members.map(m =>
  idsToRemove.has(m.id) ? { ...m, isDeleted: true } : m
);
```

**优势**：支持回收站功能，数据可恢复

#### 2.3.3 离线容灾

```typescript
try {
  const data = await api.fetchMembers();
} catch {
  // API失败时自动降级到本地存储
  const local = localStorage.getItem('familyMembers_backup');
  setMembers(JSON.parse(local));
}
```

---

## 三、核心代码解析

### 3.1 D3.js 家族图谱可视化

#### 3.1.1 力导向图布局

```typescript
// components/FamilyGraph.tsx

const simulation = d3.forceSimulation(nodes as any)
  .force('link', d3.forceLink(links)
    .id((d: any) => d.id)
    .distance(120))  // 节点间距
  .force('charge', d3.forceManyBody()
    .strength(-300))  // 斥力强度
  .force('center', d3.forceCenter(width / 2, height / 2))
  .force('x', d3.forceX(width / 2).strength(0.1))
  .force('y', d3.forceY(height / 2).strength(0.1));
```

**原理**：
- **斥力**：节点之间互相排斥，避免重叠
- **弹簧力**：父子节点之间有连接力
- **中心力**：将整体图形居中

#### 3.1.2 亲缘关系计算（路径溯源法）

```typescript
const calculateRelationshipLabel = (
  target: FamilyMember,
  center: FamilyMember,
  allMembers: FamilyMember[]
): string | null => {
  // 1. 构建祖先路径
  const getAncestryPath = (m: FamilyMember): string[] => {
    const path = [m.id];
    let curr = m;
    while (curr.parentId && memberMap.has(curr.parentId)) {
      curr = memberMap.get(curr.parentId)!;
      path.push(curr.id);
    }
    return path;
  };

  // 2. 找到最近公共祖先
  const path1 = getAncestryPath(center);
  const path2 = getAncestryPath(target);
  const lca = findCommonAncestor(path1, path2);

  // 3. 根据路径生成称谓
  return generateKinshipTerm(path1, path2, lca);
};
```

**算法流程**：
1. 从两个节点向上追溯，分别得到祖先路径
2. 找到最近公共祖先（LCA）
3. 根据路径长度和性别计算称谓

### 3.2 数据管理 Hook (useGenealogy)

#### 3.2.1 自定义Hook封装

```typescript
// hooks/useGenealogy.ts

export const useGenealogy = () => {
  const [members, setMembers] = useState<FamilyMember[]>([]);

  // 活跃成员
  const activeMembers = useMemo(
    () => members.filter(m => !m.isDeleted),
    [members]
  );

  // 已删除成员
  const deletedMembers = useMemo(
    () => members.filter(m => m.isDeleted),
    [members]
  );

  // 保存成员（乐观更新）
  const saveMember = useCallback(async (member: FamilyMember) => {
    setMembers(prev => {
      const index = prev.findIndex(m => m.id === member.id);
      if (index >= 0) {
        const updated = [...prev];
        updated[index] = member;
        return updated;
      }
      return [...prev, member];
    });
    await api.saveMember(member);
  }, []);

  return { members, activeMembers, deletedMembers, saveMember, ... };
};
```

**设计优势**：
- 逻辑复用：App.tsx和DetailsModal.tsx共享数据管理
- 性能优化：使用useMemo缓存计算结果
- 类型安全：TypeScript提供完整类型推断

#### 3.2.2 级联删除算法

```typescript
export const getDescendants = (
  parentId: string,
  all: FamilyMember[]
): string[] => {
  const children = all.filter(m => m.parentId === parentId && !m.isDeleted);
  let ids = children.map(c => c.id);
  children.forEach(c => {
    ids = [...ids, ...getDescendants(c.id, all)];
  });
  return ids;
};

// 删除节点时，所有后代也会被标记为删除
const deleteMemberNodes = async (targetId: string) => {
  const descendantIds = getDescendants(targetId, members);
  const idsToRemove = new Set([targetId, ...descendantIds]);

  const updated = members.map(m =>
    idsToRemove.has(m.id) ? { ...m, isDeleted: true } : m
  );
  setMembers(updated);
};
```

### 3.3 AI服务集成

#### 3.3.1 OpenAI兼容API支持

```typescript
// services/geminiService.ts

const generateContent = async (prompt: string, settings?: AISettings) => {
  const { baseUrl, apiKey, modelName } = settings;

  if (baseUrl) {
    // OpenAI兼容API
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelName,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7
      })
    });
    return data.choices[0].message.content;
  } else {
    // Google Gemini SDK
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt
    });
    return response.text;
  }
};
```

**兼容性**：
- 支持Google Gemini官方API
- 支持OpenAI兼容的第三方API（如DeepSeek、Qwen等）

#### 3.3.2 亲缘关系分析Prompt

```typescript
const prompt = `你是一位精通中国家族礼法和宗法制度的族谱编纂者。
基于以下家谱数据:
${contextList}

请分析以下两人的亲缘关系:
1. ${personA.name}
2. ${personB.name}

要求：
1. 给出正式的称谓（如：堂叔、从堂妹、祖父等）。
2. 描述他们的血脉联系。
3. 请使用庄重典雅的古典文言或半文言风格，引用宗法礼教称谓。
4. 如果没有亲缘关系，请礼貌地指出。
请用中文书写。`;
```

### 3.4 后端API设计

```javascript
// server.js

const express = require('express');
const sqlite3 = require('sqlite3').verbose();

const app = express();
app.use(cors());
app.use(express.json());

// 初始化SQLite数据库
const db = new sqlite3.Database('./genealogy.db');

// 创建表
db.run(`CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  birthDate TEXT,
  gender TEXT,
  address TEXT,
  parentId TEXT,
  biography TEXT,
  spouseName TEXT,
  isMarried INTEGER,
  isDeleted INTEGER,
  isHighlight INTEGER
)`);

// API端点
app.get('/api/members', (req, res) => {
  db.all('SELECT * FROM members', [], (err, rows) => {
    res.json(rows);
  });
});

app.post('/api/members', (req, res) => {
  const member = req.body;
  db.run(
    `INSERT INTO members VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [member.id, member.name, member.birthDate, member.gender,
     member.address, member.parentId, member.biography,
     member.spouseName, member.isMarried ? 1 : 0,
     member.isDeleted ? 1 : 0, member.isHighlight ? 1 : 0]
  );
  res.json({ success: true });
});

app.listen(3001);
```

### 3.5 Docker容器化部署

```dockerfile
# 多阶段构建
FROM node:18-alpine as builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# 运行阶段
FROM node:18-alpine
WORKDIR /app

# 安装Nginx
RUN apk add --no-cache nginx

# 准备后端
COPY package*.json ./
RUN npm install --production
COPY server.js ./

# 复制前端产物
COPY --from=builder /app/dist /usr/share/nginx/html

# Nginx反向代理配置
RUN echo 'server { \
    listen 80; \
    location / { \
        root /usr/share/nginx/html; \
        try_files $uri $uri/ /index.html; \
    } \
    location /api { \
        proxy_pass http://127.0.0.1:3001; \
    } \
}' > /etc/nginx/http.d/default.conf

CMD nginx && node server.js
```

**优势**：
- 前后端打包在一个容器中
- Nginx处理静态文件，性能更优
- 一键部署，无需复杂配置

---

## 四、项目成果

### 4.1 功能实现

| 功能模块 | 实现状态 | 说明 |
|---------|---------|------|
| 交互式族谱图 | ✅ 完成 | D3.js力导向图，支持拖拽、缩放 |
| 成员增删改查 | ✅ 完成 | 完整的CRUD操作 |
| 软删除与恢复 | ✅ 完成 | 宗祠秘档（回收站）功能 |
| AI亲缘关系分析 | ✅ 完成 | 智能推演复杂称谓 |
| AI传记生成 | ✅ 完成 | 仿古文风格生平志传 |
| 数据导入导出 | ✅ 完成 | JSON格式批量操作 |
| 离线容灾 | ✅ 完成 | LocalStorage自动备份 |
| API连接测试 | ✅ 完成 | 一键测试AI配置 |
| Docker部署 | ✅ 完成 | 三步快速部署 |

### 4.2 技术亮点

1. **Optimistic UI模式**：操作即时响应，后台异步持久化
2. **路径溯源算法**：精确计算复杂亲缘关系
3. **多AI服务兼容**：同时支持Gemini和OpenAI兼容API
4. **离线优先架构**：网络异常时自动降级
5. **古风UI设计**：传统文化与现代技术结合

### 4.3 代码质量

```
文件统计：
├── 前端代码：约 2000 行 TypeScript/React
├── 后端代码：约 200 行 Node.js/Express
├── 类型定义：完整的 TypeScript 类型系统
└── 测试覆盖：核心功能已验证

代码规范：
✅ ESLint 代码检查
✅ TypeScript 严格模式
✅ 组件化设计，职责单一
✅ 自定义 Hook 复用逻辑
```

### 4.4 部署成果

- **GitHub仓库**：https://github.com/Fino-wind/zupu
- **Docker镜像**：支持一键构建部署
- **云服务器运行**：已成功部署至生产环境
- **访问地址**：http://服务器IP:8888

### 4.5 项目演示截图

> （此处可添加系统运行截图，展示族谱图、编辑面板、设置界面等）

### 4.6 未来展望

1. **多族谱支持**：支持多个家族独立管理
2. **权限系统**：家族成员分级权限控制
3. **图片上传**：成员头像、老照片展示
4. **移动端适配**：响应式设计优化
5. **数据导出**：PDF族谱书生成功能

---

## 五、总结

本项目成功将传统族谱文化与现代Web技术相结合，打造了一个功能完备、体验优秀的数字化族谱管理系统。通过React 19、D3.js、AI等技术手段，实现了：

✨ **技术价值**：展示了全栈开发、数据可视化、AI集成等综合能力

🏛️ **文化价值**：以数字化方式传承和弘扬中华家族文化

🚀 **实用价值**：提供可实际部署使用的族谱管理解决方案

项目代码开源，可供学习参考和二次开发使用。
