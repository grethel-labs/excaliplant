// Mutable parsing context for component-style diagrams.
//
// All component plugins receive an instance of this and use its
// helpers; this keeps plugins free of cross-cutting state management.

import { Box, Connection, Diagram, Plane, Subplane } from "../../general/model/diagram.mjs";
import { planeColor, subplaneColor } from "../../general/style/colors.mjs";

/**
 * Construct the mutable parsing context that component plugins share
 * during a single `parsePlantUml` invocation. The returned object
 * exposes high-level helpers (`addBox`, `openContainer`, …) so that
 * plugins never touch the model classes directly.
 *
 * @returns {{
 *   readonly result: import("../../general/model/diagram.mjs").Diagram,
 *   diagram:         import("../../general/model/diagram.mjs").Diagram,
 *   boxes:           Map<string, import("../../general/model/diagram.mjs").Box>,
 *   setTitle(t: string): void,
 *   openContainer(spec: { id: string, title: string, kind: string }): void,
 *   closeContainer(): void,
 *   addBox(spec: object): import("../../general/model/diagram.mjs").Box,
 *   queueConnection(spec: object): void,
 *   queueBoxLink(spec: object): void,
 *   queueNote(spec: object): void,
 *   queueLinkNote(spec: object): void,
 *   setGraphStyle(key: keyof import("../../general/model/diagram.mjs").Diagram["style"], value: string): void,
 *   addPort(spec: object): void,
 *   removeBox(id: string): void,
 *   queueFilter(spec: object): void,
 *   setAutoVivifyConnections(enabled: boolean, shape?: string): void,
 *   nextNoteId(): string,
 *   finalize(): void,
 * }}
 * @public
 */
