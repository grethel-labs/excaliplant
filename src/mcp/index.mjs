/**
 * Model Context Protocol server for excaliplant. It exposes the renderer as
 * tools (`render_plantuml`, `validate_plantuml`, `list_diagram_types`,
 * `get_example`) over stdio or, opt-in, loopback Streamable HTTP, and has no
 * dependencies beyond excaliplant itself.
 *
 * ```js
 * import { createServer, serveStdio } from "@grethel-labs/excaliplant/mcp";
 * await serveStdio(createServer(), { stdin: process.stdin, stdout: process.stdout, stderr: process.stderr });
 * ```
 * @module mcp
 */

export { createServer } from "./server.mjs";
export { serveStdio } from "./stdio.mjs";
export { serveHttp } from "./http.mjs";
export { runMcpCli, runMcpProcess } from "./cli.mjs";
export { TOOLS, runTool } from "./tools.mjs";
export { MODERN_VERSIONS, LEGACY_VERSIONS, SUPPORTED_VERSIONS } from "./protocol.mjs";
