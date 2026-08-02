# SiYuan MCP Server

> **AI Knowledge Platform（AI 知识平台）** — 以 Workflow 为核心、以 Knowledge Context 为基础、以 Knowledge Graph 为增强，通过 MCP 向 AI 提供高层业务能力的知识服务平台。

[![Node.js](https://img.shields.io/badge/Node.js-22-green.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org)
[![MCP](https://img.shields.io/badge/MCP-1.0-purple.svg)](https://modelcontextprotocol.io)
[![Version](https://img.shields.io/badge/version-1.3.0-orange.svg)]()
[![Tests](https://img.shields.io/badge/tests-116-brightgreen.svg)]()

---

## 目录

- [Project Vision](#project-vision)
- [Why Workflow](#why-workflow)
- [AI Workflow](#ai-workflow)
- [Knowledge Context](#knowledge-context)
- [Knowledge Graph](#knowledge-graph)
- [Design Principles](#design-principles)
- [架构](#架构)
- [SDK](#sdk)
- [MCP Tools](#mcp-tools)
- [快速开始](#快速开始)
- [Docker 部署](#docker-部署)
- [客户端配置](#客户端配置)
- [环境变量](#环境变量)
- [Workflow Examples](#workflow-examples)
- [项目结构](#项目结构)
- [开发](#开发)
- [Knowledge Cache](#knowledge-cache)
- [Workflow Templates](#workflow-templates)
- [V2 路线图](#v2-路线图)
- [FAQ](#faq)
- [Mission](#mission)

---

## Project Vision

> **AI 应完成工作，而不是操作文档。**

本项目不是：

- ❌ 思源 HTTP API 的简单封装
- ❌ 一个 CRUD Server
- ❌ Block Tool Collection

而是：

> ✅ **AI Knowledge Platform — AI 的工作知识中枢。**

### 项目职责

| 我们做什么 | 我们不做 |
|---|---|
| 理解知识 | 暴露所有 HTTP API |
| 聚合知识 | 提供 Block CRUD |
| 建立知识上下文 | 成为思源 API 的通用封装 |
| 支持 AI Workflow | 让 AI 拼凑几十个底层调用 |

> **AI 永远优先调用 Workflow，而不是组合多个底层 Tool；底层 Tool 保持稳定，高层 Workflow 持续演进。**

---

## Why Workflow

### 没有 Workflow 的世界

AI 每次完成任务都需要拼凑大量底层调用：

```text
search_notes("CRM")         ← 搜索
  ↓
read_note("doc_001")        ← 读取
  ↓
read_note("doc_002")        ← 读取
  ↓
search_notes("CRM 会议")    ← 再搜索
  ↓
read_note("doc_003")        ← 读取
  ↓
list_todos()                ← 查待办
  ↓
[AI 在 prompt 中自己整理]    ← 拼凑结果
```

**问题**：大量往返调用、上下文碎片化、AI 需要自己做聚合推理。

### 有 Workflow 的世界

```text
project_context("CRM")      ← 一次调用
  ↓
[Workflow 内部完成：搜索 → 读取 → 分类 → 排序 → 聚合 → 模板渲染]
  ↓
返回完整项目上下文（结构化 Markdown）
```

**收益**：

| | 无 Workflow | 有 Workflow |
|---|---|---|
| **调用次数** | 6-10 次 | 1 次 |
| **延迟** | 高（串行往返） | 低（内部并行 + 缓存） |
| **上下文质量** | 碎片化原始数据 | 聚合后的结构化知识 |
| **缓存** | 无 | TTL 内存缓存，避免重复读取 |
| **AI 认知负担** | 需要理解如何组合 | 只管发起业务请求 |

### 核心原则

> **AI 永远应该调用 Workflow，不是几十个 Tool。**

Workflow 负责**业务**，Tool 负责**能力**，SDK 负责**API**。

---

## AI Workflow

> AI Workflow 是整个项目的核心。每个 Workflow 在内部组合多次 SDK 调用，输出 LLM 可直接理解的格式化 Markdown，并利用知识缓存避免重复读取。

### 调用架构

```text
AI
  │
  ▼
Workflow (业务编排：search + read + classify + sort + template)
  │
  ▼
Tool (基础能力：search_notes, read_note, create_note, list_todos...)
  │
  ▼
SDK (HTTP 封装：auth, retry, error handling)
  │
  ▼
SiYuan API
```

| 约束 | 说明 |
|---|---|
| Workflow → Tool | ✅ Workflow 组合多个 Tool |
| Tool → Workflow | ❌ Tool 不允许调用 Workflow |
| SDK → Workflow | ❌ SDK 不允许依赖 Workflow |
| MCP → Workflow | ✅ MCP 负责暴露 Workflow 给 AI |

### 当前 8 个 Workflow

#### knowledge_context — 知识上下文

**一句话**：输入一个主题，返回统一的知识上下文。

```text
search_notes(topic) → 读取 Top N → 提取标题/摘要/标签 → 排序去重 → 返回上下文
```

输出 7 段：相关文档 / 最近更新 / 重要知识 / 未完成待办 / 关联文档 / 建议继续阅读

| 参数 | 类型 | 说明 |
|---|---|---|
| `topic` | string（必填） | 查询主题 |
| `notebook?` | string | 限定笔记本 |
| `limit?` | number | 读取文档数（默认 5，最大 20） |

#### project_context — 项目全景

**一句话**：输入项目名，返回项目全景视图（所有文档类型 + 待办）。

多查询搜索 → 按类型分类（设计材料/会议纪要/日报/实施） → 读取摘要 → 查询待办。缓存 TTL: 60s。

| 参数 | 类型 | 说明 |
|---|---|---|
| `project_name` | string（必填） | 项目名称 |
| `notebook?` | string | 限定笔记本 |

#### customer_context — 客户知识

**一句话**：输入客户名，返回该客户的所有关联知识。

多查询搜索（客户名 + 会议/报价/方案/合同） → 分类（会议记录/沟通记录/文档） → 提取关联项目 → 查询待办 → 模板渲染。缓存 TTL: 60s。

| 参数 | 类型 | 说明 |
|---|---|---|
| `customer` | string（必填） | 客户名称 |
| `depth?` | number | 搜索深度（默认 15） |

#### meeting_summary — 会议纪要

**一句话**：输入原始会议文本，自动生成结构化纪要。

解析会议内容 → 提取标题/日期/参会人/议题 → 按章节提取决策/行动项/风险 → 提取 TODO → 模板渲染 → 可选保存到思源并建立双向关联。

| 参数 | 类型 | 说明 |
|---|---|---|
| `markdown` | string（必填） | 原始会议内容 |
| `notebook?` | string | 保存目标笔记本 |
| `save?` | boolean | 是否保存到思源（默认 false） |
| `doc_id?` | string | 追加到已有文档 |

**提取规则**：

| 内容类型 | 识别方式 |
|---|---|
| **决策** | 「决定」「决议」「结论」「确认」等关键词 |
| **行动项** | 「TODO」「待办」「负责」「需要」等关键词 |
| **风险** | 「风险」「问题」「阻塞」「延期」等关键词 |

#### project_timeline — 项目时间线

**一句话**：输入项目名，返回完整项目时间线。

多查询搜索（项目名 + 会议/日报/周报/设计/实施/总结） → 从路径和标题提取日期 → 分类（📅会议/📊报告/📋设计/🚀实施） → 按日期排序 → 模板渲染。缓存 TTL: 60s。

| 参数 | 类型 | 说明 |
|---|---|---|
| `project` | string（必填） | 项目名称 |
| `depth?` | number | 搜索深度（默认 20） |

#### find_related_notes — 关联笔记

**一句话**：输入文档 ID，返回与之关联的推荐笔记。

读取源文档 → 提取关键词（标题/链接/wikilinks/@mentions/#tags + TF） → 逐关键词搜索 → 提取反向链接 → 排序返回。

| 参数 | 类型 | 说明 |
|---|---|---|
| `doc_id` | string（必填） | 源文档 ID |
| `max_results?` | number | 最大结果数（默认 10） |

#### daily_review — 日报

**一句话**：生成今日工作回顾。

获取今日日记 → 搜索今日新建文档/会议 → 查询待办 → 模板渲染。缓存 TTL: 30s。

| 参数 | 类型 | 说明 |
|---|---|---|
| `notebook?` | string | 限定笔记本 |

#### weekly_review — 周报

**一句话**：生成本周工作总结。

自动计算周一至周日范围 → 搜索本周文档 → 按项目分类汇总 → 模板渲染。缓存 TTL: 60s。

| 参数 | 类型 | 说明 |
|---|---|---|
| `notebook?` | string | 限定笔记本 |

---

## Knowledge Context

> Knowledge Context 是整个项目最重要的能力。它**不是** Search，**不是** RAG，而是**统一知识上下文**。

### 为什么需要 Knowledge Context？

AI 不应反复调用 `search → read → search → read`，而应该**一次调用获取完整上下文**。

```text
❌ 低效模式：
   AI: search("CRM")
   AI: read(doc_1)
   AI: search("CRM 会议")
   AI: read(doc_2)
   AI: search("CRM TODO")
   AI: [手动拼接上下文]

✅ Knowledge Context 模式：
   AI: knowledge_context("CRM")
   → 一次返回完整结构化上下文
```

### 工作流

```text
User Query (topic)
     │
     ▼
┌─────────────────┐
│  Knowledge      │
│  Context        │
│                 │
│  1. Search      │ ← 多模式搜索（keyword + hybrid）
│     ↓           │
│  2. Read        │ ← 读取 Top N 文档
│     ↓           │
│  3. Extract     │ ← 标题、摘要、更新时间、标签
│     ↓           │
│  4. Merge       │ ← 去重、排序
│     ↓           │
│  5. Timeline    │ ← 按时间组织
│     ↓           │
│  6. Summary     │ ← 生成结构化摘要
│     ↓           │
│  7. Context     │ ← 输出统一上下文
└─────────────────┘
     │
     ▼
  Structured Markdown
```

### 输出结构

```markdown
## 相关文档
核心匹配文档列表（标题、路径、摘要、更新时间）

## 最近更新
过去 7 天内更新的相关文档

## 重要知识
关键知识点（高频术语和概念提取）

## 未完成待办
与该主题相关的待办任务

## 关联文档
通过关键词发现的更广泛关联

## 建议继续阅读
推荐进一步深入阅读的文档
```

### Smart Retrieval

内置智能检索：自然语言 → 结构化搜索关键词。

```typescript
// 输入："客户A昨天会议"
// → 去掉时间词"昨天"
// → CamelCase、英文、中英边界分词
// → 逐段去停用词（非全局正则，保护复合词）
// 输出：["客户A", "会议"]
```

---

## Knowledge Graph

> 思源最大的优势不是 Markdown，而是**知识网络**。

### 思源特色能力

| 思源特性 | 项目中的应用 |
|---|---|
| **双向链接** | `auto_link=true`：创建笔记时自动关联项目、客户、成员 |
| **标签** | 关键词提取和归类 |
| **引用关系** | `find_related_notes` 反向链接发现 |
| **Notebook** | 工作流按笔记本范围搜索和聚合 |
| **Daily Note** | `daily_review` 自动关联当天日记 |
| **属性** | 从文档属性提取元数据 |

### `auto_link` 能力

创建会议纪要时，自动关联：
- 项目文档
- 客户文档
- 成员 Daily Note
- 相关 TODO

**约束**：只增加引用关系，不自动移动文档，不修改目录结构。

### 知识图谱 — 未来方向

```text
         ┌──────────┐
         │  Meeting │
         └────┬─────┘
              │ 双向链接
    ┌─────────┼─────────┐
    ▼         ▼         ▼
┌────────┐ ┌────────┐ ┌────────┐
│Project │←│Customer│→│ People │
└───┬────┘ └───┬────┘ └───┬────┘
    │           │          │
    └───────────┼──────────┘
                ▼
          ┌────────┐
          │  Todo  │
          └────────┘
                │
                ▼
        Knowledge Graph
```

不是简单的 Markdown 仓库，而是**以知识节点和关系为核心的知识图谱**。

---

## Design Principles

### Workflow First

> 新增需求时，优先考虑 Workflow，不是 Tool。

`project_context()` 优于 `search + read + search + read`。

### Context First

> AI 优先使用 Knowledge Context，不是原生 Search。

`knowledge_context()` 一次返回结构化上下文，不是让 AI 自己拼凑。

### Knowledge First

> 优先做知识聚合，不是文档操作。

聚合会议、日报、设计、实施到统一时间线，而不是暴露 `append_block()`。

### CRUD Last

> 只有 Workflow 确实需要时，才增加 SDK API。

禁止为了封装而封装。不推荐暴露 `append_block()`、`delete_block()`、`rename_block()`、`sql()`。

---

## 架构

```text
User
  │
  ▼
AI (WorkBuddy / Claude / Cursor)
  │
  ▼
┌──────────────────────────┐
│    SiYuan MCP Server     │
│                          │
│  ┌────────────────────┐  │
│  │   Workflow Layer   │  │  ★ 核心层：业务编排、缓存、模板
│  │  ───────────────── │  │
│  │ knowledge_context  │  │
│  │ project_context    │  │
│  │ customer_context   │  │
│  │ meeting_summary    │  │
│  │ daily_review       │  │
│  │ weekly_review      │  │
│  │ project_timeline   │  │
│  │ find_related_notes │  │
│  └────────┬───────────┘  │
│           ▼              │
│  ┌────────────────────┐  │
│  │     MCP Tools      │  │  基础工具层（供 Workflow 调用）
│  └────────┬───────────┘  │
└───────────┼──────────────┘
            ▼
    ┌───────────────┐
    │  SiYuan SDK   │  HTTP 封装层（auth, retry, error handling）
    └───────┬───────┘
            ▼
    ┌───────────────┐
    │ SiYuan API    │  思源内核
    └───────────────┘
```

**调用链**：

```text
AI → Workflow → Tool → SDK → SiYuan API
```

> 严格遵守依赖方向：Workflow → Tool → SDK，不得反向依赖。

---

## SDK

`@siyuan-ai/sdk` — 独立的思源 HTTP API 封装库，可脱离 MCP 单独使用。

**模块**：auth（认证）/ notebook（笔记本）/ document（文档）/ todo（待办）/ search（搜索）

**特性**：Token 自动注入、Axios 重试（3 次）、统一错误处理、JSON 结构化日志

**独立复用**：CLI 脚本、定时任务、自动化流水线、其他非 MCP 场景。

---

## MCP Tools

> **AI 应优先调用工作流工具。基础工具供 Workflow 内部使用，不应由 AI 直接组合调用。**

### 工作流工具（AI 调用入口）

| Tool | 说明 | 关键参数 |
|---|---|---|
| `knowledge_context` | ★ 构建主题知识上下文 | `topic`, `notebook?`, `limit?` |
| `project_context` | 项目全景视图 | `project_name`, `notebook?` |
| `customer_context` | 客户知识聚合 | `customer`, `depth?` |
| `meeting_summary` | 会议纪要自动总结 | `markdown`, `notebook?`, `save?` |
| `daily_review` | 日报回顾 | `notebook?` |
| `weekly_review` | 周报生成 | `notebook?` |
| `project_timeline` | 项目时间线 | `project`, `depth?` |
| `find_related_notes` | 智能关联笔记 | `doc_id`, `max_results?` |

### 基础工具（供 Workflow 内部使用）

| Tool | 说明 | 关键参数 |
|---|---|---|
| `search_notes` | 搜索文档（多模式） | `keyword`, `mode`, `sort` |
| `read_note` | 读取文档内容 | `doc_id` |
| `create_note` | 创建文档（支持 auto_link） | `notebook`, `path`, `title`, `markdown`, `auto_link` |
| `append_note` | 追加文档内容 | `doc_id`, `markdown` |
| `list_notebooks` | 列出所有笔记本 | — |
| `get_daily_note` | 获取/创建今日日记 | `notebook?` |
| `list_todos` | 列出所有待办 | `notebook?` |
| `create_todo` | 创建待办 | `doc_id`, `content` |
| `complete_todo` | 完成待办 | `todo_id` |
| `rename_note` | 重命名文档 | `doc_id`, `title` |
| `move_note` | 移动文档 | `doc_id`, `notebook`, `path` |
| `delete_note` | 删除文档 | `doc_id` |

> **未来新增功能优先实现为 Workflow，不是 Tool。Tool 是 Workflow 的基础能力层，保持精简稳定。**

---

## 快速开始

### 前置条件

- Node.js 22+
- pnpm 9+
- 思源笔记 v3.1+（HTTP API 已开启）

### 本地开发

```bash
git clone <repo-url>
cd siyuan-ai

pnpm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 设置 SIYUAN_URL 和 SIYUAN_TOKEN

pnpm build

# stdio 模式（适配 MCP 客户端）
node packages/siyuan-mcp/dist/index.js

# HTTP/SSE 模式（适配 Docker 远程访问）
TRANSPORT=sse PORT=3000 node packages/siyuan-mcp/dist/index.js
```

---

## Docker 部署

### Docker Compose（推荐）

```bash
cat > docker/.env << 'EOF'
SIYUAN_URL=http://host.docker.internal:6806
SIYUAN_TOKEN=your-token-here
MCP_PORT=3000
LOG_LEVEL=info
TIMEOUT=10000
RETRY=3
EOF

cd docker
docker compose up -d
docker compose logs -f
curl http://localhost:3000/health
```

### Docker 单独构建

```bash
docker build -t siyuan-mcp-server -f docker/Dockerfile .
docker run -d \
  --name siyuan-mcp \
  -p 3000:3000 \
  -e SIYUAN_URL=http://host.docker.internal:6806 \
  -e SIYUAN_TOKEN=your-token \
  -e TRANSPORT=sse \
  siyuan-mcp-server
```

---

## 客户端配置

### WorkBuddy

**stdio 模式（本地）** — `~/.workbuddy/mcp.json`：

```json
{
  "mcpServers": {
    "siyuan": {
      "command": "node",
      "args": ["/path/to/siyuan-ai/packages/siyuan-mcp/dist/index.js"],
      "env": {
        "SIYUAN_URL": "http://127.0.0.1:6806",
        "SIYUAN_TOKEN": "your-token",
        "TRANSPORT": "stdio"
      }
    }
  }
}
```

**SSE 模式（Docker/远程）**：

```json
{
  "mcpServers": {
    "siyuan": {
      "url": "http://localhost:3000/sse",
      "transport": "sse"
    }
  }
}
```

### Claude Desktop / Cursor

同上 stdio 模式配置，配置文件路径：
- Claude: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) / `%APPDATA%\Claude\claude_desktop_config.json` (Windows)
- Cursor: `~/.cursor/mcp.json`

---

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `SIYUAN_URL` | `http://127.0.0.1:6806` | 思源笔记 HTTP API 地址 |
| `SIYUAN_TOKEN` | （空） | 思源 API Token（设置 → 关于中获取） |
| `PORT` | `3000` | HTTP/SSE 模式监听端口 |
| `LOG_LEVEL` | `info` | 日志级别：`debug` / `info` / `warn` / `error` |
| `TIMEOUT` | `10000` | HTTP 请求超时（毫秒） |
| `RETRY` | `3` | 失败重试次数 |
| `TRANSPORT` | `stdio` | 传输模式：`stdio` / `sse` |

---

## Workflow Examples

### 场景一：项目知识聚合

```
帮我整理 CRM 项目的全部资料。
```

→ AI 一次调用 `project_context(project_name="CRM")`  
→ 返回完整项目上下文（设计/会议/日报/实施/待办）

---

### 场景二：客户管理

```
客户A最近有哪些重要事项？
```

→ AI 调用 `customer_context(customer="客户A")`  
→ 返回：会议、报价、TODO、项目、日报 — 统一上下文

---

### 场景三：会议总结

```
帮我整理今天会议。
```

→ AI 调用 `meeting_summary(markdown="...", save=true)`  
→ 自动生成：Summary / Decision / Action / Risk / Todo  
→ 自动关联：项目、客户、Daily Note

---

### 场景四：知识推荐

```
还有哪些文档值得看？
```

→ AI 调用 `find_related_notes(doc_id="...")`  
→ 返回相关推荐（双向链接 + 标签 + 关键词）

---

### 场景五：日报周报

```
生成今天日报 → daily_review()
生成本周周报 → weekly_review()
```

---

## 项目结构

```
siyuan-ai/
├── packages/
│   ├── siyuan-sdk/          # 思源 HTTP API SDK
│   │   └── src/             # auth/notebook/document/todo/search/client/errors/logger
│   │
│   └── siyuan-mcp/          # MCP Server
│       ├── src/
│       │   ├── server/       # MCP Server 核心
│       │   ├── workflows/   # ★ AI 工作流（8 个）
│       │   ├── templates/   # Prompt 模板（6 个 .md 文件）
│       │   ├── cache/       # TTL 知识缓存
│       │   ├── tools/       # Tool Schema + Handler
│       │   └── transport/   # stdio + SSE 传输
│       └── test/            # 116 个测试用例
│
├── docker/                  # Docker 部署
├── examples/                # 示例配置
├── package.json             # v1.2.0
└── README.md
```

---

## 开发

### 构建与测试

```bash
pnpm install && pnpm build       # 构建
pnpm test                         # 运行全部 116 个测试
pnpm lint && pnpm format         # 代码检查
```

### 添加新 Workflow

**工作流工具**（组合多个 SDK 调用 + 缓存 + 模板）：

1. 在 `packages/siyuan-mcp/src/workflows/` 创建 Workflow 类，继承 `WorkflowBase`
2. 实现 `execute()` 方法
3. 可选：在 `src/templates/` 添加 Prompt 模板（.md）
4. 在 `workflows/index.ts` 导出
5. 在 `tools/schemas.ts` 添加 Zod schema
6. 在 `tools/definitions.ts` 添加 Tool 定义
7. 在 `tools/handlers.ts` 添加 handler
8. 在 `test/workflows.test.ts` 添加测试

### 开发三问

> 所有新增功能必须优先回答：

1. **这是 Workflow，还是 Tool？** — 优先 Workflow
2. **是否应该增强 Knowledge Context，而不是新增 API？** — 优先聚合
3. **AI 是否能够一次调用完成业务目标？** — 如果不能，重新设计

---

## Knowledge Cache

Workflow 内置 TTL（Time-To-Live）内存缓存，避免 AI 在短时间内重复读取大量文档。

| 特性 | 说明 |
|---|---|
| **存储** | 进程内存，单例 |
| **键** | `workflow_name + sorted_params_hash` |
| **默认 TTL** | 10 秒 |
| **特殊 TTL** | Daily Review: 30s，Weekly/Customer/Timeline: 60s |
| **过期策略** | 惰性删除（读取时检查） |
| **手动清理** | `workflowCache.clear()` / `workflowCache.expireAll()` |
| **未来规划** | 支持 Redis 分布式缓存 |

---

## Workflow Templates

Prompt 模板以独立 `.md` 文件存储，支持 Mustache 语法。用户可直接修改，`pnpm build` 后重启生效。

| 模板文件 | 对应工具 |
|---|---|
| `meeting_summary.md` | `meeting_summary` |
| `daily_review.md` | `daily_review` |
| `weekly_review.md` | `weekly_review` |
| `project_summary.md` | `project_context` |
| `customer_summary.md` | `customer_context` |
| `project_timeline.md` | `project_timeline` |

---

## V2 路线图

1. **Knowledge Graph Engine** — 基于思源双向链接、标签、引用关系构建知识图谱。
2. **Workflow Engine** — 支持可配置的工作流编排。

   ```yaml
   workflow:
     project_context:
       - search
       - read
       - summary
       - timeline
       - todo
   ```

   不用写代码即可新增 Workflow。

3. **Event Trigger（事件驱动）** — 监听思源文档变更，自动触发：

   ```text
   新增会议纪要
     ↓
   自动生成 Summary
     ↓
   自动提取 Todo
     ↓
   自动建立 Knowledge Graph 关联
     ↓
   自动更新 Project Context
   ```

   形成自主 Agent。

4. **Knowledge Cache 升级** — 支持 Redis 分布式缓存，跨进程共享。
5. **RAG Integration** — 引入向量检索作为增强能力，但保留 Knowledge Context 作为默认检索方式。
6. **External Integrations** — 逐步支持飞书、Outlook、GitHub、企业微信等外部系统。

---

## FAQ

### Q: 如何获取思源 API Token？

在思源笔记中：设置 → 关于 → 查看 API Token。确保 HTTP API 已开启。

### Q: 如何添加新的 AI 工作流？

参考 [开发 → 添加新 Workflow](#添加新-workflow)。核心原则：**暴露业务能力，不暴露底层 API**。

### Q: 如何自定义 Prompt 模板？

直接修改 `packages/siyuan-mcp/src/templates/` 中的 `.md` 文件，`pnpm build` 后重启即可。支持 Mustache 语法。

### Q: Docker 容器无法连接思源？

使用 `http://host.docker.internal:6806` 而非 `127.0.0.1`。通过 Tailscale 访问 NAS 时使用 NAS 的 Tailscale IP。

### Q: stdio 和 SSE 模式有什么区别？

| | stdio | SSE |
|---|---|---|
| 使用场景 | 本地客户端 | Docker / 远程 |
| 传输方式 | 标准输入输出 | HTTP + SSE |
| 健康检查 | 无 | `GET /health` |
| 多客户端 | 单连接 | 多连接 |

---

## Mission

> **Build the best AI-native knowledge platform for SiYuan.**

```text
AI
  │
  ▼
Workflow        ← 业务编排
  │
  ▼
Knowledge Context ← 知识上下文
  │
  ▼
Knowledge Graph  ← 知识图谱
  │
  ▼
Business Tools   ← 基础能力
  │
  ▼
SDK              ← HTTP 封装
  │
  ▼
SiYuan           ← 知识内核
```

> **This project is evolving from an MCP Server into an AI Knowledge Platform.**

后续所有开发都围绕这条主线进行。重点永远是：

> **Knowledge → Workflow → Context → Graph**

不是：

> SDK → CRUD → API Wrapper

---

## License

MIT
