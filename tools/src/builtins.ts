import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import dns from "node:dns/promises";
import { z } from "zod";
import type { ToolContext, ToolPlugin } from "./index.js";

const pathInput = z.object({ path: z.string().min(1).max(2000) });
const writeInput = pathInput.extend({
  content: z.string().max(10_000_000),
  mode: z.enum(["CREATE", "OVERWRITE"]).default("CREATE"),
});
const editInput = pathInput.extend({
  search: z.string().min(1),
  replacement: z.string(),
  expectedReplacements: z.number().int().positive().default(1),
});
const moveInput = z.object({
  source: z.string().min(1),
  destination: z.string().min(1),
});
const executeInput = z.object({
  executable: z.string().regex(/^[A-Za-z0-9._+-]+$/),
  args: z.array(z.string().max(4000)).max(100).default([]),
  timeoutMs: z.number().int().min(100).max(600_000).default(120_000),
});
const searchInput = z.object({
  path: z.string().default("."),
  query: z.string().min(1).max(1000),
  maxResults: z.number().int().min(1).max(1000).default(200),
});
const listInput = z.object({
  path: z.string().default("."),
  depth: z.number().int().min(0).max(12).default(6),
  maxFiles: z.number().int().min(1).max(20_000).default(5000),
});

function definition(
  name: string,
  description: string,
  requiredLevel: 0 | 1 | 2 | 3 | 4,
  risk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  approval: "NEVER" | "SENSITIVE" | "ALWAYS",
  inputSchema: Record<string, unknown>,
  timeoutMs = 120_000,
) {
  return {
    name,
    description,
    requiredLevel,
    risk,
    approval,
    inputSchema,
    timeoutMs,
  } as const;
}

export const readFileTool: ToolPlugin = {
  definition: definition(
    "filesystem.read",
    "Read a UTF-8 file inside the assigned workspace",
    0,
    "LOW",
    "NEVER",
    {
      type: "object",
      required: ["path"],
      properties: { path: { type: "string" } },
    },
  ),
  async execute(arguments_, context) {
    const input = pathInput.parse(arguments_);
    return {
      content: await fs.readFile(await context.resolvePath(input.path), "utf8"),
    };
  },
};

export const searchFilesTool: ToolPlugin = {
  definition: definition(
    "filesystem.search",
    "Search text files recursively inside the assigned workspace",
    0,
    "LOW",
    "NEVER",
    {
      type: "object",
      required: ["query"],
      properties: {
        path: { type: "string" },
        query: { type: "string" },
        maxResults: { type: "integer", minimum: 1, maximum: 1000 },
      },
    },
  ),
  async execute(arguments_, context) {
    const input = searchInput.parse(arguments_);
    const root = await context.resolvePath(input.path);
    const results: Array<{ path: string; line: number; text: string }> = [];
    let filesVisited = 0;
    let traversalTruncated = false;
    const walk = async (current: string): Promise<void> => {
      if (results.length >= input.maxResults || filesVisited >= 20_000) {
        traversalTruncated = true;
        return;
      }
      const entries = await fs.readdir(current, { withFileTypes: true });
      for (const entry of entries) {
        if (results.length >= input.maxResults || filesVisited >= 20_000) {
          traversalTruncated = true;
          break;
        }
        if (
          entry.isSymbolicLink() ||
          [".git", "node_modules", "vendor"].includes(entry.name)
        )
          continue;
        const target = path.join(current, entry.name);
        if (entry.isDirectory()) {
          await walk(target);
          continue;
        }
        if (!entry.isFile()) continue;
        filesVisited++;
        const stat = await fs.stat(target);
        if (stat.size > 2 * 1024 * 1024) continue;
        const content = await fs.readFile(target);
        if (content.includes(0)) continue;
        content
          .toString("utf8")
          .split("\n")
          .forEach((text, index) => {
            if (results.length < input.maxResults && text.includes(input.query))
              results.push({
                path: path.relative(context.workspaceRoot, target),
                line: index + 1,
                text: text.slice(0, 4000),
              });
          });
      }
    };
    await walk(root);
    return {
      results,
      filesVisited,
      truncated: traversalTruncated || results.length >= input.maxResults,
    };
  },
};

