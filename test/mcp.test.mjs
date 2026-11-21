import { test } from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { spawn } from "node:child_process";
import { request as httpRequest } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createServer,
  serveStdio,
  serveHttp,
  runMcpCli,
  TOOLS,
  MODERN_VERSIONS,
  LEGACY_VERSIONS,
} from "../src/mcp/index.mjs";
import { createWorkerExecutor, ExecutorError } from "../src/mcp/executor.mjs";
import { LineSplitter } from "../src/mcp/stdio.mjs";
import { validate } from "../src/mcp/schema.mjs";
import { EXAMPLES } from "../src/mcp/examples.generated.mjs";
import { detectKind } from "../src/index.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bin = path.join(root, "bin", "excaliplant-mcp.mjs");

const META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientCapabilities": {},
  "io.modelcontextprotocol/clientInfo": { name: "test", version: "1" },
};
const SEQ = "@startuml\nAlice -> Bob : hi\n@enduml";

/** Inline server (runs tools in this thread); closed after the test. */
function inlineServer(t, options = {}) {
  const server = createServer({ executor: "inline", ...options });
  t.after(() => server.close());
  return server;
}

async function call(server, method, params, id = 1, options) {
  const { text } = await server.handleText(
    JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    options,
  );
  return text === null ? null : JSON.parse(text);
}

const callTool = (server, name, args, id = 1) =>
  call(server, "tools/call", { name, arguments: args }, id);

/** Run a tool and return the result, asserting the JSON-RPC envelope. */
async function tool(server, name, args) {
  const res = await callTool(server, name, args);
  assert.ok(res.result, JSON.stringify(res));
  return res.result;
}

// ---------------------------------------------------------------- handshake

test("legacy handshake echoes every supported revision", async (t) => {
  const server = inlineServer(t);
  for (const version of LEGACY_VERSIONS) {
    const res = await call(server, "initialize", {
      protocolVersion: version,
      capabilities: {},
      clientInfo: { name: "c", version: "1" },
    });
    assert.equal(res.result.protocolVersion, version);
    assert.deepEqual(res.result.capabilities, { tools: { listChanged: false } });
    assert.equal(res.result.serverInfo.name, "excaliplant");
    assert.equal(typeof res.result.serverInfo.version, "string");
    assert.equal(typeof res.result.instructions, "string");
    // Legacy results carry no modern fields.
    assert.equal(res.result.resultType, undefined);
  }
});

test("initialize with an unknown revision answers with the newest legacy one", async (t) => {
  const server = inlineServer(t);
  for (const version of ["1999-01-01", "2026-07-28", "banana"]) {
    const res = await call(server, "initialize", { protocolVersion: version });
    assert.equal(res.result.protocolVersion, LEGACY_VERSIONS[0]);
  }
  const bad = await call(server, "initialize", {});
  assert.equal(bad.error.code, -32602);
});

test("notifications get no response and ping answers {}", async (t) => {
  const server = inlineServer(t);
  const note = await server.handleText(
    JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  );
  assert.equal(note.text, null);
  assert.equal(note.status, 202);
  assert.deepEqual((await call(server, "ping")).result, {});
});

test("server/discover advertises the modern revision", async (t) => {
  const server = inlineServer(t);
  const res = await call(server, "server/discover", { _meta: META });
  assert.equal(res.result.resultType, "complete");
  assert.deepEqual(res.result.supportedVersions, [...MODERN_VERSIONS]);
  assert.deepEqual(res.result.capabilities, { tools: {} });
  assert.equal(res.result._meta["io.modelcontextprotocol/serverInfo"].name, "excaliplant");
  assert.equal(typeof res.result.ttlMs, "number");
  assert.equal(res.result.cacheScope, "public");
});

test("modern requests are validated per request", async (t) => {
  const server = inlineServer(t);
  // Missing metadata on server/discover.
  assert.equal((await call(server, "server/discover", {})).error.code, -32602);
  // Unsupported version names the supported ones.
  const old = await call(server, "tools/list", {
    _meta: { ...META, "io.modelcontextprotocol/protocolVersion": "2030-01-01" },
  });
  assert.equal(old.error.code, -32022);
  assert.deepEqual(old.error.data.supported, ["2026-07-28"]);
  assert.equal(old.error.data.requested, "2030-01-01");
  // Missing capabilities.
  const noCaps = await call(server, "tools/list", {
    _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28" },
  });
  assert.equal(noCaps.error.code, -32602);
  // ping was removed from the stateless revision.
  assert.equal((await call(server, "ping", { _meta: META })).error.code, -32601);
});

