/** @typedef {import("elkjs/lib/elk-api.js").ElkNode} ElkNode */
/** @typedef {import("elkjs/lib/elk-api.js").ElkExtendedEdge} ElkEdge */
/** @typedef {import("elkjs/lib/elk-api.js").ElkPoint} ElkPoint */
/** @typedef {import("elkjs/lib/elk-api.js").ElkShape} ElkShape */
/** @typedef {import("elkjs/lib/elk-api.js").ElkEdgeSection} ElkSection */

// Wrapping runs a second layered layout. Keep it to modest flat graphs even
// when the caller raises the regular parse limits.
const MAX_WRAP_NODES = 128;
const MAX_WRAP_EDGES = 256;
const EPSILON = 1e-6;

/**
 * Prepare an independent input before the regular run, which consumes its
 * argument.
 * @param {ElkNode} graph
 * @param {number} [aspectRatio]
 * @returns {ElkNode | null}
 */
export function wrappingInput(graph, aspectRatio) {
  if (aspectRatio === undefined) return null;
  const { children, edges, layoutOptions } = graph;
  if (
    layoutOptions["elk.algorithm"] !== "layered" ||
    layoutOptions["elk.edgeRouting"] !== "ORTHOGONAL" ||
    children.length > MAX_WRAP_NODES ||
    !edges.length ||
    edges.length > MAX_WRAP_EDGES ||
    children.some((node) => node.children || node.ports) ||
    edges.some((edge) => edge.sources[0] === edge.targets[0])
  ) {
    return null;
  }
  const boundedRatio = Math.max(1 / 32, Math.min(32, aspectRatio));
  // The input consists of plain JSON data, including all nested option objects.
  const wrapped = JSON.parse(JSON.stringify(graph));
  wrapped.layoutOptions["elk.aspectRatio"] = String(boundedRatio);
  wrapped.layoutOptions["elk.layered.wrapping.strategy"] = "MULTI_EDGE";
  return wrapped;
}

/** @param {ElkPoint} a @param {ElkPoint} b */
function samePoint(a, b) {
  return Math.abs(a.x - b.x) < EPSILON && Math.abs(a.y - b.y) < EPSILON;
}

/** @param {ElkShape} box */
function usableBox(box) {
  return (
    box &&
    Number.isFinite(box.x) &&
    Number.isFinite(box.y) &&
    Number.isFinite(box.width) &&
    Number.isFinite(box.height) &&
    Number.isFinite(box.x + box.width) &&
    Number.isFinite(box.y + box.height) &&
    box.width > 0 &&
    box.height > 0
  );
}

/** @param {ElkPoint} p @param {ElkShape} node */
function onBorder(p, node) {
  const x = p.x - node.x;
  const y = p.y - node.y;
  return (
    x >= -EPSILON &&
    y >= -EPSILON &&
    x <= node.width + EPSILON &&
    y <= node.height + EPSILON &&
    (Math.abs(x) < EPSILON ||
      Math.abs(y) < EPSILON ||
      Math.abs(x - node.width) < EPSILON ||
      Math.abs(y - node.height) < EPSILON)
  );
}

/**
 * The graph model represents each binary edge as one polyline. Follow ELK's
 * section chain and reject disconnected or branching output.
 * @param {ElkEdge} edge
 * @returns {ElkSection[] | null}
 */
function orderedSections(edge) {
  const sections = edge.sections;
  if (!Array.isArray(sections) || !sections.length || sections.some((s) => !s)) return null;
  if (sections.length === 1) return sections;
  const byId = new Map(sections.map((s) => [s.id, s]));
  let section = sections.find((s) => s.incomingShape === edge.sources[0]);
  const ordered = [];
  while (section && ordered.length < sections.length) {
    ordered.push(section);
    const outgoing = section.outgoingSections ?? [];
    if (outgoing.length > 1 || (outgoing.length === 1 && !byId.has(outgoing[0]))) return null;
    section = byId.get(outgoing[0]);
  }
  return !section && ordered.length === sections.length ? ordered : null;
}

/** @param {ElkSection} section */
function usableSection(section) {
  if (section.bendPoints != null && !Array.isArray(section.bendPoints)) return false;
  const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
  return points.every(
    (p, i) =>
      p &&
      Number.isFinite(p.x) &&
      Number.isFinite(p.y) &&
      (i === 0 ||
        Math.abs(p.x - points[i - 1].x) < EPSILON ||
        Math.abs(p.y - points[i - 1].y) < EPSILON),
  );
}

/**
 * A failed wrap can omit sections or leave labels at their initial origin.
 * Keep the regular layout unless the alternative preserves every node,
 * connector and label with usable geometry.
 * @param {ElkNode} wrapped
 * @param {ElkNode} normal
 */
export function usableWrapping(wrapped, normal) {
  if (
    wrapped.id !== normal.id ||
    !Array.isArray(wrapped.children) ||
    wrapped.children.length !== normal.children.length ||
    !Array.isArray(wrapped.edges) ||
    wrapped.edges.length !== normal.edges.length ||
    wrapped.children.some((node) => !usableBox(node) || node.children?.length)
  ) {
    return false;
  }
  const nodes = new Map(wrapped.children.map((n) => [n.id, n]));
  for (const node of normal.children) {
    const box = nodes.get(node.id);
    if (
      !box ||
      Math.abs(box.width - node.width) > EPSILON ||
      Math.abs(box.height - node.height) > EPSILON
    ) {
      return false;
    }
  }
  const edges = new Map(wrapped.edges.map((e) => [e?.id, e]));
  for (const expected of normal.edges) {
    const edge = edges.get(expected.id);
    const source = nodes.get(expected.sources[0]);
    const target = nodes.get(expected.targets[0]);
    if (
      !edge ||
      !source ||
      !target ||
      edge.sources?.[0] !== source.id ||
      edge.targets?.[0] !== target.id ||
      (edge.container ?? wrapped.id) !== wrapped.id
    ) {
      return false;
    }
    const sections = orderedSections(edge);
    if (!sections?.every(usableSection)) return false;
    const first = sections[0];
    const last = sections[sections.length - 1];
    if (
      !onBorder(first.startPoint, source) ||
      !onBorder(last.endPoint, target) ||
      (first.incomingShape != null && first.incomingShape !== source.id) ||
      (last.outgoingShape != null && last.outgoingShape !== target.id) ||
      sections.some((s, i) => i > 0 && !samePoint(sections[i - 1].endPoint, s.startPoint))
    ) {
      return false;
    }
    const expectedLabels = expected.labels ?? [];
    const edgeLabels = edge.labels ?? [];
    if (!Array.isArray(edgeLabels) || edgeLabels.length !== expectedLabels.length) return false;
    const labels = new Map(edgeLabels.map((l) => [l?.id, l]));
    for (const label of expectedLabels) {
      const box = labels.get(label.id);
      if (!usableBox(box) || (box.x === 0 && box.y === 0 && (label.x !== 0 || label.y !== 0))) {
        return false;
      }
    }
    edge.sections = sections;
  }
  return true;
}
