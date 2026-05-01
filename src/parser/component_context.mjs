// Mutable parsing context for component-style diagrams.
//
// All component plugins receive an instance of this and use its
// helpers; this keeps plugins free of cross-cutting state management.

import { Box, Connection, Diagram, Plane, Subplane } from "../model/diagram.mjs";
import { planeColor, subplaneColor } from "../style/colors.mjs";

export function createComponentContext() {
  const diagram = new Diagram();
  /** @type {Array<{kind:'plane'|'subplane', plane?:Plane, subplane?:Subplane, id:string}>} */
  const stack = [];
  const planes = new Map();
  const subplanes = new Map();
  const boxes = new Map();
  const pendingConnections = [];
  const pendingNotes = [];
  let floatingPlane = null;

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
      if (stack[i].kind === "plane") return stack[i].plane;
    }
    return null;
  };

  const ctx = {
    get result() { return diagram; },
    diagram,
    boxes,

    setTitle(t) { diagram.title = t; },

    openContainer({ id, title, kind }) {
      if (stack.length === 0) {
        const plane = new Plane({ id, title, color: planeColor(id), kind });
        diagram.addPlane(plane);
        planes.set(id, plane);
        stack.push({ kind: "plane", plane, id });
      } else {
        const parentPlane = findPlane();
        const sub = new Subplane({ id, title, kind });
        if (parentPlane?.color) sub.color = subplaneColor(parentPlane.color);
        parentPlane.addSubplane(sub);
        subplanes.set(id, sub);
        stack.push({ kind: "subplane", subplane: sub, id });
      }
    },

    closeContainer() { stack.pop(); },

    addBox({ id, title, description = "", shape = "rectangle", stereotype = "", members = [] }) {
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

    queueConnection(spec) { pendingConnections.push(spec); },
    queueNote(spec) { pendingNotes.push(spec); },

    finalize() {
      // Resolve connections.
      for (const c of pendingConnections) {
        const fromBox = boxes.get(c.fromId);
        const toBox = boxes.get(c.toId);
        if (!fromBox || !toBox || fromBox === toBox) continue;
        const [from, to] = c.reversed ? [toBox, fromBox] : [fromBox, toBox];
        const [startAh, endAh] = c.reversed
          ? [c.endArrowhead, c.startArrowhead]
          : [c.startArrowhead, c.endArrowhead];
        diagram.addConnection(new Connection({
          id: `${c.fromId}->${c.toId}#${diagram.connections.length}`,
          from, to,
          label: c.label,
          kind: c.kind,
          dashed: c.dashed,
          startArrowhead: startAh,
          endArrowhead: endAh,
          directionHint: c.directionHint,
        }));
      }
      // Resolve notes.
      for (const n of pendingNotes) {
        const target = boxes.get(n.targetId);
        if (!target) continue;
        const noteBox = new Box({
          id: n.id, title: "note", description: n.text,
          shape: "note",
        });
        boxes.set(n.id, noteBox);
        const container = target.parent;
        if (container instanceof Plane) container.addBox(noteBox);
        else if (container instanceof Subplane) container.addBox(noteBox);
        else continue;
        diagram.addConnection(new Connection({
          id: `${n.id}~${target.id}#${diagram.connections.length}`,
          from: noteBox, to: target,
          label: "",
          kind: "note",
          dashed: true,
          startArrowhead: null,
          endArrowhead: null,
        }));
      }
    },
  };
  return ctx;
}
