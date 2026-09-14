import { execFile } from "node:child_process";
import net from "node:net";
import { promisify } from "node:util";
import { z } from "zod";
import type { ToolPlugin } from "./index.js";

const run = promisify(execFile);
const serviceName = z.string().regex(/^[A-Za-z0-9_.@-]{1,200}$/);
const host = z.string().regex(/^[A-Za-z0-9.:_-]{1,253}$/);
const definition = (
  name: string,
  description: string,
  requiredLevel: 0 | 1 | 2 | 3 | 4,
  risk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  approval: "NEVER" | "SENSITIVE" | "ALWAYS",
  inputSchema: Record<string, unknown>,
  timeoutMs = 120_000,
) =>
  ({
    name,
    description,
    requiredLevel,
    risk,
    approval,
    inputSchema,
    timeoutMs,
  }) as const;

async function exec(
  command: string,
  args: string[],
  cwd?: string,
): Promise<unknown> {
  const result = await run(command, args, {
    cwd,
    timeout: 120_000,
    maxBuffer: 2 * 1024 * 1024,
    env: { PATH: process.env.PATH ?? "", LANG: process.env.LANG ?? "C.UTF-8" },
  });
  return { stdout: result.stdout, stderr: result.stderr };
}

export const processListTool: ToolPlugin = {
  definition: definition(
    "system.process.list",
    "List processes without invoking a shell",
    0,
    "LOW",
    "NEVER",
    { type: "object" },
  ),
  async execute() {
    return exec("ps", [
      "-eo",
      "pid,ppid,user,%cpu,%mem,etime,comm",
      "--sort=-%cpu",
    ]);
  },
};

export const serviceStatusTool: ToolPlugin = {
  definition: definition(
    "system.service.status",
    "Inspect a systemd service",
    0,
    "LOW",
    "NEVER",
    {
      type: "object",
      required: ["name"],
      properties: { name: { type: "string" } },
    },
  ),
  async execute(arguments_) {
    const name = z.object({ name: serviceName }).parse(arguments_).name;
    return exec("systemctl", [
      "show",
      name,
      "--no-pager",
      "--property=Id,LoadState,ActiveState,SubState",
    ]);
  },
};

export const serviceControlTool: ToolPlugin = {
  definition: definition(
    "system.service.control",
    "Start, stop, restart, or reload a systemd service",
    3,
    "HIGH",
    "ALWAYS",
    {
      type: "object",
      required: ["name", "action"],
      properties: {
        name: { type: "string" },
        action: { enum: ["start", "stop", "restart", "reload"] },
      },
    },
  ),
  async execute(arguments_) {
    const input = z
      .object({
        name: serviceName,
        action: z.enum(["start", "stop", "restart", "reload"]),
      })
      .parse(arguments_);
    return exec("systemctl", [input.action, input.name]);
  },
};

export const networkPortTool: ToolPlugin = {
  definition: definition(
    "network.port",
    "Test a TCP port with a bounded timeout",
    1,
    "LOW",
    "NEVER",
    {
      type: "object",
      required: ["host", "port"],
      properties: {
        host: { type: "string" },
        port: { type: "integer", minimum: 1, maximum: 65535 },
        timeoutMs: { type: "integer" },
      },
    },
    30_000,
  ),
  async execute(arguments_) {
    const input = z
      .object({
        host,
        port: z.number().int().min(1).max(65535),
        timeoutMs: z.number().int().min(100).max(30_000).default(3000),
      })
      .parse(arguments_);
    return new Promise((resolve) => {
      const socket = net.createConnection({
        host: input.host,
        port: input.port,
      });
      let settled = false;
      const done = (open: boolean, error?: string) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve({ open, error });
      };
      socket.setTimeout(input.timeoutMs);
      socket.once("connect", () => done(true));
      socket.once("timeout", () => done(false, "timeout"));
      socket.once("error", (error) => done(false, error.message));
    });
  },
};

export const networkHttpTool: ToolPlugin = {
  definition: definition(
    "network.http",
    "Perform a bounded HTTP or HTTPS health request",
    1,
    "MEDIUM",
    "NEVER",
    {
      type: "object",
      required: ["url"],
      properties: {
        url: { type: "string" },
        method: { enum: ["GET", "HEAD"] },
        timeoutMs: { type: "integer" },
      },
    },
    30_000,
  ),
  async execute(arguments_) {
    const input = z
      .object({
        url: z
          .string()
          .url()
          .refine((v) => v.startsWith("http://") || v.startsWith("https://")),
        method: z.enum(["GET", "HEAD"]).default("GET"),
        timeoutMs: z.number().int().min(100).max(30_000).default(5000),
      })
      .parse(arguments_);
    const response = await fetch(input.url, {
      method: input.method,
      redirect: "manual",
      signal: AbortSignal.timeout(input.timeoutMs),
    });
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      if (
        ["content-type", "content-length", "location", "server"].includes(key)
      )
        headers[key] = value;
    });
    return {
      status: response.status,
      headers,
      body:
        input.method === "HEAD"
          ? ""
          : (await response.text()).slice(0, 64 * 1024),
    };
  },
};