test("modern tools/list and tools/call results carry resultType and cache hints", async (t) => {
  const server = inlineServer(t);
  const list = await call(server, "tools/list", { _meta: META });
  assert.equal(list.result.resultType, "complete");
  assert.equal(typeof list.result.ttlMs, "number");
  assert.equal(list.result.cacheScope, "public");
  assert.equal(list.result.tools.length, 4);
  const res = await call(server, "tools/call", {
    _meta: META,
    name: "list_diagram_types",
    arguments: {},
  });
  assert.equal(res.result.resultType, "complete");
  assert.equal(res.result._meta["io.modelcontextprotocol/serverInfo"].name, "excaliplant");
});

// -------------------------------------------------------------- tools/list

test("tools/list describes the four tools deterministically", async (t) => {
  const server = inlineServer(t);
  const a = await call(server, "tools/list");
  const b = await call(server, "tools/list", {}, 2);
  assert.deepEqual(a.result, b.result);
  const names = a.result.tools.map((x) => x.name);
  assert.deepEqual(names, [
    "render_plantuml",
    "validate_plantuml",
    "list_diagram_types",
    "get_example",
  ]);
  for (const def of a.result.tools) {
    assert.match(def.name, /^[A-Za-z0-9_.-]{1,128}$/);
    assert.equal(def.inputSchema.type, "object");
    assert.equal(def.inputSchema.additionalProperties, false);
    assert.equal(def.outputSchema.type, "object");
    assert.equal(def.annotations.readOnlyHint, true);
    assert.equal(def.annotations.openWorldHint, false);
    assert.ok(def.description.length > 20 && def.description.length < 600);
    // Descriptions state facts; they never address the model.
    assert.doesNotMatch(def.description, /\b(you must|ignore|always call|do not tell)\b/i);
  }
  assert.equal(a.result.tools.length, TOOLS.length);
});

// ------------------------------------------------------------ render tool

test("render_plantuml returns SVG text by default", async (t) => {
  const server = inlineServer(t);
  const result = await tool(server, "render_plantuml", { source: SEQ });
  assert.ok(!result.isError);
  assert.equal(result.content[0].type, "text");
  assert.match(result.content[0].text, /^<svg/);
  const sc = result.structuredContent;
  assert.equal(sc.kind, "sequence");
  assert.equal(sc.format, "svg");
  assert.equal(sc.mimeType, "image/svg+xml");
  assert.equal(sc.pages, 1);
  assert.equal(sc.bytes, Buffer.byteLength(result.content[0].text));
  assert.deepEqual(validate(TOOLS[0].outputSchema, sc, "structuredContent"), []);
  assert.deepEqual(JSON.parse(result.content[1].text), sc);
});

test("render_plantuml returns PNG as image content", async (t) => {
  const server = inlineServer(t);
  const result = await tool(server, "render_plantuml", {
    source: SEQ,
    format: "png",
    width: 300,
    theme: "dark",
    clean: true,
  });
  assert.equal(result.content[0].type, "image");
  assert.equal(result.content[0].mimeType, "image/png");
  const png = Buffer.from(result.content[0].data, "base64");
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  assert.equal(png.readUInt32BE(16), 300);
  assert.equal(result.structuredContent.bytes, png.length);
  assert.deepEqual(validate(TOOLS[0].outputSchema, result.structuredContent), []);
});

test("render_plantuml returns Excalidraw JSON as text", async (t) => {
  const server = inlineServer(t);
  const result = await tool(server, "render_plantuml", { source: SEQ, format: "excalidraw" });
  const doc = JSON.parse(result.content[0].text);
  assert.equal(doc.type, "excalidraw");
  assert.ok(doc.elements.length > 0);
  assert.equal(result.structuredContent.mimeType, "application/vnd.excalidraw+json");
});

test("render_plantuml is deterministic and honours seed, page and clean", async (t) => {
  const server = inlineServer(t);
  const render = async (args) =>
    (await tool(server, "render_plantuml", { source: SEQ, format: "excalidraw", ...args }))
      .content[0].text;
  assert.equal(await render({ seed: "a" }), await render({ seed: "a" }));
  assert.notEqual(await render({ seed: "a" }), await render({ seed: "b" }));
  assert.notEqual(await render({}), await render({ clean: true }));
  const pages = "@startuml\nA -> B\nnewpage\nC -> D\n@enduml";
  const second = await tool(server, "render_plantuml", { source: pages, page: 1 });
  assert.equal(second.structuredContent.pages, 2);
  assert.equal(second.structuredContent.page, 1);
  assert.match(second.content[0].text, />C</);
});

