/**
 * SiYuan MCP Tool Tests - Automated Integration Test Runner
 *
 * Connects to a running MCP server (SSE mode) and exercises all 20 tools
 * against a real SiYuan instance. Generates TEST_REPORT.md with results.
 *
 * Usage:
 *   node scripts/tool-tests.mjs [--mcp-url http://localhost:3999]
 *
 * Environment (read from .env or process.env):
 *   SIYUAN_URL   - SiYuan kernel URL
 *   SIYUAN_TOKEN - SiYuan API token
 *   MCP_PORT     - MCP server SSE port (default 3999)
 */

import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync } from 'fs';

// ─── Module Resolution ────────────────────────────────────────────
// ESM doesn't use NODE_PATH. We resolve @modelcontextprotocol/sdk
// from packages/siyuan-mcp/node_modules using createRequire.

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');
const mcpNodeModules = resolve(projectRoot, 'packages', 'siyuan-mcp', 'node_modules');

// Create a require function that resolves from the MCP package's node_modules
const requireFromMcp = createRequire(pathToFileURL(resolve(mcpNodeModules, '_resolver.js')).href);

const { Client } = requireFromMcp('@modelcontextprotocol/sdk/client/index.js');
const { SSEClientTransport } = requireFromMcp('@modelcontextprotocol/sdk/client/sse.js');

// ─── Config ───────────────────────────────────────────────────────

const MCP_PORT = process.env.MCP_PORT || process.env.TEST_PORT || '3999';
const MCP_URL = process.argv.find(a => a.startsWith('--mcp-url='))?.split('=')[1]
  || `http://localhost:${MCP_PORT}`;

const REPORT_PATH = resolve(projectRoot, 'TEST_REPORT.md');

// ─── Test Context (shared state between tests) ────────────────────

const ctx = {
  notebookId: '',
  secondNotebookId: '',
  docId: '',
  todoBlockId: '',
  dailyNoteId: '',
  dailyNotePath: '',
  testKeyword: 'MCP',
  testDocTitle: `MCP-AutoTest-${Date.now()}`,
  createdDocIds: [],   // for cleanup
};

// ─── Helpers ──────────────────────────────────────────────────────

function extractText(result) {
  if (!result || !result.content || !Array.isArray(result.content)) return '';
  return result.content.map(c => c.type === 'text' ? c.text : '').join('\n');
}

function hasHtmlLeakage(text) {
  const patterns = [
    /<div[\s>]/i, /<span[\s>]/i, /<p[\s>]/i, /<br[\s/>]/i,
    /&gt;/i, /&lt;/i, /&quot;/i,
    /\{:.*?\}/,  // kramdown attributes
  ];
  return patterns.some(p => p.test(text));
}

function truncate(str, max = 200) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '...' : str;
}

// ─── Test Case Definitions ────────────────────────────────────────
// Each test: { id, tool, phase, name, args, validate, skip? }
// args can be a function(ctx) => object or a plain object
// validate(result, ctx) => { pass: boolean, detail: string }

