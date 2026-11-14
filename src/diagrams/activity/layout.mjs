/**
 * Structured activity layout.
 *
 * Every block is laid out into a frame around a vertical axis (x = 0):
 * nodes get relative centres and edges are recorded as port-to-port
 * connections. Frames compose vertically (sequences) or side by side
 * (branches). Swimlanes shift nodes per lane afterwards, and only then are
 * edges routed orthogonally from their ports — so lanes never break routes.
 * @module diagrams/activity/layout
 */

import { layoutText } from "../../layout/measure.mjs";
import { roleStyle } from "../../draw/theme.mjs";

/** @typedef {import("./parse.mjs").Item} Item */
/** @typedef {import("./parse.mjs").ArrowStyle} ArrowStyle */
/** @typedef {import("../../layout/measure.mjs").RichLayout} RichLayout */

/**
 * @typedef {object} LNode
 * @property {number} id
 * @property {"action" | "start" | "stop" | "end" | "kill" | "diamond" | "merge" | "bar" | "junction" | "note" | "connector"} kind
 * @property {number} x Centre x.
 * @property {number} y Centre y.
 * @property {number} w
 * @property {number} h
 * @property {RichLayout | null} text
 * @property {string} shape
 * @property {string | null} fill
 * @property {string | null} lane
 * @property {Record<string, any>} [data]
 */

/** @typedef {"top" | "bottom" | "left" | "right"} Side */

/**
 * @typedef {object} LEdge
 * @property {LNode} from
 * @property {Side} fromSide
 * @property {number} fromDx
 * @property {LNode} to
 * @property {Side} toSide
 * @property {number} toDx
 * @property {RichLayout | null} label
 * @property {ArrowStyle | null} style
 * @property {{ x: number } | null} via Detour column (loops, bypasses).
 * @property {[number, number][]} points
 */

/**
 * @typedef {object} Frame
 * @property {LNode[]} nodes
 * @property {LEdge[]} edges
 * @property {{ kind: string, text: RichLayout, fill: string | null, nodes: LNode[] }[]} groups
 * @property {LNode | null} entry
 * @property {{ node: LNode, side: Side, dx: number }[] | null} exits `null` = transparent (empty) frame.
 * @property {number} minX
 * @property {number} maxX
 * @property {number} height
 */

const GAP = 28;
const BRANCH_GAP = 36;

/**
 * @param {import("./parse.mjs").ActivityModel} model
 * @param {import("../../core/registry.mjs").ModuleContext} ctx
 */
