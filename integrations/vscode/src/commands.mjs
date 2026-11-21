/**
 * Command implementations: render to Excalidraw/SVG, replace Markdown
 * diagrams with SVG files.
 * @module vscode/commands
 */

import path from "node:path";
import { extractBlocks, renderMarkdown } from "./engine.mjs";
import { listDiagrams, messageOf, toExcalidrawJson, toSvgFile } from "./diagram.mjs";
import { blockOptions } from "./options.mjs";

/** File extensions treated as PlantUML source. */
export const PLANTUML_EXTENSIONS = Object.freeze([".puml", ".plantuml", ".pu", ".iuml"]);

/** @param {string} name */
const hasPlantumlExtension = (name) =>
  PLANTUML_EXTENSIONS.includes(path.posix.extname(name).toLowerCase());

/** @param {string} name */
const hasMarkdownExtension = (name) =>
  [".md", ".markdown", ".mdx"].includes(path.posix.extname(name).toLowerCase());

/**
 * What a command renders.
 * @typedef {object} Target
 * @property {any} uri Document URI (used for default output names).
 * @property {string} text Document text (the diagram source for `file`).
 * @property {"file" | "fence"} kind
 * @property {number} block Diagram index within a `file`.
 * @property {import("./diagram.mjs").DiagramOptions["attrs"]} [attrs] Fence attributes.
 * @property {string} source Text handed to the renderer.
 * @property {string} suffix Name part for multi-diagram sources (may be empty).
 */

/**
 * @typedef {object} CommandDeps
 * @property {any} vscode
 * @property {(uri: any) => import("./options.mjs").RenderContext} getContext
 */

/**
 * @param {CommandDeps} deps
 */
