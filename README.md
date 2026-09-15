# AegisForge

[فارسی](README.fa.md)

AegisForge is a self-hosted control plane for AI-assisted remote software engineering. A central Master coordinates organizations, projects, workspaces, and independently identified Agents over HTTPS/WSS. Every operation passes through typed tools, deterministic policy, scoped approvals, and redacted audit logging; each Agent enforces the workspace boundary again before touching its host.

> AegisForge is currently an early-stage `0.1.0` project. Review and pin a release before using it on production infrastructure.

## What it provides

- Multiple organizations, projects, Agents, and workspaces without a hidden default Agent
- Explicit assignment or automatic Agent selection by availability, permissions, capacity, and detected technology
- A durable project memory for architecture, dependencies, environment, database, routes, decisions, known issues, history, and a bounded code index
- An observable `Observe → Understand → Plan → Execute → Verify → Learn → Continue` controller loop
- Typed filesystem, terminal, Git, Docker, service, network, database, Nginx, deployment, and TLS operations
- Permission levels 0–4 plus exact, expiring once/session approvals for sensitive effects
- A versioned REST API, stateless MCP endpoint, CLI, and responsive operator dashboard
- PostgreSQL persistence, outbound-only Agent connections, systemd installation, audit export, and health telemetry

## Architecture

```text
ChatGPT / Codex / Claude / CLI / API clients
                       │ HTTPS
                       ▼
          Master API + Controller + Audit ─── PostgreSQL
                       │ WSS, per-Agent identity
                       ▼
             Agent Runtime + Local Policy
                       │ canonical workspace roots
                       ▼
       Files / Git / Processes / Services / Docker / DB
```

The Master never opens an inbound port on an Agent. Each Agent initiates its WSS connection, reports inventory and health, and accepts only work for a registered local workspace. A task is always bound to a project, Agent, and workspace. When automatic selection has no unique best candidate, the API returns `AGENT_SELECTION_REQUIRED` for a human choice.

The controller stores structured project context and a symbol relationship graph without persisting source-code bodies. Before a change, clients can query impact; after execution, verification evidence and learned context are persisted. Production deployment and TLS workflows are staged plans, and context-aware policy upgrades their mutating steps to approval-required operations.

For design rationale and trust boundaries, see [Design](docs/DESIGN.md), [Security](docs/SECURITY.md), and the [Threat model](docs/THREAT_MODEL.md).

## Requirements

- Node.js 22 or newer
- npm 11 or a compatible npm version with workspace support
- PostgreSQL 15 or newer
- Linux with systemd for the production installer
- A public domain pointed at the Master for automatic TLS provisioning

## Quick start for development

```bash
git clone https://github.com/amirkateb/AegisForge.git
cd AegisForge
npm ci --ignore-scripts
cp .env.example .env
# Replace every placeholder secret and configure DATABASE_URL.
npm run migrate -w @aegisforge/server
npm run dev
```

The Master listens on `http://127.0.0.1:8787` with the example configuration. Build the dashboard and all workspaces before evaluating the complete browser experience:

```bash
npm run build
npm run dev
```

AegisForge does not call an LLM API. One private Custom GPT supplies all reasoning and planning through the `MCP_KEY`-protected Action API; the Master validates and executes only typed operations.

Never commit `.env`. Use four independent, randomly generated secrets of at least 32 bytes for `MASTER_API_KEY`, `MCP_KEY`, `AGENT_ENROLLMENT_KEY`, and `DASHBOARD_SESSION_SECRET`.

## Common commands

| Command                    | Purpose                                      |
| -------------------------- | -------------------------------------------- |
| `npm run dev`              | Start the Master in development mode         |
| `npm run build`            | Build every workspace                        |
| `npm run typecheck`        | Type-check the TypeScript project references |
| `npm test`                 | Run the complete Vitest suite                |
| `npm run test:unit`        | Run unit tests                               |
| `npm run test:integration` | Run integration tests                        |
| `npm run test:security`    | Run security regression tests                |
| `npm run test:connection`  | Run Agent connection tests                   |
| `npm run test:installer`   | Run installer tests                          |
| `npm run check`            | Type-check, test, and build the repository   |
| `npm run installer -- ...` | Run the production installer                 |

## Production installation

Install the Master after preparing PostgreSQL and public DNS:

```bash
sudo npm run installer -- --type master \
  --database-url 'postgresql://aegisforge:PASSWORD@127.0.0.1/aegisforge' \
  --domain forge.example.com --email ops@example.com
```

Then install an Agent with the enrollment credential stored in the Master's protected environment file:

