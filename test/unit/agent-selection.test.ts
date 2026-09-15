import { describe, expect, it } from "vitest";
import { selectAgent } from "../../controller/src/agent-selector.js";

describe("Agent selection", () => {
  it("chooses an online project workspace with technology fit and capacity", () => {
    const result = selectAgent({
      projectId: "project",
      requiredPermissionLevel: 2,
      technologies: ["php", "laravel"],
      agents: [
        {
          id: "busy",
          status: "ONLINE",
          permissionLevel: 3,
          inventory: { cpu: { loadPercent: 96 }, memory: { totalBytes: 100, freeBytes: 2 }, runtimes: { php: "8.4" } },
        },
        {
          id: "ready",
          status: "ONLINE",
          permissionLevel: 2,
          inventory: { cpu: { loadPercent: 12 }, memory: { totalBytes: 100, freeBytes: 80 }, runtimes: { php: "8.4" } },
        },
      ],
      workspaces: [
        { id: "ws-busy", projectId: "project", agentId: "busy" },
        { id: "ws-ready", projectId: "project", agentId: "ready" },
      ],
    });
    expect(result).toMatchObject({ type: "SELECTED", agentId: "ready", workspaceId: "ws-ready" });
  });

  it("explains why no assignment is viable", () => {
    const result = selectAgent({
      projectId: "project",
      requiredPermissionLevel: 3,
      technologies: [],
      agents: [{ id: "offline", status: "OFFLINE", permissionLevel: 4, inventory: null }],
      workspaces: [{ id: "ws", projectId: "project", agentId: "offline" }],
    });
    expect(result).toMatchObject({ type: "UNAVAILABLE" });
    expect(result.reasons.join(" ")).toContain("offline");
  });

  it("asks for an explicit choice when top candidates are equally suitable", () => {
    const inventory = { cpu: { loadPercent: 20 }, memory: { totalBytes: 100, freeBytes: 50 }, runtimes: { node: "22" } };
    const result = selectAgent({
      projectId: "project",
      requiredPermissionLevel: 2,
      technologies: ["node"],
      agents: [
        { id: "agent-a", status: "ONLINE", permissionLevel: 2, inventory },
        { id: "agent-b", status: "ONLINE", permissionLevel: 2, inventory },
      ],
      workspaces: [
        { id: "ws-a", projectId: "project", agentId: "agent-a" },
        { id: "ws-b", projectId: "project", agentId: "agent-b" },
      ],
    });
    expect(result).toMatchObject({ type: "AMBIGUOUS", candidates: [{ agentId: "agent-a" }, { agentId: "agent-b" }] });
  });
});