test("render_plantuml reports parse warnings as diagnostics", async (t) => {
  const server = inlineServer(t);
  const result = await tool(server, "render_plantuml", {
    source: "@startuml\nA -> B\nthis is not plantuml at all ???\n@enduml",
  });
  assert.ok(!result.isError);
  const [diagnostic] = result.structuredContent.diagnostics;
  assert.equal(diagnostic.severity, "warning");
  assert.equal(diagnostic.line, 3);
  assert.match(diagnostic.message, /unrecognised/i);
});

// -------------------------------------------------------- validate / lists

test("validate_plantuml detects kinds and lists diagnostics per block", async (t) => {
  const server = inlineServer(t);
  const result = await tool(server, "validate_plantuml", {
    source: `@startuml first\nclass A\n@enduml\n@startuml second\nA -> B\nbogus ???\n@enduml\n@startgantt\n[T] lasts 3 days\n@endgantt`,
  });
  assert.deepEqual(validate(TOOLS[1].outputSchema, result.structuredContent), []);
  const { blocks, valid } = result.structuredContent;
  assert.equal(valid, true);
  assert.deepEqual(
    blocks.map((b) => [b.name, b.kind]),
    [
      ["first", "class"],
      ["second", "sequence"],
      [null, "gantt"],
    ],
  );
  assert.equal(blocks[1].diagnostics[0].line, 6);
  assert.equal(JSON.parse(result.content[0].text).valid, true);
  // Validation returns no rendering output.
  assert.equal(result.content.length, 1);
});

test("validate_plantuml reports invalid blocks without failing the call", async (t) => {
  const server = inlineServer(t);
  const unsupported = await tool(server, "validate_plantuml", {
    source: "@startunknownkind\nx\n@endunknownkind",
  });
  assert.ok(!unsupported.isError);
  assert.equal(unsupported.structuredContent.valid, false);
  assert.match(unsupported.structuredContent.blocks[0].error.message, /Unsupported/);
  const strict = await tool(server, "validate_plantuml", {
    source: "@startuml\nA -> B\nbogus ???\n@enduml",
    strict: true,
  });
  assert.equal(strict.structuredContent.valid, false);
  assert.equal(strict.structuredContent.blocks[0].error.line, 3);
});

test("list_diagram_types lists kinds, start tags and themes", async (t) => {
  const server = inlineServer(t);
  const result = await tool(server, "list_diagram_types", {});
  assert.deepEqual(validate(TOOLS[2].outputSchema, result.structuredContent), []);
  const seq = result.structuredContent.types.find((x) => x.kind === "sequence");
  assert.ok(seq.starts.includes("@startuml"));
  assert.ok(result.structuredContent.types.length >= 20);
  assert.ok(result.structuredContent.themes.includes("sketch"));
});

test("get_example lists, filters and returns bundled sources", async (t) => {
  const server = inlineServer(t);
  const all = await tool(server, "get_example", {});
  assert.equal(all.structuredContent.examples.length, EXAMPLES.length);
  assert.ok(EXAMPLES.length >= 30);
  const seq = await tool(server, "get_example", { kind: "sequence" });
  assert.ok(seq.structuredContent.examples.every((e) => e.kind === "sequence"));
  const one = await tool(server, "get_example", { kind: "sequence", name: "checkout-flow" });
  assert.deepEqual(validate(TOOLS[3].outputSchema, one.structuredContent), []);
  assert.match(one.content[0].text, /^@startuml/);
  assert.equal(one.structuredContent.example.source, one.content[0].text);
  // The name alone is enough while it is unique.
  const byName = await tool(server, "get_example", { name: "checkout-flow" });
  assert.equal(byName.structuredContent.example.kind, "sequence");
  for (const bad of [{ kind: "nope" }, { kind: "sequence", name: "nope" }]) {
    const res = await tool(server, "get_example", bad);
    assert.equal(res.isError, true);
    assert.match(res.content[0].text, /Available/);
  }
});

test("bundled examples are valid and match their detected kind", () => {
  for (const e of EXAMPLES) assert.equal(detectKind(e.source), e.diagram, `${e.kind}/${e.name}`);
});

test("the generated example module is up to date", async () => {
  const child = spawn(process.execPath, [
    path.join(root, "scripts", "gen-mcp-examples.mjs"),
    "--check",
  ]);
  const code = await new Promise((resolve) => child.on("close", resolve));
  assert.equal(code, 0);
});

// ------------------------------------------------------------- error cases

