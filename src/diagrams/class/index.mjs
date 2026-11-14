/**
 * Class diagrams (including IE / crow's-foot entity diagrams, which share the
 * same declarations and link grammar).
 * @module diagrams/class
 */

import { graphModule } from "../graph/module.mjs";
import { DESCRIPTIVE_KEYWORDS } from "../graph/parse.mjs";
import { score } from "../detect.mjs";

const CLASS_LIKE = /** @type {const} */ ([
  ["class", "class"],
  ["abstract", "abstract"],
  ["abstract class", "abstract"],
  ["interface", "interface"],
  ["enum", "enum"],
  ["annotation", "annotation"],
  ["entity", "entity"],
  ["protocol", "interface"],
  ["struct", "class"],
  ["record", "entity"],
  ["dataclass", "class"],
  ["exception", "class"],
  ["metaclass", "class"],
  ["stereotype", "class"],
  ["circle", "class"],
]);

/** @type {[string, import("../graph/parse.mjs").ElementKind][]} */
const KEYWORDS = [
  ...CLASS_LIKE.map(
    ([kw, role]) =>
      /** @type {[string, import("../graph/parse.mjs").ElementKind]} */ ([
        kw,
        { shape: "class", role, classLike: true },
      ]),
  ),
  ["namespace", { shape: "package", role: "package", container: true }],
  ...DESCRIPTIVE_KEYWORDS.filter(([kw]) => !CLASS_LIKE.some(([c]) => c === kw)),
];

export default graphModule({
  kind: "class",
  title: "Class / IE diagram",
  keywords: KEYWORDS,
  implicit: () => null,
  detect: (lines) =>
    score(lines, [
      [
        /^(abstract\s+class|abstract|class|interface|enum|annotation|protocol|struct|record|dataclass|exception|metaclass)\s+\S/i,
        3,
      ],
      [/^entity\s+\S+.*\{\s*$/i, 2],
      [/^namespace\s/i, 2],
      [/(<\|--|--\|>|<\|\.\.|\.\.\|>|\*--|--\*|o--|--o\b|\|o--|--o\{|\}o--|\|\|--|--\|\|)/, 2],
      [/^\S+\s*:\s*[+\-#~]?\s*\w+.*\)?$/, 0.3],
      [/^hide\s+(empty\s+)?(members|methods|fields|attributes|circle)/i, 2],
    ]),
});
