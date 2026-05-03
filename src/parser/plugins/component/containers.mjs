// Container keywords: package | frame | folder | node | rectangle, plus
// the bare `together { … }`. Recognised only when the line opens a brace.

import { slug } from "../../utils.mjs";

const CONTAINER_KEYWORDS = ["package", "frame", "folder", "node", "rectangle"];
const CONTAINER_OPEN_QUOTED = new RegExp(
  `^(${CONTAINER_KEYWORDS.join("|")})\\s+"([^"]+)"(?:\\s+as\\s+(\\S+))?\\s*\\{`,
);
const CONTAINER_OPEN_BARE = new RegExp(`^(${CONTAINER_KEYWORDS.join("|")})\\s+(\\S+)\\s*\\{`);
const TOGETHER_OPEN = /^together\s*\{/;

/**
 * Container keywords (`package`, `frame`, …) plus `together`. Always
 * opens a brace; the matching `}` is consumed by `closeBracePlugin`.
 * @type {import("../../engine.mjs").Plugin}
 */
export const containerPlugin = {
  name: "component.container",
  tryLine(line, ctx) {
    if (TOGETHER_OPEN.test(line)) {
      ctx.openContainer({
        id: `together_${ctx.diagram.planes.length}_${ctx.boxes.size}`,
        title: "",
        kind: "together",
      });
      return true;
    }
    let m = line.match(CONTAINER_OPEN_QUOTED);
    if (m) {
      ctx.openContainer({ id: m[3] || slug(m[2]), title: m[2], kind: m[1] });
      return true;
    }
    m = line.match(CONTAINER_OPEN_BARE);
    if (m) {
      ctx.openContainer({ id: m[2], title: m[2], kind: m[1] });
      return true;
    }
    return false;
  },
};
