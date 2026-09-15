import { randomUUID } from "node:crypto";
import type WebSocket from "ws";
import {
  AgentHelloSchema,
  DispatchSchema,
  type Dispatch,
  type AgentInventory,
  type ToolDefinition,
} from "@aegisforge/contracts";
import type { PlatformStore } from "../domain.js";

interface ConnectedAgent {
  socket: WebSocket;
  tools: Map<string, ToolDefinition>;
  lastPongAt: number;
  lastPingAt: number | null;
  inventory: AgentInventory;
}
interface PendingDispatch {
  agentId: string;
  projectId: string;
  taskId: string;
  toolName: string;
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
}

export class AgentHub {
  private readonly agents = new Map<string, ConnectedAgent>();
  private readonly pending = new Map<string, PendingDispatch>();
  private readonly heartbeat: NodeJS.Timeout;
  constructor(private readonly store: PlatformStore) {
    this.heartbeat = setInterval(() => this.checkConnections(), 30_000);
    this.heartbeat.unref();
  }

  async accept(socket: WebSocket, agentId: string): Promise<void> {
    const helloTimer = setTimeout(
      () => socket.close(4408, "HELLO timeout"),
      10_000,
    );
    socket.once("message", async (data, isBinary) => {
      clearTimeout(helloTimer);
      try {
        if (isBinary) throw new Error("Binary messages are not supported");
        const hello = AgentHelloSchema.parse(JSON.parse(data.toString()));
        if (hello.agentId !== agentId)
          throw new Error("Agent identity mismatch");
        const agent = await this.store.updateAgentPresence(
          agentId,
          hello.inventory,
          new Date(),
        );
        if (!agent) throw new Error("Agent is disabled, revoked or missing");
        const previous = this.agents.get(agentId);
        if (previous && previous.socket !== socket)
          previous.socket.close(4409, "Replaced by a newer connection");
        this.agents.set(agentId, {
          socket,
          tools: new Map(hello.tools.map((tool) => [tool.name, tool])),
          lastPongAt: Date.now(),
          lastPingAt: null,
          inventory: hello.inventory,
        });
        await this.store.appendAudit({
          agentId,
          projectId: null,
          userId: "agent",
          action: "agent.connected",
          durationMs: null,
          status: "SUCCESS",
          metadata: { agentVersion: hello.inventory.agentVersion ?? null },
        });
        socket.send(
          JSON.stringify({
            type: "HELLO_ACK",
            protocolVersion: 1,
            agentId,
            serverTime: new Date().toISOString(),
          }),
        );
        socket.on("message", (message, binary) => {
          if (!binary) this.handleResult(message.toString());
        });
        socket.on("pong", () => {
          const connected = this.agents.get(agentId);
          if (connected?.socket === socket) {
            const now = Date.now();
            connected.lastPongAt = now;
            const latencyMs =
              connected.lastPingAt == null
                ? null
                : Math.max(0, now - connected.lastPingAt);
            connected.inventory = {
              ...connected.inventory,
              health: {
                score: liveHealthScore(connected.inventory, latencyMs),
                latencyMs,
                lastHeartbeatAt: new Date(now).toISOString(),
              },
            };
            void this.store.updateAgentPresence(
              agentId,
              connected.inventory,
              new Date(now),
            );
          }
        });
        socket.once("close", (code, reason) =>
          void this.disconnect(agentId, socket, code, reason.toString()),
        );
      } catch (error) {
        await this.store.appendAudit({
          agentId,
          projectId: null,
          userId: "agent",
          action: "agent.connection.failed",
          durationMs: null,
          status: "FAILED",
          metadata: {
            error: error instanceof Error ? error.message : String(error),
          },
        });
        socket.close(
          4400,
          error instanceof Error
            ? error.message.slice(0, 120)
            : "Invalid HELLO",
        );
      }
    });
  }

