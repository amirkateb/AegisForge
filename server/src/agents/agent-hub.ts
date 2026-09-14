import { randomUUID } from "node:crypto";
import type WebSocket from "ws";
import {
  AgentHelloSchema,
  DispatchSchema,
  type Dispatch,
  type ToolDefinition,
} from "../../../packages/contracts/src/index.js";
import type { PlatformStore } from "../domain.js";

interface ConnectedAgent {
  socket: WebSocket;
  tools: Map<string, ToolDefinition>;
  lastPongAt: number;
}
interface PendingDispatch {
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
          if (connected?.socket === socket) connected.lastPongAt = Date.now();
        });
        socket.once("close", () => void this.disconnect(agentId, socket));
      } catch (error) {
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
          reject(new Error("Dispatch result is unknown after timeout"));
        },
        Math.max(1000, new Date(dispatch.expiresAt).getTime() - Date.now()),
      );
      this.pending.set(dispatch.dispatchId, { resolve, reject, timer });
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
      else pending.reject(new Error(value.error ?? "Agent execution failed"));
    } catch {
      /* malformed messages are ignored and bounded by the socket payload limit */
    }
  }
  private async disconnect(agentId: string, socket: WebSocket): Promise<void> {
    if (this.agents.get(agentId)?.socket !== socket) return;
    this.agents.delete(agentId);
    const agent = await this.store.findAgent(agentId);
    if (agent && !["DISABLED", "REVOKED"].includes(agent.status))
      await this.store.updateAgentStatus(agentId, "OFFLINE");
  }
  private checkConnections(): void {
    const now = Date.now();
    for (const [agentId, connection] of this.agents) {
      if (now - connection.lastPongAt > 90_000) {
        connection.socket.terminate();
        this.agents.delete(agentId);
      } else connection.socket.ping();
    }
  }
}
