import { describe, expect, it } from "vitest";
import { redactEvent } from "../../server/src/observability/redaction.js";

describe("redactEvent", () => {
  it("redacts secret-shaped keys recursively and bearer tokens in text", () => {
    const event = redactEvent({
      token: "top-secret",
      nested: { password: "hunter2", safe: "visible" },
      message: "Authorization: Bearer abc.def-123",
    });
    expect(JSON.stringify(event)).not.toContain("top-secret");
    expect(JSON.stringify(event)).not.toContain("hunter2");
    expect(JSON.stringify(event)).not.toContain("abc.def-123");
    expect(event).toMatchObject({
      token: "[REDACTED]",
      nested: { password: "[REDACTED]", safe: "visible" },
    });
  });
});
