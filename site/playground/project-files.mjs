import { isPlantUmlFile } from "../../src/core/project-paths.mjs";
import { MAX_SOURCE_BYTES } from "./options.mjs";

export const MAX_PROJECT_FILES = 100;
export const MAX_PROJECT_BYTES = 2 * 1024 * 1024;

/** Read only files selected by the user. Directory selections provide relative paths. */
export async function readProjectFiles(files) {
  const selected = Array.from(files).filter((file) => isPlantUmlFile(file.name));
  if (!selected.length) throw new Error("Select PlantUML files or a folder containing them.");
  if (selected.length > MAX_PROJECT_FILES)
    throw new Error(`Select at most ${MAX_PROJECT_FILES} PlantUML files.`);
  let total = 0;
  for (const file of selected) {
    if (file.size > MAX_SOURCE_BYTES)
      throw new Error(`${file.name} exceeds ${MAX_SOURCE_BYTES / 1024} KB.`);
    total += file.size;
    if (total > MAX_PROJECT_BYTES) throw new Error("Selected PlantUML files exceed 2 MiB.");
  }
  return Promise.all(
    selected.map(async (file) => ({
      path: file.webkitRelativePath || file.name,
      text: await file.text(),
    })),
  );
}
