// Container/box sizing.
//
// Boxes size themselves from their text content and from the number of
// connections that need to attach. Subplanes and planes then size
// themselves from their children AND from the number of internal-routing
// lanes the lane allocator (step2b) requested on each side. All children
// of a container share the same content width so titles align.

import { Box, Plane, Subplane } from "../model/diagram.mjs";
import { FONT, measureLine, measureWrapped } from "../style/text.mjs";

/**
 * Default padding / spacing constants used by {@link sizeDiagram}.
 * Exposed so renderers and downstream layout passes can read the
 * same numbers.
 * @public
 */
export const SIZING = {
  boxPaddingX: 14,
  boxPaddingY: 12,
  boxTitleGap: 4,
  boxMinHeight: 56,
  boxConnectionSlot: 18, // height per connection on a side

  subplanePaddingX: 16,
  subplanePaddingY: 18,
  subplaneChildGap: 16,
  subplaneTitleHeight: 26,

  planePaddingX: 22,
  planePaddingY: 28,
  planeChildGap: 22,
  planeTitleHeight: 38,

  // Pixels per internal-routing lane on each side of a container.
  laneWidth: 18,

  // Content width is computed from the widest box title/description so
  // that every box label fits without truncation. The constants below
  // clamp the result.
  contentMinWidth: 220,
  contentMaxWidth: 360,
};

/**
 * First sizing pass. Walks every plane / subplane / box in the
 * diagram and writes width / height onto the model. Must run before
 * the ELK layout pass so positions can be assigned.
 *
 * @param {import("../model/diagram.mjs").Diagram} diagram Diagram model whose elements are sized in place.
 * @returns {void} Mutates `diagram` directly; nothing is returned.
 * @public
 */
export function sizeDiagram(diagram) {
  for (const plane of diagram.planes) sizePlane(plane);
}

/**
 * Size a single plane and all of its children (subplanes + direct boxes).
 * @param {import("../model/diagram.mjs").Plane} plane Plane to size in place.
 * @returns {void}
 */
function sizePlane(plane) {
  const planeLanes = laneSpace(plane);
  const baseInner = computePlaneContentWidth(plane);
  const innerWidth = baseInner; // every child gets exactly this width
  for (const child of plane.children) {
    if (child instanceof Subplane) sizeSubplane(child, innerWidth);
    else sizeBox(child, innerWidth);
  }
  let h = SIZING.planePaddingY + SIZING.planeTitleHeight;
  for (let i = 0; i < plane.children.length; i++) {
    if (i > 0) h += SIZING.planeChildGap;
    h += plane.children[i].height;
  }
  h += SIZING.planePaddingY;
  plane.width = innerWidth + SIZING.planePaddingX * 2 + planeLanes;
  plane.height = Math.max(120, h);
}

/**
 * @param {import("../model/diagram.mjs").Subplane} sub Subplane to size in place.
 * @param {number} planeContentWidth Inner width of the owning plane (used to clamp subplane boxes).
 * @returns {void}
 */
function sizeSubplane(sub, planeContentWidth) {
  const subLanes = laneSpace(sub);
  // Subplane occupies the full plane content width (so titles align).
  sub.width = planeContentWidth;
  // Boxes inside the subplane get the remaining space minus padding and
  // the lane allowance.
  const innerBoxWidth = Math.max(40, planeContentWidth - SIZING.subplanePaddingX * 2 - subLanes);
  for (const box of sub.boxes) sizeBox(box, innerBoxWidth);
  let h = SIZING.subplanePaddingY + SIZING.subplaneTitleHeight;
  for (let i = 0; i < sub.boxes.length; i++) {
    if (i > 0) h += SIZING.subplaneChildGap;
    h += sub.boxes[i].height;
  }
  h += SIZING.subplanePaddingY;
  sub.height = Math.max(80, h);
}

/**
 * @param {import("../model/diagram.mjs").Box} box Box to size in place (sets width/height + wrapped text).
 * @param {number} width Available width hint; the box may grow beyond this for shapes with intrinsic minima.
 * @returns {void}
 */
