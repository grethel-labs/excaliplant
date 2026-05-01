/**
 * @module layout
 *
 * Layout chooses positions for every shape and routes every edge.
 * Component / use-case / deployment diagrams flow through ELK
 * (`elkjs`) using the `layered` algorithm with orthogonal edge
 * routing. After ELK returns we chamfer 90° corners so the result
 * matches Excalidraw's diagonal-corner aesthetic.
 *
 * Sequence diagrams skip ELK entirely — their layout is strictly
 * tabular (lifelines on the X axis, time on the Y axis), so a
 * deterministic ~90-line algorithm produces better, more compact
 * results than a force-directed solver could.
 */

// ELK-based layout & routing.
//
// Replaces the old multi-step pipeline (legacy/layout/step{1..7}*.mjs).
// Strategy:
//   1. Pre-size every Box from its text content (legacy sizing.mjs is
//      reused — text geometry has not changed).
//   2. Hand the entire Diagram to ELK as a hierarchical graph:
//        graph
//        ├─ Plane (compound node, layoutOptions: layered)
//        │   ├─ Box (leaf)               (direct boxes)
//        │   ├─ Subplane (compound node)
//        │   │   └─ Box (leaf)
//        │   └─ Box (leaf)
//        └─ Plane …
//      All connections become edges between leaf nodes; edges that span
//      planes are routed through the common ancestor with
//      `hierarchyHandling: INCLUDE_CHILDREN`.
//   3. Walk the ELK result, write absolute geometry back into the
//      Diagram model: Plane/Subplane/Box `x,y,width,height`; Connection
//      `path[]`, `fromSide`, `toSide`.
//
// The output stays inside the existing Excalidraw renderer's contract
// (orthogonal polylines, no wobble, planes/subplanes/boxes are
// rectangles, etc.).

import ELK from "elkjs/lib/elk.bundled.js";
import { Box, Plane, Subplane, SequenceDiagram } from "../model/diagram.mjs";
import { sizeDiagram, SIZING } from "./sizing.mjs";
import { layoutSequenceDiagram } from "./sequence_layout.mjs";

const elk = new ELK();

// ELK layout options. These are tuned for many-node, many-edge,
// hierarchical compound layouts with orthogonal edge routing — i.e.
// what we have. See https://eclipse.dev/elk/reference/options.html
const ROOT_OPTIONS = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.hierarchyHandling": "INCLUDE_CHILDREN",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
  "elk.layered.crossingMinimization.semiInteractive": "true",
  "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
  "elk.layered.nodePlacement.bk.fixedAlignment": "BALANCED",
  "elk.layered.spacing.nodeNodeBetweenLayers": "60",
  "elk.spacing.nodeNode": "30",
  "elk.spacing.edgeNode": "20",
  "elk.spacing.edgeEdge": "12",
  "elk.spacing.edgeNodeBetweenLayers": "20",
  "elk.spacing.edgeEdgeBetweenLayers": "12",
  "elk.padding": "[top=24,left=24,bottom=24,right=24]",
};

const PLANE_OPTIONS = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.padding": `[top=${SIZING.planeTitleHeight + SIZING.planePaddingY},left=${SIZING.planePaddingX},bottom=${SIZING.planePaddingY},right=${SIZING.planePaddingX}]`,
  "elk.layered.spacing.nodeNodeBetweenLayers": "50",
  "elk.spacing.nodeNode": "24",
};

const SUBPLANE_OPTIONS = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.padding": `[top=${SIZING.subplaneTitleHeight + SIZING.subplanePaddingY},left=${SIZING.subplanePaddingX},bottom=${SIZING.subplanePaddingY},right=${SIZING.subplanePaddingX}]`,
  "elk.layered.spacing.nodeNodeBetweenLayers": "40",
  "elk.spacing.nodeNode": "16",
};

