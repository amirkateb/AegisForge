# Implementation plan: AegisForge Phase 2

## Overview

Upgrade the control plane into an evidence-driven engineering agent while preserving the v1 REST/WSS contracts. Delivery is split into durable project/code intelligence, context-aware assignment and policy, a resumable Observe/Understand/Plan/Execute/Verify/Learn loop, then operational tools, monitoring, API/dashboard surfaces and documentation.

## Architecture decisions

- Extend contracts additively; explicit assignment remains supported while automatic assignment is enabled by omitting Agent/workspace IDs.
- Store normalized context categories in PostgreSQL `project_memory`; a filesystem-shaped context is an export/view, not a second source of truth.
- Keep AI output behind strict schemas. Deterministic analyzers, assignment and policy remain authoritative.
- Index bounded source text without persisting source bodies or secrets; persist symbols, relations, routes and database metadata only.
- Execute sensitive effects exclusively through argument-bound approval and Agent-side policy enforcement.

## Task list

### Phase A: Intelligence foundation

- [x] P201 Define additive context, code-index, health, assignment and planner contracts.
- [x] P202 Implement bounded framework-aware project analysis and code indexing with impact queries.
- [x] P203 Persist/load all project context categories and learning history in both stores.

### Checkpoint: Intelligence

- [x] Focused analyzer and memory tests pass; typecheck is clean.

### Phase B: Agent brain and secure routing

- [x] P204 Implement deterministic Agent selection using connectivity, workspace, permissions, resources and technology fit.
- [x] P205 Upgrade context policy to evaluate Agent, project, tool, command/path targets and computed risk.
- [x] P206 Upgrade the controller to Observe/Understand/Plan/Execute/Verify/Learn/Continue with resumable step state and failure diagnosis.
- [x] P207 Wire automatic assignment, context inspection and impact analysis into versioned APIs.

### Checkpoint: Brain

- [x] Task, assignment, permission, approval and autonomous-debug tests pass.

### Phase C: Operations and product surfaces

- [x] P208 Add typed Linux, Docker, Laravel, WordPress, Git, database, deployment and TLS workflow tools.
- [x] P209 Persist heartbeat/latency/version/health metrics and expose log filtering/export.
- [x] P210 Surface health and context in the dashboard and complete OpenAPI/GPT/operator documentation.

### Checkpoint: Release

- [x] Full `npm run check` succeeds (17 files, 39 tests).
- [x] Security, connection, installer, SSL/deployment workflow and multi-Agent tests succeed.

## Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| AI-generated unsafe plan | Critical | Strict schemas, known-tool constraint, computed risk and dual policy enforcement |
| Incorrect automatic selection | High | Deterministic scored candidates; conflict response without a unique viable assignment |
| Source indexing leaks secrets | High | No bodies persisted, ignored secret/vendor paths, bounded metadata only |
| Production interruption | Critical | Production approval, staged workflow, health verification and explicit unknown state |
| Migration compatibility | High | New migration only; no destructive schema edits |

## Open questions

- Live certificate issuance, DNS delegation and service restart require a real delegated domain and Linux host. Repository tests validate command construction, policy and workflow behavior without claiming public issuance occurred.
