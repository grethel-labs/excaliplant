#!/usr/bin/env node
// excaliplant-mcp: MCP server entry point. All logic lives in src/mcp; stdout
// carries protocol messages only, everything else goes to stderr.

import { runMcpProcess } from "../src/mcp/cli.mjs";

await runMcpProcess(process.argv.slice(2));