export function layoutActivity(model, ctx) {
  const theme = ctx.theme;
  const fs = roleStyle(theme, "action").fontSize;
  let seq = 0;
  /** @type {LNode[]} */
  const notes = [];

  /**
   * @param {LNode["kind"]} kind
   * @param {{ text?: string | null, shape?: string, fill?: string | null, lane?: string | null, w?: number, h?: number, small?: boolean }} [o]
   * @returns {LNode}
   */
  const node = (kind, o = {}) => {
    const text = o.text ? layoutText(o.text, { fontSize: o.small ? fs * 0.85 : fs, align: kind === "note" ? "left" : "center", maxWidth: 300 }) : null;
    let w = o.w ?? 0;
    let h = o.h ?? 0;
    if (kind === "action") {
      w = Math.max(60, (text?.width ?? 0) + 36);
      h = Math.max(38, (text?.height ?? 0) + 20);
    } else if (kind === "diamond") {
      w = text ? text.width + 48 : 30;
      h = text ? Math.max(36, text.height + 16) : 30;
    } else if (kind === "note") {
      w = (text?.width ?? 0) + 28;
      h = (text?.height ?? 0) + 16;
    } else if (kind === "connector") {
      w = h = Math.max(30, (text?.width ?? 0) + 14);
    }
    return { id: seq++, kind, x: 0, y: h / 2, w, h, text, shape: o.shape ?? "", fill: o.fill ?? null, lane: o.lane ?? null };
  };

  /** @param {Frame} f @param {number} dx @param {number} dy */
  const shift = (f, dx, dy) => {
    for (const n of f.nodes) {
      n.x += dx;
      n.y += dy;
    }
    for (const e of f.edges) if (e.via) e.via.x += dx;
    f.minX += dx;
    f.maxX += dx;
  };

  /**
   * @param {LNode} from
   * @param {Side} fromSide
   * @param {LNode} to
   * @param {Side} toSide
   * @param {{ label?: string | null, style?: ArrowStyle | null, via?: number | null, fromDx?: number, toDx?: number }} [o]
   * @returns {LEdge}
   */
  const edge = (from, fromSide, to, toSide, o = {}) => ({
    from,
    fromSide,
    fromDx: o.fromDx ?? 0,
    to,
    toSide,
    toDx: o.toDx ?? 0,
    label: o.label ? layoutText(o.label, { fontSize: fs * 0.8 }) : null,
    style: o.style ?? null,
    via: o.via !== undefined && o.via !== null ? { x: o.via } : null,
    points: [],
  });

  /** @param {LNode} n @returns {Frame} */
  const single = (n) => ({
    nodes: [n],
    edges: [],
    groups: [],
    entry: n,
    exits: [{ node: n, side: "bottom", dx: 0 }],
    minX: -n.w / 2,
    maxX: n.w / 2,
    height: n.h,
  });

  /** @returns {Frame} */
  const empty = () => ({ nodes: [], edges: [], groups: [], entry: null, exits: null, minX: 0, maxX: 0, height: 0 });

  /**
   * @param {Frame} target
   * @param {Frame} part
   */
  const absorb = (target, part) => {
    target.nodes.push(...part.nodes);
    target.edges.push(...part.edges);
    target.groups.push(...part.groups);
    target.minX = Math.min(target.minX, part.minX);
    target.maxX = Math.max(target.maxX, part.maxX);
  };

  /** Side of a node a branch at axis `x` should leave from. @param {number} x @returns {Side} */
  const sideFor = (x) => (x < -1 ? "left" : x > 1 ? "right" : "bottom");

  /**
   * Lay branches side by side under a split node and join them.
   * @param {LNode} head Diamond / bar / junction at the top.
   * @param {{ frame: Frame, label: string | null }[]} branches
   * @param {"merge" | "bar" | "junction"} joinKind
   * @param {string | null} lane
   * @param {boolean} fromBar Edges leave the head from its bottom at the branch axis.
   * @returns {Frame}
   */
  const branchOut = (head, branches, joinKind, lane, fromBar) => {
    /** @type {Frame} */
    const f = single(head);
    f.exits = [];
    const top = head.h + GAP;
    const widths = branches.map((b) => (b.frame.exits === null && !b.frame.nodes.length ? 0 : b.frame.maxX - b.frame.minX));
    const nonEmpty = branches.filter((b, i) => widths[i] > 0);
    /** @type {number[]} */
    const axes = [];
    if (nonEmpty.length === 1 && branches.length === 2 && widths[1] === 0 && !fromBar) {
      axes.push(0, branches[0].frame.maxX + BRANCH_GAP);
    } else {
      const total = widths.reduce((s, w) => s + w, 0) + BRANCH_GAP * (branches.length - 1);
      let x = -total / 2;
      branches.forEach((b, i) => {
        axes.push(x - b.frame.minX);
        x += widths[i] + BRANCH_GAP;
      });
    }
    let bottom = top;
    branches.forEach((b, i) => {
      if (widths[i] > 0) {
        shift(b.frame, axes[i], top);
        absorb(f, b.frame);
        bottom = Math.max(bottom, top + b.frame.height);
      }
    });
    const join = node(joinKind === "merge" ? "merge" : joinKind === "bar" ? "bar" : "junction", {
      lane,
      w: joinKind === "merge" ? 22 : joinKind === "bar" ? Math.max(60, f.maxX - f.minX - 20) : 0,
      h: joinKind === "merge" ? 22 : joinKind === "bar" ? 6 : 0,
    });
    if (joinKind === "bar") head.w = Math.max(head.w, join.w);
    join.y = bottom + GAP + join.h / 2;
    let joined = false;
    branches.forEach((b, i) => {
      const axis = axes[i];
      const fromSide = fromBar ? "bottom" : sideFor(axis);
      const fromDx = fromBar ? axis : 0;
      if (widths[i] === 0) {
        // Empty branch: bypass column straight into the join.
        const via = axis === 0 ? null : axis;
        f.edges.push(edge(head, fromBar ? "bottom" : sideFor(axis || 1), join, fromBar ? "top" : axis < 0 ? "left" : "right", { label: b.label, via: via ?? Math.max(f.maxX, head.w / 2) + BRANCH_GAP / 2, fromDx, toDx: fromDx }));
        f.maxX = Math.max(f.maxX, (via ?? 0) + 10);
        joined = true;
        return;
      }
      if (b.frame.entry) f.edges.push(edge(head, fromSide, b.frame.entry, "top", { label: b.label, fromDx }));
      for (const ex of b.frame.exits ?? []) {
        f.edges.push(edge(ex.node, ex.side, join, joinKind === "merge" ? sideFor(axis) === "bottom" ? "top" : sideFor(axis) : "top", { fromDx: ex.dx, toDx: joinKind === "merge" ? 0 : axis }));
        joined = true;
      }
    });
    if (joined) {
      f.nodes.push(join);
      f.exits = [{ node: join, side: "bottom", dx: 0 }];
      f.height = join.y + join.h / 2;
    } else {
      f.exits = [];
      f.height = bottom;
    }
    f.minX = Math.min(f.minX, -head.w / 2);
    f.maxX = Math.max(f.maxX, head.w / 2);
    return f;
  };

  /**
   * @param {Item[]} items
   * @returns {Frame}
   */
  const layoutSeq = (items) => {
    /** @type {Frame} */
    const f = empty();
    /** @type {{ node: LNode, side: Side, dx: number }[] | null} */
    let exits = null;
    /** @type {ArrowStyle | null} */
    let pending = null;
    /** @type {LNode | null} */
    let lastNode = null;
    let y = 0;
    let started = false;
    for (const item of items) {
      if (item.t === "arrow") {
        pending = item.style;
        continue;
      }
      if (item.t === "note") {
        const n = node("note", { text: item.text, fill: item.fill, small: true });
        if (lastNode) {
          n.x = item.side === "left" ? lastNode.x - lastNode.w / 2 - 20 - n.w / 2 : lastNode.x + lastNode.w / 2 + 20 + n.w / 2;
          n.y = lastNode.y;
          n.lane = lastNode.lane;
        } else n.y = n.h / 2;
        f.nodes.push(n);
        notes.push(n);
        f.minX = Math.min(f.minX, n.x - n.w / 2);
        f.maxX = Math.max(f.maxX, n.x + n.w / 2);
        y = Math.max(y, n.y + n.h / 2 + (lastNode ? 0 : GAP));
        continue;
      }
      const part = layoutItem(item);
      if (!part.nodes.length && part.exits === null) continue;
      if (started) y += GAP;
      shift(part, 0, y);
      absorb(f, part);
      if (part.entry) {
        if (!f.entry) f.entry = part.entry;
        for (const ex of exits ?? []) {
          const style = pending;
          f.edges.push(edge(ex.node, ex.side, part.entry, "top", { label: style?.label ?? null, style, fromDx: ex.dx }));
        }
        pending = null;
        exits = part.exits ?? exits;
      }
      lastNode = part.nodes.filter((n) => n.kind !== "note").at(-1) ?? lastNode;
      y += part.height;
      started = true;
      if (part.exits && part.exits.length === 0) exits = [];
    }
    f.exits = started ? exits ?? [] : null;
    f.height = y;
    return f;
  };

  /**
   * @param {Item} item
   * @returns {Frame}
   */
  const layoutItem = (item) => {
    switch (item.t) {
      case "start":
        return single(node("start", { w: 22, h: 22, lane: item.lane }));
      case "stop":
      case "end": {
        const f = single(node(item.t, { w: 26, h: 26, lane: item.lane }));
        f.exits = [];
        return f;
      }
      case "kill":
      case "detach":
      case "break": {
        const f = single(node("kill", { w: item.t === "break" ? 0 : 16, h: item.t === "break" ? 0 : 16, lane: item.lane }));
        f.exits = [];
        return f;
      }
      case "action":
        return single(node("action", { text: item.text, shape: item.shape, fill: item.fill, lane: item.lane }));
      case "connector":
        return single(node("connector", { text: item.text, fill: item.fill, lane: item.lane }));
      case "if": {
        /** @param {number} i @returns {Frame} */
        const build = (i) => {
          const b = item.branches[i];
          const head = node("diamond", { text: b.cond, lane: item.lane, small: true });
          /** @type {Frame} */
          let elseFrame;
          let elseLabel = item.elseLabel;
          if (i + 1 < item.branches.length) {
            elseFrame = build(i + 1);
            elseLabel = null;
          } else elseFrame = item.elseBody ? layoutSeq(item.elseBody) : empty();
          return branchOut(
            head,
            [
              { frame: layoutSeq(b.body), label: b.label },
              { frame: elseFrame, label: elseLabel },
            ],
            "merge",
            item.lane,
            false,
          );
        };
        return build(0);
      }
      case "switch": {
        const head = node("diamond", { text: item.test, lane: item.lane, small: true });
        return branchOut(
          head,
          item.cases.map((c) => ({ frame: layoutSeq(c.body), label: c.label })),
          "merge",
          item.lane,
          false,
        );
      }
      case "fork": {
        const split = item.kind === "split";
        const head = node(split ? "junction" : "bar", { lane: item.lane, w: split ? 0 : 60, h: split ? 0 : 6 });
        const f = branchOut(
          head,
          item.branches.map((b) => ({ frame: layoutSeq(b), label: null })),
          item.merge ? "merge" : split ? "junction" : "bar",
          item.lane,
          true,
        );
        if (!split) head.w = Math.max(60, f.maxX - f.minX - 20);
        return f;
      }
      case "while": {
        const head = node("diamond", { text: item.cond, lane: item.lane, small: true });
        const body = layoutSeq(item.body);
        /** @type {Frame} */
        const f = single(head);
        const top = head.h + GAP;
        shift(body, 0, top);
        absorb(f, body);
        const left = Math.min(f.minX, -head.w / 2) - 24;
        const right = Math.max(f.maxX, head.w / 2) + 24;
        const back = item.backward.find((b) => b.t === "action");
        const backLabel = back && back.t === "action" ? back.text : null;
        if (body.entry) {
          f.edges.push(edge(head, "bottom", body.entry, "top", { label: item.label }));
          for (const ex of body.exits ?? []) f.edges.push(edge(ex.node, ex.side, head, "left", { via: left, fromDx: ex.dx, label: backLabel }));
        } else {
          f.edges.push(edge(head, "bottom", head, "left", { via: left, label: item.label }));
        }
        const j = node("junction", { lane: item.lane });
        j.y = top + body.height + GAP;
        f.nodes.push(j);
        f.edges.push(edge(head, "right", j, "top", { via: right, label: item.endLabel }));
        f.exits = [{ node: j, side: "bottom", dx: 0 }];
        f.minX = left - 8;
        f.maxX = right + 8;
        f.height = j.y;
        return f;
      }
      case "repeat": {
        const head = node("merge", { lane: item.lane, w: 22, h: 22 });
        const bodyItems = item.startLabel ? [/** @type {Item} */ ({ t: "action", text: item.startLabel, shape: ";", fill: null, lane: item.lane, stereotypes: [] }), ...item.body] : item.body;
        const body = layoutSeq(bodyItems);
        const cond = node("diamond", { text: item.cond || null, lane: item.lane, small: true });
        /** @type {Frame} */
        const f = single(head);
        const top = head.h + GAP;
        shift(body, 0, top);
        absorb(f, body);
        cond.y = top + body.height + GAP + cond.h / 2;
        f.nodes.push(cond);
        if (body.entry) {
          f.edges.push(edge(head, "bottom", body.entry, "top"));
          for (const ex of body.exits ?? []) f.edges.push(edge(ex.node, ex.side, cond, "top", { fromDx: ex.dx }));
        } else f.edges.push(edge(head, "bottom", cond, "top"));
        const left = Math.min(f.minX, -cond.w / 2) - 24;
        const back = item.backward.find((b) => b.t === "action");
        f.edges.push(edge(cond, "left", head, "left", { via: left, label: [item.label, back && back.t === "action" ? back.text : null].filter(Boolean).join("\n") || null }));
        f.exits = [{ node: cond, side: "bottom", dx: 0 }];
        f.minX = Math.min(left - 8, -cond.w / 2);
        f.maxX = Math.max(f.maxX, cond.w / 2);
        f.height = cond.y + cond.h / 2;
        if (item.notLabel) cond.data = { exitLabel: item.notLabel };
        return f;
      }
      case "group": {
        const body = layoutSeq(item.body);
        const text = layoutText(item.text, { fontSize: fs * 0.85, bold: true });
        const header = text.height + 12;
        shift(body, 0, header + 8);
        body.groups.push({ kind: item.kind, text, fill: item.fill, nodes: body.nodes.slice() });
        body.minX = Math.min(body.minX - 18, -text.width / 2 - 20);
        body.maxX = Math.max(body.maxX + 18, text.width / 2 + 20);
        body.height += header + 22;
        return body;
      }
      default:
        return empty();
    }
  };

  const frame = layoutSeq(model.body);

  // Exit labels on repeat conditions become labels of their outgoing edge.
  for (const e of frame.edges) {
    const exitLabel = /** @type {any} */ (e.from).data?.exitLabel;
    if (exitLabel && e.fromSide === "bottom" && !e.label) e.label = layoutText(exitLabel, { fontSize: fs * 0.8 });
  }

  // ── swimlanes ────────────────────────────────────────────────────────
  /** @type {{ id: string, label: RichLayout, fill: string | null, x: number, w: number }[]} */
  const lanes = [];
  let laneHeader = 0;
  if (model.lanes.length) {
    const ids = model.lanes.map((l) => l.id);
    const laneOf = (/** @type {LNode} */ n) => (n.lane && ids.includes(n.lane) ? n.lane : ids[0]);
    let x = 0;
    for (const l of model.lanes) {
      const members = frame.nodes.filter((n) => laneOf(n) === l.id);
      const vias = frame.edges.filter((e) => e.via && laneOf(e.from) === l.id).map((e) => /** @type {{ x: number }} */ (e.via).x);
      const minX = Math.min(...members.map((n) => n.x - n.w / 2), ...vias, Infinity);
      const maxX = Math.max(...members.map((n) => n.x + n.w / 2), ...vias, -Infinity);
      const text = layoutText(l.label, { fontSize: fs, bold: true });
      const extent = Number.isFinite(minX) ? maxX - minX : 0;
      const w = Math.max(180, extent + 60, text.width + 40);
      const dx = Number.isFinite(minX) ? x + (w - extent) / 2 - minX : 0;
      for (const n of members) n.x += dx;
      for (const e of frame.edges) if (e.via && laneOf(e.from) === l.id) e.via.x += dx;
      lanes.push({ id: l.id, label: text, fill: l.fill, x, w });
      laneHeader = Math.max(laneHeader, text.height + 16);
      x += w;
    }
    for (const n of frame.nodes) n.y += laneHeader + 16;
  }

  // ── routing ──────────────────────────────────────────────────────────
  /** @param {LNode} n @param {Side} side @param {number} dx @returns {[number, number]} */
  const port = (n, side, dx) => {
    if (side === "top") return [n.x + dx, n.y - n.h / 2];
    if (side === "bottom") return [n.x + dx, n.y + n.h / 2];
    if (side === "left") return [n.x - n.w / 2, n.y];
    return [n.x + n.w / 2, n.y];
  };
  for (const e of frame.edges) {
    // Lane shifts can move branches to the other side of their diamond/merge.
    if (!e.via && e.toSide === "top" && (e.fromSide === "left" || e.fromSide === "right")) {
      const dx = e.to.x - e.from.x;
      e.fromSide = dx < -1 ? "left" : dx > 1 ? "right" : "bottom";
    }
    if (!e.via && e.fromSide === "bottom" && (e.toSide === "left" || e.toSide === "right")) {
      const dx = e.from.x - e.to.x;
      e.toSide = dx < -1 ? "left" : dx > 1 ? "right" : "top";
    }
  }
  // Two branches leaving (or joining) on the same side: the nearer one uses the vertical port.
  for (const [key, other] of /** @type {const} */ ([
    ["from", "to"],
    ["to", "from"],
  ])) {
    const sideKey = key === "from" ? "fromSide" : "toSide";
    /** @type {Map<LNode, LEdge[]>} */
    const byNode = new Map();
    for (const e of frame.edges) {
      if (e.via || (e[sideKey] !== "left" && e[sideKey] !== "right")) continue;
      byNode.set(e[key], [...(byNode.get(e[key]) ?? []), e]);
    }
    for (const list of byNode.values()) {
      for (const side of ["left", "right"]) {
        const same = list.filter((e) => e[sideKey] === side);
        if (same.length < 2 || list.length < 2 || list.some((e) => e[sideKey] === (key === "from" ? "bottom" : "top"))) continue;
        same.sort((p, q) => Math.abs(p[other].x - p[key].x) - Math.abs(q[other].x - q[key].x));
        same[0][sideKey] = key === "from" ? "bottom" : "top";
      }
    }
  }
  for (const e of frame.edges) {
    const a = port(e.from, e.fromSide, e.fromDx);
    const b = port(e.to, e.toSide, e.toDx);
    /** @type {[number, number][]} */
    let pts;
    if (e.via) {
      const vx = e.via.x;
      if (e.fromSide === "bottom") pts = [a, [a[0], a[1] + 14], [vx, a[1] + 14], [vx, b[1]], b];
      else pts = [a, [vx, a[1]], [vx, b[1]], b];
      if (e.toSide === "top") pts = [a, [vx, a[1]], [vx, b[1] - (e.to.kind === "junction" ? 0 : 14)], [b[0], b[1] - (e.to.kind === "junction" ? 0 : 14)], b];
    } else if (e.fromSide === "bottom" && e.toSide === "top") {
      if (Math.abs(a[0] - b[0]) < 1) pts = [a, b];
      else {
        const mid = Math.max(a[1] + 8, b[1] - 14);
        pts = [a, [a[0], mid], [b[0], mid], b];
      }
    } else if (e.toSide === "top") pts = [a, [b[0], a[1]], b];
    else if (e.fromSide === "bottom") pts = [a, [a[0], b[1]], b];
    else pts = [a, [a[0] + (e.fromSide === "right" ? 16 : -16), a[1]], [a[0] + (e.fromSide === "right" ? 16 : -16), b[1]], b];
    e.points = dedupe(pts);
  }

  // Groups become rectangles around their nodes.
  const groups = frame.groups.map((g) => {
    const xs = g.nodes.flatMap((n) => [n.x - n.w / 2, n.x + n.w / 2]);
    const ys = g.nodes.flatMap((n) => [n.y - n.h / 2, n.y + n.h / 2]);
    const x1 = Math.min(...xs, -g.text.width / 2) - 18;
    const x2 = Math.max(...xs, g.text.width / 2) + 18;
    const y1 = Math.min(...ys) - g.text.height - 18;
    const y2 = Math.max(...ys) + 14;
    return { kind: g.kind, text: g.text, fill: g.fill, x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  });

  const height = Math.max(...frame.nodes.map((n) => n.y + n.h / 2), 0) + 24;
  return { nodes: frame.nodes, edges: frame.edges, groups, lanes, laneHeader, height, notes };
}

/**
 * Remove consecutive duplicate points.
 * @param {[number, number][]} pts
 */
function dedupe(pts) {
  /** @type {[number, number][]} */
  const out = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last[0] - p[0]) > 0.5 || Math.abs(last[1] - p[1]) > 0.5) out.push(p);
  }
  return out;
}
