/**
 * Node shape library. Each shape knows how to draw its outline inside a box,
 * where its label goes and how much padding the label needs. Shapes are
 * composed only of canvas primitives, so they render identically in
 * Excalidraw, SVG and PNG.
 * @module draw/shapes
 */

/** @typedef {import("./canvas.mjs").Canvas} Canvas */
/** @typedef {import("./canvas.mjs").Style} Style */
/** @typedef {import("./canvas.mjs").Point} Point */

/**
 * @typedef {object} ShapeDef
 * @property {"inside" | "below"} label Label placement.
 * @property {[number, number, number, number]} pad Label padding (top, right, bottom, left) for inside labels.
 * @property {[number, number]} [icon] Fixed icon size for `below` shapes.
 * @property {[number, number]} [min] Minimum outline size.
 * @property {(c: Canvas, x: number, y: number, w: number, h: number, s: Style) => string} draw Returns the bindable element id.
 */

const PAD = 12;

/** @param {number} n */
const r2 = (n) => Math.round(n * 100) / 100;

/**
 * Sample an elliptic arc into points.
 * @param {number} cx
 * @param {number} cy
 * @param {number} rx
 * @param {number} ry
 * @param {number} a0 Start angle in degrees.
 * @param {number} a1 End angle in degrees.
 * @param {number} [steps]
 * @returns {Point[]}
 */
export function arc(cx, cy, rx, ry, a0, a1, steps = 12) {
  /** @type {Point[]} */
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = ((a0 + ((a1 - a0) * i) / steps) * Math.PI) / 180;
    pts.push([r2(cx + Math.cos(a) * rx), r2(cy + Math.sin(a) * ry)]);
  }
  return pts;
}