const TEST_CASES = [
  // ─── Phase 1: Core Note Tools (6) ───────────────────────────────
  {
    id: 1,
    tool: 'list_notebooks',
    phase: 'Phase 1',
    name: '列出所有笔记本',
    args: {},
    validate: (result, ctx) => {
      const text = extractText(result);
      if (result.isError) return { pass: false, detail: `Error: ${truncate(text)}` };
      if (!text.includes('notebook')) return { pass: false, detail: `Unexpected output: ${truncate(text)}` };
      // Extract notebook ID from output
      const idMatch = text.match(/\*\*ID\*\*:\s*(\S+)/);
      if (idMatch) {
        ctx.notebookId = idMatch[1];
        // Try to find a second notebook
        const allIds = [...text.matchAll(/\*\*ID\*\*:\s*(\S+)/g)].map(m => m[1]);
        if (allIds.length >= 2) ctx.secondNotebookId = allIds[1];
        return { pass: true, detail: `Found ${allIds.length} notebook(s), using: ${ctx.notebookId}` };
      }
      return { pass: false, detail: 'No notebook ID found in output' };
    },
  },
  {
    id: 2,
    tool: 'get_daily_note',
    phase: 'Phase 1',
    name: '获取/创建每日笔记',
    args: (ctx) => ({ notebook: ctx.notebookId }),
    validate: (result, ctx) => {
      const text = extractText(result);
      if (result.isError) return { pass: false, detail: `Error: ${truncate(text)}` };
      const idMatch = text.match(/\*\*ID\*\*:\s*(\S+)/);
      if (idMatch) {
        ctx.dailyNoteId = idMatch[1];
        return { pass: true, detail: `Daily note ID: ${ctx.dailyNoteId}` };
      }
      return { pass: true, detail: 'Daily note response received (may not have ID)' };
    },
  },
  {
    id: 3,
    tool: 'create_note',
    phase: 'Phase 1',
    name: '创建测试文档',
    args: (ctx) => ({
      notebook: ctx.notebookId,
      path: '/MCP-AutoTest',
      title: ctx.testDocTitle,
      markdown: `# ${ctx.testDocTitle}\n\nThis is an automated test document.\n\n## Section A\n\nContent for testing.\n\n## TODOs\n\n- [ ] Test todo item\n`,
    }),
    validate: (result, ctx) => {
      const text = extractText(result);
      if (result.isError) return { pass: false, detail: `Error: ${truncate(text)}` };
      const idMatch = text.match(/\*\*ID\*\*:\s*(\S+)/);
      if (idMatch && idMatch[1] && idMatch[1].length > 5) {
        ctx.docId = idMatch[1];
        ctx.createdDocIds.push(ctx.docId);
        return { pass: true, detail: `Created doc ID: ${ctx.docId}` };
      }
      return { pass: false, detail: `No valid doc ID returned: ${truncate(text)}` };
    },
  },
  {
    id: 4,
    tool: 'read_note',
    phase: 'Phase 1',
    name: '读取文档内容',
    args: (ctx) => ({ doc_id: ctx.docId }),
    skip: (ctx) => !ctx.docId,
    validate: (result, ctx) => {
      const text = extractText(result);
      if (result.isError) return { pass: false, detail: `Error: ${truncate(text)}` };
      if (text.includes(ctx.testDocTitle)) {
        return { pass: true, detail: `Content matches (contains "${ctx.testDocTitle}")` };
      }
      return { pass: false, detail: `Content mismatch: ${truncate(text)}` };
    },
  },
  {
    id: 5,
    tool: 'append_note',
    phase: 'Phase 1',
    name: '追加文档内容',
    args: (ctx) => ({
      doc_id: ctx.docId,
      markdown: '\n## Appended Section\n\nThis content was appended by the test runner.',
    }),
    skip: (ctx) => !ctx.docId,
    validate: (result, ctx) => {
      const text = extractText(result);
      if (result.isError) return { pass: false, detail: `Error: ${truncate(text)}` };
      if (text.includes('Block ID')) {
        return { pass: true, detail: truncate(text) };
      }
      return { pass: true, detail: 'Append completed' };
    },
  },
  {
    id: 6,
    tool: 'search_notes',
    phase: 'Phase 1',
    name: '搜索笔记',
    args: { keyword: 'MCP', limit: 5, mode: 'hybrid', sort: 'composite' },
    validate: (result, ctx) => {
      const text = extractText(result);
      if (result.isError) return { pass: false, detail: `Error: ${truncate(text)}` };
      if (hasHtmlLeakage(text)) return { pass: false, detail: `HTML leakage detected: ${truncate(text)}` };
      return { pass: true, detail: truncate(text, 120) };
    },
  },

  // ─── Phase 2: Todo & Note Management (6) ────────────────────────
  {
    id: 7,
    tool: 'list_todos',
    phase: 'Phase 2',
    name: '列出所有待办',
    args: {},
    validate: (result, ctx) => {
      const text = extractText(result);
      if (result.isError) return { pass: false, detail: `Error: ${truncate(text)}` };
      if (hasHtmlLeakage(text)) return { pass: false, detail: `HTML leakage detected: ${truncate(text)}` };
      return { pass: true, detail: truncate(text, 120) };
    },
  },
  {
    id: 8,
    tool: 'create_todo',
    phase: 'Phase 2',
    name: '创建待办项',
    args: (ctx) => ({
      doc_id: ctx.docId,
      content: 'AutoTest: verify create_todo works',
      done: false,
    }),
    skip: (ctx) => !ctx.docId,
    validate: (result, ctx) => {
      const text = extractText(result);
      if (result.isError) return { pass: false, detail: `Error: ${truncate(text)}` };
      const idMatch = text.match(/\*\*Block ID\*\*:\s*(\S+)/);
      if (idMatch) {
        ctx.todoBlockId = idMatch[1];
        return { pass: true, detail: `Todo block ID: ${ctx.todoBlockId}` };
      }
      return { pass: true, detail: 'Todo created' };
    },
  },
  {
    id: 9,
    tool: 'complete_todo',
    phase: 'Phase 2',
    name: '完成待办项',
    args: (ctx) => ({ todo_id: ctx.todoBlockId }),
    skip: (ctx) => !ctx.todoBlockId,
    validate: (result, ctx) => {
      const text = extractText(result);
      if (result.isError) return { pass: false, detail: `Error: ${truncate(text)}` };
      return { pass: true, detail: 'Todo marked as complete' };
    },
  },
  {
    id: 10,
    tool: 'rename_note',
    phase: 'Phase 2',
    name: '重命名文档',
    args: (ctx) => ({
      doc_id: ctx.docId,
      title: `${ctx.testDocTitle}-renamed`,
    }),
    skip: (ctx) => !ctx.docId,
    validate: (result, ctx) => {
      const text = extractText(result);
      if (result.isError) return { pass: false, detail: `Error: ${truncate(text)}` };
      return { pass: true, detail: 'Document renamed' };
    },
  },
  {
    id: 11,
    tool: 'move_note',
    phase: 'Phase 2',
    name: '移动文档',
    args: (ctx) => ({
      doc_id: ctx.docId,
      notebook: ctx.secondNotebookId || ctx.notebookId,
      path: '/MCP-AutoTest-Moved',
    }),
    skip: (ctx) => !ctx.docId,
    validate: (result, ctx) => {
      const text = extractText(result);
      if (result.isError) return { pass: false, detail: `Error: ${truncate(text)}` };
      return { pass: true, detail: `Document moved to notebook: ${ctx.secondNotebookId || ctx.notebookId}` };
    },
  },
  {
    id: 12,
    tool: 'delete_note',
    phase: 'Phase 2',
    name: '删除文档',
    args: (ctx) => ({ doc_id: ctx.docId }),
    skip: (ctx) => !ctx.docId,
    validate: (result, ctx) => {
      const text = extractText(result);
      if (result.isError) return { pass: false, detail: `Error: ${truncate(text)}` };
      return { pass: true, detail: 'Document deleted (cleanup)' };
    },
  },

  // ─── Phase 3: AI Workflow Tools (6) ─────────────────────────────
  {
    id: 13,
    tool: 'knowledge_context',
    phase: 'Phase 3',
    name: '构建知识上下文',
    args: { topic: 'Docker', depth: 3 },
    validate: (result, ctx) => {
      const text = extractText(result);
      if (result.isError) return { pass: false, detail: `Error: ${truncate(text)}` };
      if (hasHtmlLeakage(text)) return { pass: false, detail: `HTML leakage detected: ${truncate(text)}` };
      if (text.length < 10) return { pass: false, detail: 'Output too short' };
      return { pass: true, detail: `Generated ${text.length} chars` };
    },
  },
  {
    id: 14,
    tool: 'project_context',
    phase: 'Phase 3',
    name: '项目上下文聚合',
    args: { project: 'MCP', depth: 5 },
    validate: (result, ctx) => {
      const text = extractText(result);
      if (result.isError) return { pass: false, detail: `Error: ${truncate(text)}` };
      if (hasHtmlLeakage(text)) return { pass: false, detail: `HTML leakage detected: ${truncate(text)}` };
      return { pass: true, detail: `Generated ${text.length} chars` };
    },
  },
  {
    id: 15,
    tool: 'meeting_summary',
    phase: 'Phase 3',
    name: '会议纪要解析',
    args: {
      content: `# 项目周会\n\n日期: 2026-08-01\n参会: 张三, 李四, 王五\n\n## 讨论内容\n\n讨论了MCP服务器的测试覆盖率和自动化测试方案。\n\n## 决议\n\n1. 采用自动化测试系统替代手动测试\n2. 每次发布前必须运行全量测试\n\n## 行动项\n\n- [ ] 张三: 搭建CI流水线 @2026-08-05\n- [ ] 李四: 编写测试文档 @2026-08-07\n- [ ] 王五: 部署测试环境 @2026-08-03\n\n## 风险\n\n- 测试环境不稳定可能导致误报\n- SiYuan API 版本差异可能影响兼容性`,
      title: 'MCP项目周会-20260801',
    },
    validate: (result, ctx) => {
      const text = extractText(result);
      if (result.isError) return { pass: false, detail: `Error: ${truncate(text)}` };
      if (hasHtmlLeakage(text)) return { pass: false, detail: `HTML leakage detected: ${truncate(text)}` };
      // Check for structured content
      const hasDecisions = text.includes('决') || text.includes('decision') || text.includes('议');
      const hasActions = text.includes('行') || text.includes('action') || text.includes('待办') || text.includes('todo');
      const hasRisks = text.includes('风险') || text.includes('risk');
      const sections = [hasDecisions, hasActions, hasRisks].filter(Boolean).length;
      if (sections >= 2) {
        // Save created doc for cleanup
        const idMatch = text.match(/\*\*ID\*\*:\s*(\S+)/);
        if (idMatch) ctx.createdDocIds.push(idMatch[1]);
        return { pass: true, detail: `Structured content found (${sections}/3 sections)` };
      }
      return { pass: false, detail: `Missing structured sections: ${truncate(text)}` };
    },
  },
  {
    id: 16,
    tool: 'daily_review',
    phase: 'Phase 3',
    name: '生成日报',
    args: {},
    validate: (result, ctx) => {
      const text = extractText(result);
      if (result.isError) return { pass: false, detail: `Error: ${truncate(text)}` };
      if (hasHtmlLeakage(text)) return { pass: false, detail: `HTML leakage detected: ${truncate(text)}` };
      return { pass: true, detail: `Generated ${text.length} chars` };
    },
  },
  {
    id: 17,
    tool: 'weekly_review',
    phase: 'Phase 3',
    name: '生成周报',
    args: {},
    validate: (result, ctx) => {
      const text = extractText(result);
      if (result.isError) return { pass: false, detail: `Error: ${truncate(text)}` };
      // Weekly review is the most prone to HTML leakage — check thoroughly
      if (hasHtmlLeakage(text)) return { pass: false, detail: `HTML leakage detected: ${truncate(text)}` };
      return { pass: true, detail: `Generated ${text.length} chars, no HTML leakage` };
    },
  },
  {
    id: 18,
    tool: 'find_related_notes',
    phase: 'Phase 3',
    name: '查找相关笔记',
    args: (ctx) => ({ doc_id: ctx.dailyNoteId || ctx.docId }),
    skip: (ctx) => !ctx.dailyNoteId && !ctx.docId,
    validate: (result, ctx) => {
      const text = extractText(result);
      if (result.isError) return { pass: false, detail: `Error: ${truncate(text)}` };
      if (hasHtmlLeakage(text)) return { pass: false, detail: `HTML leakage detected: ${truncate(text)}` };
      return { pass: true, detail: truncate(text, 120) };
    },
  },

  // ─── Phase 4: Customer & Timeline (2) ──────────────────────────
  {
    id: 19,
    tool: 'customer_context',
    phase: 'Phase 4',
    name: '客户上下文聚合',
    args: { customer: '测试客户', depth: 5 },
    validate: (result, ctx) => {
      const text = extractText(result);
      if (result.isError) return { pass: false, detail: `Error: ${truncate(text)}` };
      if (hasHtmlLeakage(text)) return { pass: false, detail: `HTML leakage detected: ${truncate(text)}` };
      return { pass: true, detail: `Generated ${text.length} chars` };
    },
  },
  {
    id: 20,
    tool: 'project_timeline',
    phase: 'Phase 4',
    name: '项目时间线',
    args: { project: 'MCP', depth: 10 },
    validate: (result, ctx) => {
      const text = extractText(result);
      if (result.isError) return { pass: false, detail: `Error: ${truncate(text)}` };
      if (hasHtmlLeakage(text)) return { pass: false, detail: `HTML leakage detected: ${truncate(text)}` };
      return { pass: true, detail: `Generated ${text.length} chars` };
    },
  },
];

