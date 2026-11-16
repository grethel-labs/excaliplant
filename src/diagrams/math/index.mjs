/**
 * Mathematical formulas (`@startmath` = AsciiMath, `@startlatex` = LaTeX
 * subset) typeset with a small box layout: fractions, super/subscripts,
 * roots, big operators with limits, brackets and symbols.
 * @module diagrams/math
 */

import { defineDiagram } from "../../core/registry.mjs";
import { createMeta, parseCommon } from "../../syntax/commons.mjs";
import { LineReader } from "../../syntax/reader.mjs";
import { textWidth } from "../../layout/measure.mjs";
import { LimitError } from "../../core/errors.mjs";

/** Integral signs take their limits beside the glyph (TeX `\nolimits`), other big operators above and below. */
const SIDE_LIMIT_OPS = new Set(["∫", "∮", "∬"]);

/**
 * @typedef {(
 *  | { t: "row", items: MNode[] }
 *  | { t: "sym", text: string, italic?: boolean, op?: boolean }
 *  | { t: "frac", n: MNode, d: MNode, bar?: boolean }
 *  | { t: "script", base: MNode, sup: MNode | null, sub: MNode | null }
 *  | { t: "sqrt", body: MNode, index: MNode | null }
 *  | { t: "fence", open: string, close: string, body: MNode }
 *  | { t: "big", op: string, sup: MNode | null, sub: MNode | null }
 *  | { t: "space", w: number }
 * )} MNode
 */

const SYMBOLS = new Map(
  Object.entries({
    alpha: "α",
    beta: "β",
    gamma: "γ",
    delta: "δ",
    epsilon: "ε",
    varepsilon: "ε",
    zeta: "ζ",
    eta: "η",
    theta: "θ",
    vartheta: "ϑ",
    iota: "ι",
    kappa: "κ",
    lambda: "λ",
    mu: "μ",
    nu: "ν",
    xi: "ξ",
    pi: "π",
    rho: "ρ",
    sigma: "σ",
    tau: "τ",
    upsilon: "υ",
    phi: "φ",
    varphi: "φ",
    chi: "χ",
    psi: "ψ",
    omega: "ω",
    Gamma: "Γ",
    Delta: "Δ",
    Theta: "Θ",
    Lambda: "Λ",
    Xi: "Ξ",
    Pi: "Π",
    Sigma: "Σ",
    Phi: "Φ",
    Psi: "Ψ",
    Omega: "Ω",
    infty: "∞",
    oo: "∞",
    partial: "∂",
    del: "∂",
    nabla: "∇",
    grad: "∇",
    cdot: "·",
    times: "×",
    xx: "×",
    div: "÷",
    pm: "±",
    mp: "∓",
    leq: "≤",
    le: "≤",
    geq: "≥",
    ge: "≥",
    neq: "≠",
    ne: "≠",
    approx: "≈",
    equiv: "≡",
    sim: "∼",
    propto: "∝",
    in: "∈",
    notin: "∉",
    subset: "⊂",
    subseteq: "⊆",
    supset: "⊃",
    cup: "∪",
    cap: "∩",
    forall: "∀",
    exists: "∃",
    neg: "¬",
    wedge: "∧",
    vee: "∨",
    to: "→",
    rightarrow: "→",
    leftarrow: "←",
    Rightarrow: "⇒",
    Leftarrow: "⇐",
    leftrightarrow: "↔",
    Leftrightarrow: "⇔",
    implies: "⇒",
    iff: "⇔",
    mapsto: "↦",
    ldots: "…",
    cdots: "⋯",
    dots: "…",
    emptyset: "∅",
    angle: "∠",
    circ: "∘",
    degree: "°",
    prime: "′",
    hbar: "ℏ",
    ell: "ℓ",
    Re: "ℜ",
    Im: "ℑ",
    aleph: "ℵ",
    RR: "ℝ",
    NN: "ℕ",
    ZZ: "ℤ",
    QQ: "ℚ",
    CC: "ℂ",
    star: "⋆",
    ast: "∗",
    bullet: "•",
    langle: "⟨",
    rangle: "⟩",
  }),
);
/** Binary operators and relations that get TeX-style spacing; letters, `∞`, `∂` and friends do not. */
const SPACED_SYMBOLS = new Set([..."·×÷±∓≤≥≠≈≡∼∝∈∉⊂⊆⊃∪∩∧∨→←⇒⇐↔⇔↦∘⋆∗"]);
const ASCII_OPS = new Map([
  ["<=", "≤"],
  [">=", "≥"],
  ["!=", "≠"],
  ["->", "→"],
  ["=>", "⇒"],
  ["<=>", "⇔"],
  ["+-", "±"],
  ["-+", "∓"],
  ["**", "∗"],
  ["***", "⋆"],
  ["//", "/"],
  ["-:", "÷"],
  ["~~", "≈"],
  ["-=", "≡"],
  ["...", "…"],
  ["|->", "↦"],
  ["<-", "←"],
  ["!in", "∉"],
]);
const BIG_OPS = new Map([
  ["sum", "∑"],
  ["prod", "∏"],
  ["int", "∫"],
  ["oint", "∮"],
  ["iint", "∬"],
  ["bigcup", "⋃"],
  ["bigcap", "⋂"],
  ["lim", "lim"],
  ["max", "max"],
  ["min", "min"],
  ["sup", "sup"],
  ["inf", "inf"],
]);
const FUNCS = new Set([
  "sin",
  "cos",
  "tan",
  "cot",
  "sec",
  "csc",
  "log",
  "ln",
  "exp",
  "det",
  "dim",
  "gcd",
  "arcsin",
  "arccos",
  "arctan",
  "sinh",
  "cosh",
  "tanh",
  "mod",
]);

