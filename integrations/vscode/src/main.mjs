/**
 * Bundle entry point: binds the extension to the real `vscode` module.
 * `vscode` is external to the bundle; the extension host provides it.
 * @module vscode/main
 */

import * as vscode from "vscode";
import { createExtension } from "./extension.mjs";

const extension = createExtension(vscode);

export const activate = extension.activate;
export const deactivate = extension.deactivate;
