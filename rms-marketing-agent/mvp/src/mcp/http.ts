// Remote MCP: the same RevPilot server over Streamable HTTP with Bearer-key auth, so
// external products (not just local Claude) can connect. Stateless mode — every request
// builds a fresh transport against the shared runtime; the world lives in the store.
// Run: REVPILOT_API_KEYS=key1,key2 npm run mcp:http   (port via MCP_HTTP_PORT, default 8788)
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Runtime } from '../engine/engine.ts';
import { buildMcpServer } from './server.ts';

export interface McpHttpOptions {
  port: number;
  /** non-empty API keys; requests must send Authorization: Bearer <key> */
  apiKeys: string[];
}

export function startMcpHttpServer(rt: Runtime, opts: McpHttpOptions): Server {
  const keys = new Set(opts.apiKeys.map((k) => k.trim()).filter(Boolean));
  if (keys.size === 0) {
    throw new Error('refusing to start the remote MCP server without API keys — set REVPILOT_API_KEYS=key1,key2');
  }

  const httpServer = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'revpilot-mcp' }));
      return;
    }
    if (url.pathname !== '/mcp') {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found — the MCP endpoint is POST /mcp' }));
      return;
    }

    const auth = req.headers.authorization ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!keys.has(token)) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        jsonrpc: '2.0', id: null,
        error: { code: -32001, message: 'unauthorized: send Authorization: Bearer <api key>' },
      }));
      return;
    }

    try {
      const body = await readJsonBody(req);
      // stateless: one transport + server instance per request, all over the same runtime
      const server = buildMcpServer(rt);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on('close', () => {
        transport.close();
        server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          jsonrpc: '2.0', id: null,
          error: { code: -32603, message: err instanceof Error ? err.message : 'internal error' },
        }));
      }
    }
  });

  httpServer.listen(opts.port);
  return httpServer;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  if (req.method !== 'POST') return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : undefined;
}

// CLI entry: `node mvp/src/mcp/http.ts`
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop() ?? '')) {
  const { createRuntime } = await import('../runtime.ts');
  const rt = createRuntime();
  const port = Number(process.env.MCP_HTTP_PORT ?? 8788);
  const apiKeys = (process.env.REVPILOT_API_KEYS ?? '').split(',');
  startMcpHttpServer(rt, { port, apiKeys });
  console.error(`[revpilot-mcp] Streamable HTTP on :${port}/mcp (${apiKeys.filter((k) => k.trim()).length} API key(s); data: ${rt.env.dataFile})`);
}

export type { ServerResponse };