// ── LaTeX ─────────────────────────────────────────────────────────────

// Private-use markers for the infix commands; they never reach the layout.
const CHOOSE = "\uE000choose";
const OVER = "\uE000over";
const INFIX = new Set([CHOOSE, OVER]);

/**
 * Binomial coefficient: two stacked rows without a rule inside brackets.
 * @param {MNode} n
 * @param {MNode} d
 * @returns {MNode}
 */
function binomial(n, d) {
  return { t: "fence", open: "(", close: ")", body: { t: "frac", n, d, bar: false } };
}

/**
 * @param {string} src
 * @returns {MNode}
 */
export function parseLatex(src) {
  let i = 0;
  let steps = 0;
  /** @returns {MNode} */
  const group = () => {
    while (src[i] === " ") i++;
    if (src[i] === "{") {
      i++;
      const r = row("}");
      i++;
      return r;
    }
    // A missing argument (`\binom k`) must not swallow `}` or `\right`.
    if (src[i] === "}" || src.startsWith("\\right", i)) return { t: "row", items: [] };
    return atom() ?? { t: "row", items: [] };
  };
  /** @param {string} end @returns {MNode} */
  const row = (end) => {
    /** @type {MNode[]} */
    const items = [];
    while (i < src.length && !src.startsWith(end, i)) {
      if (++steps > 20000) throw new LimitError("Formula too complex");
      if (end === "\\right" && src.startsWith("\\right", i)) break;
      const a = atom();
      if (!a) continue;
      items.push(scripts(a));
    }
    return infix(items);
  };
  /**
   * TeX's infix `{n \choose k}` / `{a \over b}` split a group in two halves.
   * @param {MNode[]} items
   * @returns {MNode}
   */
  const infix = (items) => {
    const at = items.findIndex((it) => it.t === "sym" && INFIX.has(it.text));
    if (at < 0) return { t: "row", items };
    const kind = /** @type {{ text: string }} */ (items[at]).text;
    /** @type {MNode} */
    const n = { t: "row", items: items.slice(0, at) };
    const d = infix(items.slice(at + 1));
    if (kind === OVER) return { t: "frac", n, d };
    return binomial(n, d);
  };
  /** @param {MNode} base @returns {MNode} */
  const scripts = (base) => {
    /** @type {MNode | null} */
    let sup = null;
    /** @type {MNode | null} */
    let sub = null;
    for (;;) {
      while (src[i] === " ") i++;
      if (src[i] === "^") {
        i++;
        sup = group();
      } else if (src[i] === "_") {
        i++;
        sub = group();
      } else break;
    }
    if (!sup && !sub) return base;
    if (base.t === "big") return { ...base, sup, sub };
    return { t: "script", base, sup, sub };
  };
  /** @returns {MNode | null} */
  const atom = () => {
    const c = src[i];
    if (c === " " || c === "&") {
      i++;
      return null;
    }
    if (c === "{") return group();
    if (c === "\\") {
      const m = /^\\([A-Za-z]+|.)/.exec(src.slice(i));
      const cmd = m ? m[1] : "";
      i += cmd.length + 1;
      if (cmd === "frac" || cmd === "dfrac" || cmd === "tfrac")
        return { t: "frac", n: group(), d: group() };
      if (cmd === "binom" || cmd === "dbinom" || cmd === "tbinom")
        return binomial(group(), group());
      if (cmd === "choose") return { t: "sym", text: CHOOSE };
      if (cmd === "over") return { t: "sym", text: OVER };
      if (cmd === "sqrt") {
        let index = null;
        if (src[i] === "[") {
          const end = src.indexOf("]", i);
          index = parseLatex(src.slice(i + 1, end));
          i = end + 1;
        }
        return { t: "sqrt", body: group(), index };
      }
      if (cmd === "left") {
        const open = readDelim();
        const body = row("\\right");
        i += 6;
        return { t: "fence", open, close: readDelim(), body };
      }
      if (
        cmd === "text" ||
        cmd === "mathrm" ||
        cmd === "operatorname" ||
        cmd === "mathbf" ||
        cmd === "textbf"
      ) {
        const g = group();
        return { t: "sym", text: flatten(g) };
      }
      if (cmd === "," || cmd === ";" || cmd === ":") return { t: "space", w: 0.25 };
      if (cmd === "quad") return { t: "space", w: 1 };
      if (cmd === "qquad") return { t: "space", w: 2 };
      if (cmd === "\\") return { t: "space", w: 1 };
      if (BIG_OPS.has(cmd))
        return { t: "big", op: /** @type {string} */ (BIG_OPS.get(cmd)), sup: null, sub: null };
      if (FUNCS.has(cmd)) return { t: "sym", text: cmd };
      if (SYMBOLS.has(cmd))
        return {
          t: "sym",
          text: /** @type {string} */ (SYMBOLS.get(cmd)),
          op: SPACED_SYMBOLS.has(/** @type {string} */ (SYMBOLS.get(cmd))),
        };
      if ("{}%$#_&".includes(cmd)) return { t: "sym", text: cmd };
      return { t: "sym", text: cmd };
    }
    i++;
    if (/[a-zA-Z]/.test(c)) return { t: "sym", text: c, italic: true };
    if (/[0-9.]/.test(c)) {
      let s = c;
      while (/[0-9.]/.test(src[i] ?? "")) s += src[i++];
      return { t: "sym", text: s };
    }
    return { t: "sym", text: c, op: /[=+\-<>*/]/.test(c) };
  };
  const readDelim = () => {
    while (src[i] === " ") i++;
    if (src[i] === "\\") {
      const m = /^\\([A-Za-z]+|.)/.exec(src.slice(i));
      i += m?.[0].length ?? 1;
      return m?.[1] === "{" ? "{" : m?.[1] === "}" ? "}" : (SYMBOLS.get(m?.[1] ?? "") ?? "");
    }
    const ch = src[i++] ?? "";
    return ch === "." ? "" : ch;
  };
  return row("\u0000");
}

