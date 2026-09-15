import { useState } from "react";
import type { Agent, AgentAccessMode, Project, Task } from "../types.js";

const accessModes: Array<{
  value: AgentAccessMode;
  label: string;
  summary: string;
  detail: string;
}> = [
  {
    value: "FULL_TRUST",
    label: "Fully trusted",
    summary: "No approval prompts",
    detail:
      "Every installed tool can run immediately, including ALWAYS, HIGH/CRITICAL, and production operations. Trust applies to the whole Agent, not one task, command, or session.",
  },
  {
    value: "CAUTIOUS",
    label: "Cautious",
    summary: "Approve sensitive work",
    detail:
      "Safe work runs automatically. ALWAYS tools, sensitive HIGH/CRITICAL tools, and production mutations require an exact, expiring approval.",
  },
  {
    value: "VERY_CAUTIOUS",
    label: "Very cautious",
    summary: "Approve almost every change",
    detail:
      "Only LOW-risk tools explicitly marked NEVER run automatically. Every other installed tool waits for an exact, expiring approval.",
  },
];
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
  onAccessModeChange,
}: {
  agents: Agent[];
  projects: Project[];
  tasks: Task[];
  onAccessModeChange: (
    agentId: string,
    accessMode: AgentAccessMode,
  ) => Promise<void>;
}) {
  const [savingAgentId, setSavingAgentId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState("");
  const projectById = new Map(projects.map((item) => [item.id, item.name]));
  return (
    <section className="panel agent-panel">
      <div className="panel-title">
        <h2>Agent health</h2>
        <span>{agents.length} registered</span>
      </div>
      <div className="access-mode-guide" aria-label="Agent access mode guide">
        {accessModes.map((mode) => (
          <article
            key={mode.value}
            className={`access-mode-card ${mode.value.toLowerCase()}`}
          >
            <strong>{mode.label}</strong>
            <span>{mode.summary}</span>
            <p>{mode.detail}</p>
          </article>
        ))}
      </div>
      <p className="access-mode-note">
        Saving any mode synchronizes permission level 4 so all installed tools
        remain available. Authentication, registered-tool, dispatch-expiry, and
        workspace boundaries still apply.
      </p>
      {saveError ? (
        <div className="inline-error" role="alert">
          {saveError}
        </div>
      ) : null}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Agent</th>
              <th>Status</th>
              <th>Environment</th>
              <th>Access mode</th>
              <th>Level</th>
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
                    <label
                      className="sr-only"
                      htmlFor={`access-mode-${agent.id}`}
                    >
                      Access mode for {agent.name}
                    </label>
                    <select
                      id={`access-mode-${agent.id}`}
                      className="access-mode-select"
                      value={agent.accessMode}
                      disabled={savingAgentId === agent.id}
                      onChange={async (event) => {
                        const accessMode = event.target
                          .value as AgentAccessMode;
                        setSavingAgentId(agent.id);
                        setSaveError("");
                        try {
                          await onAccessModeChange(agent.id, accessMode);
                        } catch (cause) {
                          setSaveError(
                            cause instanceof Error
                              ? `Could not update ${agent.name}: ${cause.message}`
                              : `Could not update ${agent.name}`,
                          );
                        } finally {
                          setSavingAgentId(null);
                        }
                      }}
                    >
                      {accessModes.map((mode) => (
                        <option key={mode.value} value={mode.value}>
                          {mode.label}
                        </option>
                      ))}
                    </select>
                    {savingAgentId === agent.id ? (
                      <small className="saving">Saving…</small>
                    ) : null}
                  </td>
                  <td>{agent.permissionLevel}</td>
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
                  <td>
                    {agent.inventory?.health?.latencyMs == null
                      ? "—"
                      : `${agent.inventory.health.latencyMs} ms`}
                  </td>
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
                <td colSpan={14} className="empty">
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
