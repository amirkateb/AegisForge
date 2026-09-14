# Implementation plan: AegisForge v1

## Architecture decisions

- Use a modular monorepo so contracts and policy rules are shared without duplicating authority.
- Keep orchestration on Master and re-check authorization on Agent to limit a compromised control-plane path.
- Use PostgreSQL for durable workflows and idempotency; use in-memory adapters only in tests.
- Model each engineering task as a persisted state machine with bounded steps and evidence.
- Expose REST v1 for operators/Actions, WebSocket v1 for Agents and an MCP adapter over the same application services.
- Treat installer operations as a transaction of reversible steps with a rollback journal.

## Delivery phases

1. Foundation: contracts, policy, migrations, configuration and audit.
2. Secure connection: Agent identity, registration, heartbeat, inventory and revocation.
3. Work execution: plugin registry, workspace guard, approvals and idempotent task dispatch.
4. Engineering intelligence: analyzer, planner, execution/verify/fix loop and project memory.
5. Product surfaces: API, MCP/Actions, CLI and operations dashboard.
6. Operations: installer, Nginx/TLS, services, backups, tests and documentation.

## Risks and mitigations

| Risk                     | Impact   | Mitigation                                                                           |
| ------------------------ | -------- | ------------------------------------------------------------------------------------ |
| Excessive AI agency      | Critical | Deterministic policy engine, schema validation, dual enforcement, approval leases    |
| Credential compromise    | Critical | Independent hashed tokens, rotation/revocation, no secret logging, scoped identities |
| Duplicate side effects   | High     | Atomic idempotency records and no automatic replay after unknown completion          |
| Workspace escape         | Critical | Realpath containment, symlink rejection, dedicated OS account/container              |
| Multi-node Agent routing | High     | Single-node v1; Redis-backed routing is an explicit scale-out phase                  |
| Installer host variance  | High     | Preflight checks, dry-run, rollback journal and distro adapters                      |

## Verification checkpoints

- Foundation: unit/security tests and TypeScript build.
- Connection: real local WebSocket handshake and revocation test.
- Execution: end-to-end task plus approval and audit evidence.
- Product: browser-verified responsive dashboard and OpenAPI validation.
- Release: clean install in a temporary prefix, rollback, uninstall and dependency audit.
