/**
 * @module sequence-spacing
 *
 * Central spacing contract for sequence diagrams.
 *
 * Sequence layout has many visual item types (messages, notes, refs,
 * dividers, fragments, lifecycle bars). They all reserve vertical space
 * through this module so adding a new timeline item does not introduce a
 * one-off top/bottom rhythm.
 */

/** Default visual size reserved for rendered arrowheads in px. */
export const SEQUENCE_ARROWHEAD_SIZE = 20;

/**
 * Central spacing values for sequence diagrams.
 * @public
 */
export const SEQUENCE_SPACING = Object.freeze({
  page: {
    top: 90,
    side: 40,
    bottom: 60,
  },
  participant: {
    gap: 60,
    groupPadX: 16,
    groupPadY: 14,
  },
  message: {
    firstOffset: 50,
    itemGap: 30,
    labelToArrowGap: 2,
    labelMinWidth: 48,
    labelHardMaxWidth: 260,
    selfLabelMaxWidth: 220,
    selfHeight: 36,
    endpointLabelMaxWidth: 48,
    endpointLabelGap: 4,
    externalOffset: 64,
    shortOffset: 42,
  },
  note: {
    pad: 8,
    sideGap: 14,
  },
  reference: {
    padX: 14,
    padY: 12,
    minHeight: 54,
  },
  marker: {
    dividerHeight: 30,
    delayHeight: 34,
    defaultSpace: 36,
  },
  fragment: {
    sideMargin: 24,
    topMargin: 30,
    bottomMargin: 30,
    nestedMargin: 14,
    boundaryGap: 58,
    minHeight: 62,
    decorationInnerMargin: 12,
  },
  activation: {
    width: 12,
  },
});

/**
 * Symmetric vertical gap before and after every visible timeline item.
 * @returns {number} Timeline item gap in px.
 * @public
 */
export function timelineItemGap() {
  return SEQUENCE_SPACING.message.itemGap;
}

/**
 * Horizontal label budget after arrowheads have claimed their visual tips.
 * @param {number} arrowLength Absolute arrow length in px.
 * @param {{size?:number,head?:string}|null|undefined} start Start endpoint.
 * @param {{size?:number,head?:string}|null|undefined} end End endpoint.
 * @returns {number} Safe label width in px.
 * @public
 */
export function arrowLabelBudget(arrowLength, start, end) {
  const startSize = endpointConsumesHeadSpace(start) ? (start?.size ?? SEQUENCE_ARROWHEAD_SIZE) : 0;
  const endSize = endpointConsumesHeadSpace(end) ? (end?.size ?? SEQUENCE_ARROWHEAD_SIZE) : 0;
  // Keep an additional head-width as safety margin so labels do not crowd
  // the visual arrow tips on short segments.
  const safety = Math.max(startSize, endSize);
  return Math.max(
    SEQUENCE_SPACING.message.labelMinWidth,
    arrowLength - startSize - endSize - safety,
  );
}

/**
 * @param {{head?:string}|null|undefined} endpoint Arrow endpoint semantics.
 * @returns {boolean} Whether the endpoint has a visible head/tail glyph.
 */
function endpointConsumesHeadSpace(endpoint) {
  return Boolean(endpoint && endpoint.head && endpoint.head !== "none");
}
