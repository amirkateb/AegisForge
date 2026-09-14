import { describe, expect, it } from "vitest";
import { transitionTask } from "../../controller/src/task-state.js";

describe("transitionTask", () => {
  it("accepts the complete engineering loop", () => {
    const states = [
      "UNDERSTANDING",
      "PLANNING",
      "EXECUTING",
      "VERIFYING",
      "COMPLETED",
    ] as const;
    expect(
      states.reduce((state, next) => transitionTask(state, next), "QUEUED"),
    ).toBe("COMPLETED");
  });

  it("rejects skipping verification", () => {
    expect(() => transitionTask("EXECUTING", "COMPLETED")).toThrow(
      /Invalid task transition/,
    );
  });
});
