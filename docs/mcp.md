# MCP server

excaliplant ships a [Model Context Protocol](https://modelcontextprotocol.io) server, so AI clients can render, validate and look up PlantUML diagrams as tools. It adds no dependencies: the protocol (JSON-RPC 2.0) is implemented in `src/mcp/`.

```sh
npx -y -p @grethel-labs/excaliplant excaliplant-mcp
```

The server talks MCP over stdio. It is also importable as `@grethel-labs/excaliplant/mcp`.

## Tools

| Tool                 | Input                                                                                          | Result                                                                                                                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `render_plantuml`    | `source`, `format` (`svg` \| `png` \| `excalidraw`), `theme`, `clean`, `seed`, `page`, `width` | SVG as text, PNG as `image` content (base64, `image/png`), Excalidraw as JSON text. A second text block and `structuredContent` carry `kind`, `pages`, `page`, `bytes` and `diagnostics`. |
| `validate_plantuml`  | `source`, `strict`                                                                             | Per `@start…@end` block: detected `kind`, `pages`, `valid`, `error` and line-based `diagnostics`. Nothing is rendered; layout limits are not checked.                                     |
| `list_diagram_types` | none                                                                                           | `types` (`kind`, `title`, `starts`) and `themes`.                                                                                                                                         |
| `get_example`        | `kind`, `name` (both optional)                                                                 | Without `name`: the list of bundled examples. With `name`: the PlantUML source of one example.                                                                                            |

Notes:

- `render_plantuml` renders the first block, or the given `page` of a `newpage` document. PNG `width` is 16 to 4096 pixels; without it the PNG is 2x the SVG size, capped at 4096.
- Output is deterministic: the same source, options and `seed` give the same bytes.
- Every tool has an `inputSchema` (`additionalProperties: false`) and an `outputSchema`; all are annotated read-only and idempotent.
- Wrong arguments, limit violations and parse failures are tool results with `isError: true` and a short message. Protocol problems (invalid JSON, unknown tool, unknown method) are JSON-RPC errors.
- The bundled examples are embedded in `src/mcp/examples.generated.mjs`, because the npm package does not ship `examples/`. Regenerate with `node scripts/gen-mcp-examples.mjs`; CI-style check: `--check`.

## Protocol versions

One process speaks both families of MCP revisions, chosen per request:

| Revision                                               | Style                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `2026-07-28`                                           | Stateless. Each request carries `_meta["io.modelcontextprotocol/protocolVersion"]` and `clientCapabilities`; `server/discover` replaces the handshake. Results carry `resultType: "complete"`; `tools/list` and `server/discover` add `ttlMs`/`cacheScope`. `ping` does not exist. |
| `2025-11-25`, `2025-06-18`, `2025-03-26`, `2024-11-05` | `initialize` handshake. The server answers with the client's revision, or `2025-11-25` for an unknown one. `ping` answers `{}`. JSON-RPC batches are accepted.                                                                                                                     |

A request without the stateless metadata is treated with legacy semantics, even if no `initialize` came first. The server keeps no per-connection state. An unsupported stateless version gets error `-32022` listing the supported ones.

Not implemented (not declared as capabilities): resources, prompts, logging, subscriptions, tasks, progress notifications. Cancellation (`notifications/cancelled`) is supported: the running call is stopped and no response is sent.

## Install and configure

The commands below start the server through npx. All of them need Node.js 20 or newer. Replace `npx -y -p @grethel-labs/excaliplant excaliplant-mcp` with `excaliplant-mcp` when the package is installed globally or in the project. The `-p` flag matters: the package has two binaries and npx would otherwise start the CLI.

Verified against the vendors' documentation on 2026-11-16 unless marked (unverified).

### Claude Code

```sh
claude mcp add --transport stdio excaliplant -- npx -y -p @grethel-labs/excaliplant excaliplant-mcp
```

Add `--scope project` to write `.mcp.json` for the team, or `--scope user` for all projects. Equivalent `.mcp.json`:

```json
{
  "mcpServers": {
    "excaliplant": {
      "command": "npx",
      "args": ["-y", "-p", "@grethel-labs/excaliplant", "excaliplant-mcp"]
    }
  }
}
```

On native Windows, wrapping the command as `cmd /c npx …` is commonly needed (unverified; not found in the part of the docs that was read).

### Claude Desktop

Edit `claude_desktop_config.json` (Settings, Developer, Edit Config) and use the same `mcpServers` block as above. Restart the app. (File location and format from memory of the vendor docs; unverified in this check.)

### Codex (CLI and IDE)

```sh
codex mcp add excaliplant -- npx -y -p @grethel-labs/excaliplant excaliplant-mcp
```

or in `~/.codex/config.toml` (project level: `.codex/config.toml` in trusted projects):

```toml
[mcp_servers.excaliplant]
command = "npx"
args = ["-y", "-p", "@grethel-labs/excaliplant", "excaliplant-mcp"]
startup_timeout_sec = 30
tool_timeout_sec = 60
```

The first start downloads the package, so a startup timeout above the 10 s default helps.

### Gemini CLI

`~/.gemini/settings.json` (user) or `.gemini/settings.json` (project):

```json
{
  "mcpServers": {
    "excaliplant": {
      "command": "npx",
      "args": ["-y", "-p", "@grethel-labs/excaliplant", "excaliplant-mcp"],
      "timeout": 60000
    }
  }
}
```

Or: `gemini mcp add -s user excaliplant npx -- -y -p @grethel-labs/excaliplant excaliplant-mcp`. The Gemini CLI docs page fetched for this check states that Gemini CLI was replaced by "Antigravity CLI" in June 2026; check the current docs of your client if the commands differ (unverified).

### opencode

In `opencode.jsonc`, following the current docs page:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "servers": {
      "excaliplant": {
        "type": "local",
        "command": ["npx", "-y", "-p", "@grethel-labs/excaliplant", "excaliplant-mcp"],
      },
    },
  },
}
```

Or: `opencode mcp add excaliplant -- npx -y -p @grethel-labs/excaliplant excaliplant-mcp` (add `--global` for all projects). Older opencode releases used a flat `"mcp": { "excaliplant": { "type": "local", "command": [...] } }` layout (from memory; unverified). If one layout is rejected, try the other.

### Cursor

`.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global):

