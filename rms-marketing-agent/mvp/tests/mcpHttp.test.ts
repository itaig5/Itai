import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createRuntime } from '../src/runtime.ts';
import { loadEnv } from '../src/config/env.ts';
import { startMcpHttpServer } from '../src/mcp/http.ts';

function serverFor() {
  const rt = createRuntime({
    ephemeral: true,
    env: loadEnv({ ML_SERVICE_URL: 'http://127.0.0.1:1' } as NodeJS.ProcessEnv),
  });
  const server = startMcpHttpServer(rt, { port: 0, apiKeys: ['test-key-1', 'itai-key'] });
  const port = (server.address() as AddressInfo).port;
  return { rt, server, url: new URL(`http://127.0.0.1:${port}/mcp`) };
}

test('remote MCP refuses to start without keys and rejects bad/missing tokens', async () => {
  const rt = createRuntime({ ephemeral: true, env: loadEnv({} as NodeJS.ProcessEnv) });
  assert.throws(() => startMcpHttpServer(rt, { port: 0, apiKeys: ['  '] }), /without API keys/);

  const { server, url } = serverFor();
  try {
    for (const extra of [{}, { authorization: 'Bearer wrong-key' }] as Record<string, string>[]) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...extra },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
      });
      assert.equal(res.status, 401);
    }
  } finally {
    server.close();
  }
});

test('remote MCP serves authorized clients end-to-end over HTTP', async () => {
  const { server, url } = serverFor();
  try {
    const client = new Client({ name: 'external-product', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(url, {
      requestInit: { headers: { authorization: 'Bearer itai-key' } },
    }));

    const { tools } = await client.listTools();
    assert.ok(tools.some((t) => t.name === 'approve_and_push'));

    const portfolio = JSON.parse(
      (await client.callTool({ name: 'get_portfolio', arguments: {} }) as { content: { text: string }[] }).content[0].text,
    );
    assert.equal(portfolio.listings.length, 8);
    await client.close();
  } finally {
    server.close();
  }
});

test('healthz is open, other paths are not', async () => {
  const { server, url } = serverFor();
  try {
    const health = await fetch(new URL('/healthz', url));
    assert.equal(health.status, 200);
    const nope = await fetch(new URL('/anything', url));
    assert.equal(nope.status, 404);
  } finally {
    server.close();
  }
});
