# AegisForge design

## System boundary

AI clients submit goals; they never directly own a shell. The Master resolves an authenticated principal, project, Agent and workspace, turns goals into typed intents, applies policy and persists the workflow. The Agent receives a signed dispatch, repeats local policy checks and invokes a registered tool inside the workspace boundary.

```text
AI clients ─HTTPS─> API/MCP gateway ─> application services ─> PostgreSQL
                                         │
                                  policy + approvals
                                         │
                                     WSS dispatch
                                         │
                         Agent identity + local policy
                                         │
                       workspace-scoped plugin runtime
```

## Task state machine

`QUEUED → UNDERSTANDING → PLANNING → WAITING_APPROVAL → EXECUTING → VERIFYING → FIXING → COMPLETED`

Any active state may move to `FAILED` or `CANCELLED`. `FIXING` has a configured attempt limit and always returns to `VERIFYING`. A timeout during an external effect creates `UNKNOWN`, requiring reconciliation rather than automatic replay.

The controller records semantic phases separately from transport state: Observe loads durable context; Understand refreshes evidence; Plan validates structured steps; Execute invokes typed tools; Verify stores evidence; failed verification is diagnosed and repaired within the configured bound; Learn appends redacted history; Continue advances only after successful verification.

## Project and code intelligence

`project_memory` is authoritative for `architecture`, `dependencies`, `environment`, `database`, `routes`, `decisions`, `known-issues`, `history`, and `code-index`. Context can be exported into a `projects/<id>/context/*` layout, but two writable sources of truth are deliberately avoided.

The index reads bounded source files, ignores dependencies/build artifacts and stores only metadata. Impact analysis walks reverse symbol/file relationships so consumers of a changed symbol are included.

## Agent selection

There is no default Agent. Automatic assignment considers only online Agents with a project workspace and sufficient permission. CPU, free memory and detected runtimes affect its deterministic score. Saturated candidates produce reasons; equal top scores produce `AGENT_SELECTION_REQUIRED` for human choice.

## Permission model

| Level | Capability                                                                |
| ----- | ------------------------------------------------------------------------- |
| 0     | Read-only inspection                                                      |
| 1     | Non-destructive safe operations                                           |
| 2     | Development writes/build/tests inside workspace                           |
| 3     | Sensitive deploy, service, database and security operations with approval |
| 4     | Full configured host capability; critical actions still require approval  |

Risk is `LOW`, `MEDIUM`, `HIGH` or `CRITICAL`. Level 3/4 does not bypass approval for policy-marked operations.

The context firewall also evaluates environment, tool, structured arguments and affected paths. It rejects recursive protected-path deletion and upgrades production mutations to approval-required before dispatch.

## Scaling

One Master process supports the v1 deployment. Stateless REST nodes can be added after moving Agent presence and dispatch routing to Redis. PostgreSQL remains authoritative. Agents reconnect with bounded jitter; pending side effects are not replayed automatically.

## Dashboard design system

- Background `#0b1017`, surfaces `#111923`, border `#273443`.
- Text `#f4f7fb`, muted `#93a4b5`, accent `#42b5ff`.
- Healthy `#38d996`, warning `#f2bf4f`, danger `#ff6677`.
- Compact sans-serif typography; 12–14px controls; 26px page heading.
- Table/list-first layout with 8–12px radii, thin borders, no decorative gradients.
