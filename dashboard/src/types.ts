export type Agent = {
  id: string;
  name: string;
  environment: string;
  permissionLevel: number;
  accessMode: AgentAccessMode;
  status: string;
  inventory: null | {
    agentVersion?: string;
    health?: {
      score: number;
      latencyMs: number | null;
      lastHeartbeatAt: string;
    };
    cpu?: { loadPercent?: number };
    memory?: { totalBytes?: number; freeBytes?: number };
    disks?: Array<{ totalBytes: number; freeBytes: number }>;
    network?: Array<{ name: string; address: string }>;
  };
  lastSeenAt: string | null;
};
export type AgentAccessMode = "FULL_TRUST" | "CAUTIOUS" | "VERY_CAUTIOUS";
export type Organization = { id: string; name: string };
export type Project = {
  id: string;
  name: string;
  organizationId: string | null;
};
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
  metadata: Record<string, unknown>;
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
  organizations: Organization[];
  projects: Project[];
  tasks: Task[];
  approvals: Approval[];
  logs: Audit[];
  tools: Array<{ agentId: string; tools: Tool[] }>;
};
