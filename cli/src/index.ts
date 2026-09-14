#!/usr/bin/env node
import { Command } from "commander";
import { randomUUID } from "node:crypto";

const program = new Command()
  .name("aegisforge")
  .description("Operate the AegisForge control plane")
  .version("0.1.0");
const baseUrl = () =>
  (process.env.AEGISFORGE_URL ?? "https://127.0.0.1:8787").replace(/\/$/, "");
const key = () => {
  const value = process.env.AEGISFORGE_MASTER_API_KEY;
  if (!value) throw new Error("AEGISFORGE_MASTER_API_KEY is required");
  return value;
};
async function api(path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${key()}`,
      "content-type": "application/json",
      ...init?.headers,
    },
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(
      (body as { error?: { message?: string } }).error?.message ??
        `HTTP ${response.status}`,
    );
  return body;
}
function print(value: unknown, json: boolean) {
  if (json) console.log(JSON.stringify(value, null, 2));
  else if (Array.isArray((value as { data?: unknown[] })?.data))
    console.table((value as { data: unknown[] }).data);
  else console.log(value);
}
const jsonOption = (command: Command) => command.option("--json", "print JSON");
jsonOption(program.command("status")).action(async (options) =>
  print(await api("/healthz"), options.json),
);
jsonOption(program.command("agents")).action(async (options) =>
  print(await api("/v1/agents"), options.json),
);
jsonOption(program.command("projects")).action(async (options) =>
  print(await api("/v1/projects"), options.json),
);
jsonOption(program.command("logs")).action(async (options) =>
  print(await api("/v1/logs"), options.json),
);
program
  .command("task")
  .requiredOption("--project <uuid>")
  .requiredOption("--agent <uuid>")
  .requiredOption("--workspace <uuid>")
  .requiredOption("--goal <text>")
  .action(async (options) =>
    print(
      await api("/v1/tasks", {
        method: "POST",
        headers: { "idempotency-key": randomUUID() },
        body: JSON.stringify({
          projectId: options.project,
          agentId: options.agent,
          workspaceId: options.workspace,
          goal: options.goal,
        }),
      }),
      true,
    ),
  );
program
  .command("deploy")
  .requiredOption("--project <uuid>")
  .requiredOption("--agent <uuid>")
  .requiredOption("--workspace <uuid>")
  .option("--environment <name>", "target environment", "production")
  .action(async (options) =>
    print(
      await api("/v1/tasks", {
        method: "POST",
        headers: { "idempotency-key": randomUUID() },
        body: JSON.stringify({
          projectId: options.project,
          agentId: options.agent,
          workspaceId: options.workspace,
          goal: `Deploy the assigned project to ${options.environment}; inspect requirements, plan, request approvals, back up, deploy, verify health and report evidence.`,
        }),
      }),
      true,
    ),
  );
program
  .command("approve")
  .argument("<approval-id>")
  .option("--session")
  .option("--deny")
  .action(async (id, options) =>
    print(
      await api(`/v1/approvals/${id}/decision`, {
        method: "POST",
        body: JSON.stringify({
          decision: options.deny
            ? "DENY"
            : options.session
              ? "APPROVE_SESSION"
              : "APPROVE_ONCE",
        }),
      }),
      true,
    ),
  );

program.parseAsync().catch((error) => {
  console.error(
    `Error: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
