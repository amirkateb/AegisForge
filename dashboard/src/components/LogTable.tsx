import type { Audit } from "../types.js";
export function LogTable({
  logs,
  title = "Live events & security log",
}: {
  logs: Audit[];
  title?: string;
}) {
  return (
    <section className="panel logs">
      <div className="panel-title">
        <h2>{title}</h2>
        <span>{logs.length} retained</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Status</th>
              <th>Source</th>
              <th>Event</th>
              <th>Duration</th>
              <th>Evidence</th>
              <th>Copy</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{new Date(log.timestamp).toLocaleString()}</td>
                <td>
                  <span className={`log-level ${log.status.toLowerCase()}`}>
                    {log.status}
                  </span>
                </td>
                <td>{log.agentId?.slice(0, 8) ?? "master"}</td>
                <td>{log.action}</td>
                <td>{log.durationMs == null ? "—" : `${log.durationMs} ms`}</td>
                <td>
                  {Object.keys(log.metadata ?? {}).length ? (
                    <details>
                      <summary>View details</summary>
                      <pre>{JSON.stringify(log.metadata, null, 2)}</pre>
                    </details>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  <button
                    type="button"
                    aria-label={`Copy ${log.action} audit event`}
                    onClick={() =>
                      void navigator.clipboard.writeText(
                        JSON.stringify(log, null, 2),
                      )
                    }
                  >
                    Copy
                  </button>
                </td>
              </tr>
            ))}
            {logs.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty">
                  No audit events recorded.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
