// Tiny DOM helpers. Text always goes through `textContent`, never through
// `innerHTML`.

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {Record<string, string | boolean | null | undefined> & { class?: string }} [attrs]
 * @param {(Node | string)[]} [children]
 * @returns {HTMLElementTagNameMap[K]}
 */
export function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v === null || v === undefined) continue;
    el.setAttribute(k === "class" ? "class" : k, v === true ? "" : v);
  }
  for (const c of children) el.append(c);
  return el;
}

/**
 * @template {HTMLElement} T
 * @param {string} id
 * @returns {T}
 */
export function byId(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return /** @type {T} */ (el);
}

/**
 * Run `fn` at most once per animation frame.
 * @param {() => void} fn
 */
export function frameThrottle(fn) {
  let queued = false;
  return () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      fn();
    });
  };
}