export const listFilesTool: ToolPlugin = {
  definition: definition(
    "filesystem.list",
    "List bounded workspace files for project and code intelligence",
    0,
    "LOW",
    "NEVER",
    {
      type: "object",
      properties: {
        path: { type: "string" },
        depth: { type: "integer", minimum: 0, maximum: 12 },
        maxFiles: { type: "integer", minimum: 1, maximum: 20000 },
      },
    },
  ),
  async execute(arguments_, context) {
    const input = listInput.parse(arguments_);
    const root = await context.resolvePath(input.path);
    const files: string[] = [];
    let truncated = false;
    const walk = async (current: string, depth: number): Promise<void> => {
      if (depth > input.depth || files.length >= input.maxFiles) {
        truncated = true;
        return;
      }
      for (const entry of await fs.readdir(current, { withFileTypes: true })) {
        if (entry.isSymbolicLink() || [".git", "node_modules", "vendor", "dist", "build"].includes(entry.name)) continue;
        const target = path.join(current, entry.name);
        if (entry.isDirectory()) await walk(target, depth + 1);
        else if (entry.isFile()) files.push(path.relative(context.workspaceRoot, target));
        if (files.length >= input.maxFiles) { truncated = true; break; }
      }
    };
    await walk(root, 0);
    return { files: files.sort(), truncated };
  },
};

export const writeFileTool: ToolPlugin = {
  definition: definition(
    "filesystem.write",
    "Create or explicitly overwrite a file inside the workspace",
    2,
    "MEDIUM",
    "NEVER",
    {
      type: "object",
      required: ["path", "content"],
      properties: {
        path: { type: "string" },
        content: { type: "string" },
        mode: { enum: ["CREATE", "OVERWRITE"] },
      },
    },
  ),
  async execute(arguments_, context) {
    const input = writeInput.parse(arguments_);
    const target = await context.resolvePath(input.path);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, input.content, {
      encoding: "utf8",
      flag: input.mode === "CREATE" ? "wx" : "w",
    });
    return { path: input.path, bytes: Buffer.byteLength(input.content) };
  },
};

export const editFileTool: ToolPlugin = {
  definition: definition(
    "filesystem.edit",
    "Apply an exact counted text replacement inside the workspace",
    2,
    "MEDIUM",
    "NEVER",
    {
      type: "object",
      required: ["path", "search", "replacement"],
      properties: {
        path: { type: "string" },
        search: { type: "string" },
        replacement: { type: "string" },
        expectedReplacements: { type: "integer", minimum: 1 },
      },
    },
  ),
  async execute(arguments_, context) {
    const input = editInput.parse(arguments_);
    const target = await context.resolvePath(input.path);
    const source = await fs.readFile(target, "utf8");
    const count = source.split(input.search).length - 1;
    if (count !== input.expectedReplacements)
      throw new Error(
        `Expected ${input.expectedReplacements} replacements but found ${count}`,
      );
    await fs.writeFile(
      target,
      source.split(input.search).join(input.replacement),
      "utf8",
    );
    return { replacements: count };
  },
};

export const copyFileTool: ToolPlugin = {
  definition: definition(
    "filesystem.copy",
    "Copy a file inside the workspace",
    2,
    "MEDIUM",
    "NEVER",
    { type: "object", required: ["source", "destination"] },
  ),
  async execute(arguments_, context) {
    const input = moveInput.parse(arguments_);
    await fs.copyFile(
      await context.resolvePath(input.source),
      await context.resolvePath(input.destination),
      fs.constants.COPYFILE_EXCL,
    );
    return { copied: true };
  },
};

