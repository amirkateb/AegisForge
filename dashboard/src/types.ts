export type Agent = {
  id: string;
  name: string;
  environment: string;
  permissionLevel: number;
  status: string;
  inventory: null | {
    cpu?: { loadPercent?: number };
    memory?: { totalBytes?: number; freeBytes?: number };
    disks?: Array<{ totalBytes: number; freeBytes: number }>;
  };
  lastSeenAt: string | null;
};
export type Project = { id: string; name: string };
export type Task = {
  id: string;
  projectId: string;
  agentId: string;
  goal: string;
  status: string;
  createdAt: string;
};
export type Approval = {
  id: string;
  taskId: string;
  toolName: string;
  risk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  reason: string;
  impact: string;
  affectedResources: string[];
  status: string;
  createdAt: string;
};
export type Audit = {
  id: string;
  timestamp: string;
  agentId: string | null;
  projectId: string | null;
  action: string;
  status: string;
  durationMs: number | null;
};
export type Tool = {
  name: string;
  description: string;
  requiredLevel: number;
  risk: string;
  approval: string;
};
export type Snapshot = {
  agents: Agent[];
  projects: Project[];
  tasks: Task[];
  approvals: Approval[];
  logs: Audit[];
  tools: Array<{ agentId: string; tools: Tool[] }>;
};
