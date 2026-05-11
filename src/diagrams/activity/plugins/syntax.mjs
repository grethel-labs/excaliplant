/**
 * Activity diagram syntax parser plugins.
 * @module diagrams/activity/plugins/syntax
 */

import { stripComment } from "../../../util/plantuml_utils.mjs";

/**
 * Activity node types.
 * @enum {string}
 */
export const ActivityNodeType = {
  START: "start",
  STOP: "stop",
  END: "end",
  ACTION: "action",
  DECISION: "decision",
  SWITCH: "switch",
  WHILE: "while",
  REPEAT: "repeat",
  FORK: "fork",
  SPLIT: "split",
  CONNECTOR: "connector",
  SWIMLANE: "swimlane",
  PARTITION: "partition",
  NOTE: "note",
  KILL: "kill",
  DETACH: "detach",
  LABEL: "label",
};

/**
 * Parse action text with optional styling.
 * @param {string} text - Raw action text
 * @returns {{text: string, style?: object}}
 */
function parseActionText(text) {
  // Handle color prefix like #HotPink:action text
  const colorMatch = text.match(/^#(\w+):(.*)$/);
  if (colorMatch) {
    return {
      text: colorMatch[2].trim(),
      style: { backgroundColor: colorMatch[1] },
    };
  }
  return { text: text.trim() };
}

/**
 * Plugin for activity start/stop/end keywords.
 * @type {object}
 */
export const activityControlPlugin = {
  name: "activity.control",
  /** @type {(line: string, ctx: any) => boolean} */
  tryLine: (line, ctx) => {
    const clean = stripComment(line).trim();
    if (!clean) return false;

    const lower = clean.toLowerCase();

    if (lower === "start") {
      ctx.addNode({ type: ActivityNodeType.START, id: "start" });
      return true;
    }

    if (lower === "stop" || lower === "end") {
      ctx.addNode({ type: ActivityNodeType.STOP, id: lower });
      return true;
    }

    if (lower === "kill") {
      ctx.addNode({ type: ActivityNodeType.KILL, id: `kill_${ctx.nodeCount}` });
      return true;
    }

    if (lower === "detach") {
      ctx.addNode({ type: ActivityNodeType.DETACH, id: `detach_${ctx.nodeCount}` });
      return true;
    }

    return false;
  },
};

/**
 * Plugin for activity actions (:action; syntax).
 * @type {object}
 */
export const activityActionPlugin = {
  name: "activity.action",
  /** @type {(line: string, ctx: any) => boolean} */
  tryLine: (line, ctx) => {
    const clean = stripComment(line).trim();
    if (!clean) return false;

    // Match :action; syntax (including multiline)
    const match = clean.match(/^:(.+);$/s);
    if (!match) return false;

    const parsed = parseActionText(match[1]);
    /** @type {any} */
    const node = {
      type: ActivityNodeType.ACTION,
      id: `action_${ctx.nodeCount}`,
      text: parsed.text,
    };

    if (parsed.style) {
      node.style = parsed.style;
    }

    // Check for stereotypes like <<object>>
    const stereoMatch = parsed.text.match(/(.+?)\s*<<(\w+)>>\s*$/);
    if (stereoMatch) {
      node.text = stereoMatch[1].trim();
      node.stereotype = stereoMatch[2];
    }

    ctx.addNode(node);
    return true;
  },
};

/**
 * Plugin for simple list actions (- Action or * Action).
 * @type {object}
 */
export const activityListActionPlugin = {
  name: "activity.list_action",
  /** @type {(line: string, ctx: any) => boolean} */
  tryLine: (line, ctx) => {
    const clean = stripComment(line).trim();
    if (!clean) return false;

    // Match - Action or * Action with optional nesting
    const match = clean.match(/^([-*]+)\s+(.+)$/);
    if (!match) return false;

    const level = match[1].length;
    const text = match[2];

    ctx.addNode({
      type: ActivityNodeType.ACTION,
      id: `action_${ctx.nodeCount}`,
      text,
      level,
    });
    return true;
  },
};

/**
 * Plugin for if/then/else/elseif/endif conditions.
 * @type {object}
 */
export const activityIfPlugin = {
  name: "activity.if",
  /** @type {(line: string, ctx: any) => object|null} */
  tryStart: (line, ctx) => {
    const clean = stripComment(line).trim();
    if (!clean) return null;

    // Match if (condition) then (label)
    const ifMatch = clean.match(/^if\s*\((.+?)\)\s*then\s*(?:\((.+?)\))?/i);
    if (ifMatch) {
      const condition = ifMatch[1].trim();
      const thenLabel = ifMatch[2] || "yes";

      return {
        type: "if",
        condition,
        thenLabel,
        elseLabel: "no",
        elseifs: [],
        onLine: () => false,
        tryEnd: (/** @type {string} */ l) => {
          const c = stripComment(l).trim().toLowerCase();
          return c === "endif" ? { end: true } : null;
        },
      };
    }

    return null;
  },
};

/**
 * Plugin for switch/case/endswitch.
 * @type {object}
 */
export const activitySwitchPlugin = {
  name: "activity.switch",
  /** @type {(line: string, ctx: any) => object|null} */
  tryStart: (line, ctx) => {
    const clean = stripComment(line).trim();
    if (!clean) return null;

    const switchMatch = clean.match(/^switch\s*\((.+?)\)/i);
    if (switchMatch) {
      return {
        type: "switch",
        expression: switchMatch[1].trim(),
        cases: [],
        onLine: () => false,
        tryEnd: (/** @type {string} */ l) => {
          const c = stripComment(l).trim().toLowerCase();
          return c === "endswitch" ? { end: true } : null;
        },
      };
    }

    return null;
  },
};

/**
 * Plugin for while loops.
 * @type {object}
 */
export const activityWhilePlugin = {
  name: "activity.while",
  /** @type {(line: string, ctx: any) => object|null} */
  tryStart: (line, ctx) => {
    const clean = stripComment(line).trim();
    if (!clean) return null;

    const whileMatch = clean.match(/^while\s*\((.+?)\)/i);
    if (whileMatch) {
      return {
        type: "while",
        condition: whileMatch[1].trim(),
        onLine: () => false,
        tryEnd: (/** @type {string} */ l) => {
          const c = stripComment(l).trim().toLowerCase();
          return c === "endwhile" ? { end: true } : null;
        },
      };
    }

    return null;
  },
};

/**
 * Plugin for repeat loops.
 * @type {object}
 */
export const activityRepeatPlugin = {
  name: "activity.repeat",
  /** @type {(line: string, ctx: any) => object|null} */
  tryStart: (line, ctx) => {
    const clean = stripComment(line).trim();
    if (!clean) return null;

    const lower = clean.toLowerCase();

    if (lower === "repeat") {
      return {
        type: "repeat",
        onLine: () => false,
        tryEnd: (/** @type {string} */ l) => {
          const c = stripComment(l).trim();
          const m = c.match(/^repeat\s+while\s*\((.+?)\)/i);
          if (m) {
            return { end: true, condition: m[1].trim() };
          }
          return null;
        },
      };
    }

    return null;
  },
};

/**
 * Plugin for fork/end fork.
 * @type {object}
 */
export const activityForkPlugin = {
  name: "activity.fork",
  /** @type {(line: string, ctx: any) => object|null} */
  tryStart: (line, ctx) => {
    const clean = stripComment(line).trim();
    if (!clean) return null;

    const lower = clean.toLowerCase();

    if (lower === "fork") {
      return {
        type: "fork",
        branches: [[]],
        onLine: () => false,
        tryEnd: (/** @type {string} */ l) => {
          const c = stripComment(l).trim().toLowerCase();
          return c === "end fork" ? { end: true } : null;
        },
      };
    }

    return null;
  },
};

/**
 * Plugin for split/end split.
 * @type {object}
 */
export const activitySplitPlugin = {
  name: "activity.split",
  /** @type {(line: string, ctx: any) => object|null} */
  tryStart: (line, ctx) => {
    const clean = stripComment(line).trim();
    if (!clean) return null;

    const lower = clean.toLowerCase();

    if (lower === "split") {
      return {
        type: "split",
        branches: [[]],
        onLine: () => false,
        tryEnd: (/** @type {string} */ l) => {
          const c = stripComment(l).trim().toLowerCase();
          return c === "end split" ? { end: true } : null;
        },
      };
    }

    return null;
  },
};

/**
 * Plugin for swimlanes.
 * @type {object}
 */
export const activitySwimlanePlugin = {
  name: "activity.swimlane",
  /** @type {(line: string, ctx: any) => boolean} */
  tryLine: (line, ctx) => {
    const clean = stripComment(line).trim();
    if (!clean) return false;

    // Match |SwimlaneName| or |#Color|SwimlaneName|
    const swimlaneMatch = clean.match(/^\|(?:#(\w+))?\|?([^|]*)\|\s*$/);
    if (swimlaneMatch) {
      const color = swimlaneMatch[1];
      const name = swimlaneMatch[2].trim();

      ctx.addNode({
        type: ActivityNodeType.SWIMLANE,
        id: `swimlane_${ctx.nodeCount}`,
        name,
        color,
      });
      return true;
    }

    return false;
  },
};

/**
 * Plugin for partitions.
 * @type {object}
 */
export const activityPartitionPlugin = {
  name: "activity.partition",
  /** @type {(line: string, ctx: any) => object|null} */
  tryStart: (line, ctx) => {
    const clean = stripComment(line).trim();
    if (!clean) return null;

    const partitionMatch = clean.match(/^partition\s+"([^"]+)"\s*\{/i);
    if (partitionMatch) {
      return {
        type: "partition",
        name: partitionMatch[1],
        onLine: () => false,
        tryEnd: (/** @type {string} */ l) => {
          const c = stripComment(l).trim();
          return c === "}" ? { end: true } : null;
        },
      };
    }

    return null;
  },
};

/**
 * Plugin for connectors (labels in parentheses).
 * @type {object}
 */
export const activityConnectorPlugin = {
  name: "activity.connector",
  /** @type {(line: string, ctx: any) => boolean} */
  tryLine: (line, ctx) => {
    const clean = stripComment(line).trim();
    if (!clean) return false;

    // Match (ConnectorName)
    const connectorMatch = clean.match(/^\((\w+)\)$/);
    if (connectorMatch) {
      ctx.addNode({
        type: ActivityNodeType.CONNECTOR,
        id: connectorMatch[1],
        name: connectorMatch[1],
      });
      return true;
    }

    return false;
  },
};

/**
 * Plugin for goto/label.
 * @type {object}
 */
export const activityGotoPlugin = {
  name: "activity.goto",
  /** @type {(line: string, ctx: any) => boolean} */
  tryLine: (line, ctx) => {
    const clean = stripComment(line).trim();
    if (!clean) return false;

    const lower = clean.toLowerCase();

    // Match label Name
    const labelMatch = clean.match(/^label\s+(\w+)/i);
    if (labelMatch) {
      ctx.addNode({
        type: ActivityNodeType.LABEL,
        id: labelMatch[1],
        name: labelMatch[1],
      });
      return true;
    }

    // Match goto Name
    const gotoMatch = clean.match(/^goto\s+(\w+)/i);
    if (gotoMatch) {
      ctx.addNode({
        type: ActivityNodeType.ACTION,
        id: `goto_${ctx.nodeCount}`,
        text: `goto ${gotoMatch[1]}`,
        gotoTarget: gotoMatch[1],
      });
      return true;
    }

    return false;
  },
};

/**
 * Plugin for break statement.
 * @type {object}
 */
export const activityBreakPlugin = {
  name: "activity.break",
  /** @type {(line: string, ctx: any) => boolean} */
  tryLine: (line, ctx) => {
    const clean = stripComment(line).trim().toLowerCase();
    if (clean === "break") {
      ctx.addNode({
        type: ActivityNodeType.ACTION,
        id: `break_${ctx.nodeCount}`,
        text: "break",
        isBreak: true,
      });
      return true;
    }
    return false;
  },
};

/**
 * Plugin for notes.
 * @type {object}
 */
export const activityNotePlugin = {
  name: "activity.note",
  /** @type {(line: string, ctx: any) => object|null} */
  tryStart: (line, ctx) => {
    const clean = stripComment(line).trim();
    if (!clean) return null;

    // Floating note: note left/right/top/bottom: text
    const floatingMatch = clean.match(/^note\s+(left|right|top|bottom)\s*:(.+)/i);
    if (floatingMatch) {
      return {
        type: "note",
        position: floatingMatch[1],
        text: floatingMatch[2].trim(),
        floating: true,
        onLine: () => false,
        tryEnd: () => null, // Single line note
      };
    }

    // Multiline note: note left/right/top/bottom
    const multilineMatch = clean.match(/^note\s+(left|right|top|bottom)$/i);
    if (multilineMatch) {
      return {
        type: "note",
        position: multilineMatch[1],
        lines: [],
        floating: true,
        onLine: () => false,
        tryEnd: (/** @type {string} */ l) => {
          const c = stripComment(l).trim().toLowerCase();
          return c === "end note" ? { end: true } : null;
        },
      };
    }

    return null;
  },
};

/**
 * Main activity syntax plugin combining all sub-plugins.
 * @type {object}
 */
export const activitySyntaxPlugin = {
  name: "activity.syntax",
  plugins: [
    activityControlPlugin,
    activityActionPlugin,
    activityListActionPlugin,
    activityIfPlugin,
    activitySwitchPlugin,
    activityWhilePlugin,
    activityRepeatPlugin,
    activityForkPlugin,
    activitySplitPlugin,
    activitySwimlanePlugin,
    activityPartitionPlugin,
    activityConnectorPlugin,
    activityGotoPlugin,
    activityBreakPlugin,
    activityNotePlugin,
  ],
};

export default activitySyntaxPlugin;
