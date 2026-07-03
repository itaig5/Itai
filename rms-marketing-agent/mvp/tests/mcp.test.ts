import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createRuntime } from '../src/runtime.ts';
import { loadEnv } from '../src/config/env.ts';
import { buildMcpServer } from '../src/mcp/server.ts';

async function connectedClient() {
  const rt = createRuntime({
    ephemeral: true,
    env: loadEnv({ ML_SERVICE_URL: 'http://127.0.0.1:1' } as NodeJS.ProcessEnv),
  });
  const server = buildMcpServer(rt);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.1' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { rt, client };
}

function textOf(result: unknown): string {
  const content = (result as { content: { type: string; text?: string }[] }).content;
  return content.map((c) => c.text ?? '').join('\n');
}

test('MCP: exposes the expected toolset with the 3-tool contract annotations', async () => {
  const { client } = await connectedClient();
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  assert.deepEqual(names, [
    'add_client', 'advance_demo_day', 'approve_and_push', 'get_audit_log', 'get_learning_state',
    'get_portfolio', 'get_promotion_radar', 'get_recommendations', 'get_signals',
    'list_clients', 'reject_recommendation',
  ]);
  const byName = new Map(tools.map((t) => [t.name, t]));
  assert.equal(byName.get('get_signals')!.annotations?.readOnlyHint, true);
  assert.equal(byName.get('approve_and_push')!.annotations?.destructiveHint, true);
});

test('MCP: read -> propose -> gated write drives the real loop', async () => {
  const { rt, client } = await connectedClient();

  const portfolio = JSON.parse(textOf(await client.callTool({ name: 'get_portfolio', arguments: {} })));
  assert.equal(portfolio.listings.length, 8);
  const marina = portfolio.listings.find((l: { listingId: string }) => l.listingId === 'L-MARINA');
  assert.ok(marina.paceVsStlyPct <= -0.15);

  const recs = JSON.parse(textOf(await client.callTool({ name: 'get_recommendations', arguments: {} })));
  assert.ok(recs.length >= 4);
  const rec = recs.find((r: { listingId: string }) => r.listingId === 'L-MARINA');
  assert.ok(rec.verifierPass);
  assert.ok(rec.guardPreview.length >= 3, 'per-channel guard preview included');

  // dry-run is the DEFAULT — no promotions written
  const preview = JSON.parse(textOf(await client.callTool({
    name: 'approve_and_push',
    arguments: { recommendationId: rec.recommendationId, approvalToken: 'itai@dconsult.me' },
  })));
  assert.equal(preview.dryRun, true);
  assert.equal(rt.store.getState().promotions.filter((p) => p.recommendationId === rec.recommendationId).length, 0);

  // explicit live push
  const live = JSON.parse(textOf(await client.callTool({
    name: 'approve_and_push',
    arguments: { recommendationId: rec.recommendationId, approvalToken: 'itai@dconsult.me', dryRun: false },
  })));
  assert.ok(live.executedChannels.length >= 3);
  assert.ok(live.outcomeId);
  const state = rt.store.getState();
  assert.ok(state.promotions.some((p) => p.recommendationId === rec.recommendationId && p.status === 'active'));
  assert.ok(state.audit.some((e) => e.kind === 'executed' && e.recommendationId === rec.recommendationId));

  // the learning loop is reachable through MCP too
  for (let i = 0; i < 8; i++) await client.callTool({ name: 'advance_demo_day', arguments: {} });
  const learning = JSON.parse(textOf(await client.callTool({ name: 'get_learning_state', arguments: {} })));
  assert.ok(learning.measuredCount >= 1);
  assert.ok(learning.banditArms.length >= 1, 'bandit updated via MCP-driven loop');
});

test('MCP: the write tool refuses without a real approval token; errors surface as isError', async () => {
  const { client } = await connectedClient();
  const recs = JSON.parse(textOf(await client.callTool({ name: 'get_recommendations', arguments: {} })));
  const blank = await client.callTool({
    name: 'approve_and_push',
    arguments: { recommendationId: recs[0].recommendationId, approvalToken: '   ' },
  });
  assert.equal(blank.isError, true);
  const unknown = await client.callTool({
    name: 'approve_and_push',
    arguments: { recommendationId: 'rec_99999', approvalToken: 'op' },
  });
  assert.equal(unknown.isError, true);
});

test('MCP: client onboarding works end-to-end (demo mode only by design)', async () => {
  const { rt, client } = await connectedClient();
  const res = JSON.parse(textOf(await client.callTool({
    name: 'add_client',
    arguments: { name: 'MCP Test Stays', contactEmail: 'mcp@test.co', market: 'Porto', demoListingCount: 2 },
  })));
  assert.equal(res.client.status, 'connected');
  assert.equal(res.connect.importedListingIds.length, 2);
  assert.ok(!JSON.stringify(res).includes('clientSecret'), 'no secrets in MCP responses');
  assert.equal(rt.store.getState().listings.filter((l) => l.clientId === res.client.id).length, 2);
});
