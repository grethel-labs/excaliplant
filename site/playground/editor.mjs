// A lightweight code editor: a plain <textarea> (native selection, IME,
// undo, mobile keyboards) over a highlight layer, plus a line-number gutter.
// Keyboard: Tab/Shift+Tab indent, Enter keeps the indent, Ctrl/Cmd+/ toggles
// `'` comments, Esc then Tab leaves the field.

import { tokenize } from "./highlight.mjs";
import { frameThrottle, h } from "./dom.mjs";

/** Beyond this size highlighting is skipped to keep typing instant. */
const HIGHLIGHT_LIMIT = 60_000;
const INDENT = "  ";

/**
 * @typedef {object} EditorOptions
 * @property {(value: string) => void} onChange
 * @property {() => void} onRun Ctrl/Cmd+Enter.
 * @property {string} label Accessible name of the text field.
 */

/**
 * @param {HTMLElement} mount
 * @param {EditorOptions} options
 */
export function createEditor(mount, options) {
  const gutterInner = h("div", { class: "gutter-inner" });
  const gutter = h("div", { class: "gutter", "aria-hidden": "true" }, [gutterInner]);
  const code = h("code");
  const layer = h("pre", { class: "hl", "aria-hidden": "true" }, [code]);
  const area = h("textarea", {
    class: "input",
    spellcheck: "false",
    autocapitalize: "off",
    autocomplete: "off",
    autocorrect: "off",
    wrap: "off",
    "aria-label": options.label,
  });
  mount.classList.add("editor");
  mount.append(gutter, h("div", { class: "code" }, [layer, area]));

  let lineCount = 0;
  /** @type {Map<number, "error" | "warning" | "info">} */
  let marks = new Map();
  let tabEscapes = false;

  function paintLines() {
    const n = area.value.split("\n").length;
    if (n !== lineCount) {
      lineCount = n;
      let text = "";
      for (let i = 1; i <= n; i++) text += `${i}\n`;
      gutterInner.firstChild?.remove();
      gutterInner.prepend(document.createTextNode(text));
    }
  }

  function paintMarks() {
    for (const el of [...gutterInner.querySelectorAll(".mark")]) el.remove();
    for (const [line, severity] of marks) {
      if (line < 1 || line > lineCount) continue;
      const m = h("span", { class: `mark ${severity}` });
      m.style.setProperty("top", `calc(${line - 1} * var(--lh))`);
      gutterInner.append(m);
    }
  }

  function paintHighlight() {
    const value = area.value;
    if (value.length > HIGHLIGHT_LIMIT) {
      code.replaceChildren(document.createTextNode(`${value}\n`));
      return;
    }
    const frag = document.createDocumentFragment();
    const lines = tokenize(value);
    lines.forEach((tokens, i) => {
      for (const t of tokens) {
        if (t.cls) frag.append(h("span", { class: `t-${t.cls}` }, [t.text]));
        else frag.append(document.createTextNode(t.text));
      }
      frag.append(document.createTextNode(i < lines.length - 1 ? "\n" : "\n "));
    });
    code.replaceChildren(frag);
  }

  const repaint = frameThrottle(() => {
    paintLines();
    paintHighlight();
    paintMarks();
    syncScroll();
  });

  function syncScroll() {
    const x = -area.scrollLeft;
    const y = -area.scrollTop;
    code.style.setProperty("transform", `translate(${x}px, ${y}px)`);
    gutterInner.style.setProperty("transform", `translateY(${y}px)`);
  }

  /**
   * Replace a range through the browser's edit command so undo keeps working.
   * @param {number} from
   * @param {number} to
   * @param {string} text
   */
  function replace(from, to, text) {
    area.focus();
    area.setSelectionRange(from, to);
    let ok = false;
    try {
      ok = document.execCommand("insertText", false, text);
    } catch {
      ok = false;
    }
    if (!ok) {
      area.setRangeText(text, from, to, "end");
      area.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  /** @returns {{ start: number, end: number }} Character range covering the selected lines. */
  function lineRange() {
    const v = area.value;
    const start = v.lastIndexOf("\n", area.selectionStart - 1) + 1;
    let end = v.indexOf(
      "\n",
      area.selectionEnd > area.selectionStart ? area.selectionEnd - 1 : area.selectionEnd,
    );
    if (end < 0) end = v.length;
    return { start, end };
  }

  /** @param {boolean} outdent */
  function indentLines(outdent) {
    const { selectionStart: s, selectionEnd: e, value } = area;
    if (!outdent && s === e) {
      replace(s, e, INDENT);
      return;
    }
    const { start, end } = lineRange();
    const block = value.slice(start, end);
    const lines = block.split("\n");
    const out = lines.map((l) => {
      if (!outdent) return l === "" ? l : INDENT + l;
      return l.startsWith(INDENT) ? l.slice(INDENT.length) : l.replace(/^ ?/, "");
    });
    const text = out.join("\n");
    replace(start, end, text);
    const delta0 = out[0].length - lines[0].length;
    area.setSelectionRange(Math.max(start, s + delta0), e + (text.length - block.length));
  }

  function toggleComment() {
    const { selectionStart: s, selectionEnd: e, value } = area;
    const { start, end } = lineRange();
    const lines = value.slice(start, end).split("\n");
    const all = lines.every((l) => l.trim() === "" || /^\s*'/.test(l));
    const out = lines.map((l) =>
      l.trim() === "" ? l : all ? l.replace(/^(\s*)' ?/, "$1") : l.replace(/^(\s*)/, "$1' "),
    );
    const text = out.join("\n");
    replace(start, end, text);
    area.setSelectionRange(s, e + (text.length - (end - start)));
  }

  area.addEventListener("input", () => {
    repaint();
    options.onChange(area.value);
  });
  area.addEventListener("scroll", syncScroll, { passive: true });
  area.addEventListener("blur", () => (tabEscapes = false));
  area.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === "Tab" && !mod && !e.altKey) {
      if (tabEscapes) return;
      e.preventDefault();
      indentLines(e.shiftKey);
    } else if (e.key === "Escape") {
      tabEscapes = true;
    } else if (e.key === "Enter" && mod) {
      e.preventDefault();
      options.onRun();
    } else if (
      e.key === "Enter" &&
      !e.shiftKey &&
      !e.altKey &&
      !mod &&
      area.selectionStart === area.selectionEnd
    ) {
      const v = area.value;
      const from = area.selectionStart;
      const lineStart = v.lastIndexOf("\n", from - 1) + 1;
      const indent = /^[ \t]*/.exec(v.slice(lineStart, from))?.[0] ?? "";
      if (indent) {
        e.preventDefault();
        replace(from, from, `\n${indent}`);
      }
    } else if (mod && e.key === "/") {
      e.preventDefault();
      toggleComment();
    }
    if (e.key !== "Escape" && e.key !== "Shift") tabEscapes = false;
  });

  return {
    /** @returns {string} */
    getValue: () => area.value,
    /** @param {string} value */
    setValue(value) {
      area.value = value;
      area.scrollTop = 0;
      area.scrollLeft = 0;
      repaint();
    },
    focus: () => area.focus(),
    /**
     * Select a 1-based line and scroll it into view.
     * @param {number} line
     */
    goToLine(line) {
      const lines = area.value.split("\n");
      const n = Math.min(Math.max(1, line), lines.length);
      let start = 0;
      for (let i = 0; i < n - 1; i++) start += lines[i].length + 1;
      area.focus();
      area.setSelectionRange(start, start + lines[n - 1].length);
      const lh = Number.parseFloat(getComputedStyle(area).lineHeight) || 20;
      const top = (n - 1) * lh;
      if (top < area.scrollTop || top > area.scrollTop + area.clientHeight - 2 * lh) {
        area.scrollTop = Math.max(0, top - area.clientHeight / 3);
      }
    },
    /**
     * Mark lines in the gutter.
     * @param {Map<number, "error" | "warning" | "info">} next
     */
    setMarks(next) {
      marks = next;
      repaint();
    },
    textarea: area,
  };
}
