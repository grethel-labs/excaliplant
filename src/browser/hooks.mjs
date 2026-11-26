/**
 * Bind declarative hooks on an inline excaliplant SVG.
 * @module browser/hooks
 */

const PART = "g[data-excaliplant-hook][data-excaliplant-element-id]";
const VARIANT = "g[data-excaliplant-variant]";
const bindings = new WeakMap();

/** @typedef {"base" | "hover" | "click"} State */
/** @typedef {{ id: string | undefined, classes: string[], type: "hover" | "click", active: boolean, elementId: string }} HookEventDetail */
/** @typedef {{ id: string | undefined, classes: string[], hovered: boolean, selected: boolean, state: State, parts: Part[], control: Element | null }} Hook */
/** @typedef {{ hook: Hook, element: Element, id: string, variants: Map<string, Element>, link: Element | null }} Part */

/** @param {SVGSVGElement} svg */
function svgView(svg) {
  const view = svg?.ownerDocument.defaultView;
  if (svg?.localName !== "svg" || svg.namespaceURI !== "http://www.w3.org/2000/svg" || !view) {
    throw new TypeError("Expected an inline SVG element");
  }
  return view;
}

/**
 * Subscribe to an author hook ID (`#id`) or class (`.class`) on a bound SVG.
 * @param {SVGSVGElement} svg
 * @param {string} selector A single ID or class selector.
 * @param {(event: CustomEvent<HookEventDetail>) => void} listener
 * @returns {() => void} Remove this subscription.
 * @public
 */
