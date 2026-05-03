// Smoke test executed against the *packed* tarball, in a clean
// project that depends on @grethel-labs/excaliplant. Run by the
// `pack-smoke` CI job on Linux, macOS, and Windows.

import { renderPlantUml, parsePlantUml, exportDiagram } from "@grethel-labs/excaliplant";

if (typeof renderPlantUml !== "function") throw new Error("renderPlantUml missing");
if (typeof parsePlantUml !== "function") throw new Error("parsePlantUml missing");
if (typeof exportDiagram !== "function") throw new Error("exportDiagram missing");

const cases = {
  empty: "@startuml\n@enduml",
  connection: "@startuml\n[a]\n[b]\na --> b\n@enduml",
  reverse: "@startuml\n[a]\n[b]\na <-- b\n@enduml",
  bidir: "@startuml\n[a]\n[b]\na <--> b\n@enduml",
  container: "@startuml\npackage P {\n  [a]\n  [b]\n}\n@enduml",
  frame: "@startuml\nframe F {\n  [x]\n}\n@enduml",
  note_block: "@startuml\n[a]\n[b]\nnote left of a\n  multi\n  line\nend note\na --> b\n@enduml",
  sequence_basic:
    "@startuml\nparticipant Alice\nparticipant Bob\nAlice -> Bob: hi\nBob -->> Alice: ok\n@enduml",
  usecase: "@startuml\n(login)\n(logout)\n(login) --> (logout)\n@enduml",
  direction_up: "@startuml\n[a]\n[b]\na -up-> b\n@enduml",
  direction_left: "@startuml\n[a]\n[b]\na -left-> b\n@enduml",
  comments: "@startuml\n' a comment\nskinparam monochrome true\n[a]\n[b]\na --> b\n@enduml",
  big_label: "@startuml\n[a]\n[b]\na --> b : a long label with spaces and: punctuation\n@enduml",
  unicode: "@startuml\n[\u00fcber]\n[\u00f6mega]\n\u00fcber --> \u00f6mega\n@enduml",
  large:
    "@startuml\n" +
    Array.from({ length: 50 }, (_, i) => `[n${i}]`).join("\n") +
    "\n" +
    Array.from({ length: 49 }, (_, i) => `n${i} --> n${i + 1}`).join("\n") +
    "\n@enduml",
};

let failed = 0;
for (const [name, src] of Object.entries(cases)) {
  try {
    const doc = await renderPlantUml(src);
    if (!doc || !Array.isArray(doc.elements)) throw new Error("invalid doc");
    console.log(`  ${name}: OK (${doc.elements.length} elements)`);
  } catch (e) {
    console.error(`  ${name}: FAIL - ${e.message}`);
    failed++;
  }
}

if (failed > 0) {
  console.error(`\n${failed} edge case(s) failed.`);
  process.exit(1);
}
console.log("\nAll edge cases passed.");
