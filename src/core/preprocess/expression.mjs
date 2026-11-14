/**
 * Safe expression parser and evaluator for the PlantUML preprocessor.
 *
 * Supports numbers, single/double quoted strings, `$variables`, builtin
 * `%functions()`, user functions, JSON-style array/object literals, member
 * access (`$a.b`, `$a[0]`), arithmetic, comparison and boolean operators.
 * No JavaScript is ever evaluated.
 * @module core/preprocess/expression
 */

import { ParseError } from "../errors.mjs";

/**
 * Preprocessor value. JSON objects use null-prototype records.
 * @typedef {string | number | boolean | null | PValue[] | { [key: string]: PValue }} PValue
 */

/**
 * @typedef {object} EvalContext
 * @property {(name: string) => PValue | undefined} lookup Resolve a `$variable`.
 * @property {(name: string, args: PValue[], named: Map<string, PValue>) => PValue} call Call a function.
 */

/** @typedef {{ t: string, v: string }} Token */

const TWO_CHAR_OPS = new Set(["==", "!=", "<=", ">=", "&&", "||"]);
const ONE_CHAR_OPS = new Set(["+", "-", "*", "/", "%", "<", ">", "!", "(", ")", "[", "]", "{", "}", ",", ":", ".", "="]);

/**
 * @param {string} src
 * @returns {Token[]}
 */
export function tokenize(src) {
  /** @type {Token[]} */
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t") {
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) j++;
      tokens.push({ t: "str", v: src.slice(i + 1, j) });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      tokens.push({ t: "num", v: src.slice(i, j) });
      i = j;
      continue;
    }
    if (c === "$" || c === "%" || /[A-Za-z_]/.test(c)) {
      if (c === "%" && !/[A-Za-z_]/.test(src[i + 1] ?? "")) {
        tokens.push({ t: "op", v: "%" });
        i++;
        continue;
      }
      let j = i + 1;
      while (j < src.length && /[\w]/.test(src[j])) j++;
      const word = src.slice(i, j);
      tokens.push({ t: c === "$" ? "var" : c === "%" ? "builtin" : "ident", v: word });
      i = j;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (TWO_CHAR_OPS.has(two)) {
      tokens.push({ t: "op", v: two });
      i += 2;
      continue;
    }
    if (ONE_CHAR_OPS.has(c)) {
      tokens.push({ t: "op", v: c });
      i++;
      continue;
    }
    // Unknown characters become part of a bare word so loose PlantUML
    // arguments such as `#red` or `a-b` still evaluate to strings.
    let j = i + 1;
    while (j < src.length && !/[\s,()]/.test(src[j])) j++;
    tokens.push({ t: "ident", v: src.slice(i, j) });
    i = j;
  }
  return tokens;
}

/**
 * @typedef {(
 *  | { k: "lit", v: PValue }
 *  | { k: "var", name: string }
 *  | { k: "call", name: string, args: Node[], named: [string, Node][] }
 *  | { k: "un", op: string, a: Node }
 *  | { k: "bin", op: string, a: Node, b: Node }
 *  | { k: "member", a: Node, key: Node }
 *  | { k: "arr", items: Node[] }
 *  | { k: "obj", entries: [Node, Node][] }
 * )} Node
 */

