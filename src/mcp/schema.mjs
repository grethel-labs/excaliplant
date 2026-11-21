/**
 * A tiny JSON Schema checker for the subset used by the tool definitions:
 * `type`, `enum`, `minimum`/`maximum`, `minLength`/`maxLength`, `items`,
 * `properties`, `required` and `additionalProperties: false`. It validates
 * untrusted tool arguments before they reach the renderer.
 * @module mcp/schema
 */

import { isObject } from "./protocol.mjs";

/** Maximum number of problems reported for one value. */
const MAX_PROBLEMS = 8;

/**
 * @param {unknown} value
 * @returns {string}
 */
function typeOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
}

/**
 * @param {string} type
 * @param {unknown} value
 */
function matchesType(type, value) {
  const actual = typeOf(value);
  return actual === type || (type === "number" && actual === "integer");
}

/**
 * Check `value` against `schema` and return human-readable problems (empty
 * when valid).
 * @param {any} schema
 * @param {unknown} value
 * @param {string} [at] Name of the value in messages.
 * @param {string[]} [problems]
 * @returns {string[]}
 */
export function validate(schema, value, at = "arguments", problems = []) {
  if (problems.length >= MAX_PROBLEMS) return problems;
  const add = (/** @type {string} */ message) => {
    if (problems.length < MAX_PROBLEMS) problems.push(`${at}: ${message}`);
  };
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => matchesType(t, value))) {
      add(`expected ${types.join(" or ")}, got ${typeOf(value)}`);
      return problems;
    }
  }
  if (schema.enum && !schema.enum.includes(value)) {
    add(`must be one of ${schema.enum.map((v) => JSON.stringify(v)).join(", ")}`);
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) add(`must be >= ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) add(`must be <= ${schema.maximum}`);
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength)
      add(`must have at least ${schema.minLength} characters`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength)
      add(`must have at most ${schema.maxLength} characters`);
  }
  if (Array.isArray(value) && schema.items) {
    for (let i = 0; i < value.length && problems.length < MAX_PROBLEMS; i++) {
      validate(schema.items, value[i], `${at}[${i}]`, problems);
    }
  }
  if (isObject(value)) {
    const props = schema.properties ?? {};
    for (const key of schema.required ?? []) {
      if (!Object.hasOwn(value, key)) add(`missing required property "${key}"`);
    }
    for (const key of Object.keys(value)) {
      if (Object.hasOwn(props, key)) validate(props[key], value[key], `${at}.${key}`, problems);
      else if (schema.additionalProperties === false) {
        add(`unknown property "${key.length > 40 ? `${key.slice(0, 37)}...` : key}"`);
      }
    }
  }
  return problems;
}
