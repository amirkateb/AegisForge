import { describe, expect, it } from "vitest";
import { evaluatePolicy } from "@aegisforge/policy";

describe("evaluatePolicy", () => {
  it("denies a tool above the principal permission level", () => {
    expect(
      evaluatePolicy({
        permissionLevel: 1,
        requiredLevel: 2,
        risk: "LOW",
        approval: "NEVER",
      }),
    ).toEqual({ type: "DENIED", reason: "PERMISSION_LEVEL_TOO_LOW" });
  });

  it("requires approval for a high-risk operation even at full access", () => {
    expect(
      evaluatePolicy({
        permissionLevel: 4,
        requiredLevel: 3,
        risk: "HIGH",
        approval: "SENSITIVE",
      }),
    ).toEqual({ type: "APPROVAL_REQUIRED", risk: "HIGH" });
  });

  it("allows a safe operation within the granted level", () => {
    expect(
      evaluatePolicy({
        permissionLevel: 2,
        requiredLevel: 1,
        risk: "LOW",
        approval: "NEVER",
      }),
    ).toEqual({ type: "ALLOWED" });
  });

  it("allows every tool without approval in full-trust mode", () => {
    expect(
      evaluatePolicy({
        accessMode: "FULL_TRUST",
        permissionLevel: 0,
        requiredLevel: 4,
        risk: "CRITICAL",
        approval: "ALWAYS",
      }),
    ).toEqual({ type: "ALLOWED" });
  });

  it("requires approval for non-trivial tools in very-cautious mode", () => {
    expect(
      evaluatePolicy({
        accessMode: "VERY_CAUTIOUS",
        permissionLevel: 4,
        requiredLevel: 2,
        risk: "MEDIUM",
        approval: "NEVER",
      }),
    ).toEqual({ type: "APPROVAL_REQUIRED", risk: "MEDIUM" });
  });

  it("still allows explicitly safe reads in very-cautious mode", () => {
    expect(
      evaluatePolicy({
        accessMode: "VERY_CAUTIOUS",
        permissionLevel: 4,
        requiredLevel: 0,
        risk: "LOW",
        approval: "NEVER",
      }),
    ).toEqual({ type: "ALLOWED" });
  });
});