class Parser {
  /** @param {Token[]} tokens */
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }
  peek() {
    return this.tokens[this.pos];
  }
  next() {
    return this.tokens[this.pos++];
  }
  /** @param {string} v */
  isOp(v) {
    const t = this.peek();
    return t !== undefined && t.t === "op" && t.v === v;
  }
  /** @param {string} v */
  expect(v) {
    if (!this.isOp(v)) throw new ParseError(`Expected '${v}' in expression`);
    this.pos++;
  }
  /** @returns {Node} */
  parse() {
    const node = this.or();
    if (this.pos < this.tokens.length) throw new ParseError(`Unexpected '${this.peek().v}' in expression`);
    return node;
  }
  /** @returns {Node} */
  or() {
    let a = this.and();
    while (this.isOp("||")) {
      this.pos++;
      a = { k: "bin", op: "||", a, b: this.and() };
    }
    return a;
  }
  /** @returns {Node} */
  and() {
    let a = this.cmp();
    while (this.isOp("&&")) {
      this.pos++;
      a = { k: "bin", op: "&&", a, b: this.cmp() };
    }
    return a;
  }
  /** @returns {Node} */
  cmp() {
    let a = this.add();
    for (;;) {
      const t = this.peek();
      if (t?.t === "op" && ["==", "!=", "<", "<=", ">", ">=", "="].includes(t.v)) {
        this.pos++;
        a = { k: "bin", op: t.v === "=" ? "==" : t.v, a, b: this.add() };
      } else return a;
    }
  }
  /** @returns {Node} */
  add() {
    let a = this.mul();
    for (;;) {
      const t = this.peek();
      if (t?.t === "op" && (t.v === "+" || t.v === "-")) {
        this.pos++;
        a = { k: "bin", op: t.v, a, b: this.mul() };
      } else return a;
    }
  }
  /** @returns {Node} */
  mul() {
    let a = this.unary();
    for (;;) {
      const t = this.peek();
      if (t?.t === "op" && (t.v === "*" || t.v === "/" || t.v === "%")) {
        this.pos++;
        a = { k: "bin", op: t.v, a, b: this.unary() };
      } else return a;
    }
  }
  /** @returns {Node} */
  unary() {
    if (this.isOp("!") || this.isOp("-")) {
      const op = this.next().v;
      return { k: "un", op, a: this.unary() };
    }
    return this.postfix();
  }
  /** @returns {Node} */
  postfix() {
    let a = this.primary();
    for (;;) {
      if (this.isOp(".")) {
        this.pos++;
        const t = this.next();
        if (!t) throw new ParseError("Expected member name");
        a = { k: "member", a, key: { k: "lit", v: t.v } };
      } else if (this.isOp("[")) {
        this.pos++;
        const key = this.or();
        this.expect("]");
        a = { k: "member", a, key };
      } else return a;
    }
  }
  /** @returns {Node} */
  primary() {
    const t = this.next();
    if (!t) throw new ParseError("Unexpected end of expression");
    if (t.t === "num") return { k: "lit", v: Number(t.v) };
    if (t.t === "str") return { k: "lit", v: t.v };
    if (t.t === "var" || t.t === "builtin" || t.t === "ident") {
      if (this.isOp("(")) return this.call(t.v);
      if (t.t === "var") return { k: "var", name: t.v };
      if (t.t === "ident" && (t.v === "true" || t.v === "false")) return { k: "lit", v: t.v === "true" };
      return { k: "lit", v: t.v };
    }
    if (t.v === "(") {
      const e = this.or();
      this.expect(")");
      return e;
    }
    if (t.v === "[") {
      /** @type {Node[]} */
      const items = [];
      while (!this.isOp("]")) {
        items.push(this.or());
        if (!this.isOp(",")) break;
        this.pos++;
      }
      this.expect("]");
      return { k: "arr", items };
    }
    if (t.v === "{") {
      /** @type {[Node, Node][]} */
      const entries = [];
      while (!this.isOp("}")) {
        const key = this.or();
        this.expect(":");
        entries.push([key, this.or()]);
        if (!this.isOp(",")) break;
        this.pos++;
      }
      this.expect("}");
      return { k: "obj", entries };
    }
    throw new ParseError(`Unexpected '${t.v}' in expression`);
  }
  /** @param {string} name @returns {Node} */
  call(name) {
    this.expect("(");
    /** @type {Node[]} */
    const args = [];
    /** @type {[string, Node][]} */
    const named = [];
    while (!this.isOp(")")) {
      const t = this.peek();
      const after = this.tokens[this.pos + 1];
      if (t?.t === "var" && after?.t === "op" && after.v === "=") {
        this.pos += 2;
        named.push([t.v, this.or()]);
      } else args.push(this.or());
      if (!this.isOp(",")) break;
      this.pos++;
    }
    this.expect(")");
    return { k: "call", name, args, named };
  }
}