test("protocol errors use JSON-RPC error codes", async (t) => {
  const server = inlineServer(t);
  const parse = await server.handleText("{not json");
  assert.equal(JSON.parse(parse.text).error.code, -32700);
  assert.equal(JSON.parse(parse.text).id, null);
  for (const bad of ["42", '"x"', "null", "{}", '{"jsonrpc":"1.0","id":1,"method":"ping"}']) {
    const res = JSON.parse((await server.handleText(bad)).text);
    assert.equal(res.error.code, -32600, bad);
  }
  const noMethod = await call(server, "nope/nope");
  assert.equal(noMethod.error.code, -32601);
  const badParams = JSON.parse(
    (await server.handleText('{"jsonrpc":"2.0","id":3,"method":"tools/list","params":[1]}')).text,
  );
  assert.equal(badParams.error.code, -32602);
  const badId = JSON.parse(
    (await server.handleText('{"jsonrpc":"2.0","id":{"a":1},"method":"ping"}')).text,
  );
  assert.equal(badId.error.code, -32600);
  assert.equal(badId.id, null);
  // Responses from a client are ignored.
  assert.equal((await server.handleText('{"jsonrpc":"2.0","id":1,"result":{}}')).text, null);
});

test("unknown tools and malformed tools/call are protocol errors", async (t) => {
  const server = inlineServer(t);
  assert.equal((await callTool(server, "does_not_exist", {})).error.code, -32602);
  assert.equal((await call(server, "tools/call", {})).error.code, -32602);
  assert.equal(
    (await call(server, "tools/call", { name: "list_diagram_types", arguments: [] })).error.code,
    -32602,
  );
});

test("invalid tool arguments are tool errors the model can fix", async (t) => {
  const server = inlineServer(t);
  const cases = [
    [{}, /missing required property "source"/],
    [{ source: 5 }, /expected string/],
    [{ source: "" }, /at least 1/],
    [{ source: SEQ, format: "pdf" }, /must be one of/],
    [{ source: SEQ, theme: "neon" }, /must be one of/],
    [{ source: SEQ, page: -1 }, />= 0/],
    [{ source: SEQ, page: 1.5 }, /expected integer/],
    [{ source: SEQ, width: 100000 }, /<= 4096/],
    [{ source: SEQ, clean: "yes" }, /expected boolean/],
    [{ source: SEQ, path: "/etc/passwd" }, /unknown property "path"/],
    [{ source: SEQ, include: "x" }, /unknown property/],
  ];
  for (const [args, pattern] of cases) {
    const res = await tool(server, "render_plantuml", args);
    assert.equal(res.isError, true, JSON.stringify(args));
    assert.match(res.content[0].text, pattern);
    assert.equal(res.structuredContent, undefined);
  }
});

test("limits turn into tool errors without internals", async (t) => {
  const server = inlineServer(t, { limits: { maxInputBytes: 2000, maxElements: 20 } });
  const big = await tool(server, "render_plantuml", {
    source: `@startuml\n${"A -> B\n".repeat(500)}@enduml`,
  });
  assert.equal(big.isError, true);
  assert.match(big.content[0].text, /exceeds 2000 bytes/);
  const many = await tool(server, "render_plantuml", {
    source: `@startuml\n${Array.from({ length: 30 }, (_, i) => `A${i} -> B${i}`).join("\n")}\n@enduml`,
  });
  assert.equal(many.isError, true);
  const validated = await tool(server, "validate_plantuml", {
    source: `@startuml\n${"A -> B\n".repeat(500)}@enduml`,
  });
  assert.equal(validated.isError, true);
});

test("output size is capped", async (t) => {
  const server = inlineServer(t, { maxOutputBytes: 1024 });
  const res = await tool(server, "render_plantuml", { source: SEQ });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /exceeds the limit/);
});