  async dispatch(
    agentId: string,
    input: Omit<
      Dispatch,
      "type" | "protocolVersion" | "dispatchId" | "issuedAt"
    >,
  ): Promise<unknown> {
    const connected = this.agents.get(agentId);
    if (!connected) throw new Error("Target Agent is not connected");
    const dispatch = DispatchSchema.parse({
      type: "DISPATCH",
      protocolVersion: 1,
      dispatchId: randomUUID(),
      issuedAt: new Date().toISOString(),
      ...input,
    });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => {
          this.pending.delete(dispatch.dispatchId);
          void this.store.appendAudit({
            agentId,
            projectId: dispatch.projectId,
            userId: "agent",
            action: "agent.dispatch.timeout",
            durationMs: null,
            status: "UNKNOWN",
            metadata: {
              taskId: dispatch.taskId,
              dispatchId: dispatch.dispatchId,
              toolName: dispatch.tool.name,
            },
          });
          reject(new Error("Dispatch result is unknown after timeout"));
        },
        Math.max(1000, new Date(dispatch.expiresAt).getTime() - Date.now()),
      );
      this.pending.set(dispatch.dispatchId, {
        agentId,
        projectId: dispatch.projectId,
        taskId: dispatch.taskId,
        toolName: dispatch.tool.name,
        resolve,
        reject,
        timer,
      });
      connected.socket.send(JSON.stringify(dispatch));
    });
  }

  connectedAgentIds(): string[] {
    return [...this.agents.keys()];
  }
  connectedTools(): Array<{ agentId: string; tools: ToolDefinition[] }> {
    return [...this.agents].map(([agentId, value]) => ({
      agentId,
      tools: [...value.tools.values()],
    }));
  }
  getTool(agentId: string, name: string): ToolDefinition | null {
    return this.agents.get(agentId)?.tools.get(name) ?? null;
  }
  disconnectAgent(agentId: string, reason = "Agent access changed"): void {
    const connected = this.agents.get(agentId);
    if (connected) connected.socket.close(4403, reason);
  }
  close(): void {
    clearInterval(this.heartbeat);
    for (const agent of this.agents.values())
      agent.socket.close(1001, "Master shutting down");
    for (const call of this.pending.values()) {
      clearTimeout(call.timer);
      call.reject(new Error("Master shutting down"));
    }
  }

  private handleResult(raw: string): void {
    try {
      const value = JSON.parse(raw) as {
        type?: string;
        dispatchId?: string;
        ok?: boolean;
        result?: unknown;
        error?: string;
      };
      if (
        value.type !== "RESULT" ||
        typeof value.dispatchId !== "string" ||
        typeof value.ok !== "boolean"
      )
        return;
      const pending = this.pending.get(value.dispatchId);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(value.dispatchId);
      if (value.ok) pending.resolve(value.result);
      else {
        void this.store.appendAudit({
          agentId: pending.agentId,
          projectId: pending.projectId,
          userId: "agent",
          action: "agent.tool.failed",
          durationMs: null,
          status: "FAILED",
          metadata: {
            taskId: pending.taskId,
            dispatchId: value.dispatchId,
            toolName: pending.toolName,
            error: value.error ?? "Agent execution failed",
          },
        });
        pending.reject(new Error(value.error ?? "Agent execution failed"));
      }
    } catch {
      /* malformed messages are ignored and bounded by the socket payload limit */
    }
  }
  private async disconnect(
    agentId: string,
    socket: WebSocket,
    code: number,
    reason: string,
  ): Promise<void> {
    if (this.agents.get(agentId)?.socket !== socket) return;
    this.agents.delete(agentId);
    const agent = await this.store.findAgent(agentId);
    if (agent && !["DISABLED", "REVOKED"].includes(agent.status))
      await this.store.updateAgentStatus(agentId, "OFFLINE");
    await this.store.appendAudit({
      agentId,
      projectId: null,
      userId: "agent",
      action: "agent.disconnected",
      durationMs: null,
      status: [1000, 1001, 4403, 4409].includes(code) ? "SUCCESS" : "FAILED",
      metadata: { code, reason: reason || "WebSocket connection closed" },
    });
  }
  private checkConnections(): void {
    const now = Date.now();
    for (const [agentId, connection] of this.agents) {
      if (now - connection.lastPongAt > 90_000) {
        connection.socket.terminate();
        this.agents.delete(agentId);
      } else {
        connection.lastPingAt = now;
        connection.socket.ping();
      }
    }
  }
}

function liveHealthScore(
  inventory: AgentInventory,
  latencyMs: number | null,
): number {
  const memoryFree = inventory.memory.totalBytes
    ? (inventory.memory.freeBytes / inventory.memory.totalBytes) * 100
    : 0;
  const disk = inventory.disks[0];
  const diskFree = disk?.totalBytes
    ? (disk.freeBytes / disk.totalBytes) * 100
    : 100;
  const latency = latencyMs == null ? 100 : Math.max(0, 100 - latencyMs / 10);
  return Math.round(
    (100 - inventory.cpu.loadPercent) * 0.35 +
      memoryFree * 0.3 +
      diskFree * 0.25 +
      latency * 0.1,
  );
}
