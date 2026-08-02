/**
 * Transport - HTTP/SSE
 *
 * HTTP transport with:
 *   - /health  → JSON health check
 *   - /sse     → MCP SSE transport endpoint
 *   - /message → MCP message endpoint (POST)
 *
 * Used for Docker deployment and remote MCP access.
 */

import express from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import type { SiYuanClient } from '@siyuan-ai/sdk';
import { logger } from '@siyuan-ai/sdk';
import { SiYuanMCPServer } from '../server/mcp-server.js';

export async function startHttpServer(
  siyuan: SiYuanClient,
  port: number,
): Promise<void> {
  const app = express();
  app.use(express.json());

  // Track active SSE transports
  const transports = new Map<string, SSEServerTransport>();

  // ─── Health Check ────────────────────────────────────────────────
  app.get('/health', async (_req, res) => {
    try {
      const siyuanOk = await siyuan.ping();
      const health = {
        status: siyuanOk ? 'healthy' : 'degraded',
        siyuanConnected: siyuanOk,
        siyuanUrl: siyuan.http.baseURL,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      };
      const httpStatus = siyuanOk ? 200 : 503;
      res.status(httpStatus).json(health);
    } catch (err) {
      res.status(503).json({
        status: 'unhealthy',
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      });
    }
  });

  // ─── SSE Endpoint ────────────────────────────────────────────────
  app.get('/sse', async (_req, res) => {
    try {
      const transport = new SSEServerTransport('/message', res);

      // Use the transport's built-in session ID
      transports.set(transport.sessionId, transport);

      // Create a fresh MCP server instance for this connection
      const mcpServer = new SiYuanMCPServer(siyuan);
      await mcpServer.connect(transport);

      logger.info('SSE client connected', { sessionId: transport.sessionId });

      // Cleanup on close
      res.on('close', () => {
        transports.delete(transport.sessionId);
        logger.info('SSE client disconnected', { sessionId: transport.sessionId });
      });
    } catch (err) {
      logger.error('SSE setup failed', { error: err instanceof Error ? err.message : String(err) });
      res.status(500).json({ error: 'SSE setup failed' });
    }
  });

  // ─── Message Endpoint ────────────────────────────────────────────
  app.post('/message', async (req, res) => {
    const sessionId = req.query.sessionId as string | undefined;

    if (!sessionId) {
      res.status(400).json({ error: 'Missing sessionId' });
      return;
    }

    const transport = transports.get(sessionId);
    if (!transport) {
      res.status(404).json({ error: 'Transport not found' });
      return;
    }

    try {
      // MCP SDK 1.30+: handlePostMessage(req, res, parsedBody)
      // The method handles the HTTP response internally (writes 202 on success,
      // 400 on error). Do NOT send another response after calling it.
      await transport.handlePostMessage(req, res, req.body);
    } catch (err) {
      // handlePostMessage already sent an error response via res
      logger.error('Message handling failed', {
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // ─── Start ───────────────────────────────────────────────────────
  app.listen(port, () => {
    logger.info(`HTTP server listening on port ${port}`);
    logger.info('Endpoints: GET /health, GET /sse, POST /message');
  });
}
