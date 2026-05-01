// Container/box sizing.
//
// Boxes size themselves from their text content and from the number of
// connections that need to attach. Subplanes and planes then size
// themselves from their children AND from the number of internal-routing
// lanes the lane allocator (step2b) requested on each side. All children
// of a container share the same content width so titles align.

import { Box, Plane, Subplane } from "../model/diagram.mjs";
import { FONT, measureLine, measureWrapped } from "../style/text.mjs";

export const SIZING = {
  boxPaddingX: 14,
  boxPaddingY: 12,
  boxTitleGap: 4,
  boxMinHeight: 56,
  boxConnectionSlot: 18,        // height per connection on a side

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

export function sizeDiagram(diagram) {
  for (const plane of diagram.planes) sizePlane(plane);
}

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

function sizeSubplane(sub, planeContentWidth) {
  const subLanes = laneSpace(sub);
  // Subplane occupies the full plane content width (so titles align).
  sub.width = planeContentWidth;
  // Boxes inside the subplane get the remaining space minus padding and
  // the lane allowance.
  const innerBoxWidth = Math.max(40,
    planeContentWidth - SIZING.subplanePaddingX * 2 - subLanes);
  for (const box of sub.boxes) sizeBox(box, innerBoxWidth);
  let h = SIZING.subplanePaddingY + SIZING.subplaneTitleHeight;
  for (let i = 0; i < sub.boxes.length; i++) {
    if (i > 0) h += SIZING.subplaneChildGap;
    h += sub.boxes[i].height;
  }
  h += SIZING.subplanePaddingY;
  sub.height = Math.max(80, h);
}

function sizeBox(box, width) {
  box.width = width;
  const innerWidth = Math.max(20, width - SIZING.boxPaddingX * 2);
  // Title can be multi-line via "\n".
  const titleLines = String(box.title || "").split("\n");
  const titleHeight = titleLines.length * FONT.sizeTitle * FONT.lineHeight;
  const description = box.description ? measureWrapped(box.description, FONT.sizeDescription, innerWidth) : { height: 0 };
  let textHeight = SIZING.boxPaddingY + titleHeight;
  if (box.stereotype) textHeight += FONT.sizeDescription * FONT.lineHeight;
  if (description.height) textHeight += SIZING.boxTitleGap + description.height;
  textHeight += SIZING.boxPaddingY;

  const connectionsHeight = box.connections.length * SIZING.boxConnectionSlot + SIZING.boxPaddingY * 2;

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
        shapeMin = Math.max(shapeMin,
          textHeight + box.members.length * FONT.sizeDescription * FONT.lineHeight + 12);
      }
      break;
    case "note":
      shapeMin = Math.max(shapeMin, 50);
      break;
  }

  box.height = Math.max(shapeMin, textHeight, connectionsHeight);
}

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
  const clamped = Math.min(SIZING.contentMaxWidth, Math.max(SIZING.contentMinWidth, Math.ceil(widest)));
  return Math.max(clamped, hardMin);
}

function laneSpace(container) {
  // ELK-based layout does not use the legacy lane allocator. Boxes /
  // subplanes are sized purely from their content; ELK injects port
  // spacing on the fly via its own port-side options.
  return 0;
}

// Re-export classes for test convenience.
export { Box, Plane, Subplane };
