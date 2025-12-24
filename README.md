# 华夏族谱录 (ChronoGenealogy)

一个极具未来感的家族族谱管理系统，融合了中国传统宗法文化与现代 Web 技术。系统支持交互式数据可视化、AI 智能关系推演及生平传记生成。

## ✨ 主要功能

*   **交互式族谱图**：基于 D3.js 的力导向图，支持拖拽、缩放，以古风卷轴形式呈现。
*   **宗法关系推演**：利用 AI 智能分析任意两名家族成员之间的复杂亲戚称谓（如“堂叔”、“从堂妹”）。
*   **AI 传记撰写**：自动根据成员信息生成仿古文或白话文的生平志传。
*   **灵犀一问**：支持以自然语言向 AI 询问家族成员的历史背景。
*   **宗主管理模式**：
    *   支持增删改查家族成员。
    *   提供“宗祠秘档”（回收站）功能。
    *   支持 JSON 格式的族谱数据导入与导出。
*   **双重存储保障**：
    *   **云端/本地数据库**：使用 SQLite 存储核心数据。
    *   **离线容灾**：网络异常时自动切换至浏览器本地存储 (localStorage)，并在网络恢复后尝试同步，防止数据丢失。

## 🛠️ 技术栈

*   **前端框架**: React 19, TypeScript
*   **可视化**: D3.js
*   **样式**: TailwindCSS
*   **AI 支持**: Google Gemini API (@google/genai)
*   **后端**: Node.js (Express) + SQLite
*   **构建工具**: Vite

## 🚀 快速开始

### 前置要求

本项目依赖 Google Gemini API 进行智能分析。请确保您拥有有效的 `API_KEY`。

### 1. 开发环境运行 (端口 5021)

```bash
# 安装依赖
npm install

# 启动开发服务器 (同时启动后端 API 和前端)
npm run dev
```

启动后访问: `http://localhost:5021`

---

## 🐳 Docker 快速部署

三步搞定：

```bash
# 1. 克隆项目
git clone https://github.com/Fino-wind/zupu.git
cd zupu

# 2. 构建镜像
docker build -t chrono-genealogy .

# 3. 运行容器
docker run -d \
  --name my-genealogy \
  -p 8888:80 \
  chrono-genealogy
```

访问 `http://localhost:8888` 即可！

**可选：配置AI功能和数据持久化**

```bash
# 使用API Key和数据库持久化
docker run -d \
  --name my-genealogy \
  -p 8888:80 \
  -e API_KEY="your_api_key_here" \
  -v $(pwd)/genealogy.db:/app/genealogy.db \
  chrono-genealogy
```

**参数说明：**
- `API_KEY`: Google Gemini API密钥（可选，在设置里也可配置）
- `-v ...`: 数据库文件挂载，重启后数据不丢失

## 📜 许可证

MIT
