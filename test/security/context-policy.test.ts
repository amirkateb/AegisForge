import { describe, expect, it } from "vitest";
import { evaluateContextPolicy } from "@aegisforge/policy";
import {
  gitDiffTool,
  wordpressPluginTool,
} from "../../tools/src/operations.js";

describe("context policy", () => {
  it("requires approval for mutating production commands", () => {
    expect(
      evaluateContextPolicy({
        permissionLevel: 3,
        requiredLevel: 2,
        risk: "MEDIUM",
        approval: "NEVER",
        environment: "PRODUCTION",
        toolName: "developer.node",
        arguments: { action: "install" },
        affectedPaths: ["/srv/app/package-lock.json"],
      }),
    ).toMatchObject({ type: "APPROVAL_REQUIRED" });
  });

  it("denies destructive shell-like arguments and protected paths", () => {
    expect(
      evaluateContextPolicy({
        permissionLevel: 4,
        requiredLevel: 2,
        risk: "HIGH",
        approval: "SENSITIVE",
        environment: "DEVELOPMENT",
        toolName: "terminal.execute",
        arguments: { executable: "rm", args: ["-rf", "/"] },
        affectedPaths: ["/"],
      }),
    ).toMatchObject({ type: "DENIED", reason: "POLICY_DENIED" });
  });

  it("allows read-only production health probes without approval", () => {
    expect(
      evaluateContextPolicy({
        permissionLevel: 1,
        requiredLevel: 1,
        risk: "MEDIUM",
        approval: "NEVER",
        environment: "PRODUCTION",
        toolName: "network.http",
        arguments: { url: "https://forge.example.com/healthz", method: "GET" },
        affectedPaths: [],
      }),
    ).toEqual({ type: "ALLOWED" });
  });

  it("rejects output and traversal arguments on read-only command tools", async () => {
    const context = {
      workspaceRoot: "/srv/app",
      signal: new AbortController().signal,
      async resolvePath(value: string) {
        return value;
      },
    };
    await expect(
      gitDiffTool.execute(
        { action: "diff", args: ["--output=/tmp/leak"] },
        context,
      ),
    ).rejects.toThrow("Read-only");
    await expect(
      wordpressPluginTool.execute(
        { action: "list", args: ["../../outside"] },
        context,
      ),
    ).rejects.toThrow("Read-only");
  });

  it("does not add denials or approvals in full-trust mode", () => {
    expect(
      evaluateContextPolicy({
        accessMode: "FULL_TRUST",
        permissionLevel: 4,
        requiredLevel: 4,
        risk: "CRITICAL",
        approval: "ALWAYS",
        environment: "PRODUCTION",
        toolName: "terminal.execute",
        arguments: { executable: "rm", args: ["-rf", "/"] },
        affectedPaths: ["/"],
      }),
    ).toEqual({ type: "ALLOWED" });
  });
});
