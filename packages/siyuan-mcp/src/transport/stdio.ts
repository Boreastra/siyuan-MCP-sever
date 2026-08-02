/**
 * Transport - Stdio
 *
 * Standard MCP stdio transport for local client connections
 * (WorkBuddy, Claude Desktop, Cursor, etc.)
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { logger } from '@siyuan-ai/sdk';
import { SiYuanMCPServer } from '../server/mcp-server.js';

export async function startStdioServer(siyuanServer: SiYuanMCPServer): Promise<void> {
  const transport = new StdioServerTransport();

  logger.info('Starting MCP server in stdio mode');

  await siyuanServer.connect(transport);
  logger.info('SiYuan MCP Server ready (stdio)');
}