export async function layoutDiagram(diagram) {
  // Sequence diagrams use a separate, deterministic tabular layout.
  if (diagram instanceof SequenceDiagram) {
    return layoutSequenceDiagram(diagram);
  }

  // Step 1: text-based box sizing.
  sizeDiagram(diagram);

  // Step 2: build the ELK graph.
  const graph = buildElkGraph(diagram);

  // Step 3: run ELK.
  const result = await elk.layout(graph);

  // Step 4: write geometry back.
  applyElkResult(diagram, result);

  // Step 5: chamfer 90° corners where it doesn't introduce conflicts.
  chamferAllCorners(diagram);
  return diagram;
}

function buildElkGraph(diagram) {
  const root = {
    id: "__root",
    layoutOptions: ROOT_OPTIONS,
    children: [],
    edges: [],
  };

  const nodeById = new Map();          // box.id / plane.id / subplane.id -> elk node ref
  const containerOfBox = new Map();    // box.id -> elk node that holds the box
  const planeOfBox = new Map();        // box.id -> plane elk node
  const subplaneOfBox = new Map();     // box.id -> subplane elk node (or null)

  for (const plane of diagram.planes) {
    const planeNode = {
      id: `plane:${plane.id}`,
      layoutOptions: { ...PLANE_OPTIONS },
      children: [],
      edges: [],
      labels: [{ text: plane.title || plane.id }],
    };
    root.children.push(planeNode);
    nodeById.set(plane.id, planeNode);

    for (const child of plane.children) {
      if (child instanceof Subplane) {
        const subNode = {
          id: `sub:${child.id}`,
          layoutOptions: { ...SUBPLANE_OPTIONS },
          children: [],
          edges: [],
          labels: [{ text: child.title || child.id }],
        };
        planeNode.children.push(subNode);
        nodeById.set(child.id, subNode);
        for (const box of child.boxes) {
          const boxNode = boxToElkNode(box);
          subNode.children.push(boxNode);
          nodeById.set(box.id, boxNode);
          containerOfBox.set(box.id, subNode);
          planeOfBox.set(box.id, planeNode);
          subplaneOfBox.set(box.id, subNode);
        }
      } else if (child instanceof Box) {
        const boxNode = boxToElkNode(child);
        planeNode.children.push(boxNode);
        nodeById.set(child.id, boxNode);
        containerOfBox.set(child.id, planeNode);
        planeOfBox.set(child.id, planeNode);
        subplaneOfBox.set(child.id, null);
      }
    }
  }

  // Place each edge on the lowest common ancestor of its endpoints so
  // ELK reports the edge coordinates in that ancestor's local frame —
  // and applyElkResult can find them with the correct offset.
  for (const conn of diagram.connections) {
    const fromSub = subplaneOfBox.get(conn.from.id);
    const toSub = subplaneOfBox.get(conn.to.id);
    const fromPlane = planeOfBox.get(conn.from.id);
    const toPlane = planeOfBox.get(conn.to.id);
    let host;
    if (fromSub && fromSub === toSub) host = fromSub;
    else if (fromPlane === toPlane) host = fromPlane;
    else host = root;
    host.edges.push({
      id: conn.id,
      sources: [`box:${conn.from.id}`],
      targets: [`box:${conn.to.id}`],
    });
  }

  return root;
}

function boxToElkNode(box) {
  return {
    id: `box:${box.id}`,
    width: box.width,
    height: box.height,
    labels: [{ text: box.title || box.id }],
    layoutOptions: {
      "elk.portConstraints": "FREE",
    },
  };
}

