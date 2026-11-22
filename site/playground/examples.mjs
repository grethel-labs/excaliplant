// The example index shared by the gallery and the playground's picker.

/**
 * @typedef {object} ExampleEntry
 * @property {string} kind
 * @property {string} title Human title of the diagram type.
 * @property {string} note One-line description of the type.
 * @property {string} name File name without extension.
 * @property {string} source PlantUML text.
 */

/**
 * @typedef {object} ExampleGroup
 * @property {string} kind
 * @property {string} title
 * @property {string} note
 * @property {{ id: string, name: string, source: string }[]} items
 */

/**
 * Group a flat example list by diagram type, keeping the given order.
 * @param {ExampleEntry[]} examples
 * @returns {ExampleGroup[]}
 */
export function buildExampleIndex(examples) {
  /** @type {Map<string, ExampleGroup>} */
  const groups = new Map();
  for (const ex of examples) {
    let g = groups.get(ex.kind);
    if (!g) {
      g = { kind: ex.kind, title: ex.title, note: ex.note, items: [] };
      groups.set(ex.kind, g);
    }
    g.items.push({ id: `${ex.kind}/${ex.name}`, name: ex.name, source: ex.source });
  }
  return [...groups.values()];
}

/**
 * @param {ExampleGroup[]} index
 * @param {string} id `kind/name`
 * @returns {{ group: ExampleGroup, item: ExampleGroup["items"][number] } | null}
 */
export function findExample(index, id) {
  for (const group of index) {
    const item = group.items.find((i) => i.id === id);
    if (item) return { group, item };
  }
  return null;
}

/**
 * Case-insensitive filter over type, name and note; empty query keeps all.
 * @param {ExampleGroup[]} index
 * @param {string} query
 * @returns {ExampleGroup[]}
 */
export function filterExamples(index, query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return index;
  /** @type {ExampleGroup[]} */
  const out = [];
  for (const g of index) {
    const items = g.items.filter((i) => {
      const hay = `${g.title} ${g.kind} ${i.name} ${g.note}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
    if (items.length) out.push({ ...g, items });
  }
  return out;
}
