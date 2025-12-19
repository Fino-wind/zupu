# 华夏族谱录 (ChronoGenealogy)

一个极具古风感的AI家族族谱管理系统，融合了中国传统宗法文化与现代 Web 技术。系统支持交互式数据可视化、AI 智能关系推演及生平传记生成。
<img width="2738" height="1524" alt="image" src="https://github.com/user-attachments/assets/b391ce33-e856-407c-a862-4fe851005317" />
<img width="2604" height="1476" alt="image" src="https://github.com/user-attachments/assets/a40271c8-c4a3-4b8d-8283-bb6639f2dcfa" />
<img width="2604" height="1476" alt="image" src="https://github.com/user-attachments/assets/6dda0c47-6acd-47bf-b202-30c42884ff84" />
<img width="2604" height="1476" alt="image" src="https://github.com/user-attachments/assets/c31e1662-7e8c-49a3-997c-6cea21535247" />


## ✨ 主要功能

*   **交互式族谱图**：基于 D3.js 的力导向图，支持拖拽、缩放，以古风卷轴形式呈现。
*   **宗法关系推演**：利用 AI 智能分析任意两名家族成员之间的复杂亲戚称谓（如“堂叔”、“从堂妹”）。
*   **AI 传记撰写**：自动根据成员信息生成仿古文或白话文的生平志传。
*   **灵犀一问**：支持以自然语言向 AI 询问家族成员的历史背景。
*   **宗主管理模式**：
    *   支持增删改查家族成员。
    *   提供“宗祠秘档”（回收站）功能。
    *   支持 JSON 格式的族谱数据导入与导出。
*   **沉浸式古风 UI**：融合宣纸纹理、水墨特效与流光动画。

## 🛠️ 技术栈

*   **前端框架**: React 19, TypeScript
*   **可视化**: D3.js
*   **样式**: TailwindCSS
*   **AI 支持**: Google Gemini API (@google/genai)
*   **构建工具**: Vite

## 🚀 快速开始

### 前置要求

本项目依赖 Google Gemini API 进行智能分析。请确保您拥有有效的 `API_KEY`。（也支持自定义api)

### 1. 开发环境运行 (端口 5021)

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

启动后访问: `http://localhost:5021`

### 2. Docker 一键部署 (生产端口 8888)

使用 Docker 构建并运行 Nginx 容器服务。

```bash
# 构建镜像
docker build -t genealogy .

# 运行容器 (将容器 8888 端口映射到宿主机 8888)
# 请将 your_api_key_here 替换为您的实际 Google Gemini API Key
docker run -d -p 8888:8888 -e API_KEY="your_api_key_here" --name my-genealogy genealogy
```

启动后访问: `http://localhost:8888`

## 📁 目录结构

*   `src/` - 源代码 (App, Components, Services)
*   `public/` - 静态资源
*   `Dockerfile` - 容器构建配置
*   `nginx.conf` - 生产环境 Nginx 配置 (监听 8888)

## 📜 许可证

MIT
