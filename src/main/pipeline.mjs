/**
 * Module-aware pipeline wrappers around the existing parser/layout/render
 * layers. These wrappers provide failure boundaries and final artifact
 * validation without changing the public model classes.
 * @module modules/pipeline
 */

import { layoutDiagram } from "../general/layout/elk_layout.mjs";
import { exportDiagram } from "../general/render/excalidraw.mjs";
import { createSecurityBase } from "../general/platform/security_base.mjs";
import { getDiagramModuleMetadata, setDiagramModuleMetadata } from "./metadata.mjs";

/** @public */
export const defaultSecurityBase = createSecurityBase();

/**
 * Lay out a diagram inside its module failure boundary when metadata is available.
 * @param {object} diagram Diagram model.
 * @returns {Promise<void>}
 * @public
 */
export async function layoutDiagramWithModule(diagram) {
  const metadata = getOrCreateFallbackMetadata(diagram);
  const boundary = defaultSecurityBase.createFailureBoundary("layout", metadata.securityContext);
  await boundary.runAsync(async () => {
    const context = {
      module: metadata.module,
      kind: metadata.kind,
      securityContext: metadata.securityContext,
      layoutStrategy: metadata.module?.layoutStrategy ?? "custom",
    };
    if (metadata.module) await metadata.module.layout(diagram, context);
    else await layoutDiagram(/** @type {any} */ (diagram));
  });
}

/**
 * Export a laid-out diagram and validate the generated artifact before returning it.
 * @param {object} diagram Diagram model.
 * @param {object} [opts]
 * @returns {object} Excalidraw document.
 * @public
 */
export function exportDiagramWithModule(diagram, opts = {}) {
  const metadata = getOrCreateFallbackMetadata(diagram);
  const boundary = defaultSecurityBase.createFailureBoundary("render", metadata.securityContext);
  return boundary.run(() => {
    const context = {
      module: metadata.module,
      kind: metadata.kind,
      securityContext: metadata.securityContext,
      format: "excalidraw",
    };
    const renderers = metadata.module?.renderers() ?? {};
    const renderExcalidraw = renderers.excalidraw;
    const doc = renderExcalidraw
      ? renderExcalidraw(diagram, opts, context)
      : exportDiagram(/** @type {any} */ (diagram), opts);
    defaultSecurityBase.assertSafeArtifact(doc, metadata.securityContext);
    return doc;
  });
}

/**
 * @param {object} diagram Diagram model.
 * @returns {import("./metadata.mjs").DiagramModuleMetadata}
 */
function getOrCreateFallbackMetadata(diagram) {
  const existing = getDiagramModuleMetadata(diagram);
  if (existing) return existing;
  const securityContext = defaultSecurityBase.createContext(
    defaultSecurityBase.defaultProfileFor("manual"),
    {
      module: "manual",
    },
  );
  return /** @type {import("./metadata.mjs").DiagramModuleMetadata} */ (
    setDiagramModuleMetadata(diagram, {
      kind: "manual",
      module: /** @type {any} */ (null),
      securityContext,
      diagnostics: securityContext.diagnostics,
    }) && getDiagramModuleMetadata(diagram)
  );
}
