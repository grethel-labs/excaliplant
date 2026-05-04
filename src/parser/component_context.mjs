// Mutable parsing context for component-style diagrams.
//
// All component plugins receive an instance of this and use its
// helpers; this keeps plugins free of cross-cutting state management.

import { Box, Connection, Diagram, Plane, Subplane } from "../model/diagram.mjs";
import { planeColor, subplaneColor } from "../style/colors.mjs";

/**
 * Construct the mutable parsing context that component plugins share
 * during a single `parsePlantUml` invocation. The returned object
 * exposes high-level helpers (`addBox`, `openContainer`, …) so that
 * plugins never touch the model classes directly.
 *
 * @returns {{
 *   readonly result: import("../model/diagram.mjs").Diagram,
 *   diagram:         import("../model/diagram.mjs").Diagram,
 *   boxes:           Map<string, import("../model/diagram.mjs").Box>,
 *   setTitle(t: string): void,
 *   openContainer(spec: { id: string, title: string, kind: string }): void,
 *   closeContainer(): void,
 *   addBox(spec: object): import("../model/diagram.mjs").Box,
 *   queueConnection(spec: object): void,
 *   queueNote(spec: object): void,
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
  const pendingNotes = [];
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
     * @param {{id:string,title:string,description?:string,shape?:string,stereotype?:string,members?:string[]}} spec Box specification.
     * @returns {Box} The newly-created (or pre-existing) box.
     */
    addBox(
      /** @type {{id:string,title:string,description?:string,shape?:string,stereotype?:string,members?:string[]}} */ {
        id,
        title,
        description = "",
        shape = "rectangle",
        stereotype = "",
        members = [],
      },
    ) {
      if (boxes.has(id)) return boxes.get(id);
      const box = new Box({ id, title, description, shape, stereotype, members });
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
     * Defer a `note on link` declaration until {@link finalize} runs.
     * @param {any} spec Plugin-specific note record.
     */
    queueNote(/** @type {any} */ spec) {
      pendingNotes.push(spec);
    },
    /** @returns {string} Fresh unique note id. */
    nextNoteId() {
      return `note_${noteCounter++}`;
    },

    finalize() {
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
        if (shorthand || !allowVivify) return null;
        const box = new Box({ id, title: id, shape: "class" });
        boxes.set(id, box);
        ensureFloatingPlane().addBox(box);
        return box;
      };
      // Resolve connections.
      for (const c of pendingConnections) {
        const fromBox = ensureEndpoint(c.fromId, !!c.fromShorthand, !!c.allowVivify);
        const toBox = ensureEndpoint(c.toId, !!c.toShorthand, !!c.allowVivify);
        if (!fromBox || !toBox || fromBox === toBox) continue;
        const [from, to] = c.reversed ? [toBox, fromBox] : [fromBox, toBox];
        const [startAh, endAh] = c.reversed
          ? [c.endArrowhead, c.startArrowhead]
          : [c.startArrowhead, c.endArrowhead];
        const [fromMul, toMul] = c.reversed
          ? [c.toMul || "", c.fromMul || ""]
          : [c.fromMul || "", c.toMul || ""];
        diagram.addConnection(
          new Connection({
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
          }),
        );
      }
      // Resolve notes.
      for (const n of pendingNotes) {
        const target = boxes.get(n.targetId);
        if (!target) continue;
        const noteBox = new Box({
          id: n.id,
          title: "note",
          description: n.text,
          shape: "note",
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
    },
  };
  return ctx;
}
