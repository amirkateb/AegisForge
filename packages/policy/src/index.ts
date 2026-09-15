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

export interface ContextPolicyInput extends PolicyInput {
  environment: "PRODUCTION" | "DEVELOPMENT" | "TESTING";
  toolName: string;
  arguments: Record<string, unknown>;
  affectedPaths: string[];
}

const protectedPaths = new Set(["/", "/etc", "/boot", "/usr", "/var/lib", "/home"]);
const mutatingActions = new Set(["install", "restart", "stop", "start", "reload", "pull", "push", "commit", "add", "build", "migrate", "set", "del"]);

export function evaluateContextPolicy(input: ContextPolicyInput): PolicyDecision {
  const base = evaluatePolicy(input);
  if (base.type === "DENIED") return base;
  const serialized = JSON.stringify(input.arguments).toLowerCase();
  const destructive = /\brm\b/.test(serialized) && /(?:-rf|-fr|--recursive)/.test(serialized);
  const targetsProtectedPath = input.affectedPaths.some((item) => {
    const normalized = item.replace(/\/$/, "") || "/";
    return [...protectedPaths].some((protectedPath) => normalized === protectedPath || (protectedPath !== "/" && normalized.startsWith(`${protectedPath}/`)));
  });
  if (destructive && (input.affectedPaths.length === 0 || targetsProtectedPath))
    return { type: "DENIED", reason: "POLICY_DENIED" };
  if (base.type === "APPROVAL_REQUIRED") return base;
  const action = typeof input.arguments.action === "string" ? input.arguments.action.toLowerCase() : "";
  const readOnlyTools = new Set([
    "filesystem.read", "filesystem.search", "filesystem.list", "system.info",
    "system.process.list", "system.service.status", "system.disk",
    "network.dns", "network.port", "network.http", "network.ping",
    "docker.container.list", "docker.logs", "wordpress.plugin.analyze",
    "laravel.migration.analyze", "git.diff.analyze", "git.conflict.analyze",
  ]);
  const mutatingTool = !readOnlyTools.has(input.toolName);
  if (input.environment === "PRODUCTION" && (mutatingActions.has(action) || mutatingTool))
    return { type: "APPROVAL_REQUIRED", risk: input.risk === "LOW" ? "MEDIUM" : input.risk };
  return base;
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
