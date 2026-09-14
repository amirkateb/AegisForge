import { describe, expect, it } from "vitest";
import { EngineeringController } from "../../controller/src/execution-loop.js";

describe("engineering execution loop", () => {
  it("executes, verifies, fixes and continues through multiple steps", async () => {
    const statuses: string[] = [];
    const evidence: unknown[] = [];
    let calls = 0;
    const controller = new EngineeringController(
      {
        async setStatus(_id, status) {
          statuses.push(status);
        },
        async saveProfile() {},
        async savePlan() {},
        async recordEvidence(_id, _step, value) {
          evidence.push(value);
        },
      },
      {
        async execute() {
          calls++;
          return { calls };
        },
        async verify() {
          return { ok: calls !== 1, evidence: { calls } };
        },
      },
    );
    await controller.run({
      taskId: "task",
      projectId: "project",
      goal: "repair and verify",
      profile: {
        framework: [],
        dependencies: [],
        databases: [],
        routes: [],
        architecture: [],
        importantFiles: [],
      },
      plan: {
        summary: "two verified steps",
        assumptions: [],
        steps: [
          {
            title: "First step",
            description: "execute first",
            toolName: null,
            arguments: {},
            verification: "verify first",
          },
          {
            title: "Second step",
            description: "execute second",
            toolName: null,
            arguments: {},
            verification: "verify second",
          },
        ],
      },
      tools: [],
      maxFixAttempts: 2,
    });
    expect(statuses).toContain("FIXING");
    expect(statuses.at(-1)).toBe("COMPLETED");
    expect(calls).toBe(3);
    expect(evidence).toHaveLength(3);
  });
});
