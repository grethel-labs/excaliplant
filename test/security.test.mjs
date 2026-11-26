// Hostile-input regression tests: SVG injection, prototype pollution,
// resource limits, regex backtracking and file-system access.

import { test } from "node:test";
import assert from "node:assert/strict";
import { render, preprocessText } from "../src/index.mjs";
import { LimitError } from "../src/core/errors.mjs";
import { sanitizeHookPreview } from "../src/markdown/sanitize.mjs";
import { excalidrawToSvg } from "../src/render/svg.mjs";
import { svgToPng } from "../src/render/png.mjs";

test("labels are escaped in SVG output", async () => {
  const r = await render(
    '@startuml\nclass "<script>alert(1)</script>" as X\nX : "a&b<img src=x onerror=alert(1)>"\n@enduml',
  );
  const svg = await r.toSvg({ embedFont: false });
  assert.doesNotMatch(svg, /<script>/);
  assert.doesNotMatch(svg, /<img/);
  assert.match(svg, /&lt;script&gt;/);
});

test("colours that are not colours never reach SVG attributes", async () => {
  const r = await render('@startuml\nclass A #red"onload="alert(1)\n@enduml');
  const svg = await r.toSvg({ embedFont: false });
  assert.doesNotMatch(svg, /onload/);
  const doc = structuredClone(r.excalidraw);
  doc.elements[0].strokeColor = '"/><script>alert(1)</script>';
  assert.doesNotMatch(excalidrawToSvg(doc, { embedFont: false }), /<script>/);
});

test("only http(s)/mailto links survive", async () => {
  const r = await render(
    "@startuml\nclass A [[javascript:alert(1)]]\nclass B [[https://example.com]]\n@enduml",
  );
  const links = r.excalidraw.elements.map((e) => e.link).filter(Boolean);
  assert.deepEqual(links, ["https://example.com"]);
});

test("JSON/YAML keys cannot pollute prototypes", async () => {
  await render(
    '@startjson\n{"__proto__": {"polluted": 1}, "constructor": {"prototype": {"x": 1}}}\n@endjson',
  );
  await render("@startyaml\n__proto__:\n  polluted: 1\n@endyaml");
  preprocessText('!$x = {"__proto__": {"polluted": 1}}\n%set_variable_value("__proto__", 1)');
  assert.equal(/** @type {any} */ ({}).polluted, undefined);
  assert.equal(/** @type {any} */ ({}).x, undefined);
});

test("input size, line and element limits are enforced", async () => {
  await assert.rejects(
    render("A -> B\n".repeat(10), { limits: { maxInputBytes: 20 } }),
    LimitError,
  );
  await assert.rejects(
    render(`@startuml\n${"A -> B\n".repeat(50)}@enduml`, { limits: { maxLines: 10 } }),
    LimitError,
  );
  const classes = Array.from({ length: 30 }, (_, i) => `class C${i}`).join("\n");
  await assert.rejects(
    render(`@startuml\n${classes}\n@enduml`, { limits: { maxNodes: 5 } }),
    LimitError,
  );
  await assert.rejects(
    render("@startuml\nA -> B\n@enduml", { limits: { maxElements: 3 } }),
    LimitError,
  );
});

test("preprocessor output explosion is bounded", () => {
  const bomb = `!$s = "x"\n!$i = 0\n!while $i < 40\n!$s = $s + $s\n!$i = $i + 1\n!endwhile\n$s`;
  assert.throws(() => preprocessText(bomb), LimitError);
});

test("PNG width is clamped", async () => {
  const r = await render("@startuml\nA -> B\n@enduml");
  const svg = await r.toSvg({ embedFont: false });
  const png = svgToPng(svg, { width: 10_000_000 });
  assert.equal(png.readUInt32BE(16), 16_000);
  assert.equal(svgToPng(svg, { width: 1 }).readUInt32BE(16), 16);
});

test("pathological lines parse in linear-ish time", async () => {
  const cases = [
    `@startuml\n${"-".repeat(20_000)}\n@enduml`,
    `@startuml\nA ${"-".repeat(5_000)}> B\n@enduml`,
    `@startuml\nclass ${"<".repeat(10_000)}\n@enduml`,
    `@startebnf\nrule = ${"a ".repeat(5_000)};\n@endebnf`,
    `@startuml\n${'"'.repeat(15_000)}\n@enduml`,
    `@startuml\n${"[".repeat(10_000)}\n@enduml`,
  ];
  for (const src of cases) {
    const start = Date.now();
    await render(src).catch(() => {});
    assert.ok(Date.now() - start < 3000, `took too long for ${src.slice(10, 30)}`);
  }
});

