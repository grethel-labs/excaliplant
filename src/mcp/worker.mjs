/**
 * Worker-thread entry point: runs one tool call at a time for the worker
 * executor. Not part of the public API.
 * @module mcp/worker
 */

import { parentPort, workerData } from "node:worker_threads";
import { runTool } from "./tools.mjs";

// The worker's stderr is forwarded to the server's stderr by the parent.
const log = (/** @type {string} */ message) => process.stderr.write(`${message}\n`);

parentPort?.on(
  "message",
  async (/** @type {{ id: number, tool: string, args: unknown }} */ job) => {
    const result = await runTool(job.tool, job.args, workerData.env, log);
    parentPort?.postMessage({ id: job.id, result });
  },
);