export function createCommands(deps) {
  const { vscode } = deps;

  /**
   * @param {any} uri
   * @returns {Promise<{ uri: any, text: string, languageId: string, editor?: any } | undefined>}
   */
  async function documentOf(uri) {
    const active = vscode.window.activeTextEditor;
    if (uri && typeof uri.toString === "function" && uri.scheme) {
      if (active && active.document.uri.toString() === uri.toString()) {
        return {
          uri,
          text: active.document.getText(),
          languageId: active.document.languageId,
          editor: active,
        };
      }
      const doc = await vscode.workspace.openTextDocument(uri);
      return { uri, text: doc.getText(), languageId: doc.languageId };
    }
    if (!active) return undefined;
    return {
      uri: active.document.uri,
      text: active.document.getText(),
      languageId: active.document.languageId,
      editor: active,
    };
  }

  /**
   * Let the user choose among several items; a single item is returned directly.
   * @template T
   * @param {{ label: string, description?: string, value: T }[]} items
   * @param {string} placeHolder
   * @returns {Promise<T | undefined>}
   */
  async function choose(items, placeHolder) {
    if (items.length === 1) return items[0].value;
    const picked = await vscode.window.showQuickPick(items, { placeHolder });
    return picked?.value;
  }

  /**
   * Work out which diagram a command applies to.
   * @param {any} uriArg
   * @returns {Promise<Target | undefined>}
   */
  async function resolveTarget(uriArg) {
    const doc = await documentOf(uriArg);
    if (!doc) {
      vscode.window.showWarningMessage("Excaliplant: open a PlantUML or Markdown file first.");
      return undefined;
    }
    const name = String(doc.uri.path ?? "");
    const isMarkdown = doc.languageId === "markdown" || hasMarkdownExtension(name);
    const isPlantuml = doc.languageId === "plantuml" || hasPlantumlExtension(name);
    const cursor = doc.editor?.selection?.active;

    if (isMarkdown && !isPlantuml) {
      const blocks = extractBlocks(doc.text);
      if (blocks.length === 0) {
        vscode.window.showWarningMessage("Excaliplant: no plantuml, puml or uml code block found.");
        return undefined;
      }
      const inside = cursor
        ? blocks.find((b) => b.line - 1 <= cursor.line && cursor.line <= endLine(doc.text, b.end))
        : undefined;
      const block =
        inside ??
        (await choose(
          blocks.map((b) => ({
            label: `Line ${b.line}`,
            description: firstLine(b.source),
            value: b,
          })),
          "Which diagram?",
        ));
      if (!block) return undefined;
      return {
        uri: doc.uri,
        text: doc.text,
        kind: "fence",
        block: 0,
        attrs: block.attrs,
        source: block.source,
        suffix: `diagram-L${block.line}`,
      };
    }

    if (!isPlantuml) {
      vscode.window.showWarningMessage(
        "Excaliplant: this command works on PlantUML files (.puml, .plantuml, .pu, .iuml) and Markdown files.",
      );
      return undefined;
    }
    const diagrams = listDiagrams(doc.text);
    if (diagrams.length === 0) {
      vscode.window.showWarningMessage("Excaliplant: no diagram found.");
      return undefined;
    }
    const inside = cursor
      ? diagrams.find((d) => d.line - 1 <= cursor.line && cursor.line <= d.endLine - 1)
      : undefined;
    const diagram =
      inside ??
      (await choose(
        diagrams.map((d) => ({
          label: d.name ?? `Diagram ${d.index + 1}`,
          description: `line ${d.line}`,
          value: d,
        })),
        "Which diagram?",
      ));
    if (!diagram) return undefined;
    return {
      uri: doc.uri,
      text: doc.text,
      kind: "file",
      block: diagram.index,
      source: doc.text,
      suffix: diagrams.length > 1 ? sanitizeName(diagram.name ?? `${diagram.index + 1}`) : "",
    };
  }

  /**
   * @param {"svg" | "excalidraw"} format
   * @param {any} [uriArg]
   */
  async function renderTo(format, uriArg) {
    let target;
    try {
      target = await resolveTarget(uriArg);
    } catch (err) {
      vscode.window.showErrorMessage(`Excaliplant: ${messageOf(err)}`);
      return;
    }
    if (!target) return;
    const ctx = deps.getContext(target.uri);
    const base = path.posix.basename(
      String(target.uri.path ?? ""),
      path.posix.extname(target.uri.path ?? ""),
    );
    /** @type {string} */
    let data;
    try {
      const run = () => {
        const o = {
          options: blockOptions(ctx),
          block: target.block,
          filename: path.posix.basename(String(target.uri.path ?? "")),
          attrs: target.attrs,
        };
        return format === "svg" ? toSvgFile(target.source, o) : toExcalidrawJson(target.source, o);
      };
      data = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Window, title: "Excaliplant: rendering…" },
        run,
      );
    } catch (err) {
      vscode.window.showErrorMessage(`Excaliplant: ${messageOf(err)}`);
      return;
    }
    const ext = format === "svg" ? "svg" : "excalidraw";
    const fileName = `${[base, target.suffix].filter(Boolean).join("-")}.${ext}`;
    const dir = vscode.Uri.joinPath(target.uri, "..");
    const dest = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.joinPath(dir, fileName),
      filters: format === "svg" ? { SVG: ["svg"] } : { Excalidraw: ["excalidraw"] },
      saveLabel: "Save",
    });
    if (!dest) return;
    try {
      await vscode.workspace.fs.writeFile(dest, new TextEncoder().encode(data));
    } catch (err) {
      vscode.window.showErrorMessage(`Excaliplant: could not write the file: ${messageOf(err)}`);
      return;
    }
    Promise.resolve(
      vscode.window.showInformationMessage(
        `Excaliplant: wrote ${path.posix.basename(dest.path)}`,
        "Open",
      ),
    ).then((choice) => {
      if (choice === "Open") return vscode.commands.executeCommand("vscode.open", dest);
      return undefined;
    });
  }

  /**
   * Replace every PlantUML fence of a Markdown document by an SVG file link.
   * The PlantUML source stays in a comment so the diagrams can be re-rendered.
   * @param {any} [uriArg]
   */
  async function replaceInMarkdown(uriArg) {
    const doc = await documentOf(uriArg);
    if (
      !doc ||
      !(doc.languageId === "markdown" || hasMarkdownExtension(String(doc.uri.path ?? "")))
    ) {
      vscode.window.showWarningMessage("Excaliplant: open a Markdown file first.");
      return;
    }
    const ctx = deps.getContext(doc.uri);
    const dirUri = vscode.Uri.joinPath(doc.uri, "..");
    const folder = vscode.workspace.getWorkspaceFolder?.(doc.uri);
    // Assets may go anywhere below the workspace folder (or the file's folder
    // when it is not part of a workspace), never outside of it.
    const boundary = String((folder ? folder.uri : dirUri).path).replace(/\/+$/, "");
    let result;
    try {
      result = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Window, title: "Excaliplant: rendering…" },
        () =>
          renderMarkdown(doc.text, {
            ...blockOptions(ctx),
            mode: "file",
            keepSource: true,
            assetsDir: ctx.settings.assetsDir,
            filename: path.posix.basename(String(doc.uri.path ?? "")),
          }),
      );
    } catch (err) {
      vscode.window.showErrorMessage(`Excaliplant: ${messageOf(err)}`);
      return;
    }
    const failed = result.blocks.filter((b) => b.error);
    if (!result.changed && failed.length === 0) {
      vscode.window.showInformationMessage(
        "Excaliplant: nothing to replace, all diagrams are up to date.",
      );
      return;
    }
    /** @type {{ uri: any, data: string }[]} */
    const writes = [];
    for (const asset of result.assets) {
      const resolved = path.posix.normalize(path.posix.join(String(dirUri.path), asset.name));
      if (resolved !== boundary && !resolved.startsWith(`${boundary}/`)) {
        vscode.window.showErrorMessage(
          `Excaliplant: "${ctx.settings.assetsDir}" leaves the workspace; nothing was written. Change excaliplant.markdown.assetsDir.`,
        );
        return;
      }
      writes.push({ uri: dirUri.with({ path: resolved }), data: asset.data });
    }
    try {
      const dirs = new Set(writes.map((w) => path.posix.dirname(w.uri.path)));
      for (const dir of dirs) await vscode.workspace.fs.createDirectory(dirUri.with({ path: dir }));
      for (const w of writes) {
        await vscode.workspace.fs.writeFile(w.uri, new TextEncoder().encode(w.data));
      }
    } catch (err) {
      vscode.window.showErrorMessage(
        `Excaliplant: could not write the SVG files: ${messageOf(err)}`,
      );
      return;
    }
    if (result.changed) {
      const edit = new vscode.WorkspaceEdit();
      const document = await vscode.workspace.openTextDocument(doc.uri);
      edit.replace(
        doc.uri,
        new vscode.Range(document.positionAt(0), document.positionAt(doc.text.length)),
        result.markdown,
      );
      if (!(await vscode.workspace.applyEdit(edit))) {
        vscode.window.showErrorMessage("Excaliplant: the document could not be edited.");
        return;
      }
    }
    const done = `Excaliplant: ${writes.length} SVG file${writes.length === 1 ? "" : "s"} written.`;
    if (failed.length > 0) {
      const first = failed[0];
      vscode.window.showWarningMessage(
        `${done} ${failed.length} diagram${failed.length === 1 ? "" : "s"} failed and ${failed.length === 1 ? "was" : "were"} left unchanged (line ${first.line}: ${first.error}).`,
      );
    } else {
      vscode.window.showInformationMessage(`${done} Undo restores the Markdown text.`);
    }
  }

  return { renderTo, replaceInMarkdown, resolveTarget };
}

/** @param {string} text @param {number} offset 0-based line of `offset` */
function endLine(text, offset) {
  let line = 0;
  for (let i = 0; i < offset && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

/** @param {string} source */
function firstLine(source) {
  const line = source.split(/\r?\n/).find((l) => l.trim() && !l.trim().startsWith("@start"));
  return (line ?? "").trim().slice(0, 80);
}

/** @param {string} name */
function sanitizeName(name) {
  const clean = name.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "");
  return clean.slice(0, 60) || "diagram";
}
