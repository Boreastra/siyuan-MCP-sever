/**
 * SiYuan MCP Server - Entry Point
 *
 * Starts the MCP server in either stdio or HTTP/SSE mode based on
 * the TRANSPORT environment variable.
 *
 * stdio  → local MCP client connections (WorkBuddy, Claude Desktop, Cursor)
 * sse    → HTTP/SSE transport for Docker deployment and remote access
 */

import 'dotenv/config';
import { SiYuanClient, setLogLevel, type LogLevel } from '@siyuan-ai/sdk';

import { SiYuanMCPServer } from './server/mcp-server.js';
import { startStdioServer } from './transport/stdio.js';
import { startHttpServer } from './transport/http.js';

// ─── Load configuration from environment ──────────────────────────

const SIYUAN_URL = process.env.SIYUAN_URL ?? 'http://127.0.0.1:6806';
const SIYUAN_TOKEN = process.env.SIYUAN_TOKEN ?? '';
const PORT = Number(process.env.PORT ?? 3000);
const LOG_LEVEL = (process.env.LOG_LEVEL ?? 'info') as LogLevel;
const TRANSPORT = (process.env.TRANSPORT ?? 'stdio') as 'stdio' | 'sse';

setLogLevel(LOG_LEVEL);

// ─── Main ──────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const siyuan = new SiYuanClient({
    url: SIYUAN_URL,
    token: SIYUAN_TOKEN,
    logLevel: LOG_LEVEL,
  });

  // Verify connectivity at startup
  const ok = await siyuan.ping();
  if (!ok) {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        message: 'Cannot connect to SiYuan kernel',
        url: SIYUAN_URL,
      }),
    );
    console.error('Is SiYuan running? Check SIYUAN_URL and SIYUAN_TOKEN.');
    process.exit(1);
  }

  if (TRANSPORT === 'sse') {
    // HTTP/SSE mode — one server, multiple SSE connections
    await startHttpServer(siyuan, PORT);
  } else {
    // stdio mode — single connection, standard MCP transport
    const mcpServer = new SiYuanMCPServer(siyuan);
    await startStdioServer(mcpServer);
  }
}

// ─── Export public API ─────────────────────────────────────────────

export { SiYuanMCPServer } from './server/mcp-server.js';
export { TOOL_DEFINITIONS } from './tools/definitions.js';
export { ToolHandlers } from './tools/handlers.js';
export type {
  ToolHandlerResult,
} from './tools/handlers.js';

// ─── Run ───────────────────────────────────────────────────────────

main().catch((err) => {
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      message: 'Fatal error',
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    }),
  );
  process.exit(1);
});