function sizeBox(box, width) {
  box.width = width;
  const innerWidth = Math.max(20, width - SIZING.boxPaddingX * 2);
  // Auto-wrap the title so long labels stay inside the box. Manual
  // line breaks ("\n") are preserved by wrapping each segment
  // independently.
  const titleSegments = String(box.title || "").split("\n");
  /** @type {string[]} */
  const wrappedTitleLines = [];
  for (const seg of titleSegments) {
    const wrapped = measureWrapped(seg, FONT.sizeTitle, innerWidth);
    if (wrapped.lines.length === 0) wrappedTitleLines.push("");
    else wrappedTitleLines.push(...wrapped.lines);
  }
  // Cache the wrapped title so the renderer can emit the exact same
  // line breaks the sizing pass measured.
  box._wrappedTitle = wrappedTitleLines.join("\n");
  const titleHeight = wrappedTitleLines.length * FONT.sizeTitle * FONT.lineHeight;
  const description = box.description
    ? measureWrapped(box.description, FONT.sizeDescription, innerWidth)
    : { height: 0, lines: /** @type {string[]} */ ([]) };
  if (box.description) box._wrappedDescription = description.lines.join("\n");
  let textHeight = SIZING.boxPaddingY + titleHeight;
  if (box.stereotype) textHeight += FONT.sizeDescription * FONT.lineHeight;
  if (description.height) textHeight += SIZING.boxTitleGap + description.height;
  textHeight += SIZING.boxPaddingY;

  const connectionsHeight =
    box.connections.length * SIZING.boxConnectionSlot + SIZING.boxPaddingY * 2;

  // Shape-specific minimum heights.
  let shapeMin = SIZING.boxMinHeight;
  switch (box.shape) {
    case "actor":
      // Stickman ~ headD + body + legs + label
      shapeMin = Math.max(shapeMin, 110 + titleHeight);
      break;
    case "interface":
      shapeMin = Math.max(shapeMin, 70 + titleHeight);
      break;
    case "usecase":
      shapeMin = Math.max(shapeMin, 70);
      break;
    case "database":
      shapeMin = Math.max(shapeMin, 90);
      break;
    case "cloud":
      shapeMin = Math.max(shapeMin, 80);
      break;
    case "node":
      // 3-D shadow uses extra ~8px on top.
      shapeMin = Math.max(shapeMin, textHeight + 8);
      break;
    case "class":
      if (box.members && box.members.length) {
        shapeMin = Math.max(
          shapeMin,
          textHeight + box.members.length * FONT.sizeDescription * FONT.lineHeight + 12,
        );
      }
      break;
    case "note":
      shapeMin = Math.max(shapeMin, 50);
      break;
  }

  box.height = Math.max(shapeMin, textHeight, connectionsHeight);
}

/**
 * Compute the inner content width of a plane based on its widest child.
 * @param {import("../model/diagram.mjs").Plane} plane Plane to inspect.
 * @returns {number} Inner width in pixels (excluding plane padding).
 */
function computePlaneContentWidth(plane) {
  let widest = SIZING.contentMinWidth;
  for (const box of plane.allBoxes) {
    const titleSize = measureLine(box.title, FONT.sizeTitle);
    widest = Math.max(widest, titleSize.width + SIZING.boxPaddingX * 2);
  }
  // Subplanes need extra room for their padding and their internal lanes.
  for (const sub of plane.subplanes) {
    const need = widest + SIZING.subplanePaddingX * 2 + laneSpace(sub);
    widest = Math.max(widest, need);
  }
  // Plane title also wants to fit (excluding plane-level lanes — those
  // sit outside the title area at the children row).
  const planeTitle = measureLine(plane.title, FONT.sizePlaneTitle);
  widest = Math.max(widest, planeTitle.width + SIZING.planePaddingX * 2);
  // Clamp to contentMaxWidth, but never below what we just computed for
  // box / subplane needs (those constraints are hard).
  const hardMin = widest;
  const clamped = Math.min(
    SIZING.contentMaxWidth,
    Math.max(SIZING.contentMinWidth, Math.ceil(widest)),
  );
  return Math.max(clamped, hardMin);
}

/**
 * Inner padding (left + right) reserved for lifeline lanes around a container's boxes.
 * @param {any} container Plane or Subplane whose lane space is being computed.
 * @returns {number} Total horizontal padding in pixels.
 */
function laneSpace(container) {
  // ELK-based layout does not use the legacy lane allocator. Boxes /
  // subplanes are sized purely from their content; ELK injects port
  // spacing on the fly via its own port-side options.
  return 0;
}

// Re-export classes for test convenience.
export { Box, Plane, Subplane };
