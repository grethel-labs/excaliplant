/**
 * Shared parser building blocks for graph-like PlantUML diagram modules.
 * @module diagrams/shared/graph_parser
 */

import { createComponentContext } from "./graph_context.mjs";
import {
  titlePlugin as componentTitlePlugin,
  closeBracePlugin,
  directionPlugin as componentDirectionPlugin,
  presentationPlugin as componentPresentationPlugin,
  skinparamPlugin as componentSkinparamPlugin,
  styleBlockPlugin as componentStyleBlockPlugin,
  urlOfPlugin as componentUrlOfPlugin,
} from "./graph_plugins/preamble.mjs";
import { containerPlugin } from "./graph_plugins/containers.mjs";
import { associationClassPlugin } from "./graph_plugins/association_class.mjs";
import {
  bracketBoxPlugin,
  usecaseParensPlugin,
  shapeKeywordPlugin,
} from "./graph_plugins/shapes.mjs";
import { classBlockPlugin } from "./graph_plugins/class_block.mjs";
import { connectionPlugin } from "./graph_plugins/connections.mjs";
import { graphFilterPlugin } from "./graph_plugins/filters.mjs";
import { portPlugin } from "./graph_plugins/ports.mjs";
import {
  noteOfPlugin,
  noteFreePlugin,
  noteBlockPlugin,
  noteOnLinkPlugin,
} from "./graph_plugins/notes.mjs";

/** @public */
export const DEFAULT_GRAPH_PLUGINS = Object.freeze([
  componentTitlePlugin,
  componentSkinparamPlugin,
  componentStyleBlockPlugin,
  componentDirectionPlugin,
  componentUrlOfPlugin,
  componentPresentationPlugin,
  closeBracePlugin,
  graphFilterPlugin,
  noteOnLinkPlugin,
  noteBlockPlugin,
  noteOfPlugin,
  noteFreePlugin,
  associationClassPlugin,
  classBlockPlugin,
  portPlugin,
  shapeKeywordPlugin,
  containerPlugin,
  bracketBoxPlugin,
  usecaseParensPlugin,
  connectionPlugin,
]);

/** @public */
export const createGraphParseContext = createComponentContext;
