# Spec: AegisForge AI Remote Engineering Platform

## Objective

AegisForge is a self-hosted control plane for coordinating AI-assisted engineering work across many projects and machines. It separates intent, authorization and audit on the Master from least-privilege execution on independently identified Agents. A task is successful only after the platform understands its project, creates a bounded plan, executes policy-approved steps, verifies the outcome and records durable evidence.

## Product invariants

- No default Agent: every task carries `projectId`, `agentId` and `workspaceId` before execution.
- Model output is untrusted data. Only schema-valid tool intents may reach policy evaluation.
- Permission level and risk are separate. A caller may have permission while the operation still requires approval.
- Master and Agent both enforce the decision; neither trusts policy metadata supplied by a client.
- Side-effecting requests require an idempotency key and are never blindly replayed after an unknown result.
- Secrets are read from environment or secret files, are never returned by APIs and are redacted from logs.
- Production external traffic is HTTPS/WSS only. Plain HTTP is limited to loopback health/development use.
- Workspace roots are canonicalized; path escape and symlink escape are rejected.
- All security-sensitive state transitions produce an append-only audit event.

## Tech stack

- Node.js 22+ and TypeScript 5.9 in an npm workspace monorepo.
- Fastify, WebSocket and Zod at system boundaries.
- PostgreSQL 16 as the durable source of truth; Redis is optional for multi-node fan-out.
- React 19 + Vite for the dashboard.
- Vitest for unit/integration tests and Playwright for critical browser flows.
- Docker Compose for reproducible local/production-shaped deployment; systemd and Nginx templates for host installs.

## Commands

```bash
npm ci --ignore-scripts
npm run build
npm test
npm run typecheck
npm run dev
npm run installer
```

## Project structure

```text
server/       Master REST/WebSocket control plane
agent/        Host inventory and guarded local execution
controller/   Project understanding and task state machine
tools/        Plugin contracts and built-in tools
skills/       Declarative engineering skills
dashboard/    React management interface
packages/     Shared contracts and policy primitives
database/     PostgreSQL migrations
installer/    Transactional install/uninstall CLI
docs/         Architecture, security, API and integration docs
tasks/        Roadmap and verifiable work items
test/         Cross-package and security tests
```

## Code style

```ts
export async function authorizeTool(
  input: ToolIntent,
  context: PolicyContext,
): Promise<PolicyDecision> {
  const permission = context.permissions.forTool(input.toolName);
  if (!permission.isAllowed)
    return { type: "denied", reason: permission.reason };
  return context.approvals.evaluate(input, permission);
}
```

Use explicit domain names, discriminated unions, immutable inputs, boundary validation and dependency injection. Avoid hidden global state and cross-layer imports.

## Testing strategy

- Unit: policy matrix, path containment, redaction, state transitions and planners.
- Integration: REST contracts, PostgreSQL repositories, Agent handshake and approval lifecycle.
- Security: authentication separation, tenant/project authorization, traversal, replay, injection and secret leakage.
- Connection: real Master plus test Agent over WebSocket.
- Installer: temporary-prefix installation with rollback and uninstall.
- E2E: create project/task, approve a sensitive step and observe verified completion in the dashboard.

## Boundaries

- Always: validate external input, authorize every resource, redact logs, use parameterized SQL, use idempotency for mutations, verify before completing.
- Approval required: schema migrations, deploy/restart, destructive file/database operations, privilege changes, secret access and production-impacting commands.
- Never: commit secrets, trust model-generated commands, execute outside the assigned workspace, log tokens/passwords, auto-replay an unknown side effect, disable TLS in production.

## Success criteria

- Master supports at least 100 registered Agents and 100 Projects without a default-Agent assumption.
- Agents have independently revocable and rotatable credentials.
- Levels 0–4 and Approve Once/Session/Deny are enforced server- and agent-side.
- A task persists Understand → Plan → Execute → Verify/Fix state and evidence.
- Core tools carry permission, risk and approval metadata.
- Dashboard exposes the requested management surfaces and a working approval action.
- Installer supports Master, Agent and Both with rollback, uninstall and health verification.
- Required documentation and OpenAPI/Custom GPT setup are committed.
- Build, typecheck, unit, integration, security, connection and installer tests pass.

## Assumptions

- Linux is the first production host target; macOS/Windows Agents remain supported by the runtime but service installation is Linux-first.
- Multiple organizations and Projects are supported; Agent/workspace assignment remains explicit or deterministically selected without a default Agent.
- TLS certificates are provisioned through Certbot only when DNS already resolves to the host.
- LLM providers are adapters. AegisForge works without one for deterministic task/tool execution.
