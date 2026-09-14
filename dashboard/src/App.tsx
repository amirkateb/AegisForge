import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { api } from "./api.js";
import type { Snapshot } from "./types.js";
import { Icon } from "./components/Icon.js";
import { AgentTable } from "./components/AgentTable.js";
import { TaskTimeline } from "./components/TaskTimeline.js";
import { ApprovalQueue } from "./components/ApprovalQueue.js";
import { LogTable } from "./components/LogTable.js";
const nav = [
  "Overview",
  "Agents",
  "Projects",
  "Tasks",
  "Approvals",
  "Logs",
  "Security",
  "Tools",
  "Settings",
];
const empty: Snapshot = {
  agents: [],
  projects: [],
  tasks: [],
  approvals: [],
  logs: [],
  tools: [],
};

export function App() {
  const [data, setData] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [error, setError] = useState("");
  const [active, setActive] = useState("Overview");
  const [environment, setEnvironment] = useState("ALL");
  const load = useCallback(async () => {
    try {
      setData(await api.snapshot());
      setNeedsLogin(false);
      setError("");
    } catch (cause) {
      if ((cause as { status?: number }).status === 401) setNeedsLogin(true);
      else
        setError(
          cause instanceof Error ? cause.message : "Unable to load operations",
        );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 15000);
    return () => clearInterval(timer);
  }, [load]);
  const filtered = useMemo(() => {
    if (environment === "ALL") return data;
    const ids = new Set(
      data.agents
        .filter((agent) => agent.environment === environment)
        .map((agent) => agent.id),
    );
    const tasks = data.tasks.filter((task) => ids.has(task.agentId));
    const taskIds = new Set(tasks.map((task) => task.id));
    return {
      ...data,
      agents: data.agents.filter((agent) => ids.has(agent.id)),
      tasks,
      approvals: data.approvals.filter((approval) =>
        taskIds.has(approval.taskId),
      ),
      logs: data.logs.filter((log) => !log.agentId || ids.has(log.agentId)),
      tools: data.tools.filter((item) => ids.has(item.agentId)),
    };
  }, [data, environment]);
  const metrics = useMemo(
    () => [
      {
        label: "Online agents",
        value: `${filtered.agents.filter((a) => a.status === "ONLINE").length} / ${filtered.agents.length}`,
        tone: "healthy",
      },
      {
        label: "Active tasks",
        value: filtered.tasks.filter(
          (t) => !["COMPLETED", "FAILED", "CANCELLED"].includes(t.status),
        ).length,
        tone: "accent",
      },
      {
        label: "Pending approvals",
        value: filtered.approvals.filter((a) => a.status === "PENDING").length,
        tone: "warning",
      },
      {
        label: "Security events",
        value: filtered.logs.filter(
          (l) => l.status === "FAILED" || l.status === "DENIED",
        ).length,
        tone: "danger",
      },
    ],
    [filtered],
  );
  if (needsLogin) return <Login onSuccess={load} />;
  const approval = (
    <ApprovalQueue
      approvals={filtered.approvals}
      onDecision={async (id, decision) => {
        await api.decideApproval(id, decision);
        await load();
      }}
    />
  );
  return (
    <div className="app-shell">
      <aside>
        <div className="brand">
          <div className="brand-mark">AF</div>
          <div>
            <strong>AegisForge</strong>
            <span>AI REMOTE ENGINEERING</span>
          </div>
        </div>
        <nav>
          {nav.map((item) => (
            <button
              key={item}
              className={active === item ? "active" : ""}
              onClick={() => setActive(item)}
            >
              <Icon name={item.toLowerCase()} />
              <span>{item}</span>
            </button>
          ))}
        </nav>
        <div className="platform-health">
          <i />
          Platform healthy<span>v0.1.0</span>
        </div>
      </aside>
      <main>
        <header>
          <div>
            <h1>{active === "Overview" ? "Operations" : active}</h1>
            <p>{subtitle(active)}</p>
          </div>
          <label className="environment">
            Environment
            <select
              value={environment}
              onChange={(event) => setEnvironment(event.target.value)}
            >
              <option value="ALL">All environments</option>
              <option value="PRODUCTION">Production</option>
              <option value="DEVELOPMENT">Development</option>
              <option value="TESTING">Testing</option>
            </select>
          </label>
        </header>
        {error ? (
          <div role="alert" className="error-banner">
            {error}
            <button onClick={() => void load()}>Retry</button>
          </div>
        ) : null}
        {loading ? (
          <div className="loading">Loading live operations…</div>
        ) : (
          <>
            <div className="metrics">
              {metrics.map((item) => (
                <section key={item.label} className={item.tone}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                  <i />
                </section>
              ))}
            </div>
            <Page active={active} data={filtered} approval={approval} />
          </>
        )}
      </main>
    </div>
  );
}

