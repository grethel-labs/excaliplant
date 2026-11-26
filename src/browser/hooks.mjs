/**
 * Bind declarative hooks on an inline excaliplant SVG.
 * @module browser/hooks
 */

const PART = "g[data-excaliplant-hook][data-excaliplant-element-id]";
const VARIANT = "g[data-excaliplant-variant]";
const HOOK_NAME = /^(?:[A-Za-z_][A-Za-z0-9_-]{0,63}|@line:[0-9]{1,15}:[0-9]{1,15})$/;
const bindings = new WeakMap();

/** @typedef {"base" | "hover" | "click"} State */
/** @typedef {{ id: string | undefined, classes: string[], type: "hover" | "click", active: boolean, elementId: string, sourceElementId?: string, clickMode?: "button" }} HookEventDetail */
/** @typedef {{ id: string | undefined, classes: string[], hovered: boolean, selected: boolean, pressed: number, button: boolean, state: State, parts: Part[], representative: Part | null, parent: string | null, clickFromChildren: boolean }} Hook */
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
 * Toggle selection and button presses take visual precedence over hover.
 * A click forwarded to an enclosing hook includes the original primitive's
 * ID as `sourceElementId`.
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
  /** @type {Map<number | string, Hook[]>} */
  const presses = new Map();
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
      const parent = element.getAttribute("data-excaliplant-hook-parent");
      hook = {
        id: hookId,
        classes,
        hovered: false,
        selected: false,
        pressed: 0,
        button: element.getAttribute("data-excaliplant-click-mode") === "button",
        state: "base",
        parts: [],
        representative: null,
        parent: parent && HOOK_NAME.test(parent) && parent === parent.trim() ? parent : null,
        clickFromChildren: element.getAttribute("data-excaliplant-click-from-children") === "true",
      };
      hooks.set(name, hook);
    }
    const child = element.firstElementChild;
    const link = child?.localName === "a" && child.hasAttribute("href") ? child : null;
    const part = { hook, element, id, variants, link };
    parts.set(element, part);
    hook.parts.push(part);
  }

  const hasButtons = [...hooks.values()].some((hook) => hook.button);

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
    hook.representative = part;
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
      if (!hook.button) setControlAttribute(control, "aria-pressed", "false");
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

  /** @param {Hook} hook */
  function updateAppearance(hook) {
    show(hook, hook.selected || hook.pressed ? "click" : hook.hovered ? "hover" : "base");
  }

  /**
   * @param {Part} part
   * @param {HookEventDetail["type"]} type
   * @param {boolean} active
   * @param {string} [sourceElementId] Original primitive ID for a forwarded click.
   */
  function publish({ hook, element, id }, type, active, sourceElementId) {
    updateAppearance(hook);
    const control = hook.representative.link ?? hook.representative.element;
    if (type === "click" && !hook.button && control.getAttribute("role") === "button")
      control.setAttribute("aria-pressed", String(active));
    element.dispatchEvent(
      new view.CustomEvent("excaliplant:hook", {
        bubbles: true,
        detail: {
          id: hook.id,
          classes: [...hook.classes],
          type,
          active,
          elementId: id,
          ...(sourceElementId !== undefined ? { sourceElementId } : {}),
          ...(type === "click" && hook.button && { clickMode: "button" }),
        },
      }),
    );
  }

  /** @param {EventTarget | null} target */
  function findPart(target) {
    if (!(target instanceof view.Element) || target.closest("svg") !== svg) return;
    return parts.get(target.closest(PART));
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

  /** @param {Part} part @param {(recipient: Part, sourceElementId?: string) => void} visit */
  function visitClickRecipients(part, visit) {
    const wasConnected = svg.isConnected;
    visit(part);
    let parent = hooks.get(part.hook.parent);
    if (!parent) return;
    const visited = new Set([part.hook]);
    while (
      parent &&
      bindings.get(svg) === cleanup &&
      (!wasConnected || svg.isConnected) &&
      !visited.has(parent)
    ) {
      const representative = parent.representative;
      if (representative.element.closest("svg") !== svg) break;
      visited.add(parent);
      if (parent.clickFromChildren) visit(representative, part.id);
      parent = hooks.get(parent.parent);
    }
  }

  /** @param {Part} part */
  function activate(part) {
    visitClickRecipients(part, (recipient, sourceElementId) => {
      const { hook } = recipient;
      if (!hook.button) hook.selected = !hook.selected;
      publish(recipient, "click", hook.button || hook.selected, sourceElementId);
    });
  }

  /** @param {number | string} input @param {Part} part */
  function press(input, part) {
    if (presses.has(input)) return;
    /** @type {Hook[]} */
    const recipients = [];
    visitClickRecipients(part, ({ hook }) => {
      if (!hook.button) return;
      recipients.push(hook);
      hook.pressed++;
      updateAppearance(hook);
    });
    if (recipients.length) presses.set(input, recipients);
  }

  /** @param {number | string} input */
  function release(input) {
    const recipients = presses.get(input);
    if (!recipients) return;
    presses.delete(input);
    for (const hook of recipients) {
      hook.pressed--;
      updateAppearance(hook);
    }
  }

  /** @param {PointerEvent} event */
  function pointerdown(event) {
    if (event.button !== 0 || event.defaultPrevented) return;
    const part = findPart(event.target);
    if (part) press(event.pointerId, part);
  }

  /** @param {PointerEvent} event */
  function releasePointer(event) {
    release(event.pointerId);
  }

  function releaseAll() {
    for (const input of presses.keys()) release(input);
  }

  /** @param {FocusEvent} event */
  function focusout(event) {
    if (!controls.has(event.target)) return;
    release("Enter");
    release(" ");
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
    if (hasButtons && !event.repeat && (event.key === "Enter" || event.key === " "))
      press(event.key, part);
    if (event.key === " ") event.preventDefault();
    if (event.key === "Enter") {
      if (event.repeat || !part.link) event.preventDefault();
      if (!event.repeat && !part.link) activate(part);
    }
  }

  /** @param {KeyboardEvent} event */
  function keyup(event) {
    const part = controls.get(event.target);
    const wasPressed = presses.has(event.key);
    release(event.key);
    if (!part || event.defaultPrevented || event.key !== " ") return;
    event.preventDefault();
    if (part.hook.button && !wasPressed) return;
    if (part.link)
      part.link.dispatchEvent(new view.MouseEvent("click", { bubbles: true, cancelable: true }));
    else activate(part);
  }

  svg.addEventListener("pointerover", hover);
  svg.addEventListener("pointerout", hover);
  svg.addEventListener("click", click);
  svg.addEventListener("keydown", keydown);
  svg.addEventListener("keyup", keyup);
  if (hasButtons) {
    svg.addEventListener("pointerdown", pointerdown);
    svg.addEventListener("focusout", focusout);
    view.addEventListener("pointerup", releasePointer, true);
    view.addEventListener("pointercancel", releasePointer, true);
    view.addEventListener("blur", releaseAll);
  }

  function cleanup() {
    if (bindings.get(svg) !== cleanup) return;
    bindings.delete(svg);
    svg.removeEventListener("pointerover", hover);
    svg.removeEventListener("pointerout", hover);
    svg.removeEventListener("click", click);
    svg.removeEventListener("keydown", keydown);
    svg.removeEventListener("keyup", keyup);
    if (hasButtons) {
      svg.removeEventListener("pointerdown", pointerdown);
      svg.removeEventListener("focusout", focusout);
      view.removeEventListener("pointerup", releasePointer, true);
      view.removeEventListener("pointercancel", releasePointer, true);
      view.removeEventListener("blur", releaseAll);
      presses.clear();
    }
    for (const hook of hooks.values()) show(hook, "base");
    for (const reset of restore) reset();
  }

  bindings.set(svg, cleanup);
  return cleanup;
}
