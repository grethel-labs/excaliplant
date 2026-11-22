// The static server of scripts/site-smoke.mjs: it serves the built site under the
// path GitHub Pages uses and must never serve anything outside the site directory.
// (The browser run itself is exercised by the "Site smoke test" CI job.)

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { MOUNT, createStaticServer } from "../scripts/site-smoke.mjs";

/**
 * @param {number} port
 * @param {string} requestPath Sent as written (no URL normalisation).
 * @param {string} [method]
 * @returns {Promise<{ status: number, body: string, type: string, location: string }>}
 */
function request(port, requestPath, method = "GET") {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: requestPath, method }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () =>
        resolve({
          status: res.statusCode ?? 0,
          body,
          type: String(res.headers["content-type"] ?? ""),
          location: String(res.headers.location ?? ""),
        }),
      );
    });
    req.on("error", reject);
    req.end();
  });
}

test("the smoke test serves the site under /excaliplant/ and nothing else", async (t) => {
  const parent = mkdtempSync(path.join(os.tmpdir(), "excaliplant-smoke-"));
  const site = path.join(parent, "site");
  mkdirSync(path.join(site, "d", "x"), { recursive: true });
  writeFileSync(path.join(site, "index.html"), "<!doctype html><title>home</title>");
  writeFileSync(path.join(site, "worker.js"), "self.x=1");
  writeFileSync(path.join(site, "d", "x", "a.svg"), "<svg/>");
  writeFileSync(path.join(parent, "secret.txt"), "outside the site");
  const server = createStaticServer(site);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(undefined)));
  const { port } = /** @type {import("node:net").AddressInfo} */ (server.address());
  t.after(() => {
    server.close();
    rmSync(parent, { recursive: true, force: true });
  });

  assert.equal(MOUNT, "/excaliplant/");
  const home = await request(port, `${MOUNT}index.html`);
  assert.equal(home.status, 200);
  assert.match(home.type, /^text\/html/);
  assert.match(home.body, /<title>home<\/title>/);
  assert.equal((await request(port, MOUNT)).status, 200, "the directory serves index.html");
  assert.match((await request(port, `${MOUNT}worker.js`)).type, /^text\/javascript/);
  assert.match((await request(port, `${MOUNT}d/x/a.svg`)).type, /^image\/svg\+xml/);
  assert.equal((await request(port, "/")).location, MOUNT, "the root redirects to the mount");
  assert.equal(
    (await request(port, "/index.html")).status,
    404,
    "nothing is served outside the mount",
  );
  assert.equal((await request(port, `${MOUNT}missing.js`)).status, 404);
  assert.equal((await request(port, `${MOUNT}index.html`, "POST")).status, 405);
  assert.equal((await request(port, `${MOUNT}index.html`, "HEAD")).status, 200);
  for (const hostile of [
    `${MOUNT}..%2fsecret.txt`,
    `${MOUNT}%2e%2e%2fsecret.txt`,
    `${MOUNT}..%2F..%2Fetc%2Fpasswd`,
    `${MOUNT}index.html%00.js`,
    `${MOUNT}%`,
  ]) {
    const r = await request(port, hostile);
    assert.equal(r.status, 404, hostile);
    assert.ok(!r.body.includes("outside the site"), hostile);
  }
});
