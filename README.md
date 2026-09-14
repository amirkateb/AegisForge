# AegisForge

AegisForge is a self-hosted AI remote engineering platform. A central Master coordinates explicit Projects, Workspaces and independently identified Agents over HTTPS/WSS. AI clients use the versioned REST API or MCP adapter; all execution happens through typed tools, deterministic permission policy, expiring approvals and an Agent-side workspace boundary.

## Architecture

```text
ChatGPT / Codex / Claude / API clients
                 │ HTTPS (MASTER_API_KEY or MCP_KEY)
                 ▼
        Master API + Controller + Audit ─── PostgreSQL
                 │ WSS, per-Agent identity
                 ▼
       Agent Runtime + Local Policy + Tool Registry
                 │ canonical Workspace root
                 ▼
 Files / Git / Terminal / Services / Network / Docker / DB
```

The Master never opens an inbound port on an Agent. An Agent initiates the WSS connection, advertises its current inventory and tools, and enforces policy again before execution. A task is always bound to `projectId`, `agentId`, and `workspaceId`; no default Agent exists.

## Requirements

- Node.js 22+
- PostgreSQL 15+
- Linux with systemd for the production installer
- A domain whose DNS points to the Master for automatic public TLS

## Development

```bash
npm ci --ignore-scripts
cp .env.example .env
npm run migrate -w @aegisforge/server
npm run dev
```

Run all release checks with `npm run check`. The browser dashboard is served from the Master after `npm run build`.

## Production install

```bash
sudo npm run installer -- --type master --database-url 'postgresql://...' \
  --domain forge.example.com --email ops@example.com
```

Install an Agent after obtaining the enrollment key from the Master's protected environment file:

```bash
sudo npm run installer -- --type agent --master-url https://forge.example.com \
  --enrollment-key "$AGENT_ENROLLMENT_KEY" --agent-name web-01 \
  --environment production --workspace /srv/apps/example
```

See [INSTALL.md](docs/INSTALL.md), [API.md](docs/API.md), [SECURITY.md](docs/SECURITY.md), and [GPT_CONFIGURATION.md](docs/GPT_CONFIGURATION.md).

## Permission levels

| Level | Meaning              | Typical scope                      |
| ----- | -------------------- | ---------------------------------- |
| 0     | Read only            | files, status, inventory           |
| 1     | Safe operations      | DNS and health probes              |
| 2     | Development          | edits, tests, controlled commands  |
| 3     | Sensitive operations | services, Docker, database, backup |
| 4     | Full access          | critical restore and recovery      |

Permission is necessary but not sufficient. Every tool also declares risk and approval mode. Sensitive/high-impact calls require an approval whose hash binds the exact tool, arguments, task and step.

## Repository map

- `server`: Master API, WSS gateway, persistence, MCP and audit
- `agent`: outbound runtime, inventory and local enforcement
- `controller`: project understanding, structured planning and execution state machine
- `tools`: typed plugin registry and built-in operations
- `skills`: bounded engineering playbooks
- `dashboard`: responsive operations console
- `cli`: automation-friendly operator client
- `installer`: transactional Master/Agent/Both installation
- `database`: PostgreSQL migrations
- `test`: unit, integration, security, connection and installer suites

## License and support

Deployments should pin this repository to a reviewed release, keep credentials in a secrets manager, and back up PostgreSQL before upgrades. Security handling and reporting expectations are defined in `docs/SECURITY.md`.
