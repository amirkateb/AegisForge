import type { Audit } from "../types.js";
export function LogTable({ logs }: { logs: Audit[] }) {
  return (
    <section className="panel logs">
      <div className="panel-title">
        <h2>Live events & security log</h2>
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
            </tr>
          </thead>
          <tbody>
            {logs.slice(0, 10).map((log) => (
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
              </tr>
            ))}
            {logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty">
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