/** @param {MNode} n @returns {string} */
function flatten(n) {
  if (n.t === "sym") return n.text;
  if (n.t === "row") return n.items.map(flatten).join("");
  return "";
}

// ── AsciiMath ─────────────────────────────────────────────────────────

/**
 * @param {string} src
 * @returns {MNode}
 */
export function parseAsciiMath(src) {
  let i = 0;
  let steps = 0;
  const ws = () => {
    while (src[i] === " ") i++;
  };
  /** @returns {MNode | null} */
  const simple = () => {
    ws();
    if (i >= src.length) return null;
    if (++steps > 20000) throw new LimitError("Formula too complex");
    const c = src[i];
    if (c === "(" || c === "[" || c === "{" || (c === "|" && src.indexOf("|", i + 1) > i)) {
      const close = c === "(" ? ")" : c === "[" ? "]" : c === "{" ? "}" : "|";
      i++;
      const body = expr(close);
      if (
        src[i] === close ||
        (close === ")" && src[i] === "]") ||
        (close === "]" && src[i] === ")")
      )
        i++;
      return { t: "fence", open: c, close, body };
    }
    if (c === '"') {
      const end = src.indexOf('"', i + 1);
      const s = src.slice(i + 1, end < 0 ? src.length : end);
      i = end < 0 ? src.length : end + 1;
      return { t: "sym", text: s };
    }
    for (const len of [3, 2]) {
      const op = src.slice(i, i + len);
      if (ASCII_OPS.has(op)) {
        i += len;
        return { t: "sym", text: /** @type {string} */ (ASCII_OPS.get(op)), op: true };
      }
    }
    const word = /^[A-Za-z]+/.exec(src.slice(i));
    if (word) {
      const w = word[0];
      // longest known prefix (e.g. "sqrtx" is rare; prefer exact words)
      const known = [
        ...SYMBOLS.keys(),
        ...BIG_OPS.keys(),
        ...FUNCS,
        "sqrt",
        "root",
        "text",
        "frac",
        "hat",
        "bar",
        "vec",
      ]
        .filter((k) => w.startsWith(k))
        .sort((a, b) => b.length - a.length)[0];
      if (known) {
        i += known.length;
        if (known === "sqrt") return { t: "sqrt", body: unwrap(simple()), index: null };
        if (known === "root") {
          const n = unwrap(simple());
          return { t: "sqrt", body: unwrap(simple()), index: n };
        }
        if (known === "frac") return { t: "frac", n: unwrap(simple()), d: unwrap(simple()) };
        if (known === "text") return { t: "sym", text: flatten(unwrap(simple())) };
        if (known === "hat" || known === "bar" || known === "vec")
          return {
            t: "script",
            base: unwrap(simple()),
            sup: { t: "sym", text: known === "hat" ? "^" : known === "bar" ? "‾" : "→" },
            sub: null,
          };
        if (BIG_OPS.has(known))
          return { t: "big", op: /** @type {string} */ (BIG_OPS.get(known)), sup: null, sub: null };
        if (FUNCS.has(known)) return { t: "sym", text: known };
        return { t: "sym", text: /** @type {string} */ (SYMBOLS.get(known)) };
      }
      i++;
      return { t: "sym", text: w[0], italic: true };
    }
    if (/[0-9.]/.test(c)) {
      let s = "";
      while (/[0-9.]/.test(src[i] ?? "")) s += src[i++];
      return { t: "sym", text: s };
    }
    i++;
    return { t: "sym", text: c, op: /[=+\-<>*]/.test(c) };
  };
  /** @returns {MNode | null} */
  const intermediate = () => {
    let base = simple();
    if (!base) return null;
    /** @type {MNode | null} */
    let sub = null;
    /** @type {MNode | null} */
    let sup = null;
    for (;;) {
      ws();
      if (src[i] === "_") {
        i++;
        sub = unwrap(simple());
      } else if (src[i] === "^") {
        i++;
        sup = unwrap(simple());
      } else break;
    }
    if (sub || sup)
      base = base.t === "big" ? { ...base, sub, sup } : { t: "script", base, sup, sub };
    return base;
  };
  /** @param {string} end @returns {MNode} */
  const expr = (end) => {
    /** @type {MNode[]} */
    const items = [];
    for (;;) {
      ws();
      if (i >= src.length || src[i] === end || (end && ")]}".includes(src[i]))) break;
      let a = intermediate();
      if (!a) break;
      ws();
      if (src[i] === "/" && src[i + 1] !== "/") {
        i++;
        const d = intermediate();
        a = { t: "frac", n: unwrap(a), d: unwrap(d) };
      }
      items.push(a);
    }
    return { t: "row", items };
  };
  return expr("");
}

