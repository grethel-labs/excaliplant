// Minimal ZIP writer and reader for the skill release artefacts.
//
// The writer is deterministic: entries are sorted, timestamps are fixed to
// 1980-01-01 00:00, permissions are fixed (files 0644) and nothing depends on
// the host. The default method is "store" (no compression): the skill is small
// and stored entries do not depend on the zlib version, so the same input gives
// the same bytes on every Node.js release. Unix permissions are recorded
// because ChatGPT rejects skills whose files are unreadable inside the archive.

import { deflateRawSync, inflateRawSync } from "node:zlib";

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_END = 0x06054b50;
/** 1980-01-01, the earliest DOS date. */
const DOS_DATE = (0 << 9) | (1 << 5) | 1;
const DOS_TIME = 0;
const FLAG_UTF8 = 0x0800;
/** "Made by" Unix, spec version 2.0 (so the high word of the attributes is a mode). */
const MADE_BY_UNIX = (3 << 8) | 20;

/** @type {Uint32Array} */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/**
 * @param {Uint8Array} data
 * @returns {number}
 */
export function crc32(data) {
  let c = 0xffffffff;
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * @typedef {object} ArchiveEntry
 * @property {string} path Forward-slash path inside the archive.
 * @property {string | Uint8Array} data
 * @property {number} [mode] Unix permission bits (default 0o644).
 */

/**
 * @param {string} name
 */
function assertSafeName(name) {
  if (
    !name ||
    name.startsWith("/") ||
    name.includes("\\") ||
    name.includes("\0") ||
    name.split("/").some((s) => s === "" || s === "." || s === "..")
  ) {
    throw new Error(`Unsafe archive path: ${name}`);
  }
}

/**
 * Build a ZIP archive.
 * @param {ArchiveEntry[]} entries
 * @param {{ method?: "store" | "deflate" }} [options]
 * @returns {Buffer}
 */
export function writeZip(entries, options = {}) {
  const method = options.method === "deflate" ? 8 : 0;
  const sorted = [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  /** @type {Buffer[]} */
  const locals = [];
  /** @type {Buffer[]} */
  const centrals = [];
  let offset = 0;
  const seen = new Set();
  for (const entry of sorted) {
    assertSafeName(entry.path);
    if (seen.has(entry.path)) throw new Error(`Duplicate archive path: ${entry.path}`);
    seen.add(entry.path);
    const name = Buffer.from(entry.path, "utf8");
    const raw = Buffer.from(
      typeof entry.data === "string" ? Buffer.from(entry.data, "utf8") : entry.data,
    );
    const body = method === 8 ? deflateRawSync(raw, { level: 9 }) : raw;
    const crc = crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(SIG_LOCAL, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(FLAG_UTF8, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(SIG_CENTRAL, 0);
    central.writeUInt16LE(MADE_BY_UNIX, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(FLAG_UTF8, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(((0o100000 | (entry.mode ?? 0o644)) << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + body.length;
  }
  const centralBytes = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(SIG_END, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(sorted.length, 8);
  end.writeUInt16LE(sorted.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, centralBytes, end]);
}

/**
 * Read a ZIP archive produced by {@link writeZip} (or any archive without
 * ZIP64, encryption or data descriptors). Verifies CRCs.
 * @param {Uint8Array} bytes
 * @returns {{ path: string, data: Buffer, mode: number }[]}
 */
export function readZip(bytes) {
  const buf = Buffer.from(bytes);
  let end = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === SIG_END) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error("Not a ZIP archive (no end-of-central-directory record)");
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  /** @type {{ path: string, data: Buffer, mode: number }[]} */
  const out = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== SIG_CENTRAL) throw new Error("Corrupt ZIP central directory");
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const attrs = buf.readUInt32LE(p + 38);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    if (buf.readUInt32LE(localOffset) !== SIG_LOCAL)
      throw new Error(`Corrupt local header: ${name}`);
    const dataStart =
      localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
    const body = buf.subarray(dataStart, dataStart + csize);
    const data = method === 8 ? inflateRawSync(body) : Buffer.from(body);
    if (method !== 0 && method !== 8) throw new Error(`Unsupported ZIP method ${method}: ${name}`);
    if (data.length !== usize || crc32(data) !== crc) throw new Error(`CRC mismatch: ${name}`);
    out.push({ path: name, data, mode: (attrs >>> 16) & 0o7777 });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}
