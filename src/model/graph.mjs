/**
 * Graph model shared by node/edge diagrams (class, object, component,
 * deployment, use case, state, ArchiMate, ER, DOT, legacy activity).
 *
 * The model is format-agnostic: it knows shapes and roles by name but nothing
 * about Excalidraw or SVG. Layout fields start at zero and are filled in by
 * the layout pass.
 * @module model/graph
 */

import { createMeta } from "../syntax/commons.mjs";

/**
 * A class-like compartment row.
 * @typedef {object} Member
 * @property {string} text Display text (visibility stripped).
 * @property {"+" | "-" | "#" | "~" | null} visibility
 * @property {boolean} isStatic
 * @property {boolean} isAbstract
 * @property {boolean} isMethod
 */

/**
 * @typedef {object} Compartment
 * @property {string | null} title Optional separator title (`-- title --`).
 * @property {"line" | "dashed" | "dotted" | "double"} separator
 * @property {Member[]} members
 */

/** @public */
export class GraphNode {
  /**
   * @param {string} id
   * @param {Record<string, any>} [init]
   */
  constructor(id, init = {}) {
    /** Stable identifier. */
    this.id = id;
    /** Display label (creole allowed). */
    this.label = init.label ?? id;
    /** Shape name from {@link import("../draw/shapes.mjs").SHAPES} or `class` / `container`. */
    this.shape = init.shape ?? "rectangle";
    /** Theme role. */
    this.role = init.role ?? "default";
    /** PlantUML keyword used to declare the node (`class`, `component`, …). */
    this.keyword = init.keyword ?? "";
    /** @type {string[]} */
    this.stereotypes = init.stereotypes ?? [];
    /** @type {import("../syntax/color.mjs").ColorSpec} */
    this.colors = init.colors ?? {};
    /** @type {string | null} */
    this.link = init.link ?? null;
    /** @type {GraphNode | null} */
    this.parent = init.parent ?? null;
    /** @type {GraphNode[]} */
    this.children = [];
    /** Whether the node is drawn as a container around its children. */
    this.container = init.container ?? false;
    /** Class-like header extras. */
    this.classHeader = init.classHeader ?? null;
    /** @type {Compartment[]} */
    this.compartments = init.compartments ?? [];
    /** Long description under the label (deployment `[...]` bodies, state descriptions). */
    this.description = init.description ?? "";
    /** Hidden nodes are laid out but not drawn. */
    this.hidden = false;
    /** Removed nodes are neither laid out nor drawn. */
    this.removed = false;
    /** Arbitrary per-module data. */
    this.data = init.data ?? {};
    // layout
    this.x = 0;
    this.y = 0;
    this.width = 0;
    this.height = 0;
    /** Header height reserved inside containers. */
    this.headerHeight = 0;
  }

  /** @returns {number} Nesting depth (0 = top level). */
  get depth() {
    let d = 0;
    for (let p = this.parent; p; p = p.parent) d++;
    return d;
  }
}

/** @public */
export class GraphEdge {
  /**
   * @param {string} id
   * @param {string} from
   * @param {string} to
   * @param {Record<string, any>} [init]
   */
  constructor(id, from, to, init = {}) {
    this.id = id;
    this.from = from;
    this.to = to;
    /** @type {string | null} */
    this.startHead = init.startHead ?? null;
    /** @type {string | null} */
    this.endHead = init.endHead ?? null;
    /** @type {"solid" | "dashed" | "dotted"} */
    this.lineStyle = init.lineStyle ?? "solid";
    this.bold = init.bold ?? false;
    this.hidden = init.hidden ?? false;
    /** @type {string | null} */
    this.color = init.color ?? null;
    /** @type {number | null} */
    this.thickness = init.thickness ?? null;
    /** @type {string | null} */
    this.label = init.label ?? null;
    /** @type {string | null} */
    this.fromLabel = init.fromLabel ?? null;
    /** @type {string | null} */
    this.toLabel = init.toLabel ?? null;
    /** @type {"up" | "down" | "left" | "right" | null} */
    this.direction = init.direction ?? null;
    /** Arrow body length (1 = short). */
    this.length = init.length ?? 2;
    /** Role used for colours. */
    this.role = init.role ?? "edge";
    /** Arbitrary per-module data. */
    this.data = init.data ?? {};
    // layout
    /** @type {[number, number][]} */
    this.points = [];
    /** @type {{ x: number, y: number, width: number, height: number } | null} */
    this.labelBox = null;
    /** @type {{ x: number, y: number, width: number, height: number } | null} */
    this.fromLabelBox = null;
    /** @type {{ x: number, y: number, width: number, height: number } | null} */
    this.toLabelBox = null;
  }
}

/** @public */
export class GraphModel {
  /** @param {string} kind */
  constructor(kind) {
    this.kind = kind;
    this.meta = createMeta();
    /** @type {Map<string, GraphNode>} */
    this.nodes = new Map();
    /** Additional names (display labels) resolving to node ids. */
    /** @type {Map<string, string>} */
    this.aliases = new Map();
    /** @type {GraphEdge[]} */
    this.edges = [];
    this.edgeSeq = 0;
    /** Layout direction requested by the diagram. */
    /** @type {"TB" | "LR"} */
    this.direction = "TB";
    /** Layout width/height after layout. */
    this.width = 0;
    this.height = 0;
  }

  /**
   * Find a node by id or alias.
   * @param {string} name
   * @returns {GraphNode | undefined}
   */
  find(name) {
    return this.nodes.get(name) ?? this.nodes.get(this.aliases.get(name) ?? "");
  }

  /**
   * Add a node (or return the existing one with the same id).
   * @param {string} id
   * @param {Record<string, any>} [init]
   * @returns {GraphNode}
   */
  add(id, init = {}) {
    const existing = this.find(id);
    if (existing) return existing;
    const node = new GraphNode(id, init);
    this.nodes.set(id, node);
    if (init.parent) init.parent.children.push(node);
    if (node.label && node.label !== id && !this.aliases.has(node.label)) this.aliases.set(node.label, id);
    return node;
  }

  /**
   * Move a node under a new parent.
   * @param {GraphNode} node
   * @param {GraphNode | null} parent
   */
  reparent(node, parent) {
    if (node.parent === parent || node === parent) return;
    if (node.parent) node.parent.children = node.parent.children.filter((c) => c !== node);
    node.parent = parent;
    if (parent) parent.children.push(node);
  }

  /**
   * @param {string} from
   * @param {string} to
   * @param {Record<string, any>} [init]
   * @returns {GraphEdge}
   */
  connect(from, to, init = {}) {
    const edge = new GraphEdge(`e${this.edgeSeq++}`, from, to, init);
    this.edges.push(edge);
    return edge;
  }

  /** @returns {GraphNode[]} Top-level nodes in declaration order. */
  roots() {
    return [...this.nodes.values()].filter((n) => !n.parent);
  }
}