/**
 * Brackets used purely for grouping arguments are dropped.
 * @param {MNode | null} n
 * @returns {MNode}
 */
function unwrap(n) {
  if (!n) return { t: "row", items: [] };
  if (n.t === "fence" && (n.open === "(" || n.open === "{")) return n.body;
  return n;
}

// ── layout ────────────────────────────────────────────────────────────

/** @typedef {{ w: number, asc: number, desc: number, draw: (c: import("../../draw/canvas.mjs").Canvas, x: number, base: number) => void }} MBox */

/**
 * @param {MNode} n
 * @param {number} fs
 * @param {string} ink
 * @returns {MBox}
 */
function mbox(n, fs, ink) {
  switch (n.t) {
    case "space":
      return { w: n.w * fs, asc: 0, desc: 0, draw: () => {} };
    case "sym": {
      const pad = n.op ? fs * 0.22 : 0;
      const w = textWidth(n.text, fs) + pad * 2;
      return {
        w,
        asc: fs * 0.72,
        desc: fs * 0.24,
        draw: (c, x, base) =>
          c.text(n.text, x + pad, base - fs * 0.88, { size: fs, color: ink, italic: n.italic }),
      };
    }
    case "row": {
      const parts = n.items.map((it, k) => mbox(unaryMinus(n.items, k), fs, ink));
      return {
        w: parts.reduce((s, p) => s + p.w, 0),
        asc: Math.max(fs * 0.72, ...parts.map((p) => p.asc)),
        desc: Math.max(fs * 0.24, ...parts.map((p) => p.desc)),
        draw: (c, x, base) => {
          let cx = x;
          for (const p of parts) {
            p.draw(c, cx, base);
            cx += p.w;
          }
        },
      };
    }
    case "frac": {
      const num = mbox(n.n, fs * 0.85, ink);
      const den = mbox(n.d, fs * 0.85, ink);
      const w = Math.max(num.w, den.w) + fs * 0.4;
      const axis = fs * 0.3;
      return {
        w,
        asc: axis + num.asc + num.desc + 4,
        desc: den.asc + den.desc + 4 - axis,
        draw: (c, x, base) => {
          const by = base - axis;
          if (n.bar !== false)
            c.line(
              [
                [x + 2, by],
                [x + w - 2, by],
              ],
              { stroke: ink, strokeWidth: 1.5, roughness: 0.5 },
            );
          num.draw(c, x + (w - num.w) / 2, by - num.desc - 4);
          den.draw(c, x + (w - den.w) / 2, by + den.asc + 4);
        },
      };
    }
    case "script": {
      const base = mbox(n.base, fs, ink);
      const sup = n.sup ? mbox(n.sup, fs * 0.65, ink) : null;
      const sub = n.sub ? mbox(n.sub, fs * 0.65, ink) : null;
      const raise = base.asc * 0.55;
      // The subscript hangs right under the base line like in TeX; only tall
      // bases (fractions, brackets) push it further down.
      const drop = Math.max(fs * 0.2, base.desc - fs * 0.05);
      return {
        w: base.w + Math.max(sup?.w ?? 0, sub?.w ?? 0) + 2,
        asc: Math.max(base.asc, sup ? raise + sup.asc : 0),
        desc: Math.max(base.desc, sub ? drop + sub.desc : 0),
        draw: (c, x, b) => {
          base.draw(c, x, b);
          if (sup) sup.draw(c, x + base.w + 1, b - raise);
          if (sub) sub.draw(c, x + base.w + 1, b + drop);
        },
      };
    }
    case "sqrt": {
      const body = mbox(n.body, fs, ink);
      const index = n.index ? mbox(n.index, fs * 0.55, ink) : null;
      const lead = fs * 0.7 + (index ? Math.max(0, index.w - fs * 0.3) : 0);
      return {
        w: body.w + lead + 4,
        asc: body.asc + 6,
        desc: body.desc + 2,
        draw: (c, x, b) => {
          const top = b - body.asc - 4;
          const bottom = b + body.desc;
          const sx = x + lead;
          c.line(
            [
              [sx - fs * 0.7, b - fs * 0.25],
              [sx - fs * 0.5, b - fs * 0.35],
              [sx - fs * 0.25, bottom],
              [sx, top],
              [sx + body.w + 4, top],
            ],
            { stroke: ink, strokeWidth: 1.5, roughness: 0.5 },
          );
          if (index) index.draw(c, sx - fs * 0.6 - index.w + fs * 0.3, b - fs * 0.45);
          body.draw(c, sx + 2, b);
        },
      };
    }
    case "fence": {
      const body = mbox(n.body, fs, ink);
      const h = body.asc + body.desc;
      const scale = Math.max(1, h / (fs * 1.05));
      const bw = fs * 0.35 * Math.min(scale, 1.6);
      /** @param {import("../../draw/canvas.mjs").Canvas} c @param {string} ch @param {number} x @param {number} b */
      const delim = (c, ch, x, b) => {
        if (!ch) return;
        const top = b - body.asc - 2;
        const bot = b + body.desc + 2;
        const mid = (top + bot) / 2;
        const st = { stroke: ink, strokeWidth: 1.5, roughness: 0.4 };
        if (ch === "(" || ch === ")") {
          const dir = ch === "(" ? 1 : -1;
          const ox = ch === "(" ? x + bw * 0.8 : x + bw * 0.2;
          c.line(
            [
              [ox, top],
              [ox - dir * bw * 0.6, mid],
              [ox, bot],
            ],
            { ...st, curved: true },
          );
        } else if (ch === "[" || ch === "]") {
          const ox = ch === "[" ? x + bw * 0.3 : x + bw * 0.7;
          const d = ch === "[" ? bw * 0.5 : -bw * 0.5;
          c.line(
            [
              [ox + d, top],
              [ox, top],
              [ox, bot],
              [ox + d, bot],
            ],
            st,
          );
        } else if (ch === "|")
          c.line(
            [
              [x + bw / 2, top],
              [x + bw / 2, bot],
            ],
            st,
          );
        else if (ch === "{" || ch === "}") {
          const dir = ch === "{" ? 1 : -1;
          const ox = x + bw / 2;
          c.line(
            [
              [ox + dir * bw * 0.4, top],
              [ox, top + 4],
              [ox, mid - 4],
              [ox - dir * bw * 0.4, mid],
              [ox, mid + 4],
              [ox, bot - 4],
              [ox + dir * bw * 0.4, bot],
            ],
            { ...st, curved: true },
          );
        } else c.text(ch, x, b - fs * 0.88, { size: fs, color: ink });
      };
      return {
        w: body.w + bw * 2 + 2,
        asc: body.asc + 2,
        desc: body.desc + 2,
        draw: (c, x, b) => {
          delim(c, n.open, x, b);
          body.draw(c, x + bw + 1, b);
          delim(c, n.close, x + bw + body.w + 1, b);
        },
      };
    }
    case "big": {
      const word = n.op.length > 1;
      const ofs = word ? fs : fs * 1.6;
      const opW = textWidth(n.op, ofs);
      const sup = n.sup ? mbox(n.sup, fs * 0.65, ink) : null;
      const sub = n.sub ? mbox(n.sub, fs * 0.65, ink) : null;
      if (SIDE_LIMIT_OPS.has(n.op)) return integralBox(n, fs, ink, ofs, opW, sup, sub);
      const w = Math.max(opW, sup?.w ?? 0, sub?.w ?? 0) + fs * 0.3;
      const asc = (word ? fs * 0.72 : ofs * 0.75) + (sup ? sup.asc + sup.desc + 2 : 0);
      const desc = (word ? fs * 0.24 : ofs * 0.25) + (sub ? sub.asc + sub.desc + 2 : 0);
      return {
        w,
        asc,
        desc,
        draw: (c, x, b) => {
          const cx = x + w / 2;
          c.text(n.op, cx, b - (word ? fs * 0.88 : ofs * 0.95), {
            size: ofs,
            color: ink,
            align: "center",
          });
          if (sup) sup.draw(c, cx - sup.w / 2, b - (word ? fs * 0.72 : ofs * 0.8) - sup.desc - 2);
          if (sub) sub.draw(c, cx - sub.w / 2, b + (word ? fs * 0.24 : ofs * 0.3) + sub.asc + 2);
        },
      };
    }
  }
}

