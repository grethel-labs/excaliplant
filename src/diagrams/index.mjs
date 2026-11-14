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
import sequenceDiagram from "./sequence/index.mjs";
import activityDiagram from "./activity/index.mjs";
import archimateDiagram from "./archimate/index.mjs";
import chenDiagram from "./chen/index.mjs";
import dotDiagram from "./dot/index.mjs";
import ganttDiagram from "./gantt/index.mjs";
import chronologyDiagram from "./chronology/index.mjs";
import timingDiagram from "./timing/index.mjs";
import { mindmapDiagram, wbsDiagram } from "./tree/index.mjs";
import filesDiagram from "./files/index.mjs";
import { jsonDiagram, yamlDiagram } from "./data/index.mjs";
import nwdiagDiagram from "./nwdiag/index.mjs";
import saltDiagram from "./salt/index.mjs";
import { ebnfDiagram, regexDiagram } from "./railroad/index.mjs";
import { asciiMathDiagram, latexDiagram } from "./math/index.mjs";
import ditaaDiagram from "./ditaa/index.mjs";
import chartDiagram from "./chart/index.mjs";
import creoleDiagram from "./creole/index.mjs";
import legacyActivityDiagram from "./legacy-activity/index.mjs";

/** @type {import("../core/registry.mjs").DiagramModule[]} */
export const BUILTIN_DIAGRAMS = [ditaaDiagram, saltDiagram, nwdiagDiagram, sequenceDiagram, timingDiagram, ganttDiagram, activityDiagram, legacyActivityDiagram, archimateDiagram, stateDiagram, classDiagram, objectDiagram, usecaseDiagram, componentDiagram, deploymentDiagram, chenDiagram, dotDiagram, chronologyDiagram, mindmapDiagram, wbsDiagram, filesDiagram, jsonDiagram, yamlDiagram, ebnfDiagram, regexDiagram, asciiMathDiagram, latexDiagram, chartDiagram, creoleDiagram];
