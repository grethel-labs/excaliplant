/**
 * Worker-thread entry point: runs one tool call at a time for the worker
 * executor. Not part of the public API.
 * @module mcp/worker
 */

import { parentPort, workerData } from "node:worker_threads";
import { warmup } from "../api.mjs";
import { isElkLoaded } from "../diagrams/graph/elk_runner.mjs";
import { runTool } from "./tools.mjs";

// The worker's stderr is forwarded to the server's stderr by the parent.
const log = (/** @type {string} */ message) => process.stderr.write(`${message}\n`);

parentPort?.on(
  "message",
  async (/** @type {{ id: number, tool: string, args: unknown, warmup?: boolean }} */ job) => {
    if (job.warmup) {
      // Runs concurrently with jobs: both share the one layout-engine import.
      await warmup();
      parentPort?.postMessage({ warmup: true, loaded: isElkLoaded() });
      return;
    }
    const result = await runTool(job.tool, job.args, workerData.env, log);
    parentPort?.postMessage({ id: job.id, result });
  },
);
