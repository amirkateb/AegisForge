export interface SelectionAgent {
  id: string;
  status: string;
  permissionLevel: number;
  inventory: unknown | null;
}
export interface SelectionWorkspace { id: string; projectId: string; agentId: string }

export function selectAgent(input: {
  projectId: string;
  requiredPermissionLevel: number;
  technologies: string[];
  agents: SelectionAgent[];
  workspaces: SelectionWorkspace[];
}):
  | { type: "SELECTED"; agentId: string; workspaceId: string; score: number; reasons: string[] }
  | { type: "AMBIGUOUS"; candidates: Array<{ agentId: string; workspaceId: string; score: number }>; reasons: string[] }
  | { type: "UNAVAILABLE"; reasons: string[] } {
  const reasons: string[] = [];
  const candidates = input.workspaces
    .filter((workspace) => workspace.projectId === input.projectId)
    .flatMap((workspace) => {
      const agent = input.agents.find((item) => item.id === workspace.agentId);
      if (!agent) { reasons.push(`workspace ${workspace.id} references a missing Agent`); return []; }
      if (agent.status !== "ONLINE") { reasons.push(`Agent ${agent.id} is offline`); return []; }
      if (agent.permissionLevel < input.requiredPermissionLevel) { reasons.push(`Agent ${agent.id} lacks permission level ${input.requiredPermissionLevel}`); return []; }
      const inventory = normalizeInventory(agent.inventory);
      if (inventory.cpu >= 95) { reasons.push(`Agent ${agent.id} CPU is saturated`); return []; }
      if (inventory.freeMemoryPercent < 5) { reasons.push(`Agent ${agent.id} memory is exhausted`); return []; }
      if (inventory.freeDiskPercent < 5) { reasons.push(`Agent ${agent.id} disk is exhausted`); return []; }
      const technologyMatches = input.technologies.filter((technology) => inventory.technologies.has(technology.toLowerCase())).length;
      const score = 100 - inventory.cpu - (100 - inventory.freeMemoryPercent) * 0.3 - (100 - inventory.freeDiskPercent) * 0.2 + technologyMatches * 20 + agent.permissionLevel * 2;
      return [{ agent, workspace, score, reasons: [`${technologyMatches} technology matches`, `CPU ${inventory.cpu}%`, `free memory ${Math.round(inventory.freeMemoryPercent)}%`, `free disk ${Math.round(inventory.freeDiskPercent)}%`] }];
    })
    .sort((a, b) => b.score - a.score || a.agent.id.localeCompare(b.agent.id));
  if (!candidates[0]) return { type: "UNAVAILABLE", reasons: reasons.length ? reasons : ["No workspace exists for this project"] };
  const tied = candidates.filter((item) => Math.abs(item.score - candidates[0]!.score) < 0.01);
  if (tied.length > 1)
    return {
      type: "AMBIGUOUS",
      candidates: tied.map((item) => ({ agentId: item.agent.id, workspaceId: item.workspace.id, score: Math.round(item.score * 100) / 100 })),
      reasons: ["Multiple Agents have the same top suitability score; explicit selection is required"],
    };
  return { type: "SELECTED", agentId: candidates[0].agent.id, workspaceId: candidates[0].workspace.id, score: Math.round(candidates[0].score * 100) / 100, reasons: candidates[0].reasons };
}

function normalizeInventory(value: unknown) {
  const item = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const cpu = ((item.cpu as Record<string, unknown> | undefined)?.loadPercent as number | undefined) ?? 100;
  const memory = (item.memory as Record<string, unknown> | undefined) ?? {};
  const total = Number(memory.totalBytes ?? 0);
  const free = Number(memory.freeBytes ?? 0);
  const runtimes = (item.runtimes as Record<string, unknown> | undefined) ?? {};
  const databaseTools = Array.isArray(item.databaseTools) ? item.databaseTools : [];
  const disk = Array.isArray(item.disks) ? item.disks[0] as Record<string, unknown> | undefined : undefined;
  const diskTotal = Number(disk?.totalBytes ?? 0);
  const diskFree = Number(disk?.freeBytes ?? 0);
  return {
    cpu,
    freeMemoryPercent: total > 0 ? (free / total) * 100 : 0,
    freeDiskPercent: diskTotal > 0 ? (diskFree / diskTotal) * 100 : 100,
    technologies: new Set([...Object.entries(runtimes).filter(([, version]) => version != null).map(([name]) => name.toLowerCase()), ...databaseTools.map(String).map((name) => name.toLowerCase()), ...(runtimes.php ? ["laravel", "wordpress"] : [])]),
  };
}