test("errors never leak stack traces or file-system paths", async (t) => {
  const logged = [];
  const server = inlineServer(t, { log: (m) => logged.push(m) });
  const attempts = [
    ["render_plantuml", { source: "@startunknown\n@endunknown" }],
    ["render_plantuml", { source: "@startuml\n!include /etc/passwd\nA -> B\n@enduml" }],
    ["render_plantuml", { source: "@startuml\n!include ../../../../etc/passwd\nA -> B\n@enduml" }],
    [
      "render_plantuml",
      { source: "@startuml\n!includeurl https://example.com/x\nA -> B\n@enduml" },
    ],
    ["render_plantuml", { source: 1 }],
    ["get_example", { kind: "../../etc" }],
  ];
  for (const [name, args] of attempts) {
    const text = JSON.stringify(await callTool(server, name, args));
    assert.doesNotMatch(text, /\/workspace|\/home|node_modules|\bat \S+ \(|file:\/\//, text);
  }
  assert.deepEqual(logged, []);
});

test("an unexpected tool failure is reported generically and logged", async (t) => {
  const logged = [];
  const server = createServer({
    executor: {
      run: async () => {
        throw new Error("secret /path/inside");
      },
      close: async () => {},
    },
    log: (m) => logged.push(m),
  });
  t.after(() => server.close());
  const res = await callTool(server, "list_diagram_types", {});
  assert.equal(res.error.code, -32603);
  assert.equal(res.error.message, "Internal error");
  assert.doesNotMatch(JSON.stringify(res), /secret/);
  assert.match(logged.join("\n"), /secret/);
});

// ---------------------------------------------------------------- batches

test("batches are answered together; notifications are dropped", async (t) => {
  const server = inlineServer(t);
  const { text } = await server.handleText(
    JSON.stringify([
      { jsonrpc: "2.0", id: 1, method: "ping" },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: "b", method: "tools/list" },
      { nope: true },
    ]),
  );
  const out = JSON.parse(text);
  assert.equal(out.length, 3);
  assert.deepEqual(out[0], { jsonrpc: "2.0", id: 1, result: {} });
  assert.equal(out[1].result.tools.length, 4);
  assert.equal(out[2].error.code, -32600);
  // Only notifications: no body.
  const only = await server.handleText(
    JSON.stringify([{ jsonrpc: "2.0", method: "notifications/initialized" }]),
  );
  assert.equal(only.text, null);
  // Empty and oversized batches are invalid requests.
  assert.equal(JSON.parse((await server.handleText("[]")).text).error.code, -32600);
  const many = JSON.stringify(Array.from({ length: 33 }, () => ({ jsonrpc: "2.0", method: "x" })));
  assert.equal(JSON.parse((await server.handleText(many)).text).error.code, -32600);
});

// ---------------------------------------------------- cancel and time limits

test("a cancelled request gets no response and the server keeps working", async (t) => {
  const server = createServer({ timeoutMs: 20_000 });
  t.after(() => server.close());
  const pending = call(
    server,
    "tools/call",
    {
      name: "render_plantuml",
      arguments: { source: SEQ },
    },
    7,
  );
  const note = await server.handleText(
    JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/cancelled",
      params: { requestId: 7, reason: "test" },
    }),
  );
  assert.equal(note.text, null);
  assert.equal(await pending, null);
  // Unknown ids in cancellations are ignored; a fresh render still works.
  await server.handleText(
    JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/cancelled",
      params: { requestId: 99 },
    }),
  );
  const ok = await callTool(server, "render_plantuml", { source: SEQ }, 8);
  assert.match(ok.result.content[0].text, /^<svg/);
});

test("a call that exceeds the time limit is stopped with a tool error", async (t) => {
  const server = createServer({ timeoutMs: 10 });
  t.after(() => server.close());
  const res = await callTool(server, "render_plantuml", { source: SEQ });
  assert.equal(res.result.isError, true);
  assert.match(res.result.content[0].text, /took longer/);
});

test("the worker restarts after a timeout", async () => {
  const env = { limits: {}, includeDir: null, maxPngWidth: 4096, maxOutputBytes: 1 << 20 };
  const executor = createWorkerExecutor(env, () => {});
  try {
    await assert.rejects(
      executor.run("render_plantuml", { source: SEQ }, { timeoutMs: 10 }),
      (e) => e instanceof ExecutorError && e.reason === "timeout",
    );
    const ok = await executor.run("render_plantuml", { source: SEQ }, { timeoutMs: 20_000 });
    assert.match(ok.content[0].text, /^<svg/);
  } finally {
    await executor.close();
  }
});

test("the worker queue is bounded and abortable", async () => {
  const env = { limits: {}, includeDir: null, maxPngWidth: 4096, maxOutputBytes: 1 << 20 };
  const executor = createWorkerExecutor(env, () => {}, { maxQueue: 1 });
  try {
    const running = executor.run("render_plantuml", { source: SEQ }, { timeoutMs: 20_000 });
    const controller = new AbortController();
    const queued = executor.run(
      "render_plantuml",
      { source: SEQ },
      { timeoutMs: 20_000, signal: controller.signal },
    );
    await assert.rejects(
      executor.run("render_plantuml", { source: SEQ }, { timeoutMs: 20_000 }),
      (e) => e.reason === "busy",
    );
    controller.abort();
    await assert.rejects(queued, (e) => e.reason === "aborted");
    assert.match((await running).content[0].text, /^<svg/);
  } finally {
    await executor.close();
  }
});

test("a closed server refuses new work", async () => {
  const server = createServer({ executor: "inline" });
  await server.close();
  const res = await call(server, "tools/list");
  assert.equal(res.error.code, -32603);
});

// ------------------------------------------------------------------ stdio

/** Drive serveStdio with PassThrough streams. */
function stdioSession(server) {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let out = "";
  stdout.on("data", (c) => (out += c));
  const done = serveStdio(server, { stdin, stdout, stderr });
  return {
    stdin,
    finish: async () => {
      stdin.end();
      await done;
      return out
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l));
    },
  };
}