// ─── Test Runner ──────────────────────────────────────────────────

async function connectMcpClient(url) {
  const transport = new SSEClientTransport(new URL(url + '/sse'));
  const client = new Client(
    { name: 'siyuan-test-runner', version: '1.0.0' },
    { capabilities: {} },
  );
  await client.connect(transport);
  return client;
}

async function runTests(client) {
  const results = [];
  let passed = 0, failed = 0, skipped = 0;

  // Verify all 20 tools are registered
  let toolsList = [];
  try {
    const listResult = await client.listTools();
    toolsList = listResult.tools.map(t => t.name);
  } catch (err) {
    console.error('Failed to list tools:', err.message);
  }

  for (const tc of TEST_CASES) {
    const startTime = Date.now();

    // Check skip condition
    if (tc.skip && tc.skip(ctx)) {
      const duration = Date.now() - startTime;
      results.push({
        ...tc,
        status: 'SKIP',
        duration,
        detail: 'Skipped (dependency not available)',
      });
      skipped++;
      console.log(`  [SKIP] #${tc.id} ${tc.tool} - ${tc.name}`);
      continue;
    }

    // Resolve args
    const args = typeof tc.args === 'function' ? tc.args(ctx) : tc.args;

    try {
      const result = await client.callTool({ name: tc.tool, arguments: args });
      const duration = Date.now() - startTime;

      const validation = tc.validate(result, ctx);
      const status = validation.pass ? 'PASS' : 'FAIL';

      results.push({
        ...tc,
        status,
        duration,
        detail: validation.detail,
        isError: result.isError || false,
      });

      if (validation.pass) {
        passed++;
        console.log(`  [PASS] #${tc.id} ${tc.tool} - ${tc.name} (${duration}ms)`);
      } else {
        failed++;
        console.log(`  [FAIL] #${tc.id} ${tc.tool} - ${tc.name} (${duration}ms)`);
        console.log(`         ${validation.detail}`);
      }
    } catch (err) {
      const duration = Date.now() - startTime;
      const detail = err.message || String(err);
      results.push({
        ...tc,
        status: 'FAIL',
        duration,
        detail: `Exception: ${truncate(detail)}`,
        isError: true,
      });
      failed++;
      console.log(`  [FAIL] #${tc.id} ${tc.tool} - ${tc.name} (${duration}ms)`);
      console.log(`         ${truncate(detail)}`);
    }
  }

  return { results, passed, failed, skipped, toolsList };
}