```json
{
  "mcpServers": {
    "excaliplant": {
      "command": "npx",
      "args": ["-y", "-p", "@grethel-labs/excaliplant", "excaliplant-mcp"]
    }
  }
}
```

### VS Code (Copilot)

`.vscode/mcp.json` or the user profile's `mcp.json` (top-level key is `servers`, not `mcpServers`):

```json
{
  "servers": {
    "excaliplant": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "-p", "@grethel-labs/excaliplant", "excaliplant-mcp"]
    }
  }
}
```

One-liner for the user profile (Bash):

```sh
code --add-mcp '{"name":"excaliplant","type":"stdio","command":"npx","args":["-y","-p","@grethel-labs/excaliplant","excaliplant-mcp"]}'
```

The VS Code documentation points to a newer portable `mcpServers` format (`.mcp.json` in the workspace root) and marks the older harness as deprecated; both were documented at the time of writing.

### Open WebUI, Ollama and other local-model clients

Ollama itself is a model runner and does not speak MCP; the client in front of it does. Its documentation (checked) does not mention MCP.

Open WebUI supports MCP natively only over Streamable HTTP (since v0.6.31, per its docs). Two ways to connect it:

1. Run the server over HTTP and add it under Settings, Integrations, External Tool Servers, type MCP (Streamable HTTP):

   ```sh
   npx -y -p @grethel-labs/excaliplant excaliplant-mcp --http 8765
   ```

   URL: `http://127.0.0.1:8765/mcp`. The server listens on loopback only, so this works when Open WebUI runs on the same host, not from a container with its own network namespace (unverified: a container would need host networking, which exposes nothing more than loopback of the host).