test("serveStdio answers newline-delimited requests and closes on EOF", async () => {
  const server = createServer({ executor: "inline" });
  const s = stdioSession(server);
  const lines = [
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
    {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "render_plantuml", arguments: { source: SEQ } },
    },
  ];
  // Split a line across chunks and use CRLF to exercise the framing.
  const text = lines.map((l) => JSON.stringify(l)).join("\r\n") + "\r\n";
  s.stdin.write(text.slice(0, 40));
  s.stdin.write(text.slice(40));
  const out = await s.finish();
  assert.deepEqual(out.map((m) => m.id).sort(), [1, 2, 3]);
  assert.match(out.find((m) => m.id === 3).result.content[0].text, /^<svg/);
});

test("serveStdio survives invalid JSON and over-long messages", async () => {
  const server = createServer({ executor: "inline", maxMessageBytes: 2048 });
  const s = stdioSession(server);
  s.stdin.write("this is not json\n");
  s.stdin.write(
    `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping", params: { pad: "x".repeat(5000) } })}\n`,
  );
  // The rest of an over-long line arrives in later chunks and is skipped.
  s.stdin.write(`{"jsonrpc":"2.0","id":2,"method":"ping","params":{"pad":"${"y".repeat(3000)}`);
  s.stdin.write(`${"y".repeat(3000)}"}}\n`);
  s.stdin.write('{"jsonrpc":"2.0","id":3,"method":"ping"}\n');
  const out = await s.finish();
  assert.equal(out.length, 4);
  // Responses may be written in any order; the id-less ones are errors.
  const errors = out.filter((m) => m.error).map((m) => m.error);
  assert.deepEqual(errors.map((e) => e.code).sort(), [-32700, -32600, -32600].sort());
  assert.equal(errors.filter((e) => /too large/i.test(e.message)).length, 2);
  assert.deepEqual(
    out.find((m) => m.id === 3),
    { jsonrpc: "2.0", id: 3, result: {} },
  );
});

test("serveStdio handles a final line without newline and waits for running calls", async () => {
  const server = createServer({ executor: "inline" });
  const s = stdioSession(server);
  s.stdin.write(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "render_plantuml", arguments: { source: SEQ } },
    }),
  );
  const out = await s.finish();
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 1);
});

test("LineSplitter never buffers more than the limit", () => {
  const lines = [];
  let overflows = 0;
  const splitter = new LineSplitter(
    100,
    (l) => lines.push(l),
    () => overflows++,
  );
  const chunk = Buffer.alloc(64 * 1024, "a");
  for (let i = 0; i < 200; i++) splitter.push(chunk);
  assert.equal(splitter.size <= 100, true);
  splitter.push(Buffer.from('\n{"a":1}\n\n{"b":2}'));
  splitter.end();
  assert.equal(overflows, 1);
  assert.deepEqual(lines, ['{"a":1}', '{"b":2}']);
});

test("runMcpCli reports usage errors and prints help and version", async () => {
  const run = async (argv) => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    let out = "";
    let err = "";
    stdout.on("data", (c) => (out += c));
    stderr.on("data", (c) => (err += c));
    const code = await runMcpCli(argv, { stdin: new PassThrough(), stdout, stderr });
    return { code, out, err };
  };
  assert.match((await run(["--help"])).out, /Usage/);
  assert.equal((await run(["--version"])).code, 0);
  for (const bad of [
    ["--nope"],
    ["--http"],
    ["--http", "99999"],
    ["--max-input-bytes", "x"],
    ["--include-dir", "/no/such/dir"],
  ]) {
    const r = await run(bad);
    assert.equal(r.code, 2, bad.join(" "));
    assert.equal(r.out, "");
    assert.ok(r.err.length > 0);
  }
});

// ------------------------------------------------------------------- HTTP

/** Minimal HTTP client that can set arbitrary Host headers. */
function post(port, body, headers = {}, method = "POST", pathName = "/mcp") {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: "127.0.0.1",
        port,
        path: pathName,
        method,
        headers: { "Content-Type": "application/json", ...headers },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}