export const moveFileTool: ToolPlugin = {
  definition: definition(
    "filesystem.move",
    "Move a path inside the workspace",
    2,
    "MEDIUM",
    "NEVER",
    { type: "object", required: ["source", "destination"] },
  ),
  async execute(arguments_, context) {
    const input = moveInput.parse(arguments_);
    await fs.rename(
      await context.resolvePath(input.source),
      await context.resolvePath(input.destination),
    );
    return { moved: true };
  },
};

export const deletePathTool: ToolPlugin = {
  definition: definition(
    "filesystem.delete",
    "Delete one file or empty directory inside the workspace",
    3,
    "HIGH",
    "ALWAYS",
    { type: "object", required: ["path"] },
  ),
  async execute(arguments_, context) {
    const input = pathInput.parse(arguments_);
    await fs.rm(await context.resolvePath(input.path), {
      recursive: false,
      force: false,
    });
    return { deleted: true };
  },
};

export const terminalExecuteTool: ToolPlugin = {
  definition: definition(
    "terminal.execute",
    "Execute an allowlisted executable with an argument array and no shell",
    2,
    "HIGH",
    "SENSITIVE",
    {
      type: "object",
      required: ["executable"],
      properties: {
        executable: { type: "string" },
        args: { type: "array", items: { type: "string" } },
        timeoutMs: { type: "integer" },
      },
    },
    600_000,
  ),
  async execute(arguments_, context) {
    const input = executeInput.parse(arguments_);
    const allowed = new Set(
      (
        process.env.AEGIS_EXECUTABLE_ALLOWLIST ??
        "git,node,npm,npx,python,python3,php,composer,cargo,go,docker"
      )
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    );
    if (!allowed.has(input.executable))
      throw new Error(`Executable is not allowlisted: ${input.executable}`);
    return runProcess(
      input.executable,
      input.args,
      context.workspaceRoot,
      input.timeoutMs,
      context.signal,
    );
  },
};

export const dnsLookupTool: ToolPlugin = {
  definition: definition(
    "network.dns",
    "Resolve DNS records without executing a shell",
    1,
    "LOW",
    "NEVER",
    { type: "object", required: ["hostname"] },
  ),
  async execute(arguments_) {
    const input = z
      .object({
        hostname: z
          .string()
          .regex(
            /^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)*[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/,
          ),
      })
      .parse(arguments_);
    return { addresses: await dns.lookup(input.hostname, { all: true }) };
  },
};

export const systemInfoTool: ToolPlugin = {
  definition: definition(
    "system.info",
    "Return Agent inventory already collected by the runtime",
    0,
    "LOW",
    "NEVER",
    { type: "object" },
  ),
  async execute(_arguments, context) {
    return { workspaceRoot: context.workspaceRoot };
  },
};

export const builtInTools = [
  readFileTool,
  listFilesTool,
  searchFilesTool,
  writeFileTool,
  editFileTool,
  copyFileTool,
  moveFileTool,
  deletePathTool,
  terminalExecuteTool,
  dnsLookupTool,
  systemInfoTool,
];

function runProcess(
  executable: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
  parentSignal: AbortSignal,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const abort = () => controller.abort();
    parentSignal.addEventListener("abort", abort, { once: true });
    const child = spawn(executable, args, {
      cwd,
      shell: false,
      signal: controller.signal,
      env: {
        PATH: process.env.PATH ?? "",
        LANG: process.env.LANG ?? "C.UTF-8",
        HOME: cwd,
      },
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let size = 0;
    const limit = 2 * 1024 * 1024;
    const collect = (target: Buffer[]) => (chunk: Buffer) => {
      if (size < limit) {
        target.push(chunk.subarray(0, limit - size));
        size += chunk.length;
      }
    };
    child.stdout.on("data", collect(stdout));
    child.stderr.on("data", collect(stderr));
    child.once("error", reject);
    child.once("close", (code, signal) => {
      clearTimeout(timeout);
      parentSignal.removeEventListener("abort", abort);
      resolve({
        code,
        signal,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        isTruncated: size > limit,
      });
    });
  });
}
