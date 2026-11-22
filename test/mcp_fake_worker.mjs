// Stand-in worker entry for the executor warm-up tests (not a test file).
// workerData.env.mode: "ok" (warm-up succeeds), "fail" (reports that the engine
// did not load), "crash" (the thread dies while warming), "hang" (never answers
// a job; used to provoke timeouts).
import { parentPort, workerData } from "node:worker_threads";

const mode = workerData.env.mode;

parentPort.on("message", (message) => {
  if (message.warmup) {
    process.stderr.write("warm-up requested\n");
    if (mode === "crash") process.exit(1);
    parentPort.postMessage({ warmup: true, loaded: mode !== "fail" });
    return;
  }
  if (mode === "hang") return;
  parentPort.postMessage({ id: message.id, result: { content: [{ type: "text", text: "ok" }] } });
});