test("HTTP transport serves JSON-RPC on 127.0.0.1 only", async (t) => {
  const server = createServer({ executor: "inline" });
  const http = await serveHttp(server, { port: 0 });
  t.after(() => http.close());
  assert.match(http.url, /^http:\/\/127\.0\.0\.1:\d+\/mcp$/);

  const init = await post(
    http.port,
    JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18" },
    }),
  );
  assert.equal(init.status, 200);
  assert.match(init.headers["content-type"], /application\/json/);
  assert.equal(JSON.parse(init.body).result.protocolVersion, "2025-06-18");

  const note = await post(
    http.port,
    JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  );
  assert.equal(note.status, 202);
  assert.equal(note.body, "");

  const list = await post(
    http.port,
    JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
    {
      "MCP-Protocol-Version": "2025-06-18",
      Origin: "http://localhost:6274",
    },
  );
  assert.equal(list.status, 200);
  assert.equal(JSON.parse(list.body).result.tools.length, 4);

  const garbage = await post(http.port, "{nope");
  assert.equal(garbage.status, 400);
  assert.equal(JSON.parse(garbage.body).error.code, -32700);
});

test("HTTP transport rejects foreign hosts, origins, methods and oversized bodies", async (t) => {
  const server = createServer({ executor: "inline", maxMessageBytes: 2048 });
  const http = await serveHttp(server, { port: 0 });
  t.after(() => http.close());
  const ping = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" });
  // DNS rebinding: the page's own host name arrives in Host and Origin.
  assert.equal((await post(http.port, ping, { Host: "evil.example" })).status, 403);
  assert.equal((await post(http.port, ping, { Host: `evil.example:${http.port}` })).status, 403);
  assert.equal((await post(http.port, ping, { Origin: "https://evil.example" })).status, 403);
  assert.equal((await post(http.port, ping, { Origin: "null" })).status, 403);
  assert.equal((await post(http.port, ping, { Origin: "http://127.0.0.1:3000" })).status, 200);
  assert.equal((await post(http.port, ping, { Host: "localhost" })).status, 200);
  assert.equal((await post(http.port, ping, {}, "GET")).status, 405);
  assert.equal((await post(http.port, ping, {}, "DELETE")).status, 405);
  assert.equal((await post(http.port, ping, {}, "POST", "/other")).status, 404);
  assert.equal((await post(http.port, ping, { "Content-Type": "text/plain" })).status, 415);
  assert.equal((await post(http.port, "x".repeat(5000))).status, 413);
});

test("HTTP transport enforces header/body consistency for stateless requests", async (t) => {
  const server = createServer({ executor: "inline" });
  const http = await serveHttp(server, { port: 0 });
  t.after(() => http.close());
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { _meta: META, name: "list_diagram_types", arguments: {} },
  });
  const good = {
    "MCP-Protocol-Version": "2026-07-28",
    "Mcp-Method": "tools/call",
    "Mcp-Name": "list_diagram_types",
  };
  const ok = await post(http.port, body, good);
  assert.equal(ok.status, 200);
  assert.equal(JSON.parse(ok.body).result.resultType, "complete");
  const encoded = await post(http.port, body, {
    ...good,
    "Mcp-Name": `=?base64?${Buffer.from("list_diagram_types").toString("base64")}?=`,
  });
  assert.equal(encoded.status, 200);
  for (const bad of [
    { ...good, "Mcp-Name": "render_plantuml" },
    { ...good, "Mcp-Method": "tools/list" },
    { ...good, "MCP-Protocol-Version": "2025-06-18" },
    { "MCP-Protocol-Version": "2026-07-28", "Mcp-Method": "tools/call" },
  ]) {
    const res = await post(http.port, body, bad);
    assert.equal(res.status, 400);
    assert.equal(JSON.parse(res.body).error.code, -32020);
  }
  const unsupported = await post(
    http.port,
    JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: { _meta: { ...META, "io.modelcontextprotocol/protocolVersion": "2031-01-01" } },
    }),
    { "MCP-Protocol-Version": "2031-01-01", "Mcp-Method": "tools/list" },
  );
  assert.equal(unsupported.status, 400);
  assert.equal(JSON.parse(unsupported.body).error.code, -32022);
  const unknownMethod = await post(
    http.port,
    JSON.stringify({ jsonrpc: "2.0", id: 3, method: "nope", params: { _meta: META } }),
    { "MCP-Protocol-Version": "2026-07-28", "Mcp-Method": "nope" },
  );
  assert.equal(unknownMethod.status, 404);
  // A legacy request naming an unknown protocol version in the header is refused.
  const legacy = await post(
    http.port,
    JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/list" }),
    {
      "MCP-Protocol-Version": "1900-01-01",
    },
  );
  assert.equal(legacy.status, 400);
});

test("HTTP transport can require a bearer token", async (t) => {
  const server = createServer({ executor: "inline" });
  const http = await serveHttp(server, { port: 0, authToken: "s3cret-token" });
  t.after(() => http.close());
  const ping = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" });
  assert.equal((await post(http.port, ping)).status, 401);
  assert.equal((await post(http.port, ping, { Authorization: "Bearer wrong-token!" })).status, 401);
  assert.equal((await post(http.port, ping, { Authorization: "Bearer s3cret-token" })).status, 200);
});