/**
 * A sign at the start of a row or after another operator is unary and gets no
 * binary-operator spacing (`-\infty`, `e^{-x}`).
 * @param {MNode[]} items
 * @param {number} k
 * @returns {MNode}
 */
function unaryMinus(items, k) {
  const it = items[k];
  if (it.t !== "sym" || !it.op || (it.text !== "-" && it.text !== "+")) return it;
  const prev = items[k - 1];
  return !prev || (prev.t === "sym" && prev.op) ? { ...it, op: false } : it;
}

/**
 * Integral sign with its limits beside the glyph: the upper limit sits at the
 * top right, the lower one at the bottom, tucked slightly under the upper one.
 * The glyph is lowered so that it straddles the baseline like in TeX.
 * @param {Extract<MNode, { t: "big" }>} n
 * @param {number} fs
 * @param {string} ink
 * @param {number} ofs glyph font size
 * @param {number} opW glyph advance width
 * @param {MBox | null} sup
 * @param {MBox | null} sub
 * @returns {MBox}
 */
function integralBox(n, fs, ink, ofs, opW, sup, sub) {
  const top = ofs * 0.8;
  const bottom = ofs * 0.3;
  const supX = opW * 0.62;
  const subX = opW * 0.45;
  const w = Math.max(supX + (sup?.w ?? 0), subX + (sub?.w ?? 0)) + fs * 0.1;
  return {
    w,
    asc: top + (sup ? sup.asc * 0.4 : 0),
    desc: bottom + (sub ? sub.desc + sub.asc * 0.2 : 0),
    draw: (c, x, b) => {
      c.text(n.op, x, b - ofs * 0.95 + ofs * 0.3, { size: ofs, color: ink });
      if (sup) sup.draw(c, x + supX, b - top + sup.asc * 0.6);
      if (sub) sub.draw(c, x + subX, b + bottom + sub.asc * 0.3);
    },
  };
}