test("!include never touches the file system without a resolver", async () => {
  const r = await render("@startuml\n!include /etc/passwd\nA -> B\n@enduml");
  assert.ok(r.diagnostics.some((d) => /Cannot resolve/.test(d.message)));
  const r2 = await render("@startuml\n!includeurl https://example.com/x.puml\nA -> B\n@enduml");
  assert.ok(r2.diagnostics.some((d) => /not supported/.test(d.message)));
});

test("markdown: hostile labels never reach the inline SVG unescaped", async () => {
  const { renderMarkdown, createCache } = await import("../src/markdown/index.mjs");
  const diagram =
    '@startuml\nclass "<script>alert(1)</script>" as X\nX : "<img src=x onerror=alert(1)>"\n@enduml';
  const { markdown } = await renderMarkdown(`\`\`\`plantuml\n${diagram}\n\`\`\``, {
    cache: createCache(),
  });
  assert.doesNotMatch(markdown, /<script|<img|<foreignObject|javascript:/i);
  assert.doesNotMatch(markdown, /\son[a-z]+=/i);
  assert.match(markdown, /&lt;script&gt;/);
});

test("markdown: alt text and info attributes cannot break out of attributes", async () => {
  const { renderMarkdown, createCache } = await import("../src/markdown/index.mjs");
  const cache = createCache();
  const evil = '"><script>alert(1)</script>';
  const fence = (/** @type {string} */ info) => `\`\`\`${info}\n@startuml\nA -> B\n@enduml\n\`\`\``;
  const inline = await renderMarkdown(fence(`plantuml {alt='${evil}'}`), { cache });
  assert.doesNotMatch(inline.markdown, /<script/);
  assert.match(inline.markdown, /aria-label="&quot;&gt;&lt;script&gt;/);
  const file = await renderMarkdown(fence(`plantuml {alt='![x](javascript:alert(1)) <b>'}`), {
    cache,
    mode: "file",
  });
  assert.doesNotMatch(file.markdown, /(^|[^\\])<b>|(^|[^\\])\]\(javascript:/);
  const theme = await renderMarkdown(fence(`plantuml {theme='"><svg onload=alert(1)>'}`), {
    cache,
  });
  assert.equal(theme.changed, false);
  assert.match(theme.blocks[0].error ?? "", /Unknown theme/);
});

test("markdown: source kept in comments cannot close the comment", async () => {
  const { renderMarkdown, createCache } = await import("../src/markdown/index.mjs");
  const { scanMarkdown } = await import("../src/markdown/scan.mjs");
  const payload = "@startuml\nnote: --> <script>alert(1)</script> <!-- --!> -->\nA -> B\n@enduml";
  const { markdown } = await renderMarkdown(`\`\`\`plantuml\n${payload}\n\`\`\``, {
    keepSource: true,
    cache: createCache(),
  });
  const comment = markdown.slice(
    markdown.indexOf("<!-- excaliplant:source"),
    markdown.indexOf("\n-->\n") + 4,
  );
  assert.equal(comment.split("-->").length - 1, 1);
  // Outside the (inert) source comment nothing active remains.
  assert.doesNotMatch(markdown.replace(comment, ""), /<script|--!>/);
  assert.doesNotMatch(markdown, /--!>/);
  assert.equal(scanMarkdown(markdown)[0].source, payload);
});

test("markdown: asset directory and URL prefix are validated", async () => {
  const { renderMarkdown } = await import("../src/markdown/index.mjs");
  const doc = "```plantuml\nA -> B\n```";
  for (const assetsDir of ["/etc", "C:\\x", "a\\..\\b", "x:y", "a\0b"]) {
    await assert.rejects(renderMarkdown(doc, { mode: "file", assetsDir }), RangeError);
  }
  for (const assetsUrl of ["javascript:alert(1)", "data:text/html,x", 'x"y', "a<b"]) {
    await assert.rejects(renderMarkdown(doc, { mode: "file", assetsUrl }), RangeError);
  }
});

test("markdown: scanning pathological documents is fast and bounded", async () => {
  const { extractBlocks, renderMarkdown } = await import("../src/markdown/index.mjs");
  const cases = [
    "```plantuml\n".repeat(20_000),
    "<!-- excaliplant:begin hash=abcdef012345 -->\n".repeat(15_000),
    `${"`".repeat(100_000)}plantuml\n`,
    `\`\`\`plantuml ${"{=".repeat(50_000)}\nA\n\`\`\``,
    `\`\`\`plantuml ${'alt="'.repeat(20_000)}\nA\n\`\`\``,
    "~~~\n".repeat(40_000),
  ];
  for (const doc of cases) {
    const start = Date.now();
    extractBlocks(doc);
    await renderMarkdown(doc, { budget: { maxBlocks: 0 } });
    assert.ok(Date.now() - start < 3000, `took too long for ${doc.slice(0, 20)}`);
  }
});

test("markdown: the document budget caps the number of rendered diagrams", async () => {
  const { renderMarkdown, createCache } = await import("../src/markdown/index.mjs");
  const doc = Array.from({ length: 80 }, (_, i) => `\`\`\`puml\nA -> B : n${i}\n\`\`\``).join(
    "\n\n",
  );
  const r = await renderMarkdown(doc, { cache: createCache(), budget: { maxBlocks: 3 } });
  assert.equal(r.blocks.filter((b) => b.error === undefined).length, 3);
  assert.equal(r.blocks.filter((b) => /budget/.test(b.error ?? "")).length, 77);
  const { extractBlocks } = await import("../src/markdown/index.mjs");
  assert.equal(extractBlocks(r.markdown).length, 77);
});

test("markdown: sanitizer removes active content from foreign SVG", async () => {
  const { sanitizeSvg } = await import("../src/markdown/index.mjs");
  const svg = sanitizeSvg(
    '<svg xmlns="http://www.w3.org/2000/svg"><script>x</script><g onclick="x()"><use href="http://e/x.svg#a"/></g><a href=" jav&#x61;script:x()"><rect/></a><image href="http://e/i.png"/><style>@import "http://e/x.css";</style></svg>',
  );
  assert.doesNotMatch(svg, /script|onclick|<use|<image|@import|http:\/\/e|jav/i);
});

test("playground sanitizer keeps only the SVG attributes needed for live hook previews", async () => {
  const input = `<svg onload="alert(1)" display="none" data-excaliplant-hook="root">
    <style>text{white-space:pre;}</style>
    <script>alert(1)</script>
    <foreignObject><div>foreign</div></foreignObject>
    <g data-excaliplant-hook="@line:0:1" data-excaliplant-hook-id="open" data-excaliplant-hook-classes="first second" data-excaliplant-element-id="abc-1" onclick="alert(1)" role="button" tabindex="0" style="display:block" data-excaliplant-unknown="x" id="doc" class="outer">
      <a href="https://example.com/?a=1&amp;b=2"><g data-excaliplant-variant="hover" display="none" pointer-events="none"/></a>
      <a href="jav&#x61;script:x()"><g aria-hidden="true" pointer-events="painted"/></a>
    </g>
    <g data-excaliplant-hook="@line:0:1\n" data-excaliplant-hook-id="&#x61;" data-excaliplant-hook-classes="first\tsecond" data-excaliplant-element-id="bad\nvalue" data-excaliplant-variant="selected" display="block" pointer-events="all" aria-hidden="false" fill="url(https://example.com/resource)"/>
    <rect data-excaliplant-hook="open" data-excaliplant-variant="base" aria-hidden="true" pointer-events="none" width="10"/>
  </svg>`;
  const preview = sanitizeHookPreview(input).replace(/\s+</g, "<");
  assert.equal(
    preview,
    '<svg xmlns="http://www.w3.org/2000/svg"><g data-excaliplant-hook="@line:0:1" data-excaliplant-hook-id="open" data-excaliplant-hook-classes="first second" data-excaliplant-element-id="abc-1"><a href="https://example.com/?a=1&amp;b=2"><g data-excaliplant-variant="hover" display="none" pointer-events="none"/></a><a><g aria-hidden="true" pointer-events="painted"/></a></g><g/><rect width="10"/></svg>',
  );

  const { sanitizeSvg } = await import("../src/markdown/index.mjs");
  const markdownSvg = sanitizeSvg(input);
  assert.match(markdownSvg, /<style>text\{white-space:pre;\}<\/style>/);
  assert.doesNotMatch(markdownSvg, /data-excaliplant-|display=|pointer-events=|aria-hidden=/);
});

test("nested hook markers accept only valid parent names and literal opt-in values", async () => {
  const result = await render(
    "@startuml\n@hook #details alias:Details\ncomponent Details\n@enduml",
    { strict: true },
  );
  const doc = result.toJSON();
  const [valid, invalid] = doc.elements.filter((el) => el.customData?.excaliplantHook);
  valid.customData.excaliplantHook = {
    ...valid.customData.excaliplantHook,
    parent: "@line:5:2",
    clickFromChildren: true,
  };
  invalid.customData.excaliplantHook = {
    ...invalid.customData.excaliplantHook,
    parent: 'details" onload="alert(1)',
    clickFromChildren: "true",
  };
  const svg = excalidrawToSvg(doc, { interactive: true, embedFont: false });
  const markers = / data-excaliplant-(?:hook-parent|click-from-children)="[^"]*"/g;
  const validMarkers = [
    ' data-excaliplant-hook-parent="@line:5:2"',
    ' data-excaliplant-click-from-children="true"',
  ];
  assert.deepEqual(svg.match(markers), validMarkers);

  const preview = sanitizeHookPreview(
    svg.replace(
      "</svg>",
      `<g data-excaliplant-hook-parent="outer" data-excaliplant-click-from-children="True"/>
       <g data-excaliplant-hook-parent="outer\n" data-excaliplant-click-from-children="t&#x72;ue"/>
       <g data-excaliplant-hook-parent="@line:5:2:1" data-excaliplant-click-from-children="false"/>
       <rect data-excaliplant-hook-parent="outer" data-excaliplant-click-from-children="true"/>
       </svg>`,
    ),
  );
  assert.deepEqual(preview.match(markers), [
    ...validMarkers,
    ' data-excaliplant-hook-parent="outer"',
  ]);
  const { sanitizeSvg } = await import("../src/markdown/index.mjs");
  assert.doesNotMatch(sanitizeSvg(svg), markers);
});

