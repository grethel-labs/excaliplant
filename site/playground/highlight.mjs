// A small PlantUML tokenizer for the editor's highlight layer. It is a
// scanner, not a parser: it only has to be fast, linear and forgiving.

/**
 * @typedef {"kw" | "str" | "com" | "arrow" | "dir" | "col" | "ster"} TokenClass
 * @typedef {{ text: string, cls: TokenClass | null }} Token
 */

const KEYWORDS = new Set(
  (
    "participant actor boundary control entity database collections queue class interface abstract " +
    "enum annotation struct protocol package namespace node component rectangle usecase state object " +
    "artifact cloud folder frame card file storage agent person system container map json yaml " +
    "note end legend title header footer caption skinparam hide show remove restore left right top bottom " +
    "over of as is on link autonumber activate deactivate destroy create return ref newpage " +
    "alt else opt loop par break critical group box " +
    "if then elseif endif while endwhile repeat backward fork again split merge kill detach " +
    "start stop partition swimlane rotate allowmixing scale together sprite " +
    "robust concise clock binary analog task project milestone happens starts ends " +
    "class_diagram theme style"
  ).split(" "),
);

/** Matches an arrow or line starting at the sticky position. */
const ARROW =
  /(?:<\||[<*+#}o]|x(?=[-.=]))?(?:[-.=]+(?:\[[^\]\n]{0,60}\][-.=]*)?|\[[^\]\n]{1,60}\][-.=]+)(?:\|>|[>*+#{o]|x(?![\w]))?/y;
const WORD = /[A-Za-z_][A-Za-z0-9_]*/y;
const COLOR = /#(?:[0-9A-Fa-f]{3,8}\b|[A-Za-z]{3,20}\b)/y;
const STEREO = /<<[^>\n]{0,60}>>/y;

/**
 * Tokenize one line.
 * @param {string} line
 * @param {boolean} inBlock Whether the line starts inside a `/' … '/` comment.
 * @returns {{ tokens: Token[], inBlock: boolean }}
 */
export function tokenizeLine(line, inBlock) {
  /** @type {Token[]} */
  const tokens = [];
  let plain = "";
  const flush = () => {
    if (plain) tokens.push({ text: plain, cls: null });
    plain = "";
  };
  /** @param {string} text @param {TokenClass} cls */
  const push = (text, cls) => {
    flush();
    tokens.push({ text, cls });
  };
  let i = 0;
  const n = line.length;
  if (inBlock) {
    const end = line.indexOf("'/");
    if (end < 0) return { tokens: [{ text: line, cls: "com" }], inBlock: true };
    push(line.slice(0, end + 2), "com");
    i = end + 2;
    inBlock = false;
  }
  const lead = /^\s*/.exec(line.slice(i))?.[0].length ?? 0;
  const first = i + lead;
  if (line[first] === "'") {
    if (lead) push(line.slice(i, first), /** @type {any} */ (null));
    push(line.slice(first), "com");
    return { tokens, inBlock };
  }
  if (line[first] === "@" || line[first] === "!") {
    const m = /^[@!][A-Za-z_]+/.exec(line.slice(first));
    if (m) {
      if (lead) plain += line.slice(i, first);
      push(m[0], "dir");
      i = first + m[0].length;
    }
  }
  while (i < n) {
    const c = line[i];
    if (c === "'") {
      push(line.slice(i), "com");
      i = n;
    } else if (c === "/" && line[i + 1] === "'") {
      const end = line.indexOf("'/", i + 2);
      if (end < 0) {
        push(line.slice(i), "com");
        inBlock = true;
        i = n;
      } else {
        push(line.slice(i, end + 2), "com");
        i = end + 2;
      }
    } else if (c === '"') {
      const end = line.indexOf('"', i + 1);
      const stop = end < 0 ? n : end + 1;
      push(line.slice(i, stop), "str");
      i = stop;
    } else if (/[A-Za-z_]/.test(c)) {
      WORD.lastIndex = i;
      const word = /** @type {RegExpExecArray} */ (WORD.exec(line))[0];
      const prev = i > 0 ? line[i - 1] : " ";
      // `o--` and `x--` are arrow heads; a letter after another word char is not.
      if ((word === "o" || word === "x") && /[-.=]/.test(line[i + 1] ?? "") && !/\w/.test(prev)) {
        ARROW.lastIndex = i;
        const m = ARROW.exec(line);
        if (m && m[0].length > 1) {
          push(m[0], "arrow");
          i += m[0].length;
          continue;
        }
      }
      if (KEYWORDS.has(word.toLowerCase())) push(word, "kw");
      else plain += word;
      i += word.length;
    } else if (
      c === "#" ||
      c === "<" ||
      c === "-" ||
      c === "." ||
      c === "=" ||
      c === "[" ||
      c === "*" ||
      c === "+" ||
      c === "}"
    ) {
      let m = null;
      if (c === "#") {
        COLOR.lastIndex = i;
        m = COLOR.exec(line);
        if (m) {
          push(m[0], "col");
          i += m[0].length;
          continue;
        }
      }
      if (c === "<" && line[i + 1] === "<") {
        STEREO.lastIndex = i;
        m = STEREO.exec(line);
        if (m) {
          push(m[0], "ster");
          i += m[0].length;
          continue;
        }
      }
      ARROW.lastIndex = i;
      m = ARROW.exec(line);
      // Single dashes and dots in prose are not arrows.
      if (m && m[0].length >= 2 && /[-.=]{2}|[<>|*+#{}o]/.test(m[0])) {
        push(m[0], "arrow");
        i += m[0].length;
      } else {
        plain += c;
        i++;
      }
    } else {
      plain += c;
      i++;
    }
  }
  flush();
  return { tokens, inBlock };
}

/**
 * Tokenize a whole document.
 * @param {string} source
 * @returns {Token[][]} One token list per line.
 */
export function tokenize(source) {
  /** @type {Token[][]} */
  const lines = [];
  let inBlock = false;
  for (const line of source.split("\n")) {
    const r = tokenizeLine(line.endsWith("\r") ? line.slice(0, -1) : line, inBlock);
    inBlock = r.inBlock;
    lines.push(r.tokens);
  }
  return lines;
}
