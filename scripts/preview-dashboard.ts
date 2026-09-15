import { buildServer } from "../server/src/app.js";
import { MemoryStore } from "../server/src/persistence/memory-store.js";

const store = new MemoryStore();
const agent = await store.createAgent({
  name: "forge-test-01",
  environment: "TESTING",
  permissionLevel: 2,
  tokenDigest: "preview-only",
});
await store.updateAgentPresence(
  agent.id,
  {
    cpu: { loadPercent: 18 },
    memory: { totalBytes: 16_000_000_000, freeBytes: 9_000_000_000 },
    disks: [{ totalBytes: 512_000_000_000, freeBytes: 360_000_000_000 }],
  },
  new Date(),
);
const project = await store.createProject({
  name: "sample-api",
  repositoryUrl: "https://example.invalid/sample-api.git",
});
const workspace = await store.createWorkspace({
  projectId: project.id,
  agentId: agent.id,
  rootPath: "/workspace/sample-api",
});
const task = await store.createTask({
  projectId: project.id,
  agentId: agent.id,
  workspaceId: workspace.id,
  goal: "Analyze the API, run tests, repair failures and verify the result",
  maxFixAttempts: 2,
});
await store.updateTaskStatus(task.id, "WAITING_APPROVAL");
await store.createApproval({
  taskId: task.id,
  toolName: "database.migrate",
  risk: "HIGH",
  reason: "Apply the verified schema migration",
  impact: "Changes the testing database schema",
  affectedResources: ["sample-api database"],
  argumentHash: "preview",
});
await store.appendAudit({
  agentId: agent.id,
  projectId: project.id,
  userId: "preview",
  action: "agent.connected",
  durationMs: 42,
  status: "SUCCESS",
  metadata: {},
});
await store.appendAudit({
  agentId: agent.id,
  projectId: project.id,
  userId: "preview",
  action: "approval.requested",
  durationMs: 5,
  status: "PENDING",
  metadata: {},
});

const app = await buildServer({
  store,
  secrets: {
    masterApiKey: "preview-master-key",
    mcpKey: "preview-mcp-key",
    enrollmentKey: "preview-enrollment-key",
    sessionSecret: "preview-session-secret-that-is-long-enough",
  },
  logger: false,
});
const previewPort = Number(process.env.AEGIS_PREVIEW_PORT ?? 4173);
await app.listen({ host: "127.0.0.1", port: previewPort });
console.error(
  `Dashboard preview: http://127.0.0.1:${previewPort} (key: preview-master-key)`,
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => void app.close().finally(() => process.exit(0)));