/** @type {Record<string, ShapeDef>} */
export const SHAPES = {
  rectangle: {
    label: "inside",
    pad: [PAD, PAD, PAD, PAD],
    draw: (c, x, y, w, h, s) => c.rect(x, y, w, h, s),
  },
  rounded: {
    label: "inside",
    pad: [PAD, PAD + 4, PAD, PAD + 4],
    draw: (c, x, y, w, h, s) => c.rect(x, y, w, h, { ...s, rounded: true }),
  },
  component: {
    label: "inside",
    pad: [PAD, PAD + 24, PAD, PAD],
    draw: (c, x, y, w, h, s) => {
      const id = c.rect(x, y, w, h, s);
      // UML2 component icon in the top-right corner.
      const ix = x + w - 22;
      const iy = y + 8;
      const thin = { ...s, strokeWidth: 1, fill: s.fill };
      c.rect(ix, iy, 14, 16, thin);
      c.rect(ix - 4, iy + 3, 8, 4, thin);
      c.rect(ix - 4, iy + 9, 8, 4, thin);
      return id;
    },
  },
  component1: {
    label: "inside",
    pad: [PAD, PAD, PAD, PAD + 12],
    draw: (c, x, y, w, h, s) => {
      const id = c.rect(x, y, w, h, s);
      c.rect(x - 8, y + h * 0.25 - 6, 16, 10, s);
      c.rect(x - 8, y + h * 0.65 - 4, 16, 10, s);
      return id;
    },
  },
  node: {
    label: "inside",
    pad: [PAD + 10, PAD + 12, PAD, PAD],
    draw: (c, x, y, w, h, s) => {
      const d = 10;
      const id = c.rect(x, y + d, w - d, h - d, s);
      c.line(
        [
          [x, y + d],
          [x + d, y],
          [x + w, y],
          [x + w, y + h - d],
          [x + w - d, y + h],
        ],
        { ...s, fill: undefined },
      );
      c.line(
        [
          [x + w - d, y + d],
          [x + w, y],
        ],
        { ...s, fill: undefined },
      );
      return id;
    },
  },
  database: {
    label: "inside",
    pad: [PAD + 14, PAD, PAD, PAD],
    min: [60, 60],
    draw: (c, x, y, w, h, s) => {
      const ry = Math.min(10, h / 6);
      const body = c.line(
        [
          ...arc(x + w / 2, y + ry, w / 2, ry, 180, 360, 10),
          ...arc(x + w / 2, y + h - ry, w / 2, ry, 0, 180, 10),
        ],
        { ...s, closed: true },
      );
      c.line(arc(x + w / 2, y + ry, w / 2, ry, 0, 180, 10), { ...s, fill: undefined });
      return body;
    },
  },
  queue: {
    label: "inside",
    pad: [PAD, PAD + 14, PAD, PAD],
    min: [80, 40],
    draw: (c, x, y, w, h, s) => {
      const rx = Math.min(10, w / 6);
      const body = c.line(
        [
          ...arc(x + rx, y + h / 2, rx, h / 2, 90, 270, 10),
          ...arc(x + w - rx, y + h / 2, rx, h / 2, -90, 90, 10),
        ],
        {
          ...s,
          closed: true,
        },
      );
      c.line(arc(x + w - rx, y + h / 2, rx, h / 2, 90, 270, 10), { ...s, fill: undefined });
      return body;
    },
  },
  storage: {
    label: "inside",
    pad: [PAD, PAD + 10, PAD, PAD + 10],
    draw: (c, x, y, w, h, s) => c.rect(x, y, w, h, { ...s, rounded: true }),
  },
  cloud: {
    label: "inside",
    pad: [PAD + 10, PAD + 18, PAD + 10, PAD + 18],
    min: [100, 60],
    draw: (c, x, y, w, h, s) => {
      /** @type {Point[]} */
      const pts = [];
      const bumps = [
        [0.18, 0.62, 0.18, 0.28, 110, 250],
        [0.32, 0.3, 0.2, 0.26, 180, 300],
        [0.6, 0.26, 0.26, 0.24, 210, 340],
        [0.84, 0.5, 0.16, 0.3, 270, 420],
        [0.62, 0.78, 0.26, 0.22, 0, 150],
        [0.3, 0.78, 0.2, 0.2, 20, 160],
      ];
      for (const [cx, cy, rx, ry, a0, a1] of bumps)
        pts.push(...arc(x + cx * w, y + cy * h, rx * w, ry * h, a0, a1, 6));
      return c.line(pts, { ...s, closed: true, curved: true });
    },
  },
  folder: {
    label: "inside",
    pad: [PAD + 12, PAD, PAD, PAD],
    draw: (c, x, y, w, h, s) => {
      const tw = Math.min(60, w * 0.4);
      c.line(
        [
          [x, y + 12],
          [x, y],
          [x + tw - 6, y],
          [x + tw, y + 12],
        ],
        { ...s, closed: true },
      );
      return c.rect(x, y + 12, w, h - 12, s);
    },
  },
  frame: {
    label: "inside",
    pad: [PAD + 8, PAD, PAD, PAD],
    draw: (c, x, y, w, h, s) => c.rect(x, y, w, h, s),
  },
  artifact: {
    label: "inside",
    pad: [PAD, PAD + 20, PAD, PAD],
    draw: (c, x, y, w, h, s) => {
      const id = c.rect(x, y, w, h, s);
      const ix = x + w - 20;
      const iy = y + 7;
      const thin = { ...s, strokeWidth: 1 };
      c.line(
        [
          [ix, iy],
          [ix + 8, iy],
          [ix + 12, iy + 4],
          [ix + 12, iy + 16],
          [ix, iy + 16],
        ],
        { ...thin, closed: true },
      );
      c.line(
        [
          [ix + 8, iy],
          [ix + 8, iy + 4],
          [ix + 12, iy + 4],
        ],
        { ...thin, fill: undefined },
      );
      return id;
    },
  },
  file: {
    label: "inside",
    pad: [PAD, PAD + 8, PAD, PAD],
    draw: (c, x, y, w, h, s) => folded(c, x, y, w, h, s, 12),
  },
  note: {
    label: "inside",
    pad: [8, 18, 8, 10],
    draw: (c, x, y, w, h, s) => folded(c, x, y, w, h, s, 12),
  },
  card: {
    label: "inside",
    pad: [PAD, PAD, PAD, PAD],
    draw: (c, x, y, w, h, s) => c.rect(x, y, w, h, s),
  },
  agent: {
    label: "inside",
    pad: [PAD, PAD, PAD, PAD],
    draw: (c, x, y, w, h, s) => c.rect(x, y, w, h, s),
  },
  stack: {
    label: "inside",
    pad: [PAD + 6, PAD + 6, PAD, PAD],
    draw: (c, x, y, w, h, s) => {
      c.rect(x + 8, y, w - 8, h - 8, s);
      c.rect(x + 4, y + 4, w - 8, h - 8, s);
      return c.rect(x, y + 8, w - 8, h - 8, s);
    },
  },
  collections: {
    label: "inside",
    pad: [PAD + 4, PAD + 4, PAD, PAD],
    draw: (c, x, y, w, h, s) => {
      c.rect(x + 6, y, w - 6, h - 6, s);
      return c.rect(x, y + 6, w - 6, h - 6, s);
    },
  },
  hexagon: {
    label: "inside",
    pad: [PAD, PAD + 16, PAD, PAD + 16],
    draw: (c, x, y, w, h, s) => {
      const d = Math.min(18, w / 4);
      return c.line(
        [
          [x + d, y],
          [x + w - d, y],
          [x + w, y + h / 2],
          [x + w - d, y + h],
          [x + d, y + h],
          [x, y + h / 2],
        ],
        { ...s, closed: true },
      );
    },
  },
  process: {
    label: "inside",
    pad: [PAD, PAD + 16, PAD, PAD],
    draw: (c, x, y, w, h, s) => {
      const d = Math.min(16, w / 5);
      return c.line(
        [
          [x, y],
          [x + w - d, y],
          [x + w, y + h / 2],
          [x + w - d, y + h],
          [x, y + h],
        ],
        { ...s, closed: true },
      );
    },
  },
  action: {
    label: "inside",
    pad: [PAD, PAD + 16, PAD, PAD + 8],
    draw: (c, x, y, w, h, s) => {
      const d = Math.min(14, w / 5);
      return c.line(
        [
          [x, y],
          [x + w - d, y],
          [x + w, y + h / 2],
          [x + w - d, y + h],
          [x, y + h],
          [x + d, y + h / 2],
        ],
        { ...s, closed: true },
      );
    },
  },
  usecase: {
    label: "inside",
    pad: [PAD + 4, PAD + 22, PAD + 4, PAD + 22],
    min: [100, 44],
    draw: (c, x, y, w, h, s) => c.ellipse(x, y, w, h, s),
  },
  circle: {
    label: "inside",
    pad: [PAD + 6, PAD + 6, PAD + 6, PAD + 6],
    draw: (c, x, y, w, h, s) => {
      const d = Math.max(w, h);
      return c.ellipse(x + (w - d) / 2, y + (h - d) / 2, d, d, s);
    },
  },
  diamond: {
    label: "inside",
    pad: [PAD + 4, PAD + 24, PAD + 4, PAD + 24],
    draw: (c, x, y, w, h, s) => c.diamond(x, y, w, h, s),
  },
  label: {
    label: "inside",
    pad: [4, 4, 4, 4],
    draw: (c, x, y, w, h, s) =>
      c.rect(x, y, w, h, { ...s, stroke: "transparent", fill: "transparent", strokeWidth: 1 }),
  },
  person: {
    label: "inside",
    pad: [PAD + 34, PAD, PAD, PAD],
    min: [90, 80],
    draw: (c, x, y, w, h, s) => {
      c.ellipse(x + w / 2 - 15, y, 30, 30, s);
      return c.rect(x, y + 26, w, h - 26, { ...s, rounded: true });
    },
  },
  actor: {
    label: "below",
    pad: [2, 2, 2, 2],
    icon: [32, 56],
    draw: (c, x, y, w, _h, s) => {
      const cx = x + w / 2;
      const line = { ...s, fill: undefined };
      const head = c.ellipse(cx - 9, y, 18, 18, {
        ...s,
        fill: s.fill === "transparent" ? undefined : s.fill,
      });
      c.line(
        [
          [cx, y + 18],
          [cx, y + 38],
        ],
        line,
      );
      c.line(
        [
          [cx - 15, y + 25],
          [cx + 15, y + 25],
        ],
        line,
      );
      c.line(
        [
          [cx - 13, y + 56],
          [cx, y + 38],
          [cx + 13, y + 56],
        ],
        line,
      );
      return head;
    },
  },
  boundary: {
    label: "below",
    pad: [2, 2, 2, 2],
    icon: [48, 36],
    draw: (c, x, y, w, _h, s) => {
      const cx = x + w / 2 + 6;
      c.line(
        [
          [cx - 22, y + 2],
          [cx - 22, y + 34],
        ],
        s,
      );
      c.line(
        [
          [cx - 22, y + 18],
          [cx - 16, y + 18],
        ],
        s,
      );
      return c.ellipse(cx - 16, y + 2, 32, 32, s);
    },
  },
  control: {
    label: "below",
    pad: [2, 2, 2, 2],
    icon: [36, 40],
    draw: (c, x, y, w, _h, s) => {
      const cx = x + w / 2;
      const id = c.ellipse(cx - 16, y + 6, 32, 32, s);
      c.line(
        [
          [cx + 6, y + 1],
          [cx - 2, y + 6],
          [cx + 6, y + 11],
        ],
        { ...s, fill: undefined },
      );
      return id;
    },
  },
  entity: {
    label: "below",
    pad: [2, 2, 2, 2],
    icon: [36, 38],
    draw: (c, x, y, w, _h, s) => {
      const cx = x + w / 2;
      const id = c.ellipse(cx - 16, y, 32, 32, s);
      c.line(
        [
          [cx - 16, y + 36],
          [cx + 16, y + 36],
        ],
        s,
      );
      return id;
    },
  },
  interface: {
    label: "below",
    pad: [2, 2, 2, 2],
    icon: [22, 22],
    draw: (c, x, y, w, _h, s) => c.ellipse(x + w / 2 - 10, y + 1, 20, 20, s),
  },
  start: {
    label: "below",
    pad: [0, 0, 0, 0],
    icon: [24, 24],
    draw: (c, x, y, w, _h, s) =>
      c.ellipse(x + w / 2 - 12, y, 24, 24, { ...s, fill: s.stroke, fillStyle: "solid" }),
  },
  end: {
    label: "below",
    pad: [0, 0, 0, 0],
    icon: [28, 28],
    draw: (c, x, y, w, _h, s) => {
      const id = c.ellipse(x + w / 2 - 14, y, 28, 28, { ...s, fill: "transparent" });
      c.ellipse(x + w / 2 - 8, y + 6, 16, 16, { ...s, fill: s.stroke, fillStyle: "solid" });
      return id;
    },
  },
};

/**
 * Rectangle with a folded top-right corner.
 * @param {Canvas} c
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {Style} s
 * @param {number} f Fold size.
 */
function folded(c, x, y, w, h, s, f) {
  const id = c.line(
    [
      [x, y],
      [x + w - f, y],
      [x + w, y + f],
      [x + w, y + h],
      [x, y + h],
    ],
    { ...s, closed: true },
  );
  c.line(
    [
      [x + w - f, y],
      [x + w - f, y + f],
      [x + w, y + f],
    ],
    { ...s, fill: undefined },
  );
  return id;
}

/** Shape aliases from PlantUML keywords. */
const ALIASES = new Map([
  ["rect", "rectangle"],
  ["package", "folder"],
  ["participant", "rectangle"],
  ["usecase/", "usecase"],
  ["actor/", "actor"],
  ["database", "database"],
  ["queue", "queue"],
  ["port", "rectangle"],
]);

/**
 * Look up a shape definition (falls back to `rectangle`).
 * @param {string} name
 * @returns {ShapeDef}
 */
export function shape(name) {
  return SHAPES[name] ?? SHAPES[ALIASES.get(name) ?? ""] ?? SHAPES.rectangle;
}