2. Bridge stdio with [mcpo](https://github.com/open-webui/mcpo), which publishes MCP servers as OpenAPI endpoints:

   ```sh
   uvx mcpo --port 8000 --api-key "change-me" -- npx -y -p @grethel-labs/excaliplant excaliplant-mcp
   ```

   Then add `http://localhost:8000` as an OpenAPI tool server.

### ChatGPT

ChatGPT's web and mobile apps connect to remote MCP servers over public HTTPS. This server deliberately binds `127.0.0.1` only and has no OAuth, so it cannot be added there directly. Use a client that launches local servers (Codex, above). Anything in between, such as a tunnel, is your responsibility and not recommended without authentication (the `EXCALIPLANT_MCP_TOKEN` bearer token is only a minimal safeguard).

## Options

```text
excaliplant-mcp [--http <port>] [--include-dir <dir>] [--max-input-bytes <n>] [--timeout <ms>] [--help] [--version]
```

| Option                  | Meaning                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| `--http <port>`         | Streamable HTTP on `127.0.0.1:<port>/mcp` instead of stdio (`0` picks a free port, printed on stderr). |
| `--include-dir <dir>`   | Allow `!include` of files below `<dir>` (symlinks resolved first). Default: no includes.               |
| `--max-input-bytes <n>` | PlantUML source limit (default 2 MiB, ceiling 64 MiB). Also sets the message limit to `2n + 64 KiB`.   |
| `--timeout <ms>`        | Time limit per tool call (default 30000).                                                              |
| `EXCALIPLANT_MCP_TOKEN` | Environment variable: with `--http`, require `Authorization: Bearer <token>`.                          |

### Embedding

```js
import { createServer, serveStdio } from "@grethel-labs/excaliplant/mcp";

const server = createServer({ includeDir: "./diagrams", timeoutMs: 20_000 });
await serveStdio(server, { stdin: process.stdin, stdout: process.stdout, stderr: process.stderr });
```

`createServer` also takes `limits`, `maxMessageBytes`, `maxOutputBytes`, `maxBatch`, `executor` (`"worker"`, `"inline"` or a custom executor) and `log`. `serveHttp(server, { port })` is the HTTP transport.

## Security model

The server renders untrusted text, often produced by a model that read untrusted content.

- Tool arguments are plain JSON validated against the schemas; unknown properties are rejected. There is no file path, URL or environment access in any argument.
- `!include` resolves nothing unless the operator passes `--include-dir`; then only regular files below that directory (after resolving symlinks) and no URLs. `!includeurl` is never fetched. No network access happens anywhere.
- Limits: the library's `DEFAULT_LIMITS` (input size, lines, nodes, edges, elements, label length, preprocessor steps), a message size limit on stdin and HTTP (an over-long line is discarded as it streams in, never buffered), PNG width of at most 4096 px, results of at most 8 MiB, JSON batches of at most 32.
- Rendering runs on a worker thread with a heap limit and a per-call timeout. A timeout, a cancellation or an out-of-memory crash stops only that thread; the next call starts a fresh one. At most 16 calls wait; more get a "busy" tool error.
- Errors never contain stack traces or file-system paths; unexpected failures are logged to stderr and reported as "Internal error". `stdout` carries protocol messages only.
- Tool descriptions and results are factual text. Diagnostics may quote a short part of the submitted source (clipped to 300 characters), which is the caller's own input.
- HTTP: loopback only, `Host` and `Origin` must be local (403 otherwise, against DNS rebinding), POST only, JSON only, no sessions, optional bearer token. Stateless-revision requests must carry consistent `MCP-Protocol-Version`, `Mcp-Method` and `Mcp-Name` headers (400 with `-32020` otherwise).

## Publishing to the MCP registry

`server.json` in the repository root is the manifest for the [official MCP registry](https://registry.modelcontextprotocol.io) (schema `2025-12-11`). The name `io.github.grethel-labs/excaliplant` matches `mcpName` in `package.json`; the registry checks that the published npm package carries the same `mcpName`. The description is limited to 100 characters.

Both `version` fields in `server.json` are the placeholder `0.0.0-development`, like `package.json`. The release must set them to the released version before publishing, and the npm package must already exist at that version (the registry verifies it).

How the registry starts the package: for npm packages it runs `npx <identifier>@<version> <packageArguments>`. A package with several binaries cannot select a non-default one, so `server.json` passes the argument `mcp` to the default `excaliplant` binary. This requires `excaliplant mcp` to start the MCP server (see below); until then, clients that install through the registry would start the plain CLI.

```js
// bin/excaliplant.mjs, before the normal argument handling:
if (process.argv[2] === "mcp") {
  const { runMcpProcess } = await import("../src/mcp/cli.mjs");
  await runMcpProcess(process.argv.slice(3));
  process.exit(process.exitCode ?? 0);
}
```

### Release workflow step

Authentication uses GitHub OIDC: no secret is needed, but the job needs `permissions: id-token: write`. The `io.github.grethel-labs/*` namespace is granted to workflows running in that organization's repositories (per the registry docs for `io.github.*` names). Steps, after `npm publish` succeeded and with `$VERSION` set to the released version (for example `1.2.3`, without `v`):

```yaml
permissions:
  contents: write
  id-token: write # npm provenance and mcp-publisher OIDC login
env:
  MCP_PUBLISHER_VERSION: v1.8.1 # check the latest release before pinning

steps:
  # ... after npm publish ...
  - name: Install cosign
    uses: sigstore/cosign-installer@6f9f17788090df1f26f669e9d70d6ae9567deba6 # v4.1.2

  - name: Download and verify mcp-publisher
    run: |
      set -euo pipefail
      os="$(uname -s | tr '[:upper:]' '[:lower:]')"
      arch="$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/')"
      archive="mcp-publisher_${os}_${arch}.tar.gz"
      base_url="https://github.com/modelcontextprotocol/registry/releases/download/${MCP_PUBLISHER_VERSION}"
      curl --fail --location --silent --show-error --output "$archive" "$base_url/$archive"
      curl --fail --location --silent --show-error --output "$archive.sigstore.json" "$base_url/$archive.sigstore.json"
      cosign verify-blob \
        --bundle "$archive.sigstore.json" \
        --certificate-identity "https://github.com/modelcontextprotocol/registry/.github/workflows/release.yml@refs/tags/${MCP_PUBLISHER_VERSION}" \
        --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
        "$archive"
      tar xzf "$archive" mcp-publisher
      rm -f "$archive" "$archive.sigstore.json"

  - name: Set the version in server.json
    run: |
      jq --arg v "$VERSION" '.version = $v | .packages[0].version = $v' server.json > server.tmp
      mv server.tmp server.json

  - name: Publish to the MCP registry
    run: |
      ./mcp-publisher validate
      ./mcp-publisher login github-oidc
      ./mcp-publisher publish
```

The workflow above follows the registry's GitHub Actions guide (pinned publisher binary with Sigstore verification, as the guide recommends). `mcp-publisher validate` checks `server.json` without publishing; run it locally with a concrete version to test. The `server.json` change is not committed back (the release does not push to `main`); it only affects the published registry entry.

A registry version cannot be published twice. When the npm publish succeeded but the registry step failed, re-run only the registry step.

## Troubleshooting

- The client shows no tools: run the command in a terminal; it must wait silently for input. Look at the client's MCP log (stderr of the server ends up there).
- `npx` starts the CLI, not the server: the `-p @grethel-labs/excaliplant excaliplant-mcp` form is required.
- A long first start: npx downloads the package once. Raise the client's startup timeout.
- `Output of … bytes exceeds the limit`: pick a smaller `width` or a smaller diagram.
