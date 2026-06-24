// Shared graph visibility/filter commands.

const REMOVE_LINE = /^remove\s+(.+)$/i;
const HIDE_SHOW_LINE = /^(hide|show|restore)\s+(.+)$/i;

/**
 * PlantUML graph visibility commands. `remove <id>` affects the parsed
 * model; `hide/show ...` forms are consumed so strict parsing stays
 * compatible while rendering support can grow per command over time.
 * @type {import("../../../util/parser_engine.mjs").Plugin}
 */
export const graphFilterPlugin = {
  name: "component.filter",
  tryLine(line, ctx) {
    const remove = line.match(REMOVE_LINE);
    if (remove) {
      ctx.queueFilter({ command: "remove", target: remove[1].trim() });
      return true;
    }
    const hideShow = line.match(HIDE_SHOW_LINE);
    if (!hideShow) return false;
    ctx.queueFilter({ command: hideShow[1].toLowerCase(), target: hideShow[2].trim() });
    return true;
  },
};
