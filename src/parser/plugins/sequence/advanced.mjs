// Additional sequence-diagram constructs: lifecycle, references,
// participant grouping boxes, dividers, delays, spacing, and autonumber.

import { stripQuotes, unescapeLabel } from "../../utils.mjs";

const AUTONUMBER = /^autonumber(?:\s+(.*))?$/i;
const RETURN = /^return(?:\s+(.*))?$/i;
const ACTIVATE = /^activate\s+(\S+)(?:\s+(#[\w-]+))?$/i;
const DEACTIVATE = /^deactivate\s+(\S+)$/i;
const DESTROY = /^destroy\s+(\S+)$/i;
const CREATE =
  /^create(?:\s+(participant|actor|boundary|control|collections|queue|database|entity))?\s+(?:("[^"]+")|(\S+))(?:\s+as\s+(\S+))?$/i;
const BOX_START = /^box(?:\s+("[^"]+"|[^#]+?))?(?:\s+(#[\w-]+))?$/i;
const BOX_END = /^end\s+box$/i;
const DIVIDER = /^==\s*(.*?)\s*==$/;
const DELAY = /^\.\.\.(?:\s*(.*?)\s*)?\.\.\.$|^\.\.\.$/;
const SPACE = /^(?:\|\|\||\|\|(\d+)\|\|)$/;
const REF_INLINE = /^ref\s+over\s+(\S+)(?:\s*,\s*(\S+))?\s*:\s*(.+)$/i;
const REF_BLOCK = /^ref\s+over\s+(\S+)(?:\s*,\s*(\S+))?\s*$/i;
const HIDE_FOOTBOX = /^hide\s+footbox$/i;
const SHOW_FOOTBOX = /^show\s+footbox$/i;
const HIDE_UNLINKED = /^hide\s+unlinked$/i;
const HEADER = /^header\s+(.+)$/i;
const FOOTER = /^footer\s+(.+)$/i;
const NEWPAGE = /^newpage(?:\s+(.*))?$/i;
const MAINFRAME = /^mainframe\s+(.+)$/i;
const PRAGMA_TEOZ = /^!pragma\s+teoz\b/i;
const PARTITION_START = /^partition\b.*(?:\{)?$/i;
const PARTITION_END = /^end\s+partition$/i;

/**
 * Miscellaneous PlantUML sequence constructs.
 * @type {import("../../engine.mjs").Plugin}
 */
export const sequenceAdvancedPlugin = {
  name: "sequence.advanced",
  tryStart(line, ctx) {
    const ref = line.match(REF_BLOCK);
    if (!ref) return null;
    const target = ctx.ensureParticipant(ref[1]);
    const target2 = ref[2] ? ctx.ensureParticipant(ref[2]) : null;
    /** @type {string[]} */
    const lines = [];
    return {
      onLine(l) {
        lines.push(l);
      },
      tryEnd(l, ctx2) {
        if (!/^end\s+ref$/i.test(l)) return false;
        ctx2.addReference({ label: lines.join("\n"), target, target2 });
        return true;
      },
    };
  },
  tryLine(line, ctx) {
    if (PRAGMA_TEOZ.test(line)) return true;

    if (PARTITION_START.test(line)) {
      if (line.endsWith("{"))
        ctx.__sequencePartitionDepth = (ctx.__sequencePartitionDepth || 0) + 1;
      return true;
    }
    if (PARTITION_END.test(line)) return true;
    if (line === "}" && ctx.__sequencePartitionDepth) {
      ctx.__sequencePartitionDepth -= 1;
      return true;
    }

    const auto = line.match(AUTONUMBER);
    if (auto) {
      configureAutonumber(ctx, auto[1]?.trim() || "");
      return true;
    }

    const ret = line.match(RETURN);
    if (ret) {
      return ctx.addReturnMessage(unescapeLabel(ret[1]?.trim() || ""));
    }

    if (HIDE_FOOTBOX.test(line)) {
      ctx.setFootboxVisible(false);
      return true;
    }
    if (SHOW_FOOTBOX.test(line)) {
      ctx.setFootboxVisible(true);
      return true;
    }
    if (HIDE_UNLINKED.test(line)) {
      ctx.setHideUnlinked(true);
      return true;
    }

    const header = line.match(HEADER);
    if (header) {
      ctx.setHeader(unescapeLabel(stripQuotes(header[1].trim())));
      return true;
    }
    const footer = line.match(FOOTER);
    if (footer) {
      ctx.setFooter(unescapeLabel(stripQuotes(footer[1].trim())));
      return true;
    }
    const mainframe = line.match(MAINFRAME);
    if (mainframe) {
      ctx.setMainframe(unescapeLabel(stripQuotes(mainframe[1].trim())));
      return true;
    }
    const newpage = line.match(NEWPAGE);
    if (newpage) {
      ctx.addMarker("pageBreak", unescapeLabel(newpage[1]?.trim() || "newpage"));
      return true;
    }

    const boxStart = line.match(BOX_START);
    if (boxStart) {
      ctx.startParticipantGroup(
        unescapeLabel(stripQuotes((boxStart[1] || "").trim())),
        boxStart[2] || "",
      );
      return true;
    }
    if (BOX_END.test(line)) return ctx.endParticipantGroup();

    const create = line.match(CREATE);
    if (create) {
      const [, shape, qTitle, bareId, alias] = create;
      const id = alias || bareId || stripQuotes(qTitle || "");
      const participant = ctx.declareParticipant({
        id,
        title: unescapeLabel(stripQuotes(qTitle || bareId || id)),
        shape: shape || "participant",
      });
      ctx.markCreated(participant, ctx.currentSeq());
      return true;
    }

    const activate = line.match(ACTIVATE);
    if (activate) {
      const seq = ctx.lastSeq();
      ctx.startActivation(ctx.ensureParticipant(activate[1]), activate[2] || "", seq);
      return true;
    }

    const deactivate = line.match(DEACTIVATE);
    if (deactivate) {
      const seq = ctx.lastSeq();
      ctx.endActivation(ctx.ensureParticipant(deactivate[1]), seq);
      return true;
    }

    const destroy = line.match(DESTROY);
    if (destroy) {
      const seq = ctx.lastSeq();
      ctx.markDestroyed(ctx.ensureParticipant(destroy[1]), seq);
      return true;
    }

    const ref = line.match(REF_INLINE);
    if (ref) {
      ctx.addReference({
        label: unescapeLabel(ref[3]),
        target: ctx.ensureParticipant(ref[1]),
        target2: ref[2] ? ctx.ensureParticipant(ref[2]) : null,
      });
      return true;
    }

    const divider = line.match(DIVIDER);
    if (divider) {
      ctx.addMarker("divider", unescapeLabel(divider[1].trim()));
      return true;
    }

    const delay = line.match(DELAY);
    if (delay) {
      ctx.addMarker("delay", unescapeLabel((delay[1] || "").trim()));
      return true;
    }

    const space = line.match(SPACE);
    if (space) {
      ctx.addMarker("space", "", Number(space[1] || 36));
      return true;
    }

    return false;
  },
};

/**
 * @param {Record<string, any>} ctx Sequence context.
 * @param {string} raw Raw autonumber arguments.
 */
function configureAutonumber(ctx, raw) {
  const lower = raw.toLowerCase();
  if (!raw || lower === "resume") {
    ctx.setAutonumber(true);
    return;
  }
  if (lower === "stop") {
    ctx.setAutonumber(false);
    return;
  }
  const tokens = readAutonumberTokens(raw);
  const nums = tokens.filter((token) => /^-?\d+$/.test(token)).map(Number);
  const formatToken = tokens.find((token) => token.startsWith('"'));
  ctx.setAutonumber(
    true,
    nums[0],
    nums[1],
    formatToken ? unescapeLabel(stripQuotes(formatToken)) : "",
  );
}

/**
 * @param {string} raw Raw autonumber arguments.
 * @returns {string[]} Whitespace-separated tokens, preserving quoted strings.
 */
function readAutonumberTokens(raw) {
  /** @type {string[]} */
  const tokens = [];
  let i = 0;
  while (i < raw.length) {
    while (/\s/.test(raw[i] || "")) i++;
    if (i >= raw.length) break;
    if (raw[i] === '"') {
      let end = i + 1;
      while (end < raw.length) {
        if (raw[end] === '"' && raw[end - 1] !== "\\") break;
        end++;
      }
      tokens.push(raw.slice(i, Math.min(raw.length, end + 1)));
      i = end + 1;
      continue;
    }
    const start = i;
    while (i < raw.length && !/\s/.test(raw[i])) i++;
    tokens.push(raw.slice(start, i));
  }
  return tokens;
}