export const networkPingTool: ToolPlugin = {
  definition: definition(
    "network.ping",
    "Send a small bounded ICMP ping probe",
    1,
    "LOW",
    "NEVER",
    {
      type: "object",
      required: ["host"],
      properties: {
        host: { type: "string" },
        count: { type: "integer", minimum: 1, maximum: 5 },
      },
    },
    30_000,
  ),
  async execute(arguments_) {
    const input = z
      .object({ host, count: z.number().int().min(1).max(5).default(1) })
      .parse(arguments_);
    return exec("ping", ["-c", String(input.count), "-W", "3", input.host]);
  },
};

function commandTool(
  name: string,
  description: string,
  executable: string,
  allowedActions: readonly string[],
  level: 2 | 3 | 4,
  risk: "MEDIUM" | "HIGH" | "CRITICAL",
  approval: "SENSITIVE" | "ALWAYS" = "SENSITIVE",
): ToolPlugin {
  return {
    definition: definition(
      name,
      description,
      level,
      risk,
      approval,
      {
        type: "object",
        required: ["action"],
        properties: {
          action: { enum: allowedActions },
          args: { type: "array", items: { type: "string" } },
        },
      },
      600_000,
    ),
    async execute(arguments_, context) {
      const input = z
        .object({
          action: z.string().refine((value) => allowedActions.includes(value)),
          args: z.array(z.string().max(2000)).max(50).default([]),
        })
        .parse(arguments_);
      return exec(
        executable,
        [input.action, ...input.args],
        context.workspaceRoot,
      );
    },
  };
}

export const gitTool = commandTool(
  "developer.git",
  "Run an approved Git subcommand in the workspace",
  "git",
  [
    "status",
    "diff",
    "log",
    "branch",
    "fetch",
    "pull",
    "push",
    "commit",
    "add",
    "restore",
  ],
  2,
  "HIGH",
);
export const dockerTool = commandTool(
  "developer.docker",
  "Inspect and operate Docker resources",
  "docker",
  [
    "ps",
    "images",
    "logs",
    "inspect",
    "build",
    "compose",
    "restart",
    "stop",
    "start",
  ],
  3,
  "HIGH",
  "ALWAYS",
);
export const nginxTool = commandTool(
  "developer.nginx",
  "Validate or reload Nginx",
  "nginx",
  ["-t", "-s"],
  3,
  "HIGH",
  "ALWAYS",
);
export const databaseTool = commandTool(
  "database.postgresql",
  "Run a reviewed PostgreSQL client operation",
  "psql",
  ["--version", "--list", "--command", "--file"],
  3,
  "HIGH",
  "ALWAYS",
);
export const mysqlTool = commandTool(
  "database.mysql",
  "Run a reviewed MySQL client operation",
  "mysql",
  ["--version", "--execute"],
  3,
  "HIGH",
  "ALWAYS",
);
export const redisTool = commandTool(
  "database.redis",
  "Run a reviewed Redis client operation",
  "redis-cli",
  ["PING", "INFO", "GET", "SET", "DEL", "SCAN"],
  3,
  "HIGH",
  "ALWAYS",
);
export const nodeTool = commandTool(
  "developer.node",
  "Run an npm lifecycle operation",
  "npm",
  ["ci", "install", "test", "run", "audit"],
  2,
  "HIGH",
);
export const pythonTool = commandTool(
  "developer.python",
  "Run an explicit Python module",
  "python3",
  ["-m"],
  2,
  "HIGH",
);
export const laravelTool = commandTool(
  "developer.laravel",
  "Run an approved Laravel Artisan operation",
  "php",
  ["artisan"],
  3,
  "HIGH",
  "ALWAYS",
);
export const wordpressTool = commandTool(
  "developer.wordpress",
  "Run an approved WP-CLI operation",
  "wp",
  ["core", "plugin", "theme", "db", "search-replace", "cache"],
  3,
  "HIGH",
  "ALWAYS",
);
export const backupTool = commandTool(
  "cloud.backup",
  "Create a workspace archive with tar",
  "tar",
  ["-czf"],
  3,
  "HIGH",
  "ALWAYS",
);
export const restoreTool = commandTool(
  "cloud.restore",
  "Restore a reviewed archive into the workspace",
  "tar",
  ["-xzf"],
  4,
  "CRITICAL",
  "ALWAYS",
);

export const operationalTools = [
  processListTool,
  serviceStatusTool,
  serviceControlTool,
  networkPortTool,
  networkHttpTool,
  networkPingTool,
  gitTool,
  dockerTool,
  nginxTool,
  databaseTool,
  mysqlTool,
  redisTool,
  nodeTool,
  pythonTool,
  laravelTool,
  wordpressTool,
  backupTool,
  restoreTool,
];
