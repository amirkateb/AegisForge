import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ToolPlugin } from "./index.js";

type Session = {
  child: ChildProcessWithoutNullStreams;
  output: string;
  updatedAt: number;
  workspaceRoot: string;
};
const sessions = new Map<string, Session>();
const outputLimit = 1024 * 1024;
const sessionId = z.string().uuid();
const definition = (
  name: string,
  description: string,
  level: 0 | 4,
  risk: "LOW" | "CRITICAL",
  approval: "NEVER" | "ALWAYS",
) =>
  ({
    name,
    description,
    requiredLevel: level,
    risk,
    approval,
    inputSchema: { type: "object" },
    timeoutMs: 30_000,
  }) as const;
function allowedExecutable(value: string): string {
  if (!/^[A-Za-z0-9._+-]+$/.test(value)) throw new Error("Invalid executable");
  const allowed = new Set(
    (process.env.AEGIS_SESSION_ALLOWLIST ?? "bash,sh,node,python3,php").split(
      ",",
    ),
  );
  if (!allowed.has(value))
    throw new Error("Interactive executable is not allowlisted");
  return value;
}
function append(session: Session, chunk: Buffer) {
  session.output = (session.output + chunk.toString("utf8")).slice(
    -outputLimit,
  );
  session.updatedAt = Date.now();
}

export const startSessionTool: ToolPlugin = {
  definition: definition(
    "terminal.session.start",
    "Start an explicit interactive process without shell interpolation",
    4,
    "CRITICAL",
    "ALWAYS",
  ),
  async execute(arguments_, context) {
    const input = z
      .object({
        executable: z.string(),
        args: z.array(z.string().max(4000)).max(50).default([]),
      })
      .parse(arguments_);
    const child = spawn(allowedExecutable(input.executable), input.args, {
      cwd: context.workspaceRoot,
      shell: false,
      env: {
        PATH: process.env.PATH ?? "",
        LANG: process.env.LANG ?? "C.UTF-8",
        HOME: context.workspaceRoot,
      },
    });
    const id = randomUUID();
    const session: Session = {
      child,
      output: "",
      updatedAt: Date.now(),
      workspaceRoot: context.workspaceRoot,
    };
    sessions.set(id, session);
    child.stdout.on("data", (chunk) => append(session, chunk));
    child.stderr.on("data", (chunk) => append(session, chunk));
    child.once("close", (code, signal) =>
      append(
        session,
        Buffer.from(
          `\n[process exited code=${code ?? "null"} signal=${signal ?? "none"}]\n`,
        ),
      ),
    );
    return { sessionId: id, pid: child.pid };
  },
};
export const writeSessionTool: ToolPlugin = {
  definition: definition(
    "terminal.session.write",
    "Write bounded input to an existing interactive process",
    4,
    "CRITICAL",
    "ALWAYS",
  ),
  async execute(arguments_, context) {
    const input = z
      .object({ sessionId, data: z.string().max(64 * 1024) })
      .parse(arguments_);
    const session = sessions.get(input.sessionId);
    if (
      !session ||
      session.workspaceRoot !== context.workspaceRoot ||
      !session.child.stdin.writable
    )
      throw new Error("Session is unavailable");
    session.child.stdin.write(input.data);
    session.updatedAt = Date.now();
    return { written: Buffer.byteLength(input.data) };
  },
};
export const readSessionTool: ToolPlugin = {
  definition: definition(
    "terminal.session.read",
    "Read buffered output from an interactive process",
    0,
    "LOW",
    "NEVER",
  ),
  async execute(arguments_, context) {
    const id = z.object({ sessionId }).parse(arguments_).sessionId;
    const session = sessions.get(id);
    if (!session || session.workspaceRoot !== context.workspaceRoot)
      throw new Error("Session is unavailable");
    const output = session.output;
    session.output = "";
    session.updatedAt = Date.now();
    return { output, running: session.child.exitCode === null };
  },
};
export const terminateSessionTool: ToolPlugin = {
  definition: definition(
    "terminal.session.terminate",
    "Terminate an interactive process",
    4,
    "CRITICAL",
    "ALWAYS",
  ),
  async execute(arguments_, context) {
    const id = z.object({ sessionId }).parse(arguments_).sessionId;
    const session = sessions.get(id);
    if (!session || session.workspaceRoot !== context.workspaceRoot)
      throw new Error("Session is unavailable");
    session.child.kill("SIGTERM");
    sessions.delete(id);
    return { terminated: true };
  },
};
export const sessionTools = [
  startSessionTool,
  writeSessionTool,
  readSessionTool,
  terminateSessionTool,
];
const cleanup = setInterval(() => {
  const cutoff = Date.now() - 10 * 60_000;
  for (const [id, session] of sessions)
    if (session.updatedAt < cutoff) {
      session.child.kill("SIGTERM");
      sessions.delete(id);
    }
}, 60_000);
cleanup.unref();
