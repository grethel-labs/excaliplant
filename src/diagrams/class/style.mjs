/**
 * Class diagram style defaults.
 * @module diagrams/class/style
 */

/** @public */
export const CLASS_DIAGRAM_STYLE_DEFAULTS = Object.freeze({
  colorByType: false,
  typeColors: Object.freeze({
    class: Object.freeze({ stroke: "#475569", fill: "#f8fafc", titleFill: "#e2e8f0" }),
    abstract: Object.freeze({ stroke: "#7c3aed", fill: "#f5f3ff", titleFill: "#ddd6fe" }),
    interface: Object.freeze({ stroke: "#0f766e", fill: "#f0fdfa", titleFill: "#99f6e4" }),
    enum: Object.freeze({ stroke: "#b45309", fill: "#fffbeb", titleFill: "#fde68a" }),
  }),
});
