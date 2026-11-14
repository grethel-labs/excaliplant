/**
 * excaliplant — render PlantUML as hand-drawn Excalidraw diagrams, SVG and PNG.
 * @module excaliplant
 */

export { render, renderAll, parse, detectKind, listDiagramTypes, renderPlantUml, RenderResult, defaultRegistry } from "./api.mjs";
export { DiagramRegistry, defineDiagram } from "./core/registry.mjs";
export { DEFAULT_LIMITS } from "./core/limits.mjs";
export { ExcaliplantError, ParseError, LimitError } from "./core/errors.mjs";
export { preprocessText } from "./core/preprocess/preprocessor.mjs";
export { THEMES, THEME_NAMES } from "./draw/theme.mjs";
export { BUILTIN_DIAGRAMS } from "./diagrams/index.mjs";
