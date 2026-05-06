// Additional sequence-diagram constructs: lifecycle, references,
// participant grouping boxes, dividers, delays, spacing, and autonumber.

import { stripQuotes, unescapeLabel } from "../../utils.mjs";

const AUTONUMBER = /^autonumber(?:\s+(.*))?$/i;
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
    const auto = line.match(AUTONUMBER);
    if (auto) {
      configureAutonumber(ctx, auto[1]?.trim() || "");
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
  const nums = raw.match(/-?\d+/g)?.map(Number) ?? [];
  ctx.setAutonumber(true, nums[0] ?? 1, nums[1] ?? 1);
}
