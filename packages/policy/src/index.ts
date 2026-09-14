import type {
  ApprovalMode,
  PermissionLevel,
  Risk,
} from "../../contracts/src/index.js";

export type PolicyDecision =
  | { type: "ALLOWED" }
  | { type: "DENIED"; reason: "PERMISSION_LEVEL_TOO_LOW" | "POLICY_DENIED" }
  | { type: "APPROVAL_REQUIRED"; risk: Risk };

export interface PolicyInput {
  permissionLevel: PermissionLevel;
  requiredLevel: PermissionLevel;
  risk: Risk;
  approval: ApprovalMode;
}

const approvalRisks = new Set<Risk>(["HIGH", "CRITICAL"]);

export function evaluatePolicy(input: PolicyInput): PolicyDecision {
  if (input.permissionLevel < input.requiredLevel) {
    return { type: "DENIED", reason: "PERMISSION_LEVEL_TOO_LOW" };
  }
  if (
    input.approval === "ALWAYS" ||
    (input.approval === "SENSITIVE" && approvalRisks.has(input.risk))
  ) {
    return { type: "APPROVAL_REQUIRED", risk: input.risk };
  }
  return { type: "ALLOWED" };
}

export interface ApprovalGrant {
  id: string;
  taskId: string;
  principalId: string;
  scope: "ONCE" | "SESSION";
  toolName: string;
  argumentHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
}

export function isGrantUsable(
  grant: ApprovalGrant,
  now: Date,
  toolName: string,
  argumentHash: string,
): boolean {
  return (
    grant.expiresAt > now &&
    grant.toolName === toolName &&
    grant.argumentHash === argumentHash &&
    (grant.scope === "SESSION" || grant.consumedAt === null)
  );
}
