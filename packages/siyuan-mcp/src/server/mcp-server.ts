/**
 * MCP Server - Core Setup
 *
 * Creates and configures the MCP Server instance with all SiYuan tools.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import type { SiYuanClient } from '@siyuan-ai/sdk';
import { logger } from '@siyuan-ai/sdk';
import { TOOL_DEFINITIONS } from '../tools/definitions.js';
import { ToolHandlers } from '../tools/handlers.js';

export class SiYuanMCPServer {
  private readonly server: Server;
  private readonly handlers: ToolHandlers;

  constructor(siyuan: SiYuanClient) {
    this.server = new Server(
      { name: 'siyuan-mcp', version: '1.3.5' },
      { capabilities: { tools: {} } },
    );
    this.handlers = new ToolHandlers(siyuan);
    this.setupHandlers();
  }

  /** Get the underlying MCP Server instance */
  get instance(): Server {
    return this.server;
  }

  private setupHandlers(): void {
    // List tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      logger.debug('ListTools request received');
      return {
        tools: TOOL_DEFINITIONS as Tool[],
      };
    });

    // Call tool
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      logger.info('CallTool request', { tool: name });
      logger.debug('CallTool arguments', { args });

      const result = await this.handlers.handle(name, args ?? {});

      return {
        content: result.content,
        isError: result.isError,
      };
    });
  }

  /** Connect the server to a transport */
  async connect(transport: Transport): Promise<void> {
    await this.server.connect(transport);
    logger.info('MCP server connected to transport');
  }
}
