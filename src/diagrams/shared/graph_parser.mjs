/**
 * Shared parser building blocks for graph-like PlantUML diagram modules.
 * @module diagrams/shared/graph_parser
 */

import { createComponentContext } from "./graph_context.mjs";
import {
  titlePlugin as componentTitlePlugin,
  closeBracePlugin,
  skinparamPlugin as componentSkinparamPlugin,
} from "./graph_plugins/preamble.mjs";
import { containerPlugin } from "./graph_plugins/containers.mjs";
import {
  bracketBoxPlugin,
  usecaseParensPlugin,
  shapeKeywordPlugin,
} from "./graph_plugins/shapes.mjs";
import { classBlockPlugin } from "./graph_plugins/class_block.mjs";
import { connectionPlugin } from "./graph_plugins/connections.mjs";
import { noteOfPlugin, noteFreePlugin, noteBlockPlugin } from "./graph_plugins/notes.mjs";

/** @public */
export const DEFAULT_GRAPH_PLUGINS = Object.freeze([
  componentTitlePlugin,
  componentSkinparamPlugin,
  closeBracePlugin,
  noteBlockPlugin,
  noteOfPlugin,
  noteFreePlugin,
  classBlockPlugin,
  shapeKeywordPlugin,
  containerPlugin,
  bracketBoxPlugin,
  usecaseParensPlugin,
  connectionPlugin,
]);

/** @public */
export const createGraphParseContext = createComponentContext;
