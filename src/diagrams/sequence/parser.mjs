/**
 * Sequence diagram parser contract.
 * @module diagrams/sequence/parser
 */

import { stripComment } from "../../util/plantuml_utils.mjs";
import { BaseModuleParser } from "../base/parser.mjs";
import { createSequenceContext } from "./context.mjs";
import {
  titlePlugin as sequenceTitlePlugin,
  skinparamPlugin as sequenceSkinparamPlugin,
} from "./plugins/preamble.mjs";
import { participantPlugin } from "./plugins/participants.mjs";
import { messagePlugin } from "./plugins/messages.mjs";
import { fragmentPlugin } from "./plugins/fragments.mjs";
import { sequenceAdvancedPlugin } from "./plugins/advanced.mjs";
import {
  noteSidePlugin,
  noteOverPlugin,
  noteAcrossPlugin,
  noteSideBlockPlugin,
  noteOverBlockPlugin,
  noteAcrossBlockPlugin,
} from "./plugins/notes.mjs";

/** @public */
export const DEFAULT_SEQUENCE_PLUGINS = Object.freeze([
  sequenceTitlePlugin,
  sequenceSkinparamPlugin,
  participantPlugin,
  noteSideBlockPlugin,
  noteOverBlockPlugin,
  noteAcrossBlockPlugin,
  noteSidePlugin,
  noteOverPlugin,
  noteAcrossPlugin,
  sequenceAdvancedPlugin,
  fragmentPlugin,
  messagePlugin,
]);

/** @public */
export const createSequenceParseContext = createSequenceContext;

/** @public */
export class SequenceDiagramParser extends BaseModuleParser {
  constructor() {
    super({
      plugins: DEFAULT_SEQUENCE_PLUGINS,
      createParseContext: createSequenceParseContext,
      detect: detectSequenceDiagram,
    });
  }
}

/** @public */
export const sequenceDiagramParser = new SequenceDiagramParser();

/**
 * @param {string} text Raw PlantUML source.
 * @returns {boolean}
 */
export function detectSequenceDiagram(text) {
  for (const raw of text.split(/\r?\n/)) {
    const line = stripComment(raw).trim();
    if (!line) continue;
    if (/^(participant|boundary|control|collections|queue)\b/.test(line)) return true;
    if (/^skinparam\s+sequence\b/i.test(line)) return true;
    if (/^(opt|loop|alt|par|break|critical|group)\b/.test(line)) return true;
    if (/^(activate|deactivate|destroy|create|autonumber|ref|box)\b/.test(line)) return true;
    if (/^(header|footer|newpage|mainframe)\b/i.test(line)) return true;
    if (/^hide\s+(?:footbox|unlinked)\b/i.test(line)) return true;
    if (/^==.*==$/.test(line) || /^\.\.\./.test(line) || /^(?:\|\|\||\|\|\d+\|\|)$/.test(line)) {
      return true;
    }
  }
  return false;
}