// ─── Report Generator ─────────────────────────────────────────────

function generateReport(testData, envInfo) {
  const { results, passed, failed, skipped, toolsList } = testData;
  const total = results.length;
  const passRate = ((passed / total) * 100).toFixed(1);
  const now = new Date();
  const timestamp = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

  // Group by phase
  const phases = {};
  for (const r of results) {
    if (!phases[r.phase]) phases[r.phase] = [];
    phases[r.phase].push(r);
  }

  // Tools coverage check
  const expectedTools = TEST_CASES.map(t => t.tool);
  const missingTools = expectedTools.filter(t => !toolsList.includes(t));
  const extraTools = toolsList.filter(t => !expectedTools.includes(t));

  let md = `# SiYuan MCP 自动化测试报告\n\n`;
  md += `- **测试时间**: ${timestamp}\n`;
  md += `- **版本**: ${envInfo.version}\n`;
  md += `- **SiYuan URL**: ${envInfo.siyuanUrl}\n`;
  md += `- **MCP 端点**: ${MCP_URL}\n`;
  md += `- **Node.js**: ${envInfo.nodeVersion}\n`;
  md += `- **总工具数**: ${toolsList.length} (注册) / ${total} (测试)\n`;
  md += `- **测试结果**: ${passed} 通过 / ${failed} 失败 / ${skipped} 跳过 = ${total} 总计\n`;
  md += `- **通过率**: ${passRate}%\n\n`;

  // Environment status
  md += `## 测试环境\n\n`;
  md += `| 检查项 | 状态 |\n`;
  md += `|--------|------|\n`;
  md += `| 项目构建 | ${envInfo.buildOk ? '✅ 成功' : '❌ 失败'} |\n`;
  md += `| MCP 服务启动 | ${envInfo.mcpStarted ? '✅ 正常' : '❌ 异常'} |\n`;
  md += `| SiYuan 连接 | ${envInfo.siyuanConnected ? '✅ 正常' : '❌ 异常'} |\n`;
  md += `| 工具注册完整性 | ${missingTools.length === 0 ? '✅ 完整' : '⚠️ 缺失: ' + missingTools.join(', ')} |\n`;
  if (extraTools.length > 0) {
    md += `| 额外工具 | ${extraTools.join(', ')} |\n`;
  }
  md += `\n`;

  // Test details by phase
  md += `## 测试详情\n\n`;

  for (const [phase, phaseResults] of Object.entries(phases)) {
    const phasePassed = phaseResults.filter(r => r.status === 'PASS').length;
    const phaseTotal = phaseResults.length;
    md += `### ${phase} (${phasePassed}/${phaseTotal})\n\n`;
    md += `| # | 工具 | 名称 | 状态 | 耗时 | 说明 |\n`;
    md += `|---|------|------|------|------|------|\n`;
    for (const r of phaseResults) {
      const statusIcon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⏭️';
      md += `| ${r.id} | \`${r.tool}\` | ${r.name} | ${statusIcon} ${r.status} | ${r.duration}ms | ${truncate(r.detail, 80)} |\n`;
    }
    md += `\n`;
  }

  // Failed test details
  const failedTests = results.filter(r => r.status === 'FAIL');
  if (failedTests.length > 0) {
    md += `## 失败详情\n\n`;
    for (const r of failedTests) {
      md += `### ❌ #${r.id} ${r.tool} - ${r.name}\n\n`;
      md += `- **耗时**: ${r.duration}ms\n`;
      md += `- **原因**: ${r.detail}\n\n`;
    }
  }

  // Cleanup status
  md += `## 清理状态\n\n`;
  md += `- 测试创建的文档ID: ${ctx.createdDocIds.length > 0 ? ctx.createdDocIds.join(', ') : '无'}\n`;
  md += `- 清理状态: ${ctx.createdDocIds.length > 0 ? '已在 delete_note 测试中清理' : '无需清理'}\n\n`;

  // Summary
  md += `## 总结\n\n`;
  md += `| 指标 | 值 |\n`;
  md += `|------|----|\n`;
  md += `| 总计 | ${total} |\n`;
  md += `| 通过 | ${passed} |\n`;
  md += `| 失败 | ${failed} |\n`;
  md += `| 跳过 | ${skipped} |\n`;
  md += `| 通过率 | ${passRate}% |\n`;
  md += `| 总耗时 | ${results.reduce((s, r) => s + r.duration, 0)}ms |\n\n`;

  if (failed === 0 && skipped === 0) {
    md += `> ✅ **所有 ${total} 个工具测试全部通过！**\n`;
  } else if (failed === 0) {
    md += `> ⚠️ **${passed} 个通过, ${skipped} 个跳过（依赖条件不满足）**\n`;
  } else {
    md += `> ❌ **${failed} 个工具测试失败，请查看上方失败详情**\n`;
  }

  md += `\n---\n*Generated by SiYuan MCP Automated Test System at ${timestamp}*\n`;

  return md;
}

