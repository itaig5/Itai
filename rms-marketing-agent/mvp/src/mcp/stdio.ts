// stdio entry point for the RevPilot MCP server — what Claude Desktop / Claude Code launches.
// Shares the dashboard's world when REVPILOT_DATA_FILE points at the same file (default:
// .data/revpilot-state.json relative to the working directory).
// Run: npm run mcp   (from rms-marketing-agent/)
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createRuntime } from '../runtime.ts';
import { buildMcpServer } from './server.ts';

const rt = createRuntime();
const server = buildMcpServer(rt);
await server.connect(new StdioServerTransport());
// stdout belongs to the protocol — log to stderr only
console.error(`[revpilot-mcp] serving ${rt.store.getState().listings.length} listings on stdio (data: ${rt.env.dataFile})`);