function applyElkResult(diagram, root) {
  // ELK gives positions relative to each parent. We need absolute
  // coordinates for the Diagram model, so we walk the tree.
  const absolute = new Map(); // node.id -> { x, y, width, height }

  function walk(node, ox, oy) {
    const ax = ox + (node.x || 0);
    const ay = oy + (node.y || 0);
    absolute.set(node.id, { x: ax, y: ay, width: node.width, height: node.height });
    if (node.children) {
      for (const child of node.children) walk(child, ax, ay);
    }
  }
  walk(root, 0, 0);

  for (const plane of diagram.planes) {
    const r = absolute.get(`plane:${plane.id}`);
    if (r) Object.assign(plane, { x: r.x, y: r.y, width: r.width, height: r.height });
    for (const child of plane.children) {
      if (child instanceof Subplane) {
        const sr = absolute.get(`sub:${child.id}`);
        if (sr) Object.assign(child, { x: sr.x, y: sr.y, width: sr.width, height: sr.height });
        for (const box of child.boxes) {
          const br = absolute.get(`box:${box.id}`);
          if (br) Object.assign(box, { x: br.x, y: br.y, width: br.width, height: br.height });
        }
      } else if (child instanceof Box) {
        const br = absolute.get(`box:${child.id}`);
        if (br) Object.assign(child, { x: br.x, y: br.y, width: br.width, height: br.height });
      }
    }
  }

  // Edges: ELK places the routed edge under whichever container is the
  // edge's parent (with INCLUDE_CHILDREN that's the root). Sections give
  // start/end and bend points in the parent's local coordinate system.
  // Collect all edges by id from the tree.
  const edgesById = new Map();
  function collectEdges(node, ox, oy) {
    const ax = ox + (node.x || 0);
    const ay = oy + (node.y || 0);
    if (node.edges) {
      for (const edge of node.edges) edgesById.set(edge.id, { edge, ox: ax, oy: ay });
    }
    if (node.children) for (const child of node.children) collectEdges(child, ax, ay);
  }
  collectEdges(root, 0, 0);

  for (const conn of diagram.connections) {
    const entry = edgesById.get(conn.id);
    if (!entry) {
      conn.path = [];
      continue;
    }
    const { edge, ox, oy } = entry;
    const sections = edge.sections || [];
    const path = [];
    for (let i = 0; i < sections.length; i++) {
      const s = sections[i];
      if (i === 0) path.push({ x: ox + s.startPoint.x, y: oy + s.startPoint.y });
      if (s.bendPoints) {
        for (const bp of s.bendPoints) path.push({ x: ox + bp.x, y: oy + bp.y });
      }
      path.push({ x: ox + s.endPoint.x, y: oy + s.endPoint.y });
    }
    conn.path = snapOrthogonal(dedupe(path));
    // Best-effort fromSide / toSide from first/last segment direction.
    [conn.fromSide, conn.toSide] = inferSides(conn);
  }
}

// ELK can return slightly offset stub segments (e.g. y=197.5 → y=198)
// when a port lies on a fractional boundary. Snap each segment to be
// strictly horizontal / vertical so Excalidraw renders crisp arrows.
function snapOrthogonal(points) {
  if (points.length < 2) return points;
  const out = [{ x: Math.round(points[0].x), y: Math.round(points[0].y) }];
  for (let i = 1; i < points.length; i++) {
    const prev = out[out.length - 1];
    let { x, y } = points[i];
    x = Math.round(x);
    y = Math.round(y);
    const dx = Math.abs(x - prev.x);
    const dy = Math.abs(y - prev.y);
    if (dx >= dy) y = prev.y; // dominant horizontal
    else x = prev.x;          // dominant vertical
    if (x === prev.x && y === prev.y) continue;
    out.push({ x, y });
  }
  return out;
}

function dedupe(points) {
  const out = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last.x - p.x) > 0.5 || Math.abs(last.y - p.y) > 0.5) {
      out.push(p);
    }
  }
  return out;
}

function inferSides(conn) {
  const path = conn.path;
  if (!path || path.length < 2) return [null, null];
  const first = path[0];
  const second = path[1];
  const last = path[path.length - 1];
  const prev = path[path.length - 2];
  const fromSide = sideOf(conn.from, first, second);
  const toSide = sideOf(conn.to, last, prev);
  return [fromSide, toSide];
}

