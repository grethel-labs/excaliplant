// Component port declarations.

const PORT_DECLARATION = /^(port|portin|portout)\s+(?:"([^"]+)"|(\S+))(?:\s+as\s+(\S+))?$/i;

/**
 * Convert `Component::port` tokens into their owner box and port ids.
 * @param {string} raw Raw port token or alias.
 * @returns {{boxId:string,portId:string}|null}
 */
function splitPortReference(raw) {
  const m = String(raw || "").match(/^([^:]+)::(.+)$/);
  if (!m) return null;
  return { boxId: m[1], portId: m[2] };
}

/**
 * Component `port`, `portin` and `portout` declarations.
 *
 * The declaration must name the owning component with `Component::port`,
 * matching the endpoint form accepted by the connection parser.
 * @type {import("../../../util/parser_engine.mjs").Plugin}
 */
export const portPlugin = {
  name: "component.port",
  tryLine(line, ctx) {
    const m = line.match(PORT_DECLARATION);
    if (!m) return false;
    const [, keyword, quoted, bare, alias] = m;
    const ref = splitPortReference(alias || bare || quoted || "");
    if (!ref) return true;
    ctx.addPort({
      boxId: ref.boxId,
      portId: ref.portId,
      side: keyword.toLowerCase() === "portout" ? "right" : "left",
      direction:
        keyword.toLowerCase() === "portout"
          ? "out"
          : keyword.toLowerCase() === "portin"
            ? "in"
            : "port",
    });
    return true;
  },
};
