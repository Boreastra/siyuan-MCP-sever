/**
 * Phase 4 acceptance: call list_todos via a REAL MCP session (SSE) and
 * cross-check against direct SQL ground truth. Read-only: no writes to SiYuan.
 */
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

// Resolve MCP SDK from the package's node_modules (same pattern as tool-tests.mjs)
const pkgDir = path.resolve(process.cwd(), 'packages/siyuan-mcp');
const req = createRequire(path.join(pkgDir, 'package.json'));
const { Client } = req('@modelcontextprotocol/sdk/client/index.js');
const { SSEClientTransport } = req('@modelcontextprotocol/sdk/client/sse.js');

// Load .env (token never printed)
for (const line of readFileSync(path.resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const base = process.env.SIYUAN_URL;
const token = process.env.SIYUAN_TOKEN;

async function sql(stmt) {
  const res = await fetch(`${base}/api/query/sql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Token ${token}` },
    body: JSON.stringify({ stmt }),
  });
  const json = await res.json();
  return json.code === 0 ? json.data : { error: json.msg };
}

const PORT = process.env.TEST_PORT || '3999';
const url = `http://localhost:${PORT}/sse`;

console.log('Connecting MCP client to', url);
const transport = new SSEClientTransport(new URL(url));
const client = new Client({ name: 'acceptance-client', version: '1.0.0' });
await client.connect(transport);
console.log('CONNECTED');

// 1. tools/list — schema unchanged?
const tools = await client.listTools();
const lt = tools.tools.find((t) => t.name === 'list_todos');
console.log('\n[A1] list_todos registered:', !!lt);
console.log('[A2] inputSchema:', JSON.stringify(lt.inputSchema));
console.log('[A3] tool count total:', tools.tools.length);

// 2. list_todos without args
const r1 = await client.callTool({ name: 'list_todos', arguments: {} });
const t1text = (r1.content ?? []).map((c) => c.text).join('\n');
console.log('\n[B1] list_todos() isError:', !!r1.isError);
console.log('[B1] output preview:\n' + t1text.split('\n').slice(0, 12).join('\n'));

// 3. Ground truth via direct SQL
const gtTotal = await sql(`SELECT COUNT(*) AS cnt FROM blocks WHERE type='i' AND subtype='t'`);
const gtUndone = await sql(`SELECT COUNT(*) AS cnt FROM blocks WHERE type='i' AND subtype='t' AND markdown LIKE '- [ ]%'`);
console.log('\n[C1] ground truth: total task items =', gtTotal[0]?.cnt, ', unfinished =', gtUndone[0]?.cnt);

// 4. Notebook filter
const nbResp = await client.callTool({ name: 'list_notebooks', arguments: {} });
const nbText = (nbResp.content ?? []).map((c) => c.text).join('\n');
const nbLine = nbText.split('\n').find((l) => l.includes('工作-每日记录'));
const nbId = nbLine?.match(/[0-9]{14}-[a-z0-9]+/)?.[0];
console.log('\n[D1] notebook "工作-每日记录" id =', nbId);
if (nbId) {
  const r2 = await client.callTool({ name: 'list_todos', arguments: { notebook: nbId } });
  const t2 = (r2.content ?? []).map((c) => c.text).join('\n');
  const gtNb = await sql(`SELECT COUNT(*) AS cnt FROM blocks WHERE type='i' AND subtype='t' AND box='${nbId}'`);
  const mcpCount = (t2.match(/2026\d{10}-[a-z0-9]+/g) ?? []).length;
  console.log('[D2] MCP rows (id occurrences):', mcpCount, '| ground truth:', gtNb[0]?.cnt);
}

// 5. Cross-check unfinished content: pick 3 unfinished from ground truth, verify they appear in MCP output
const gtSample = await sql(`SELECT id, content FROM blocks WHERE type='i' AND subtype='t' AND markdown LIKE '- [ ]%' ORDER BY updated DESC LIMIT 3`);
const allIds = new Set((t1text.match(/2026\d{10}-[a-z0-9]+/g) ?? []));
console.log('\n[E1] unfinished sample cross-check (id in MCP output?):');
for (const row of gtSample) console.log(`  ${row.id}: ${allIds.has(row.id) ? 'FOUND' : 'MISSING'} | ${String(row.content).slice(0, 40)}`);

await client.close();
console.log('\nACCEPTANCE-DONE');