function sideOf(box, endpoint, neighbour) {
  // Decide which side of the box this endpoint is on. Prefer the
  // direction toward the neighbour point: if neighbour is to the right
  // of the endpoint, the edge leaves to the right, so the port is on
  // the right side. Fall back to which box edge `endpoint` lies on.
  if (neighbour) {
    const dx = neighbour.x - endpoint.x;
    const dy = neighbour.y - endpoint.y;
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
    if (Math.abs(dy) > 0) return dy > 0 ? "bottom" : "top";
  }
  const eps = 1.0;
  if (Math.abs(endpoint.x - box.x) <= eps) return "left";
  if (Math.abs(endpoint.x - (box.x + box.width)) <= eps) return "right";
  if (Math.abs(endpoint.y - box.y) <= eps) return "top";
  if (Math.abs(endpoint.y - (box.y + box.height)) <= eps) return "bottom";
  return null;
}

// ---------------------------------------------------------------------------
// Chamfering
// ---------------------------------------------------------------------------
//
// Replace selected 90° corners by 45° diagonals. A corner (prev → v → next)
// is replaced by (prev → a → b → next) with `a` on the incoming and `b`
// on the outgoing segment, both at distance `c` from `v`. A chamfer is
// only applied when ALL of the following hold:
//
//   1. The corner is a real 90° turn (one neighbour horizontal, the
//      other vertical).
//   2. Both neighbouring segments are at least 2·c long (so a/b lie
//      strictly inside their segments and a follow-up corner does not
//      overlap).
//   3. The new diagonal does not enter any box's interior.
//   4. The new diagonal does not properly intersect any orthogonal
//      segment of any other connection (or any non-adjacent segment of
//      this connection).
//   5. The new diagonal does not touch / cross / lie within 2 px of any
//      already-accepted chamfer diagonal.
//
// Greedy: try c ∈ {12, 10, 8, 6, 4} in that order and accept the first
// candidate that satisfies all conditions.

const CHAMFER_SIZES = [12, 10, 8, 6, 4];
const DIAG_SAFETY = 2;        // min distance to other diagonals
const BOX_PAD = 1;            // shrink box rect when checking interior

function chamferAllCorners(diagram) {
  const accepted = []; // [{a, b}]
  const boxes = diagram.allBoxes();

  // Pre-collect axis-aligned segments per connection so the conflict
  // test can skip the two segments that are adjacent to the corner
  // being chamfered (which are about to be shortened anyway).
  const segsByConn = new Map();
  for (const conn of diagram.connections) {
    const segs = [];
    for (let i = 0; i < (conn.path?.length ?? 0) - 1; i++) {
      segs.push({ a: conn.path[i], b: conn.path[i + 1] });
    }
    segsByConn.set(conn.id, segs);
  }

  for (const conn of diagram.connections) {
    const path = conn.path;
    if (!path || path.length < 3) continue;
    const out = [path[0]];
    let segIndex = 0; // index into segsByConn (incoming segment of this corner)
    for (let i = 1; i < path.length - 1; i++) {
      const prev = out[out.length - 1];
      const v = path[i];
      const next = path[i + 1];
      const inHoriz = Math.abs(prev.y - v.y) < 0.5 && Math.abs(prev.x - v.x) > 0.5;
      const outHoriz = Math.abs(v.y - next.y) < 0.5 && Math.abs(v.x - next.x) > 0.5;
      const inVert = Math.abs(prev.x - v.x) < 0.5 && Math.abs(prev.y - v.y) > 0.5;
      const outVert = Math.abs(v.x - next.x) < 0.5 && Math.abs(v.y - next.y) > 0.5;
      const isCorner = (inHoriz && outVert) || (inVert && outHoriz);
      if (!isCorner) {
        out.push(v);
        segIndex++;
        continue;
      }
      const inLen = Math.hypot(v.x - prev.x, v.y - prev.y);
      const outLen = Math.hypot(next.x - v.x, next.y - v.y);

      let chosen = null;
      for (const c of CHAMFER_SIZES) {
        if (c * 2 > inLen || c * 2 > outLen) continue;
        const a = pointAtDist(v, prev, c);
        const b = pointAtDist(v, next, c);
        if (chamferConflicts(a, b, conn, segIndex, segsByConn, accepted, boxes)) continue;
        chosen = { a, b };
        break;
      }
      if (chosen) {
        out.push(chosen.a, chosen.b);
        accepted.push(chosen);
      } else {
        out.push(v);
      }
      segIndex++;
    }
    out.push(path[path.length - 1]);
    conn.path = out;
  }
}

