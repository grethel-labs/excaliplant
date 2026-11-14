/**
 * Bundled diagram modules in detection-priority order (earlier modules win
 * ties when several `@startuml` detectors score equally).
 * @module diagrams
 */

import classDiagram from "./class/index.mjs";
import { componentDiagram, deploymentDiagram } from "./component/index.mjs";
import objectDiagram from "./object/index.mjs";
import usecaseDiagram from "./usecase/index.mjs";
import stateDiagram from "./state/index.mjs";

/** @type {import("../core/registry.mjs").DiagramModule[]} */
export const BUILTIN_DIAGRAMS = [stateDiagram, classDiagram, objectDiagram, usecaseDiagram, componentDiagram, deploymentDiagram];
