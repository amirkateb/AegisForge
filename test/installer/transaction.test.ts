import { describe, expect, it } from "vitest";
import { InstallTransaction } from "../../installer/src/transaction.js";

describe("InstallTransaction", () => {
  it("rolls completed steps back in reverse order after failure", async () => {
    const events: string[] = [];
    const transaction = new InstallTransaction();
    transaction.add({
      name: "one",
      apply: async () => {
        events.push("apply-one");
      },
      rollback: async () => {
        events.push("rollback-one");
      },
    });
    transaction.add({
      name: "two",
      apply: async () => {
        events.push("apply-two");
        throw new Error("boom");
      },
      rollback: async () => {
        events.push("rollback-two");
      },
    });
    await expect(transaction.run()).rejects.toThrow("boom");
    expect(events).toEqual(["apply-one", "apply-two", "rollback-one"]);
  });
});