// ---------------------------------------------------------------- includes

test("!include only resolves below --include-dir", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "excaliplant-mcp-"));
  writeFileSync(path.join(dir, "part.puml"), "Alice -> Bob : included\n");
  writeFileSync(path.join(dir, "..", `${path.basename(dir)}-secret.puml`), "Eve -> Mallory\n");
  const withDir = inlineServer(t, { includeDir: dir });
  const without = inlineServer(t);
  const render = (server, include) =>
    tool(server, "render_plantuml", {
      source: `@startuml\n!include ${include}\n@enduml`,
      format: "excalidraw",
    });

  const ok = await render(withDir, "part.puml");
  assert.equal(ok.structuredContent.diagnostics.length, 0);
  assert.match(ok.content[0].text, /included/);
  for (const target of [`../${path.basename(dir)}-secret.puml`, "/etc/passwd", "missing.puml"]) {
    const res = await render(withDir, target);
    assert.ok(
      res.structuredContent.diagnostics.some((d) => /Cannot resolve/.test(d.message)),
      target,
    );
    assert.doesNotMatch(res.content[0].text, /Mallory|root:/);
  }
  const none = await render(without, "part.puml");
  assert.ok(none.structuredContent.diagnostics.some((d) => /Cannot resolve/.test(d.message)));
  assert.doesNotMatch(none.content[0].text, /included/);
});

// ---------------------------------------------------------------- process

/** Spawn the real binary and talk to it. */
function spawnServer(args = [], env = {}) {
  const child = spawn(process.execPath, [bin, ...args], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, ...env },
  });
  let out = "";
  let err = "";
  child.stdout.on("data", (c) => (out += c));
  child.stderr.on("data", (c) => (err += c));
  const closed = new Promise((resolve) => child.on("close", (code) => resolve(code)));
  return { child, closed, out: () => out, err: () => err };
}

test("process smoke test over stdio", async () => {
  const p = spawnServer();
  const send = (m) => p.child.stdin.write(`${JSON.stringify(m)}\n`);
  send({ jsonrpc: "2.0", id: 1, method: "server/discover", params: { _meta: META } });
  send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: { _meta: META } });
  send({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { _meta: META, name: "render_plantuml", arguments: { source: SEQ } },
  });
  send({
    jsonrpc: "2.0",
    id: 4,
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "t", version: "1" },
    },
  });
  p.child.stdin.end();
  const code = await p.closed;
  assert.equal(code, 0, p.err());
  const messages = p
    .out()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  assert.equal(messages.length, 4, "stdout carries protocol messages only");
  const byId = Object.fromEntries(messages.map((m) => [m.id, m]));
  assert.deepEqual(byId[1].result.supportedVersions, ["2026-07-28"]);
  assert.equal(byId[2].result.tools.length, 4);
  assert.match(byId[3].result.content[0].text, /^<svg/);
  assert.equal(byId[4].result.protocolVersion, "2025-11-25");
  assert.equal(p.err(), "");
});

test("process exits on SIGTERM while idle", async () => {
  const p = spawnServer();
  p.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" })}\n`);
  await new Promise((resolve) => p.child.stdout.once("data", resolve));
  p.child.kill("SIGTERM");
  assert.equal(await p.closed, 0);
});

test("process: --version, --help and bad options", async () => {
  const v = spawnServer(["--version"]);
  assert.equal(await v.closed, 0);
  assert.match(v.out(), /^\S+\n$/);
  const h = spawnServer(["--help"]);
  assert.equal(await h.closed, 0);
  assert.match(h.out(), /--http/);
  const bad = spawnServer(["--bogus"]);
  assert.equal(await bad.closed, 2);
  assert.equal(bad.out(), "");
});

test("process: --http 0 listens on loopback and serves requests", async () => {
  const p = spawnServer(["--http", "0"]);
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no listener: ${p.err()}`)), 15_000);
    const poll = setInterval(() => {
      const m = /listening on (http:\/\/127\.0\.0\.1:\d+\/mcp)/.exec(p.err());
      if (m) {
        clearTimeout(timer);
        clearInterval(poll);
        resolve(m[1]);
      }
    }, 20);
  });
  try {
    const port = Number(new URL(url).port);
    const res = await post(
      port,
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "render_plantuml", arguments: { source: SEQ, format: "excalidraw" } },
      }),
    );
    assert.equal(res.status, 200);
    assert.equal(JSON.parse(JSON.parse(res.body).result.content[0].text).type, "excalidraw");
  } finally {
    p.child.kill("SIGTERM");
    assert.equal(await p.closed, 0);
  }
  assert.equal(p.out(), "");
});