export function createComponentContext() {
  const diagram = new Diagram();
  /** @type {Array<{kind:'plane', plane:Plane, id:string} | {kind:'subplane', subplane:Subplane, id:string}>} */
  const stack = [];
  const planes = new Map();
  const subplanes = new Map();
  const boxes = new Map();
  /** @type {any[]} */
  const pendingConnections = [];
  /** @type {any[]} */
  const pendingBoxLinks = [];
  /** @type {any[]} */
  const pendingNotes = [];
  /** @type {any[]} */
  const pendingPorts = [];
  /** @type {Set<string>} */
  const removedIds = new Set();
  /** @type {any[]} */
  const pendingFilters = [];
  let autoVivifyConnections = false;
  let autoVivifyShape = "class";
  /** @type {Plane | null} */
  let floatingPlane = null;

  let noteCounter = 0;

  const ensureFloatingPlane = () => {
    if (floatingPlane) return floatingPlane;
    floatingPlane = new Plane({
      id: "__floating__",
      title: "",
      color: planeColor("__floating__"),
      kind: "package",
    });
    diagram.addPlane(floatingPlane);
    planes.set("__floating__", floatingPlane);
    return floatingPlane;
  };

  const findPlane = () => {
    for (let i = stack.length - 1; i >= 0; i--) {
      const entry = stack[i];
      if (entry.kind === "plane") return entry.plane;
    }
    return null;
  };

  /**
   * Resolve PlantUML filter targets used by `remove`: exact ids, quoted ids,
   * wildcard suffixes (`Foo*`) and stereotype/tag forms (`$tag`, `<<tag>>`).
   * @param {string} raw
   * @returns {string[]}
   */
  const idsMatchingFilterTarget = (raw) => {
    const target = String(raw || "").trim();
    if (!target) return [];
    if (target === "*") return [...boxes.keys()];
    if (/^@?unlinked$/i.test(target)) return [];
    if (target.startsWith('"') && target.endsWith('"')) return [target.slice(1, -1)];
    const stereo = target.match(/^<<\s*([^>]+?)\s*>>$/);
    const tag = stereo?.[1] || (target.startsWith("$") ? target.slice(1) : "");
    if (tag) {
      return [...boxes.values()]
        .filter((box) =>
          String(box.stereotype || "")
            .split(/[,\s]+/)
            .some((part) => part.replace(/^<<|>>$/g, "") === tag),
        )
        .map((box) => box.id);
    }
    if (target.endsWith("*")) {
      const prefix = target.slice(0, -1);
      return [...boxes.keys()].filter((id) => id.startsWith(prefix));
    }
    return [target];
  };

  const ctx = {
    get result() {
      return diagram;
    },
    diagram,
    boxes,

    /**
     * Set the diagram's title (from a top-level `title` line).
     * @param {string} t Raw title text.
     */
    setTitle(/** @type {string} */ t) {
      diagram.title = t;
    },

    /**
     * Begin a new container (plane or subplane depending on nesting).
     * @param {{id:string,title:string,kind:string}} spec Container metadata.
     */
    openContainer(/** @type {{id:string,title:string,kind:string}} */ { id, title, kind }) {
      if (stack.length === 0) {
        const plane = new Plane({ id, title, color: planeColor(id), kind });
        diagram.addPlane(plane);
        planes.set(id, plane);
        stack.push({ kind: "plane", plane, id });
      } else {
        // findPlane is non-null here because the first stack entry
        // is always a plane (openContainer with empty stack pushes one).
        const parentPlane = /** @type {Plane} */ (findPlane() ?? ensureFloatingPlane());
        const sub = new Subplane({ id, title, kind });
        if (parentPlane.color) sub.color = subplaneColor(parentPlane.color);
        parentPlane.addSubplane(sub);
        subplanes.set(id, sub);
        stack.push({ kind: "subplane", subplane: sub, id });
      }
    },

    /** Close the most recently opened container, restoring the previous nesting level. */
    closeContainer() {
      stack.pop();
    },

    /**
     * Add a box to the current container (or to a synthesised floating
     * plane if no container is open).
     * @param {{id:string,title:string,description?:string,shape?:string,stereotype?:string,members?:string[],link?:string,tooltip?:string}} spec Box specification.
     * @returns {Box} The newly-created (or pre-existing) box.
     */
    addBox(
      /** @type {{id:string,title:string,description?:string,shape?:string,stereotype?:string,members?:string[],link?:string,tooltip?:string}} */ {
        id,
        title,
        description = "",
        shape = "rectangle",
        stereotype = "",
        members = [],
        link = "",
        tooltip = "",
      },
    ) {
      if (boxes.has(id)) {
        const existing = boxes.get(id);
        if (title && (!existing.title || existing.title === existing.id)) existing.title = title;
        if (description && !existing.description) existing.description = description;
        if (shape && (!existing.shape || existing.shape === "rectangle")) existing.shape = shape;
        if (stereotype && !existing.stereotype) existing.stereotype = stereotype;
        if (members.length && !existing.members.length) existing.members = [...members];
        if (link && !existing.link) existing.link = link;
        if (tooltip && !existing.tooltip) existing.tooltip = tooltip;
        return existing;
      }
      const box = new Box({ id, title, description, shape, stereotype, members, link, tooltip });
      boxes.set(id, box);
      if (stack.length === 0) {
        ensureFloatingPlane().addBox(box);
        return box;
      }
      const top = stack[stack.length - 1];
      if (top.kind === "subplane") top.subplane.addBox(box);
      else top.plane.addBox(box);
      return box;
    },

    /**
     * Defer a connection until {@link finalize} runs (so endpoint boxes
     * can be referenced before they are declared).
     * @param {any} spec Plugin-specific connection record.
     */
    queueConnection(/** @type {any} */ spec) {
      pendingConnections.push(spec);
    },
    /**
     * Defer a `url of <box> is ...` declaration until all boxes and
     * eligible auto-vivified endpoints are known.
     * @param {any} spec Plugin-specific link record.
     */
    queueBoxLink(/** @type {any} */ spec) {
      pendingBoxLinks.push(spec);
    },
    /**
     * Defer a `note on link` declaration until {@link finalize} runs.
     * @param {any} spec Plugin-specific note record.
     */
    queueNote(/** @type {any} */ spec) {
      pendingNotes.push(spec);
    },
    /**
     * Defer a `note on link` declaration until the most recent pending
     * connection is resolved.
     * @param {any} spec Plugin-specific link-note record.
     */
    queueLinkNote(/** @type {any} */ spec) {
      const target = pendingConnections[pendingConnections.length - 1];
      if (!target) return;
      if (!target.linkNotes) target.linkNotes = [];
      target.linkNotes.push(spec);
    },
    /**
     * Store a sanitized graph-level renderer style hint.
     * @param {keyof import("../../general/model/diagram.mjs").Diagram["style"]} key Style field.
     * @param {string} value Sanitized colour token.
     */
    setGraphStyle(
      /** @type {keyof import("../../general/model/diagram.mjs").Diagram["style"]} */ key,
      /** @type {string} */ value,
    ) {
      if (!value) return;
      diagram.style[key] = value;
    },
    /**
     * Defer a component port declaration until endpoint boxes are known.
     * @param {any} spec Plugin-specific port record.
     */
    addPort(/** @type {any} */ spec) {
      pendingPorts.push(spec);
    },
    /**
     * Remove a box and any connections that mention it. The actual
     * pruning happens in finalize so removals can appear before or
     * after declarations.
     * @param {string} id Box id or alias.
     */
    removeBox(/** @type {string} */ id) {
      removedIds.add(id);
    },
    /**
     * Record a hide/show command for downstream behaviour.
     * @param {any} spec Filter command record.
     */
    queueFilter(/** @type {any} */ spec) {
      pendingFilters.push(spec);
    },
    /**
     * Enable PlantUML-style implicit class declarations for connection
     * endpoints. Kept opt-in so component/deployment diagrams still require
     * explicit boxes for generic connections.
     * @param {boolean} enabled
     * @param {string} [shape]
     */
    setAutoVivifyConnections(
      /** @type {boolean} */ enabled,
      /** @type {string} */ shape = "class",
    ) {
      autoVivifyConnections = enabled;
      autoVivifyShape = shape || "class";
    },
    /** @returns {string} Fresh unique note id. */
    nextNoteId() {
      return `note_${noteCounter++}`;
    },

    finalize() {
      for (const filter of pendingFilters) {
        if (filter.command === "remove") {
          for (const id of idsMatchingFilterTarget(filter.target)) removedIds.add(id);
        }
        if (filter.command === "hide" && /^empty\s+members$/i.test(filter.target)) {
          diagram.hideEmptyMembers = true;
        }
        if (
          (filter.command === "show" || filter.command === "restore") &&
          /^empty\s+members$/i.test(filter.target)
        ) {
          diagram.hideEmptyMembers = false;
        }
      }
      // Auto-vivify endpoints for connections that explicitly opted in
      // (currently: class-diagram inheritance/realisation edges queued
      // by `classBlockPlugin` for headers like
      // `class Child extends Parent`, where the parent is implicitly
      // declared). Generic component-style connections (`A --> B`) do
      // *not* opt in, so the long-standing behaviour of dropping edges
      // to undeclared boxes is preserved. Bracket/paren/quoted shorthand
      // references (`[A]`, `(B)`, `"C"`) also never auto-vivify.
      const ensureEndpoint = (
        /** @type {string} */ id,
        /** @type {boolean} */ shorthand,
        /** @type {boolean} */ allowVivify,
      ) => {
        const existing = boxes.get(id);
        if (existing) return existing;
        if (shorthand || !(allowVivify || autoVivifyConnections)) return null;
        const box = new Box({ id, title: id, shape: autoVivifyShape });
        boxes.set(id, box);
        ensureFloatingPlane().addBox(box);
        return box;
      };
      const ensureBoxPort = (
        /** @type {Box} */ box,
        /** @type {string} */ portId,
        /** @type {"top"|"right"|"bottom"|"left"} */ side,
        /** @type {string} */ direction = "port",
      ) => {
        const list = box.ports[side];
        const existing = list.find((port) => port.id === portId);
        if (existing) return existing;
        const port = { id: portId, title: portId, side, direction };
        list.push(port);
        return port;
      };
      for (const port of pendingPorts) {
        if (removedIds.has(port.boxId)) continue;
        const box = boxes.get(port.boxId);
        if (!box) continue;
        ensureBoxPort(box, port.portId, port.side || "right", port.direction || "port");
      }
      // Resolve connections.
      for (const c of pendingConnections) {
        if (c.hidden) continue;
        if (removedIds.has(c.fromId) || removedIds.has(c.toId)) continue;
        const fromBox = ensureEndpoint(c.fromId, !!c.fromShorthand, !!c.allowVivify);
        const toBox = ensureEndpoint(c.toId, !!c.toShorthand, !!c.allowVivify);
        if (!fromBox || !toBox || fromBox === toBox) continue;
        const [from, to] = c.reversed ? [toBox, fromBox] : [fromBox, toBox];
        const [startAh, endAh] = c.reversed
          ? [c.endArrowhead, c.startArrowhead]
          : [c.startArrowhead, c.endArrowhead];
        const [startPort, endPort] = c.reversed
          ? [c.toPort || "", c.fromPort || ""]
          : [c.fromPort || "", c.toPort || ""];
        const [fromMul, toMul] = c.reversed
          ? [c.toMul || "", c.fromMul || ""]
          : [c.fromMul || "", c.toMul || ""];
        if (startPort) ensureBoxPort(from, startPort, "right", "out");
        if (endPort) ensureBoxPort(to, endPort, "left", "in");
        const connection = new Connection({
          id: `${c.fromId}->${c.toId}#${diagram.connections.length}`,
          from,
          to,
          label: c.label,
          kind: c.kind,
          dashed: c.dashed,
          startArrowhead: startAh,
          endArrowhead: endAh,
          directionHint: c.directionHint,
          fromMul,
          toMul,
          link: c.link || "",
          tooltip: c.tooltip || "",
        });
        if (startPort) {
          connection.arrow.start.anchor = "port";
          connection.arrow.start.label = fromMul || startPort;
        }
        if (endPort) {
          connection.arrow.end.anchor = "port";
          connection.arrow.end.label = toMul || endPort;
        }
        diagram.addConnection(connection);
        for (const linkNote of c.linkNotes || []) {
          const noteBox = new Box({
            id: linkNote.id,
            title: "note",
            description: linkNote.text,
            shape: "note",
            link: linkNote.link || "",
            tooltip: linkNote.tooltip || "",
          });
          boxes.set(linkNote.id, noteBox);
          const container = from.parent;
          if (container instanceof Plane) container.addBox(noteBox);
          else if (container instanceof Subplane) container.addBox(noteBox);
          else ensureFloatingPlane().addBox(noteBox);
          diagram.addConnection(
            new Connection({
              id: `${linkNote.id}~${connection.id}#${diagram.connections.length}`,
              from: noteBox,
              to,
              label: "",
              kind: "note",
              dashed: true,
              startArrowhead: null,
              endArrowhead: null,
            }),
          );
        }
      }
      // Apply box-level link directives after resolving connections so
      // class headers with implicit parents can receive metadata too.
      for (const linkSpec of pendingBoxLinks) {
        if (removedIds.has(linkSpec.targetId)) continue;
        const target = boxes.get(linkSpec.targetId);
        if (!target) continue;
        target.link = linkSpec.link || "";
        target.tooltip = linkSpec.tooltip || "";
      }
      // Resolve notes.
      for (const n of pendingNotes) {
        if (removedIds.has(n.targetId)) continue;
        const target = boxes.get(n.targetId);
        if (!target) continue;
        const noteBox = new Box({
          id: n.id,
          title: "note",
          description: n.text,
          shape: "note",
          link: n.link || "",
          tooltip: n.tooltip || "",
        });
        boxes.set(n.id, noteBox);
        const container = target.parent;
        if (container instanceof Plane) container.addBox(noteBox);
        else if (container instanceof Subplane) container.addBox(noteBox);
        else continue;
        diagram.addConnection(
          new Connection({
            id: `${n.id}~${target.id}#${diagram.connections.length}`,
            from: noteBox,
            to: target,
            label: "",
            kind: "note",
            dashed: true,
            startArrowhead: null,
            endArrowhead: null,
          }),
        );
      }
      if (
        pendingFilters.some(
          (filter) => filter.command === "remove" && /^@?unlinked$/i.test(filter.target),
        )
      ) {
        for (const box of boxes.values()) {
          if (box.connections.length === 0) removedIds.add(box.id);
        }
      }
      if (removedIds.size) {
        for (const id of removedIds) boxes.delete(id);
        for (const plane of diagram.planes) {
          plane.children = plane.children.filter((child) => {
            if (child instanceof Box) return !removedIds.has(child.id);
            if (child instanceof Subplane) {
              child.boxes = child.boxes.filter((box) => !removedIds.has(box.id));
              return true;
            }
            return true;
          });
        }
      }
    },
  };
  return ctx;
}