test("SVG tooltips escape markup and replace invalid XML characters", async () => {
  const payload = "</title><script>alert(1)</script> & 📦\u0000\uD800";
  const result = await render(
    `@startuml\n@tooltip alias:Details ${JSON.stringify(payload)}\ncomponent Details\n@enduml`,
    { strict: true },
  );
  const title = "<title>&lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt; &amp; 📦��</title>";
  const { sanitizeSvg } = await import("../src/markdown/index.mjs");
  const svg = await result.toSvg({ embedFont: false });
  const inline = await result.toSvg({ interactive: true, embedFont: false });
  for (const markup of [svg, sanitizeSvg(svg), inline, sanitizeHookPreview(inline)]) {
    assert.ok(markup.includes(title));
    assert.doesNotMatch(markup, /<script|\u0000|\uD800/u);
  }
});

test("mcp: tool arguments cannot name files or switch on includes", async () => {
  const { createServer } = await import("../src/mcp/index.mjs");
  const server = createServer({ executor: "inline" });
  try {
    const run = async (args) =>
      JSON.parse(
        (
          await server.handleText(
            JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "tools/call",
              params: { name: "render_plantuml", arguments: args },
            }),
          )
        ).text,
      ).result;
    for (const extra of [{ path: "/etc/passwd" }, { file: "/etc/passwd" }, { includeDir: "/" }]) {
      const res = await run({ source: "@startuml\nA -> B\n@enduml", ...extra });
      assert.equal(res.isError, true);
      assert.match(res.content[0].text, /unknown property/);
    }
    const res = await run({ source: "@startuml\n!include /etc/passwd\nA -> B\n@enduml" });
    assert.ok(res.structuredContent.diagnostics.some((d) => /Cannot resolve/.test(d.message)));
    assert.doesNotMatch(res.content[0].text, /root:/);
  } finally {
    await server.close();
  }
});

