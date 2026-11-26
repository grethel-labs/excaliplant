import { defaultRegistry, render } from "../../src/api.mjs";
import { isPlantUmlFile, findProjectEntries, resolveProjectPath } from "../../src/core/project.mjs";
import { extractBlocks } from "../../src/core/source.mjs";
import { Canvas } from "../../src/draw/canvas.mjs";
import { createTheme } from "../../src/draw/theme.mjs";
import { createDocument, validateDocument } from "../../src/render/excalidraw.mjs";
import { MAX_PROJECT_BYTES, MAX_PROJECT_FILES } from "./project-files.mjs";
import { MAX_SOURCE_BYTES } from "./options.mjs";

const MAX_PROJECT_DIAGRAMS = 16;
const encoder = new TextEncoder();

/** Validate a bounded set of file messages and make a resolver for those files. */
function prepareFiles(input) {
  if (!Array.isArray(input) || !input.length || input.length > MAX_PROJECT_FILES)
    throw new Error(`Select between 1 and ${MAX_PROJECT_FILES} PlantUML files.`);
  const files = new Map();
  let total = 0;
  for (const item of input) {
    if (typeof item?.path !== "string" || item.path.length > 1000 || typeof item.text !== "string")
      throw new Error("Invalid local PlantUML file.");
    const path = resolveProjectPath(null, item.path);
    if (!path || !isPlantUmlFile(path)) throw new Error("Invalid local PlantUML path.");
    if (files.has(path))
      throw new Error(
        `Ambiguous local file ${JSON.stringify(path)}. Open the folder to keep paths.`,
      );
    const bytes = encoder.encode(item.text).length;
    total += bytes;
    if (bytes > MAX_SOURCE_BYTES) throw new Error(`${path} exceeds ${MAX_SOURCE_BYTES / 1024} KB.`);
    if (total > MAX_PROJECT_BYTES) throw new Error("Selected PlantUML files exceed 2 MiB.");
    files.set(path, { path, text: item.text });
  }
  const flat = ![...files.keys()].some((path) => path.includes("/"));
  /** @type {import("../../src/core/preprocess/preprocessor.mjs").IncludeResolver} */
  const include = (target, { from, kind }) => {
    if (kind !== "file") return null;
    const path = resolveProjectPath(from, target);
    if (!path) return null;
    return files.get(flat ? path.split("/").at(-1) : path) ?? null;
  };
  return { files, include };
}

/**
 * Render successful entries independently and keep other entries available
 * when a missing dependency or parse error affects one diagram.
 */
export async function renderProject(input, options, isCurrent) {
  const { files, include } = prepareFiles(input);
  const sorted = [...files.keys()].sort();
  const entryPaths =
    files.size === 1
      ? sorted
      : findProjectEntries(
          sorted.map((path) => files.get(path)),
          include,
          {
            defines: options.defines,
            raw: (type) => defaultRegistry.forStart(type).every((module) => module.raw),
          },
        );
  if (!entryPaths.length)
    throw new Error("No complete PlantUML diagrams found. Select one file to open a bare snippet.");
  const jobs = entryPaths.flatMap((path) => {
    const source = files.get(path).text;
    const blocks = extractBlocks(source);
    return blocks.map((block, index) => ({
      path,
      source,
      index,
      name: blocks.length === 1 ? path : `${path} · ${block.name || `Diagram ${index + 1}`}`,
    }));
  });
  if (jobs.length > MAX_PROJECT_DIAGRAMS)
    throw new Error(`Select a project with at most ${MAX_PROJECT_DIAGRAMS} diagrams.`);

  const entries = [];
  const problems = [];
  let elements = 0;
  for (const [index, job] of jobs.entries()) {
    if (!isCurrent()) return null;
    try {
      const result = await render(job.source, {
        ...options,
        kind: undefined,
        block: job.index,
        include,
        strictIncludes: true,
        sourcePath: job.path,
        filename: options.filename ?? job.path.split("/").at(-1),
        seed: `${options.seed ?? "excaliplant"}|project|${index}`,
      });
      elements += result.excalidraw.elements.length;
      if (elements > options.limits.maxElements)
        throw new Error(`Project exceeds ${options.limits.maxElements} drawing elements.`);
      entries.push({ result, name: job.name });
    } catch (error) {
      problems.push({ severity: "error", message: `${job.name}: ${error.message}`, line: null });
    }
  }
  return { entries, problems };
}

/** Arrange complete, independently laid-out scenes on one canvas. */
export function combineProject(documents, options, background) {
  const theme = createTheme(options.theme ?? "sketch");
  const canvas = new Canvas({
    theme,
    seed: 1,
    maxElements: options.limits.maxElements + documents.length,
  });
  const elements = [];
  const pad = 24;
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  for (const [index, document] of documents.entries()) {
    const hookNames = new Map();
    const bound = canvas.bounds(document.elements);
    const width = bound.w + pad * 2;
    const height = bound.h + pad * 2;
    canvas.rect(x, y, width, height, {
      fill: background ?? document.appState.viewBackgroundColor,
      fillStyle: "solid",
      stroke: "transparent",
      roughness: 0,
    });
    elements.push(
      { ...canvas.elements.at(-1), id: `project-background-${index}` },
      ...document.elements.map((element) => {
        const placed = {
          ...element,
          x: element.x + x + pad - bound.x,
          y: element.y + y + pad - bound.y,
        };
        const hook = element.customData?.excaliplantHook;
        if (hook) {
          // Author IDs and selectors may repeat across independent documents.
          if (!hookNames.has(hook.name))
            hookNames.set(hook.name, `@line:${index}:${hookNames.size}`);
          placed.customData = {
            ...element.customData,
            excaliplantHook: { ...hook, name: hookNames.get(hook.name) },
          };
        }
        return placed;
      }),
    );
    rowHeight = Math.max(rowHeight, height);
    if (index % 2 === 0) x = width + pad;
    else {
      x = 0;
      y += rowHeight + pad;
      rowHeight = 0;
    }
  }
  return validateDocument(
    createDocument(elements, {
      background: background ?? documents[0].appState.viewBackgroundColor,
    }),
  );
}
