import type { TaskStatus } from "@aegisforge/contracts";

const transitions: Readonly<Record<TaskStatus, ReadonlySet<TaskStatus>>> = {
  QUEUED: new Set(["UNDERSTANDING", "CANCELLED"]),
  UNDERSTANDING: new Set(["PLANNING", "FAILED", "CANCELLED"]),
  PLANNING: new Set(["WAITING_APPROVAL", "EXECUTING", "FAILED", "CANCELLED"]),
  WAITING_APPROVAL: new Set(["EXECUTING", "CANCELLED", "FAILED"]),
  EXECUTING: new Set([
    "WAITING_APPROVAL",
    "VERIFYING",
    "UNKNOWN",
    "FAILED",
    "CANCELLED",
  ]),
  VERIFYING: new Set([
    "EXECUTING",
    "FIXING",
    "COMPLETED",
    "FAILED",
    "CANCELLED",
  ]),
  FIXING: new Set(["VERIFYING", "WAITING_APPROVAL", "FAILED", "CANCELLED"]),
  UNKNOWN: new Set(["VERIFYING", "FAILED", "CANCELLED"]),
  COMPLETED: new Set(),
  FAILED: new Set(),
  CANCELLED: new Set(),
};

export function transitionTask(
  current: TaskStatus,
  next: TaskStatus,
): TaskStatus {
  if (!transitions[current].has(next))
    throw new Error(`Invalid task transition: ${current} -> ${next}`);
  return next;
}
