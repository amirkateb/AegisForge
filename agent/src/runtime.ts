import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import { z } from "zod";
import {
  DispatchSchema,
  type Dispatch,
} from "@aegisforge/contracts";
import { evaluatePolicy } from "@aegisforge/policy";
import {
  builtInTools,
  operationalTools,
  sessionTools,
  ToolRegistry,
} from "@aegisforge/tools";
import { collectInventory } from "./inventory.js";
import { WorkspaceGuard } from "./security/workspace-guard.js";

const AgentConfig = z.object({
  MASTER_WS_URL: z.string().url().startsWith("wss://"),
  AGENT_ID: z.string().uuid(),
  AGENT_TOKEN: z.string().min(32),
  WORKSPACE_ROOTS_JSON: z.string().default("{}"),
});

export class AgentRuntime {
  private readonly registry = new ToolRegistry();
  private stopped = false;
  constructor(private readonly config = AgentConfig.parse(process.env)) {
    for (const tool of [...builtInTools, ...operationalTools, ...sessionTools])
      this.registry.register(tool);
  }

  async run(): Promise<void> {
    let delay = 1000;
    while (!this.stopped) {
      try {
        await this.connectOnce();
        delay = 1000;
      } catch (error) {
        console.error(
          "[agent] connection failed",
          error instanceof Error ? error.message : String(error),
        );
      }
      if (!this.stopped)
        await new Promise((resolve) =>
          setTimeout(resolve, Math.round(delay * (0.75 + Math.random() * 0.5))),
        );
      delay = Math.min(30_000, delay * 2);
    }
  }
  stop() {
    this.stopped = true;
  }

  private async connectOnce(): Promise<void> {
    const inventory = await collectInventory();
    const socket = new WebSocket(this.config.MASTER_WS_URL, {
      headers: {
        authorization: `Bearer ${this.config.AGENT_TOKEN}`,
        "x-agent-id": this.config.AGENT_ID,
      },
      maxPayload: 8 * 1024 * 1024,
    });
    await new Promise<void>((resolve, reject) => {
      socket.once("open", () =>
        socket.send(
          JSON.stringify({
            type: "HELLO",
            protocolVersion: 1,
            agentId: this.config.AGENT_ID,
            connectionNonce:
              randomUUID().replaceAll("-", "") +
              randomUUID().replaceAll("-", ""),
            inventory,
            tools: this.registry.list(),
          }),
        ),
      );
      socket.on(
        "message",
        (data) => void this.handleMessage(socket, data.toString()),
      );
      socket.once("close", () => resolve());
      socket.once("error", reject);
    });
  }

  private async handleMessage(socket: WebSocket, raw: string): Promise<void> {
    let dispatch: Dispatch;
    try {
      dispatch = DispatchSchema.parse(JSON.parse(raw));
    } catch {
      return;
    }
    const roots = z
      .record(z.string(), z.string())
      .parse(JSON.parse(this.config.WORKSPACE_ROOTS_JSON));
    const root = roots[dispatch.workspaceId];
    if (!root)
      return this.send(
        socket,
        dispatch.dispatchId,
        false,
        undefined,
        "Workspace is not configured on this Agent",
      );
    let localTool;
    try {
      localTool = this.registry.get(dispatch.tool.name);
    } catch {
      return this.send(
        socket,
        dispatch.dispatchId,
        false,
        undefined,
        "Tool is not installed on this Agent",
      );
    }
    if (JSON.stringify(localTool.definition) !== JSON.stringify(dispatch.tool))
      return this.send(
        socket,
        dispatch.dispatchId,
        false,
        undefined,
        "Tool definition does not match the local trusted registry",
      );
    const decision = evaluatePolicy({
      permissionLevel: dispatch.permissionLevel,
      requiredLevel: localTool.definition.requiredLevel,
      risk: localTool.definition.risk,
      approval: localTool.definition.approval,
    });
    if (
      decision.type === "DENIED" ||
      (decision.type === "APPROVAL_REQUIRED" && !dispatch.approvalGrantId)
    )
      return this.send(
        socket,
        dispatch.dispatchId,
        false,
        undefined,
        `Local policy rejected dispatch: ${decision.type}`,
      );
    if (new Date(dispatch.expiresAt) <= new Date())
      return this.send(
        socket,
        dispatch.dispatchId,
        false,
        undefined,
        "Dispatch expired",
      );
    try {
      const guard = await WorkspaceGuard.create(root);
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        dispatch.tool.timeoutMs,
      );
      const result = await localTool.execute(dispatch.intent.arguments, {
        workspaceRoot: root,
        signal: controller.signal,
        resolvePath: (target) => guard.resolve(target),
      });
      clearTimeout(timeout);
      this.send(socket, dispatch.dispatchId, true, result);
    } catch (error) {
      this.send(
        socket,
        dispatch.dispatchId,
        false,
        undefined,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
  private send(
    socket: WebSocket,
    dispatchId: string,
    ok: boolean,
    result?: unknown,
    error?: string,
  ) {
    socket.send(
      JSON.stringify({
        type: "RESULT",
        protocolVersion: 1,
        dispatchId,
        ok,
        result,
        error,
      }),
    );
  }
}