function pointAtDist(from, toward, dist) {
  const len = Math.hypot(toward.x - from.x, toward.y - from.y);
  const t = dist / len;
  return { x: from.x + (toward.x - from.x) * t, y: from.y + (toward.y - from.y) * t };
}

function chamferConflicts(a, b, conn, segIndex, segsByConn, accepted, boxes) {
  // 3. Box interior: check both endpoints + a few sample points along
  //    the diagonal. Endpoints lie on existing orthogonal segments that
  //    were already box-clear, so this primarily protects against
  //    cutting through a box that sits in the corner pocket.
  for (const box of boxes) {
    if (segmentEntersBox(a, b, box)) return true;
  }
  // 4. Orthogonal segments. Skip the two segments adjacent to this
  //    corner (segIndex and segIndex+1) on this connection, since we
  //    are replacing them with shortened versions.
  for (const [cid, segs] of segsByConn) {
    for (let i = 0; i < segs.length; i++) {
      if (cid === conn.id && (i === segIndex || i === segIndex + 1)) continue;
      const s = segs[i];
      if (properIntersect(a, b, s.a, s.b)) return true;
    }
  }
  // 5. Other accepted diagonals: no crossing AND min distance.
  for (const d of accepted) {
    if (segmentsClose(a, b, d.a, d.b, DIAG_SAFETY)) return true;
  }
  return false;
}

function segmentEntersBox(a, b, box) {
  const x0 = box.x + BOX_PAD;
  const y0 = box.y + BOX_PAD;
  const x1 = box.x + box.width - BOX_PAD;
  const y1 = box.y + box.height - BOX_PAD;
  // Reject if either endpoint is strictly inside.
  if (a.x > x0 && a.x < x1 && a.y > y0 && a.y < y1) return true;
  if (b.x > x0 && b.x < x1 && b.y > y0 && b.y < y1) return true;
  // Test against the four box edges.
  const corners = [
    { x: x0, y: y0 }, { x: x1, y: y0 },
    { x: x1, y: y1 }, { x: x0, y: y1 },
  ];
  for (let i = 0; i < 4; i++) {
    if (properIntersect(a, b, corners[i], corners[(i + 1) % 4])) return true;
  }
  return false;
}

function properIntersect(p1, p2, p3, p4) {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-9) return false;
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  const eps = 1e-3;
  return t > eps && t < 1 - eps && u > eps && u < 1 - eps;
}

// True iff the two segments come within `tol` of each other anywhere.
function segmentsClose(a1, a2, b1, b2, tol) {
  // Crossing → distance 0.
  const d = (a2.x - a1.x) * (b2.y - b1.y) - (a2.y - a1.y) * (b2.x - b1.x);
  if (Math.abs(d) > 1e-9) {
    const t = ((b1.x - a1.x) * (b2.y - b1.y) - (b1.y - a1.y) * (b2.x - b1.x)) / d;
    const u = ((b1.x - a1.x) * (a2.y - a1.y) - (b1.y - a1.y) * (a2.x - a1.x)) / d;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return true;
  }
  // Otherwise: minimum endpoint→segment distance.
  const dists = [
    pointSegDist(a1, b1, b2),
    pointSegDist(a2, b1, b2),
    pointSegDist(b1, a1, a2),
    pointSegDist(b2, a1, a2),
  ];
  return Math.min(...dists) < tol;
}

function pointSegDist(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