function Page({
  active,
  data,
  approval,
}: {
  active: string;
  data: Snapshot;
  approval: ReactNode;
}) {
  if (active === "Agents")
    return (
      <>
        <AgentTable
          agents={data.agents}
          projects={data.projects}
          tasks={data.tasks}
        />
        <LogTable logs={data.logs.filter((log) => Boolean(log.agentId))} />
      </>
    );
  if (active === "Projects")
    return (
      <Panel
        title="Registered projects"
        meta={`${data.projects.length} projects`}
      >
        <div className="card-list">
          {data.projects.map((project) => (
            <article key={project.id}>
              <strong>{project.name}</strong>
              <span>
                {
                  data.tasks.filter((task) => task.projectId === project.id)
                    .length
                }{" "}
                tasks
              </span>
              <code>{project.id}</code>
            </article>
          ))}
        </div>
      </Panel>
    );
  if (active === "Tasks")
    return (
      <>
        <TaskTimeline
          tasks={data.tasks}
          agents={data.agents}
          projects={data.projects}
        />
        <LogTable
          logs={data.logs.filter(
            (log) =>
              log.action.startsWith("task.") || log.action.startsWith("tool."),
          )}
        />
      </>
    );
  if (active === "Approvals")
    return <div className="wide-approval">{approval}</div>;
  if (active === "Logs") return <LogExplorer data={data} />;
  if (active === "Security")
    return (
      <>
        <Panel title="Security posture" meta="enforced">
          <div className="security-grid">
            <p>
              <strong>Separate credentials</strong>
              <span>Master, MCP, enrollment and Agent identities</span>
            </p>
            <p>
              <strong>Transport</strong>
              <span>HTTPS API and WSS Agent channel</span>
            </p>
            <p>
              <strong>Execution boundary</strong>
              <span>Canonical workspace roots and no shell interpolation</span>
            </p>
            <p>
              <strong>Approval leases</strong>
              <span>
                Argument-bound, expiring, single-use or session scoped
              </span>
            </p>
          </div>
        </Panel>
        <LogTable
          logs={data.logs.filter((log) =>
            ["FAILED", "DENIED", "UNKNOWN"].includes(log.status),
          )}
        />
      </>
    );
  if (active === "Tools")
    return (
      <Panel
        title="Connected Agent tools"
        meta={`${data.tools.reduce((sum, item) => sum + item.tools.length, 0)} advertised`}
      >
        <div className="tool-list">
          {data.tools.flatMap((item) =>
            item.tools.map((tool) => (
              <article key={`${item.agentId}-${tool.name}`}>
                <code>{tool.name}</code>
                <span>{tool.description}</span>
                <b className={`risk ${tool.risk.toLowerCase()}`}>{tool.risk}</b>
                <small>
                  Level {tool.requiredLevel} · {tool.approval}
                </small>
              </article>
            )),
          )}
        </div>
      </Panel>
    );
  if (active === "Settings")
    return (
      <Panel title="Runtime settings" meta="read only">
        <div className="security-grid">
          <p>
            <strong>Refresh interval</strong>
            <span>15 seconds</span>
          </p>
          <p>
            <strong>Session storage</strong>
            <span>HttpOnly, SameSite=Strict cookie</span>
          </p>
          <p>
            <strong>API version</strong>
            <span>/v1</span>
          </p>
          <p>
            <strong>Task assignment</strong>
            <span>Explicit Project, Agent and Workspace IDs</span>
          </p>
        </div>
      </Panel>
    );
  return (
    <>
      <div className="content-grid">
        <div className="primary">
          <AgentTable
            agents={data.agents}
            projects={data.projects}
            tasks={data.tasks}
          />
          <TaskTimeline
            tasks={data.tasks}
            agents={data.agents}
            projects={data.projects}
          />
        </div>
        {approval}
      </div>
      <LogTable logs={data.logs} />
    </>
  );
}

function Panel({
  title,
  meta,
  children,
}: {
  title: string;
  meta: string;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-title">
        <h2>{title}</h2>
        <span>{meta}</span>
      </div>
      {children}
    </section>
  );
}
function LogExplorer({ data }: { data: Snapshot }) {
  const [query, setQuery] = useState("");
  const logs = data.logs.filter((log) =>
    `${log.action} ${log.status} ${log.agentId ?? ""}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(logs, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "aegisforge-audit.json";
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <>
      <div className="log-toolbar">
        <input
          aria-label="Search logs"
          placeholder="Search action, status, or Agent…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button onClick={exportJson}>Export JSON</button>
      </div>
      <LogTable logs={logs} />
    </>
  );
}
function subtitle(active: string) {
  return (
    (
      {
        Overview: "Monitor and coordinate your AI engineering workforce",
        Agents: "Health, inventory and connection state",
        Projects: "Registered engineering contexts and activity",
        Tasks: "Understand, plan, execute, verify and fix",
        Approvals: "Review exact impact before sensitive execution",
        Logs: "Search and export redacted audit evidence",
        Security: "Identity, policy and approval controls",
        Tools: "Capabilities advertised by connected Agents",
        Settings: "Safe runtime and API configuration",
      } as Record<string, string>
    )[active] ?? ""
  );
}
function Login({ onSuccess }: { onSuccess(): Promise<void> }) {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await api.login(key);
      setKey("");
      await onSuccess();
    } catch {
      setError("The Master API key was rejected.");
    }
  };
  return (
    <main className="login">
      <form onSubmit={(e) => void submit(e)}>
        <div className="brand-mark large">AF</div>
        <h1>AegisForge</h1>
        <p>Authenticate to open the operations console.</p>
        <label>
          Master API key
          <input
            autoFocus
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error ? (
          <div role="alert" className="login-error">
            {error}
          </div>
        ) : null}
        <button type="submit">Open operations</button>
        <small>
          The key is exchanged for an HttpOnly session and is not stored in this
          browser.
        </small>
      </form>
    </main>
  );
}