/**
 * @param {"ascii" | "latex"} syntax
 */
function mathModule(syntax) {
  return defineDiagram({
    kind: syntax === "latex" ? "latex" : "math",
    title: syntax === "latex" ? "LaTeX formula" : "AsciiMath formula",
    starts: [syntax === "latex" ? "latex" : "math"],
    raw: true,
    parse: (lines) => {
      const meta = createMeta();
      const reader = new LineReader(lines);
      /** @type {string[]} */
      const formulas = [];
      while (!reader.done) {
        const t = reader.next().text.trim();
        if (!t) continue;
        if (/^(title|caption|header|footer|legend)\b/i.test(t) && parseCommon(t, meta, reader))
          continue;
        formulas.push(t);
      }
      return {
        meta,
        formulas: formulas.map((f) => (syntax === "latex" ? parseLatex(f) : parseAsciiMath(f))),
      };
    },
    layout: (model, ctx) => ({
      boxes: model.formulas.map((/** @type {MNode} */ f) =>
        mbox(f, ctx.theme.fontSize * 1.6, ctx.theme.ink),
      ),
    }),
    draw: (laid, c) => {
      let y = 0;
      for (const b of laid.boxes) {
        b.draw(c, 0, y + b.asc);
        y += b.asc + b.desc + 24;
      }
    },
  });
}

export const asciiMathDiagram = mathModule("ascii");
export const latexDiagram = mathModule("latex");
