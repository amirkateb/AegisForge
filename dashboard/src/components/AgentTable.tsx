import type { Agent, Project, Task } from "../types.js";
const percent = (value: number | undefined) =>
  value == null ? "—" : `${Math.round(value)}%`;
const memory = (agent: Agent) => {
  const item = agent.inventory?.memory;
  return item?.totalBytes && item.freeBytes !== undefined
    ? 100 - (item.freeBytes / item.totalBytes) * 100
    : undefined;
};
const disk = (agent: Agent) => {
  const item = agent.inventory?.disks?.[0];
  return item?.totalBytes
    ? 100 - (item.freeBytes / item.totalBytes) * 100
    : undefined;
};
export function AgentTable({
  agents,
  projects,
  tasks,
}: {
  agents: Agent[];
  projects: Project[];
  tasks: Task[];
}) {
  const projectById = new Map(projects.map((item) => [item.id, item.name]));
  return (
    <section className="panel agent-panel">
      <div className="panel-title">
        <h2>Agent health</h2>
        <span>{agents.length} registered</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Agent</th>
              <th>Status</th>
              <th>Environment</th>
              <th>Project</th>
              <th>Health</th>
              <th>CPU</th>
              <th>RAM</th>
              <th>Disk</th>
              <th>Network</th>
              <th>Latency</th>
              <th>Version</th>
              <th>Last seen</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((agent) => {
              const task = tasks.find(
                (item) =>
                  item.agentId === agent.id &&
                  !["COMPLETED", "FAILED", "CANCELLED"].includes(item.status),
              );
              return (
                <tr key={agent.id}>
                  <td className="strong">{agent.name}</td>
                  <td>
                    <span className={`status ${agent.status.toLowerCase()}`}>
                      <i />
                      {agent.status}
                    </span>
                  </td>
                  <td>{agent.environment}</td>
                  <td>
                    {task
                      ? (projectById.get(task.projectId) ?? "Unknown")
                      : "—"}
                  </td>
                  <td>{percent(agent.inventory?.health?.score)}</td>
                  <td>{percent(agent.inventory?.cpu?.loadPercent)}</td>
                  <td>{percent(memory(agent))}</td>
                  <td>{percent(disk(agent))}</td>
                  <td>{agent.inventory?.network?.length ?? "—"}</td>
                  <td>{agent.inventory?.health?.latencyMs == null ? "—" : `${agent.inventory.health.latencyMs} ms`}</td>
                  <td>{agent.inventory?.agentVersion ?? "—"}</td>
                  <td>
                    {agent.lastSeenAt
                      ? new Intl.RelativeTimeFormat("en", {
                          numeric: "auto",
                        }).format(
                          -Math.max(
                            1,
                            Math.round(
                              (Date.now() -
                                new Date(agent.lastSeenAt).getTime()) /
                                60000,
                            ),
                          ),
                          "minute",
                        )
                      : "Never"}
                  </td>
                </tr>
              );
            })}
            {agents.length === 0 ? (
              <tr>
                <td colSpan={12} className="empty">
                  No Agents enrolled yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
