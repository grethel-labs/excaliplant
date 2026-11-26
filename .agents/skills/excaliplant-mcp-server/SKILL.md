---
name: excaliplant-mcp-server
description: Change MCP tool schemas, diagnostics, JSON-RPC, stdio, loopback HTTP, worker execution or the registry manifest.
---

# MCP server

1. Choose the layer in `src/mcp/`. The tool layer defines schemas and calls the shared render/parse pipeline. The server translates results to JSON-RPC. The executor manages limits, cancellation and worker lifetime. Stdio and HTTP handle framing and delivery.
2. Check both negotiated stdio revisions and per-request HTTP validation if protocol behavior changes. Keep stdio stdout for protocol messages, actual failures generic to callers, and HTTP loopback-only.
3. Keep input, output, queue and timeout limits. File includes depend on the operator setting a local root. Tool arguments cannot select that root. Preserve the realpath checks and the worker’s ability to recover after a timeout.
4. Run inline tool and process coverage. Use the existing test worker for cancellation and recovery behavior. For example changes, regenerate `src/mcp/examples.generated.mjs` from the tested gallery sources.

```sh
node --test test/mcp.test.mjs test/security.test.mjs
```

See the [MCP docs](../../../docs/mcp.md) for protocol, configuration and release registration.