export function onHook(svg, selector, listener) {
  const view = svgView(svg);
  if (
    typeof selector !== "string" ||
    !/^[#.][A-Za-z_][A-Za-z0-9_-]{0,63}$/.test(selector) ||
    selector !== selector.trim()
  ) {
    throw new TypeError("Expected a single hook ID or class selector");
  }
  if (typeof listener !== "function") throw new TypeError("Expected a hook event listener");
  const token = selector.slice(1);
  /** @param {CustomEvent<HookEventDetail>} event */
  function notify(event) {
    if (!(event.target instanceof view.Element) || event.target.closest("svg") !== svg) return;
    const { detail } = event;
    if (selector[0] === "#") {
      if (detail?.id === token) listener(event);
    } else if (Array.isArray(detail?.classes) && detail.classes.includes(token)) listener(event);
  }
  svg.addEventListener("excaliplant:hook", notify);
  return () => svg.removeEventListener("excaliplant:hook", notify);
}

/**
 * Enable pointer and keyboard hooks on an inline SVG rendered with
 * `{ interactive: true }`. Each interaction dispatches a bubbling
 * `excaliplant:hook` CustomEvent with a {@link HookEventDetail} payload.
 * Selection takes precedence over hover until toggled off.
 *
 * @param {SVGSVGElement} svg
 * @returns {() => void} Remove the listeners and restore the default visuals.
 * @public
 */
export function bindHooks(svg) {
  const view = svgView(svg);
  const existing = bindings.get(svg);
  if (existing) return existing;

  /** @type {Map<string, Hook>} */
  const hooks = new Map();
  /** @type {Map<Element, Part>} */
  const parts = new Map();
  /** @type {Map<EventTarget, Part>} */
  const controls = new Map();
  /** @type {(() => void)[]} */
  const restore = [];

  for (const element of svg.querySelectorAll(PART)) {
    if (element.closest("svg") !== svg) continue;
    const name = element.getAttribute("data-excaliplant-hook");
    const id = element.getAttribute("data-excaliplant-element-id");
    const variants = new Map(
      Array.from(element.querySelectorAll(VARIANT), (variant) => [
        variant.getAttribute("data-excaliplant-variant"),
        variant,
      ]),
    );
    if (!name || !id || !variants.has("base")) continue;
    let hook = hooks.get(name);
    if (!hook) {
      const hookId = element.getAttribute("data-excaliplant-hook-id") ?? undefined;
      const classes = element.getAttribute("data-excaliplant-hook-classes")?.split(" ") ?? [];
      hook = {
        id: hookId,
        classes,
        hovered: false,
        selected: false,
        state: "base",
        parts: [],
        control: null,
      };
      hooks.set(name, hook);
    }
    const child = element.firstElementChild;
    const link = child?.localName === "a" && child.hasAttribute("href") ? child : null;
    const part = { hook, element, id, variants, link };
    parts.set(element, part);
    hook.parts.push(part);
  }

  /** @param {Element} el @param {string} key @param {string} value */
  function setControlAttribute(el, key, value) {
    const previous = el.getAttribute(key);
    el.setAttribute(key, value);
    restore.push(() => {
      if (previous === null) el.removeAttribute(key);
      else el.setAttribute(key, previous);
    });
  }

  for (const hook of hooks.values()) {
    const part = hook.parts.find((p) => p.link) ?? hook.parts[0];
    const control = part.link ?? part.element;
    hook.control = control;
    controls.set(control, part);
    setControlAttribute(control, "tabindex", "0");
    let label = "";
    for (const sibling of hook.parts) {
      label = sibling.variants.get("base").textContent.trim();
      if (label) break;
    }
    setControlAttribute(control, "aria-label", label || hook.id || hook.classes.join(" "));
    if (!part.link) {
      setControlAttribute(control, "role", "button");
      setControlAttribute(control, "aria-pressed", "false");
    }
    for (const sibling of hook.parts) {
      if (sibling.link && sibling !== part) setControlAttribute(sibling.link, "tabindex", "-1");
    }
  }

  /** @param {Hook} hook @param {State} state */
  function show(hook, state) {
    if (state === hook.state) return;
    for (const { variants } of hook.parts) {
      const base = variants.get("base");
      const current = variants.get(hook.state) ?? base;
      const next = variants.get(state) ?? base;
      if (current === next) continue;
      current.setAttribute("display", "none");
      next.removeAttribute("display");
    }
    hook.state = state;
  }

  /** @param {Part} part @param {HookEventDetail["type"]} type @param {boolean} active */
  function publish({ hook, element, id }, type, active) {
    show(hook, hook.selected ? "click" : hook.hovered ? "hover" : "base");
    if (type === "click" && hook.control?.getAttribute("role") === "button")
      hook.control.setAttribute("aria-pressed", String(active));
    element.dispatchEvent(
      new view.CustomEvent("excaliplant:hook", {
        bubbles: true,
        detail: { id: hook.id, classes: [...hook.classes], type, active, elementId: id },
      }),
    );
  }

  /** @param {EventTarget | null} target */
  function findPart(target) {
    const element = target instanceof view.Element ? target.closest(PART) : null;
    return parts.get(element);
  }

  /** @param {PointerEvent} event */
  function hover(event) {
    if (event.pointerType === "touch") return;
    const part = findPart(event.target);
    if (!part || findPart(event.relatedTarget)?.hook === part.hook) return;
    const active = event.type === "pointerover";
    if (part.hook.hovered === active) return;
    part.hook.hovered = active;
    publish(part, "hover", active);
  }

  /** @param {Part} part */
  function activate(part) {
    part.hook.selected = !part.hook.selected;
    publish(part, "click", part.hook.selected);
  }

  /** @param {MouseEvent} event */
  function click(event) {
    const part = findPart(event.target);
    if (part) activate(part);
  }

  /** @param {KeyboardEvent} event */
  function keydown(event) {
    const part = controls.get(event.target);
    if (!part || event.defaultPrevented) return;
    if (event.key === " ") event.preventDefault();
    if (event.key === "Enter") {
      if (event.repeat || !part.link) event.preventDefault();
      if (!event.repeat && !part.link) activate(part);
    }
  }

  /** @param {KeyboardEvent} event */
  function keyup(event) {
    const part = controls.get(event.target);
    if (!part || event.defaultPrevented || event.key !== " ") return;
    event.preventDefault();
    if (part.link)
      part.link.dispatchEvent(new view.MouseEvent("click", { bubbles: true, cancelable: true }));
    else activate(part);
  }

  svg.addEventListener("pointerover", hover);
  svg.addEventListener("pointerout", hover);
  svg.addEventListener("click", click);
  svg.addEventListener("keydown", keydown);
  svg.addEventListener("keyup", keyup);

  function cleanup() {
    if (bindings.get(svg) !== cleanup) return;
    bindings.delete(svg);
    svg.removeEventListener("pointerover", hover);
    svg.removeEventListener("pointerout", hover);
    svg.removeEventListener("click", click);
    svg.removeEventListener("keydown", keydown);
    svg.removeEventListener("keyup", keyup);
    for (const hook of hooks.values()) show(hook, "base");
    for (const reset of restore) reset();
  }

  bindings.set(svg, cleanup);
  return cleanup;
}
