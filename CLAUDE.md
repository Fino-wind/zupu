<!-- READ_BEFORE_CODING: docs/code-map.md -->

> # 🔴 要改代码？先 `Read docs/code-map.md` —— 依赖图 / 调用链 / 🔒 16 条不变量都在那，尤其动【删除逻辑 · AI 端点校验 · Dockerfile COPY · MCP 挂载 · nginx 反代】之前。

# 全局指令 (Global Instructions)

**必须强制遵守：**
1. **语言要求**：所有回复、解释、注释和文档必须使用 **中文 (Chinese)**。
2. **Language Requirement**: All responses, explanations, comments, and documentation MUST be in **Chinese**.

## 文档路由

| 我要… | 读哪份 | 说明 |
|---|---|---|
| **改任何源码** | `docs/code-map.md` | 架构 · 模块依赖 · 调用链 · 存储布局 · 🔒 不变量 · 部署拓扑。**改代码前必读**，改完源码顺手改它对应的段 |
| 看待办 / bug / 技术债 / 已判定不做 | `docs/roadmap.md` | 唯一的待办入口；P0/P1/P2 分档 |
| 查「以前踩过没 / 当初为什么这么定」 | `docs/incident-log.md` | 已结案事故，`PM-YYYY-MM-DD-slug` 稳定 ID，只增不改 |
| 部署 · 安全须知 · 备份 · MCP 接入 | `README.md` | 面向外部使用者（GitHub 公开仓库），不写内部判断 |
| 环境变量有哪些 | `.env.example` | 配置的唯一文档；⚠️ Docker 下只有 compose 转发的那几个生效（code-map §14 ⑭） |

**归口铁律**：架构 → code-map · 待办 → roadmap · 结案 → incident-log。**三样都不进本文件。**