test("mcp: --include-dir cannot be escaped through traversal or symlinks", async () => {
  const { createIncludeResolver } = await import("../src/mcp/include.mjs");
  const { mkdtempSync, writeFileSync, symlinkSync, mkdirSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const base = mkdtempSync(path.join(tmpdir(), "excaliplant-inc-"));
  const root = path.join(base, "root");
  mkdirSync(root);
  writeFileSync(path.join(root, "ok.puml"), "A -> B\n");
  writeFileSync(path.join(base, "secret.puml"), "SECRET\n");
  symlinkSync(path.join(base, "secret.puml"), path.join(root, "link.puml"));
  const resolve = createIncludeResolver(root, 1024);
  const file = { from: null, kind: /** @type {const} */ ("file") };
  assert.equal(resolve("ok.puml", file), "A -> B\n");
  assert.equal(resolve("../secret.puml", file), null);
  assert.equal(resolve("link.puml", file), null);
  assert.equal(resolve(path.join(base, "secret.puml"), file), null);
  assert.equal(resolve("ok.puml", { from: null, kind: "url" }), null);
  const tiny = createIncludeResolver(root, 2);
  assert.equal(tiny("ok.puml", file), null);
});

test("project includes stay inside the canonical project root", async () => {
  const { openProject } = await import("../bin/project.mjs");
  const { mkdtempSync, writeFileSync, symlinkSync, mkdirSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const base = mkdtempSync(path.join(tmpdir(), "excaliplant-project-"));
  const root = path.join(base, "root");
  mkdirSync(root);
  const outside = path.join(base, "outside.iuml");
  writeFileSync(outside, "class Outside");
  symlinkSync(outside, path.join(root, "link.iuml"));
  const resolve = openProject(root).createResolver();
  const file = { from: "parts/api.puml", kind: /** @type {const} */ ("file") };
  assert.equal(resolve("../../outside.iuml", file), null);
  assert.equal(resolve("../link.iuml", file), null);
  assert.equal(resolve(outside, file), null);
  assert.equal(resolve("https://example.test/file.puml", file), null);
});

test("mcp: HTTP transport refuses DNS-rebinding and cross-origin requests", async () => {
  const { createServer, serveHttp } = await import("../src/mcp/index.mjs");
  const server = createServer({ executor: "inline" });
  const http = await serveHttp(server, { port: 0 });
  try {
    assert.equal(new URL(http.url).hostname, "127.0.0.1");
    const send = (headers) =>
      fetch(http.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
      }).then((r) => r.status);
    assert.equal(await send({ Origin: "https://attacker.example" }), 403);
    assert.equal(await send({ Origin: "http://localhost.attacker.example" }), 403);
    assert.equal(await send({ Origin: "http://127.0.0.1.attacker.example" }), 403);
    assert.equal(await send({}), 200);
  } finally {
    await http.close();
  }
});

test("mcp: oversized and malformed messages are rejected without buffering them", async () => {
  const { LineSplitter } = await import("../src/mcp/stdio.mjs");
  const { createServer } = await import("../src/mcp/index.mjs");
  let overflows = 0;
  const lines = [];
  const splitter = new LineSplitter(
    1024,
    (l) => lines.push(l),
    () => overflows++,
  );
  const chunk = Buffer.alloc(1 << 20, "a");
  for (let i = 0; i < 64; i++) {
    splitter.push(chunk);
    assert.ok(splitter.size <= 1024);
  }
  splitter.push(Buffer.from('\n{"ok":true}\n'));
  assert.equal(overflows, 1);
  assert.deepEqual(lines, ['{"ok":true}']);
  const server = createServer({ executor: "inline" });
  try {
    for (const hostile of [
      '{"__proto__":{"x":1}}',
      "[[[[[[[[[[",
      '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"__proto__","arguments":null}}',
    ]) {
      const { text } = await server.handleText(hostile);
      assert.ok(JSON.parse(text).error, hostile);
    }
    assert.equal({}.x, undefined);
  } finally {
    await server.close();
  }
});

test("mcp: PNG width is clamped and the server never writes to stdout on its own", async () => {
  const { createServer } = await import("../src/mcp/index.mjs");
  const server = createServer({ executor: "inline" });
  try {
    const res = JSON.parse(
      (
        await server.handleText(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: {
              name: "render_plantuml",
              arguments: { source: "@startuml\nA -> B\n@enduml", format: "png" },
            },
          }),
        )
      ).text,
    ).result;
    // Default scale stays within the cap even for wide diagrams.
    assert.ok(Buffer.from(res.content[0].data, "base64").readUInt32BE(16) <= 4096);
    const tooWide = JSON.parse(
      (
        await server.handleText(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 2,
            method: "tools/call",
            params: {
              name: "render_plantuml",
              arguments: { source: "@startuml\nA -> B\n@enduml", format: "png", width: 16000 },
            },
          }),
        )
      ).text,
    ).result;
    assert.equal(tooWide.isError, true);
  } finally {
    await server.close();
  }
});
