// Shared helpers used by the parser engine and all plugins.
//
// Keeping these here lets each plugin file stay tiny and self-contained;
// adding a new plugin never forces a change to the engine.

export const STEREOTYPE = /<<\s*([^>]+?)\s*>>/;
export const TITLE_LINE = /^title\s+(.+)$/;

// Lines we always silently skip. Plugins can extend this via the engine's
// `skip` array if needed.
export const ALWAYS_SKIP = [
  /^@startuml/, /^@enduml/, /^skinparam/, /^!/,
  /^hide\s/, /^show\s/, /^scale\s/,
  /^autonumber\b/, /^activate\s/, /^deactivate\s/,
];

export function stripComment(line) {
  // PlantUML: ' starts a line comment except inside a string.
  const idx = line.indexOf("'");
  if (idx === 0) return "";
  if (idx > 0 && /\s/.test(line[idx - 1])) return line.slice(0, idx);
  return line;
}

export function stripQuotes(s) {
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
  return s;
}

export function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

// Replace literal "\n" sequences with real newlines.
export function unescapeLabel(s) {
  return String(s ?? "").replace(/\\n/g, "\n");
}

// Normalise inline `{ … }` so that `frame "F" as f { [a] [b] }` parses
// cleanly. We split each line on `{` and `}` boundaries OUTSIDE quoted
// strings, then re-attach lone `{` to the preceding header line.
export function explodeBraces(lines) {
  const out = [];
  for (const raw of lines) {
    let buf = "";
    let inStr = false;
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];
      if (c === '"') { inStr = !inStr; buf += c; continue; }
      if (!inStr && (c === "{" || c === "}")) {
        if (buf.trim()) out.push(buf);
        out.push(c);
        buf = "";
        continue;
      }
      buf += c;
    }
    if (buf.trim() || (!buf && raw === "")) out.push(buf);
  }
  const stitched = [];
  for (const ln of out) {
    if (ln === "{" && stitched.length) {
      const prevIdx = stitched.length - 1;
      const prev = stitched[prevIdx];
      if (prev && !prev.endsWith("{") && prev.trim() && prev.trim() !== "}") {
        stitched[prevIdx] = `${prev.trimEnd()} {`;
        continue;
      }
    }
    stitched.push(ln);
  }
  return stitched;
}

// Map a shape keyword to the canonical model shape name.
export function normaliseShape(kw) {
  switch (kw) {
    case "component": return "component";
    case "actor":     return "actor";
    case "usecase":   return "usecase";
    case "database":  return "database";
    case "node":      return "node";
    case "cloud":     return "cloud";
    case "interface": return "interface";
    case "entity":    return "entity";
    case "class":     return "class";
    case "rectangle": return "rectangle";
    case "boundary":  return "interface";
    case "control":   return "interface";
    default:          return "rectangle";
  }
}

// Decode a PlantUML connection operator into structural fields.
// Returns null if the op is not a recognised arrow.
export function classifyArrow(op) {
  let directionHint = null;
  const dirMatch = op.match(/-(up|down|left|right)-/i);
  if (dirMatch) {
    directionHint = dirMatch[1].toLowerCase();
    op = op.replace(/-(?:up|down|left|right)-/i, "--");
  }

  const bidir = /<.*>/.test(op);
  const startsWithLeft = op.startsWith("<");
  const endsWithRight = op.endsWith(">");
  const reversed = startsWithLeft && !endsWithRight;
  const dashed = op.includes(".");

  if (op.includes("|>") || op.includes("<|")) {
    return {
      kind: dashed ? "realization" : "inheritance",
      dashed,
      reversed: op.includes("<|") && !op.includes("|>"),
      startArrowhead: null,
      endArrowhead: "triangle_outline",
      directionHint,
    };
  }
  if (op.startsWith("*") || op.endsWith("*")) {
    return {
      kind: "composition",
      dashed,
      reversed: op.endsWith("*"),
      startArrowhead: "diamond",
      endArrowhead: null,
      directionHint,
    };
  }
  if (op.startsWith("o") || op.endsWith("o")) {
    return {
      kind: "aggregation",
      dashed,
      reversed: op.endsWith("o"),
      startArrowhead: "diamond_outline",
      endArrowhead: null,
      directionHint,
    };
  }
  if (!/[-.]/.test(op)) return null;

  return {
    kind: dashed ? "dependency" : "default",
    dashed,
    reversed,
    startArrowhead: bidir ? "arrow" : null,
    endArrowhead: (endsWithRight || bidir) ? "arrow" : (reversed ? null : "arrow"),
    directionHint,
  };
}
