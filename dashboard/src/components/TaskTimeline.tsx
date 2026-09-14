import type { Agent, Project, Task } from "../types.js";
const stages = ["UNDERSTANDING", "PLANNING", "EXECUTING", "VERIFYING"] as const;
export function TaskTimeline({
  tasks,
  agents,
  projects,
}: {
  tasks: Task[];
  agents: Agent[];
  projects: Project[];
}) {
  const names = new Map([
    ...agents.map((x) => [x.id, x.name] as const),
    ...projects.map((x) => [x.id, x.name] as const),
  ]);
  return (
    <section className="panel timeline">
      <div className="panel-title">
        <h2>Task execution timeline</h2>
        <span>
          {
            tasks.filter(
              (t) => !["COMPLETED", "FAILED", "CANCELLED"].includes(t.status),
            ).length
          }{" "}
          active
        </span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Task</th>
              <th>Agent</th>
              <th>Project</th>
              {stages.map((s) => (
                <th key={s}>{s[0] + s.slice(1).toLowerCase()}</th>
              ))}
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {tasks.slice(0, 8).map((task) => {
              const current = stages.indexOf(
                task.status as (typeof stages)[number],
              );
              const completed = task.status === "COMPLETED";
              return (
                <tr key={task.id}>
                  <td>
                    <span className="task-id">{task.id.slice(0, 8)}</span>
                    <span className="task-goal">{task.goal}</span>
                  </td>
                  <td>{names.get(task.agentId)}</td>
                  <td>{names.get(task.projectId)}</td>
                  {stages.map((stage, index) => (
                    <td key={stage}>
                      <span
                        className={`stage ${completed || index < current ? "done" : index === current ? "current" : ""}`}
                      >
                        {completed || index < current
                          ? "✓"
                          : index === current
                            ? "•"
                            : ""}
                      </span>
                    </td>
                  ))}
                  <td>
                    <span className={`state ${task.status.toLowerCase()}`}>
                      {task.status}
                    </span>
                  </td>
                </tr>
              );
            })}
            {tasks.length === 0 ? (
              <tr>
                <td colSpan={8} className="empty">
                  No engineering tasks have been submitted.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