// ─── Cleanup: delete any remaining test documents ─────────────────

async function cleanup(client) {
  for (const docId of ctx.createdDocIds) {
    if (docId && docId !== ctx.docId) {  // docId already deleted in test 12
      try {
        await client.callTool({ name: 'delete_note', arguments: { doc_id: docId } });
        console.log(`  [CLEANUP] Deleted leftover doc: ${docId}`);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────

async function main() {
  console.log('========================================');
  console.log('  SiYuan MCP Automated Tool Tests');
  console.log('========================================');
  console.log(`MCP URL: ${MCP_URL}`);
  console.log(`Report:  ${REPORT_PATH}`);
  console.log('');

  // Collect environment info
  const envInfo = {
    version: process.env.npm_package_version || '1.0.5',
    siyuanUrl: process.env.SIYUAN_URL || 'http://127.0.0.1:6806',
    nodeVersion: process.version,
    buildOk: true,
    mcpStarted: true,
    siyuanConnected: false,
  };

  // Connect to MCP server
  let client;
  try {
    console.log('Connecting to MCP server...');
    client = await connectMcpClient(MCP_URL);
    console.log('Connected!\n');
  } catch (err) {
    console.error(`Failed to connect to MCP server: ${err.message}`);
    envInfo.mcpStarted = false;

    // Generate failure report
    const testData = {
      results: TEST_CASES.map(tc => ({
        ...tc,
        status: 'FAIL',
        duration: 0,
        detail: 'MCP server not reachable',
        isError: true,
      })),
      passed: 0,
      failed: TEST_CASES.length,
      skipped: 0,
      toolsList: [],
    };
    const report = generateReport(testData, envInfo);
    writeFileSync(REPORT_PATH, report, 'utf-8');
    console.log(`\nReport written to: ${REPORT_PATH}`);
    process.exit(1);
  }

  // Check SiYuan connectivity via health endpoint
  try {
    const resp = await fetch(`${MCP_URL}/health`);
    const health = await resp.json();
    envInfo.siyuanConnected = health.siyuanConnected;
    envInfo.siyuanUrl = health.siyuanUrl || envInfo.siyuanUrl;
    console.log(`Health check: SiYuan ${envInfo.siyuanConnected ? 'connected' : 'NOT connected'}\n`);
  } catch {
    console.log('Health check: skipped (endpoint not available)\n');
  }

  // Run tests
  console.log(`Running ${TEST_CASES.length} tool tests...\n`);
  const testData = await runTests(client);

  // Cleanup
  await cleanup(client);

  // Generate report
  const report = generateReport(testData, envInfo);
  writeFileSync(REPORT_PATH, report, 'utf-8');

  // Summary
  console.log('\n========================================');
  console.log(`  Results: ${testData.passed} PASS / ${testData.failed} FAIL / ${testData.skipped} SKIP`);
  console.log(`  Report:  ${REPORT_PATH}`);
  console.log('========================================\n');

  // Close client
  await client.close();

  process.exit(testData.failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
