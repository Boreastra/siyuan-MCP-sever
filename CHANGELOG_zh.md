# 更新日志

SiYuan MCP Server 项目所有重要变更记录。

---

## [1.0.5] — 2026-08-02

### 新增

- **自动化集成测试系统**（`scripts/full-test.ps1` + `scripts/tool-tests.mjs`）：构建 → 启动 MCP (SSE) → 连接思源 → 执行全部 20 个工具测试 → 生成 `TEST_REPORT.md`
- `pnpm test:full` 和 `pnpm test:full:skip-build` npm 脚本
- `CHANGELOG.md` 和 `CHANGELOG_zh.md`（本文件），Git 推送工作流

### 修复

- **MCP SSE 传输层**：`handlePostMessage` 签名修正为 3 参数 `(req, res, parsedBody)`，适配 MCP SDK 1.30.0；移除重复的 HTTP 响应
- **create_note 始终返回空 ID**：`createDocWithMd` API 返回文档 ID 为纯字符串（`"20260802145248-abc123"`），而非 `{ rootID: "..." }` 对象——代码现在先检查 `typeof data === 'string'`
- **searchDocs 回退逻辑**：API 返回扁平数组，不含 `id` 字段——从 `path` 字段提取 ID（最后一段去掉 `.sy` 后缀）；处理 `hPath` 中的笔记本前缀
- **实体解码顺序**：`&amp;` 必须在 `&gt;`/`&lt;`/`&quot;` 之前解码，以正确处理思源的二次编码（如 `&amp;gt;`）
- **meeting_summary 表格为空**：章节标题匹配改为前缀匹配而非精确匹配；表格行（以 `|` 开头）现在被正确解析
- `.gitignore` 增强：排除 `.env`、`.pnpm-store/`、`dist/`、`TEST_REPORT.md`、`.workbuddy/`、构建产物

### 测试结果

141 个测试：60 SDK + 61 MCP + 20 集成 — 全部通过。

---

## [1.0.4] — 2026-08-01

### 修复

- **HTML 实体解码**：思源搜索 API 将 `>` 编码为 `&gt;`、`"` 编码为 `&quot;`。正则 `<[^>]*>` 依赖字面量 `>`——编码后模式永远无法匹配，导致所有 HTML 属性泄漏。新增 `cleanHtml()` 方法，在 `extractTitle`、`truncate`、`extractTodoText` 中统一进行实体解码和标签清除。

### 测试结果

121 个测试：60 SDK + 61 MCP — 全部通过。

---

## [1.0.3] — 2026-08-01

### 修复

- **weekly_review HTML 泄漏（跨行标签）**：`extractTitle` 曾逐行清除 HTML，但多行 HTML 如 `<div\n class="foo"\n>` 意味着没有单行包含 `>`。改为先全局清除 HTML 再拆行。

### 测试结果

120 个测试：60 SDK + 60 MCP — 全部通过。

---

## [1.0.2] — 2026-08-01

### 修复

- **list_todos `indexOf` 崩溃**：思源 `/api/query/sql` 返回对象数组 `[{id, content, ...}]` 而非 `{columns, rows}`。删除 `getColumnIndex`，改为 `Array<Record>` 格式。
- **待办事项文本中的 HTML**：在 `extractTodoText` 和 `truncate` 方法中新增 HTML 清除。

### 测试结果

120 个测试：60 SDK + 60 MCP — 全部通过。

---

## [1.0.1] — 2026-08-01

### 修复

- **重命名/移动/删除操作失效**：从基于路径的 API 切换为 `ByID` 变体：`renameDocByID`、`moveDocsByID`、`removeDocByID`。
- **SQL 端点**：从 `/api/sql` 改为 `/api/query/sql`。
- **appendBlock 响应格式**：修正为访问 `data[0]?.doOperations?.[0]?.id`（曾预期 `{ operations: [...] }`）。
- **completeTodo 缺少校验**：新增块 ID 长度校验（≥22 字符）。

### 测试结果

119 个测试：60 SDK + 59 MCP — 全部通过。

---

## [1.0.0] — 2026-07-31

### 新增

- **20 个 MCP 工具**：8 个工作流工具（`daily_review`、`weekly_review`、`meeting_summary`、`project_context`、`project_timeline`、`customer_context`、`knowledge_context`、`find_related_notes`）+ 12 个基础工具（`create_note`、`read_note`、`append_note`、`rename_note`、`delete_note`、`move_note`、`search_notes`、`list_notebooks`、`create_todo`、`list_todos`、`complete_todo`、`get_daily_note`）
- **架构设计**：AI → Workflow → Tool → SDK → SiYuan HTTP API（三层架构，工作流优先）
- **思源 HTTP SDK**（`@siyuan-ai/sdk`）：基于 Axios 的客户端，支持重试、错误处理、Zod 校验
- **MCP Server**（`@siyuan-ai/mcp`）：基于 Express 的 SSE 和 stdio 传输方式
- **工作流引擎**：Mustache 模板、分区渲染、`WorkflowCache`（10 秒 TTL）
- **智能检索**：分段停用词过滤、基于索引的会议章节提取
- **Docker 支持**：Dockerfile + docker-compose.yml

---

## 版本规则

本项目遵循简化版语义化版本：`主版本.次版本.修订号`。

- **主版本**：架构重构、不兼容的 API 变更
- **次版本**：新工具、新工作流、重要功能
- **修订号**：Bug 修复、API 修正、测试改进

[1.0.5]: https://github.com/Boreastra/siyuan-MCP-sever/releases/tag/v1.0.5
[1.0.4]: https://github.com/Boreastra/siyuan-MCP-sever/releases/tag/v1.0.4
[1.0.3]: https://github.com/Boreastra/siyuan-MCP-sever/releases/tag/v1.0.3
[1.0.2]: https://github.com/Boreastra/siyuan-MCP-sever/releases/tag/v1.0.2
[1.0.1]: https://github.com/Boreastra/siyuan-MCP-sever/releases/tag/v1.0.1
[1.0.0]: https://github.com/Boreastra/siyuan-MCP-sever/releases/tag/v1.0.0
