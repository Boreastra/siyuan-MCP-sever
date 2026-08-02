# Changelog

All notable changes to the SiYuan MCP Server project.

---

## [1.3.5] — 2026-08-02

### Added

- **Automated integration test system** (`scripts/full-test.ps1` + `scripts/tool-tests.mjs`): build → start MCP (SSE) → connect SiYuan → exercise all 20 tools → generate `TEST_REPORT.md`
- `pnpm test:full` and `pnpm test:full:skip-build` npm scripts

### Fixed

- **MCP SSE transport**: `handlePostMessage` signature corrected to 3 args `(req, res, parsedBody)` per MCP SDK 1.30.0; removed duplicate HTTP response
- **create_note always returning empty ID**: `createDocWithMd` API returns doc ID as plain string (`"20260802145248-abc123"`), not `{ rootID: "..." }` object — code now checks `typeof data === 'string'` first
- **searchDocs fallback**: API returns flat array without `id` field — extract ID from `path` (last segment minus `.sy`); handle `hPath` notebook prefix
- **Entity decoding order**: `&amp;` MUST be decoded first (before `&gt;`/`&lt;`/`&quot;`) to handle SiYuan double-encoding like `&amp;gt;`
- **meeting_summary empty tables**: section headers now use prefix matching instead of exact match; table rows (starting with `|`) now parsed

### Test Results

141 tests: 60 SDK + 61 MCP + 20 integration — all passing.

---

## [1.3.4] — 2026-08-01

### Fixed

- **HTML entity decoding**: SiYuan search API encodes `>` as `&gt;` and `"` as `&quot;` in results. Regex `<[^>]*>` relies on literal `>` — when encoded, pattern never matches, leaking all HTML attributes. Added `cleanHtml()` method with entity decoding + tag stripping applied across `extractTitle`, `truncate`, and `extractTodoText`.

### Test Results

121 tests: 60 SDK + 61 MCP — all passing.

---

## [1.3.3] — 2026-08-01

### Fixed

- **weekly_review HTML leakage (multi-line tags)**: `extractTitle` applied HTML stripping per-line, but multi-line HTML like `<div\n class="foo"\n>` means no single line contains `>`. Fixed by stripping HTML globally before splitting lines.

### Test Results

120 tests: 60 SDK + 60 MCP — all passing.

---

## [1.3.2] — 2026-08-01

### Fixed

- **list_todos `indexOf` crash**: SiYuan `/api/query/sql` returns object arrays `[{id, content, ...}]` not `{columns, rows}`. Removed `getColumnIndex`, switched to `Array<Record>` format.
- **HTML in todo text**: Added HTML stripping to `extractTodoText` and `truncate` methods.

### Test Results

120 tests: 60 SDK + 60 MCP — all passing.

---

## [1.3.1] — 2026-08-01

### Fixed

- **rename/move/delete operations broken**: Switched from path-based APIs to `ByID` variants: `renameDocByID`, `moveDocsByID`, `removeDocByID`.
- **SQL endpoint**: Changed from `/api/sql` to `/api/query/sql`.
- **appendBlock response format**: Corrected to access `data[0]?.doOperations?.[0]?.id` (was expecting `{ operations: [...] }`).
- **completeTodo missing validation**: Added block ID length validation (≥22 chars).

### Test Results

119 tests: 60 SDK + 59 MCP — all passing.

---

## [1.3.0] — 2026-07-31

### Added

- **20 MCP tools**: 8 workflow tools (`daily_review`, `weekly_review`, `meeting_summary`, `project_context`, `project_timeline`, `customer_context`, `knowledge_context`, `find_related_notes`) + 12 base tools (`create_note`, `read_note`, `append_note`, `rename_note`, `delete_note`, `move_note`, `search_notes`, `list_notebooks`, `create_todo`, `list_todos`, `complete_todo`, `get_daily_note`)
- **Architecture**: AI → Workflow → Tool → SDK → SiYuan HTTP API (three-layer, workflow-first)
- **SiYuan HTTP SDK** (`@siyuan-ai/sdk`): Axios-based client with retry, error handling, Zod validation
- **MCP Server** (`@siyuan-ai/mcp`): Express-based SSE and stdio transports
- **Workflow engine**: Mustache templates, section-based rendering, `WorkflowCache` with 10s TTL
- **Smart retrieval**: Per-segment stop word filtering, index-based meeting section extraction
- **Docker support**: Dockerfile + docker-compose.yml

---

## Versioning

This project follows a simplified SemVer: `MAJOR.MINOR.PATCH`.

- **MAJOR**: Architecture redesign, breaking API changes
- **MINOR**: New tools, workflows, or significant features
- **PATCH**: Bug fixes, API corrections, test improvements

[1.3.5]: https://github.com/Boreastra/siyuan-MCP-sever/releases/tag/v1.3.5
[1.3.4]: https://github.com/Boreastra/siyuan-MCP-sever/releases/tag/v1.3.4
[1.3.3]: https://github.com/Boreastra/siyuan-MCP-sever/releases/tag/v1.3.3
[1.3.2]: https://github.com/Boreastra/siyuan-MCP-sever/releases/tag/v1.3.2
[1.3.1]: https://github.com/Boreastra/siyuan-MCP-sever/releases/tag/v1.3.1
[1.3.0]: https://github.com/Boreastra/siyuan-MCP-sever/releases/tag/v1.3.0