```bash
sudo npm run installer -- --type agent \
  --master-url https://forge.example.com \
  --enrollment-key "$AGENT_ENROLLMENT_KEY" \
  --agent-name production-01 --environment production \
  --workspace /srv/apps/my-project
```

The installer supports Master, Agent, or both; performs migrations and health checks; and rolls back completed installation steps after failure. PostgreSQL data and issued certificates are deliberately retained. Read the full [installation and operations guide](docs/INSTALL.md) before a production deployment.

## API and clients

The stable API prefix is `/v1`. Operator requests use `Authorization: Bearer <MASTER_API_KEY>`; limited AI clients use a separate `MCP_KEY`. Task-creating mutations require an `Idempotency-Key`.

Important surfaces include:

- `/v1/organizations`, `/v1/projects`, and project context/impact queries
- `/v1/agents`, Agent enrollment/lifecycle routes, and `/v1/agent/connect`
- `/v1/ai/catalog`, `/v1/tasks`, task-scoped tools, plans and results
- `/v1/tools/run`, `/v1/approvals`, and redacted `/v1/logs`
- `/v1/projects/{id}/deployments` and `/v1/projects/{id}/tls`
- `/mcp` for stateless MCP clients

See the [API guide](docs/API.md), [OpenAPI contract](docs/openapi.yaml), and [AI-client configuration](docs/GPT_CONFIGURATION.md).

The CLI uses these environment variables:

```bash
export AEGISFORGE_URL=https://forge.example.com
export AEGISFORGE_MASTER_API_KEY='...'
npm run build -w @aegisforge/cli
node cli/dist/index.js status
node cli/dist/index.js agents --json
node cli/dist/index.js projects
node cli/dist/index.js logs
```

## Permission and approval model

| Level | Meaning              | Typical scope                      |
| ----- | -------------------- | ---------------------------------- |
| 0     | Read only            | Files, status, inventory           |
| 1     | Safe operations      | DNS and health probes              |
| 2     | Development          | Edits, tests, controlled commands  |
| 3     | Sensitive operations | Services, Docker, database, backup |
| 4     | Full access          | Critical restore and recovery      |

Every Agent also has a durable access mode. Selecting a mode in the Agents page
automatically synchronizes permission level 4 so all installed tools remain
eligible:

| Access mode | Behavior |
| --- | --- |
| Fully trusted | Runs every registered tool immediately, including `ALWAYS`, high/critical, and production operations. It never requests approval and is Agent-wide rather than task/session scoped. |
| Cautious | Runs safe work automatically; requests exact approval for `ALWAYS`, high/critical sensitive, and production-mutating operations. This is the default. |
| Very cautious | Automatically runs only low-risk tools marked `NEVER`; every other tool requires exact approval. |

Authentication, installed-tool validation, dispatch expiry, assignment, and
workspace containment remain active in every mode. For cautious modes, an
approval hash binds the exact tool, arguments, task, and step. Treat an
`UNKNOWN` dispatch result as potentially completed and inspect the target before
retrying.

## Repository map

- `server` — Master REST/WSS API, persistence, MCP, sessions, and audit
- `agent` — outbound runtime, inventory, workspace mapping, and local enforcement
- `controller` — Agent selection, project/code intelligence, planning, and execution state machine
- `tools` — typed tool registry, operational adapters, and staged workflows
- `skills` — bounded engineering playbooks
- `dashboard` — responsive operations console
- `cli` — automation-friendly operator client
- `installer` — transactional Master/Agent/Both installation
- `packages` — shared protocol, policy, and logging packages
- `database` — forward-only PostgreSQL migrations
- `test` — unit, integration, security, connection, and installer suites

## Operational notes

- Keep the Master, MCP, enrollment, Agent, and dashboard credentials separate and rotate them independently.
- Back up PostgreSQL before upgrades; migrations are forward-only, so database rollback is restore-from-backup.
- Public certificate issuance, service restarts, Docker changes, and production database operations require a real target host. Approval depends on the selected Agent access mode; Fully trusted never pauses for it.
- A live production PostgreSQL migration and public Let's Encrypt issuance are environment-dependent and are not implied by repository tests.

## Documentation

- [Installation and operations](docs/INSTALL.md)
- [REST, WSS, and MCP API](docs/API.md)
- [Security model](docs/SECURITY.md)
- [Custom GPT, Codex, and Claude configuration](docs/GPT_CONFIGURATION.md)
- [System design](docs/DESIGN.md)
- [Threat model](docs/THREAT_MODEL.md)
- [GitHub repository setup](docs/GITHUB_REPOSITORY.md)

Persian documentation is available in [README.fa.md](README.fa.md) and the `.fa.md` guides under `docs/`.
