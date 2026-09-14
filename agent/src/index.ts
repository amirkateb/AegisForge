import { AgentRuntime } from "./runtime.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

export * from "./security/workspace-guard.js";
export * from "./inventory.js";
export * from "./runtime.js";

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  const runtime = new AgentRuntime();
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, () => runtime.stop());
  await runtime.run();
}