/**
 * Parse an expression into an AST.
 * @param {string} src
 * @returns {Node}
 */
export function parseExpression(src) {
  return new Parser(tokenize(src)).parse();
}

/**
 * Truthiness used by `!if` and boolean operators.
 * @param {PValue} v
 * @returns {boolean}
 */
export function truthy(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v !== "" && v !== "0" && v.toLowerCase() !== "false";
  return true;
}

/**
 * Convert a value to its textual representation.
 * @param {PValue} v
 * @returns {string}
 */
export function stringify(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

/** @param {PValue} v */
function numeric(v) {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v);
  return null;
}

/**
 * Evaluate an AST.
 * @param {Node} node
 * @param {EvalContext} ctx
 * @returns {PValue}
 */
export function evaluate(node, ctx) {
  switch (node.k) {
    case "lit":
      return node.v;
    case "var": {
      const v = ctx.lookup(node.name);
      return v === undefined ? node.name : v;
    }
    case "call": {
      const named = new Map(node.named.map(([k, v]) => [k, evaluate(v, ctx)]));
      return ctx.call(
        node.name,
        node.args.map((a) => evaluate(a, ctx)),
        named,
      );
    }
    case "un": {
      const a = evaluate(node.a, ctx);
      if (node.op === "!") return !truthy(a);
      return -(numeric(a) ?? 0);
    }
    case "member": {
      const target = evaluate(node.a, ctx);
      const key = evaluate(node.key, ctx);
      if (Array.isArray(target)) return target[Number(key)] ?? null;
      if (target && typeof target === "object") {
        const k = stringify(key);
        return Object.prototype.hasOwnProperty.call(target, k) ? target[k] : null;
      }
      return null;
    }
    case "arr":
      return node.items.map((i) => evaluate(i, ctx));
    case "obj": {
      /** @type {{ [key: string]: PValue }} */
      const o = Object.create(null);
      for (const [k, v] of node.entries) o[stringify(evaluate(k, ctx))] = evaluate(v, ctx);
      return o;
    }
    case "bin":
      return binary(node.op, node.a, node.b, ctx);
  }
}

/**
 * @param {string} op
 * @param {Node} an
 * @param {Node} bn
 * @param {EvalContext} ctx
 * @returns {PValue}
 */
function binary(op, an, bn, ctx) {
  if (op === "&&") return truthy(evaluate(an, ctx)) && truthy(evaluate(bn, ctx));
  if (op === "||") return truthy(evaluate(an, ctx)) || truthy(evaluate(bn, ctx));
  const a = evaluate(an, ctx);
  const b = evaluate(bn, ctx);
  const na = numeric(a);
  const nb = numeric(b);
  const bothNum = na !== null && nb !== null && typeof a !== "string" && typeof b !== "string";
  switch (op) {
    case "+":
      return bothNum ? na + nb : stringify(a) + stringify(b);
    case "-":
      return (na ?? 0) - (nb ?? 0);
    case "*":
      return (na ?? 0) * (nb ?? 0);
    case "/":
      return nb ? Math.trunc((na ?? 0) / nb) : 0;
    case "%":
      return nb ? (na ?? 0) % nb : 0;
    case "==":
      return na !== null && nb !== null ? na === nb : stringify(a) === stringify(b);
    case "!=":
      return na !== null && nb !== null ? na !== nb : stringify(a) !== stringify(b);
    default: {
      const cmp = na !== null && nb !== null ? na - nb : stringify(a).localeCompare(stringify(b));
      if (op === "<") return cmp < 0;
      if (op === "<=") return cmp <= 0;
      if (op === ">") return cmp > 0;
      return cmp >= 0;
    }
  }
}
