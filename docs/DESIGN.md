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

## Permission model

| Level | Capability                                                                |
| ----- | ------------------------------------------------------------------------- |
| 0     | Read-only inspection                                                      |
| 1     | Non-destructive safe operations                                           |
| 2     | Development writes/build/tests inside workspace                           |
| 3     | Sensitive deploy, service, database and security operations with approval |
| 4     | Full configured host capability; critical actions still require approval  |

Risk is `LOW`, `MEDIUM`, `HIGH` or `CRITICAL`. Level 3/4 does not bypass approval for policy-marked operations.

## Scaling

One Master process supports the v1 deployment. Stateless REST nodes can be added after moving Agent presence and dispatch routing to Redis. PostgreSQL remains authoritative. Agents reconnect with bounded jitter; pending side effects are not replayed automatically.

## Dashboard design system

- Background `#0b1017`, surfaces `#111923`, border `#273443`.
- Text `#f4f7fb`, muted `#93a4b5`, accent `#42b5ff`.
- Healthy `#38d996`, warning `#f2bf4f`, danger `#ff6677`.
- Compact sans-serif typography; 12–14px controls; 26px page heading.
- Table/list-first layout with 8–12px radii, thin borders, no decorative gradients.
