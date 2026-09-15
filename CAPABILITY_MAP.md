# AegisForge capability map

| Module id              | Responsibility                                                                  | Depends on                              |
| ---------------------- | ------------------------------------------------------------------------------- | --------------------------------------- |
| contracts              | Versioned schemas, IDs, errors, protocol messages                               | —                                       |
| identity-policy        | API authentication, agent identity, permissions, risk and approvals             | contracts                               |
| persistence            | PostgreSQL repositories, migrations and idempotency                             | contracts                               |
| tool-runtime           | Plugin manifests, tool registry and guarded execution                           | contracts, identity-policy              |
| agent-runtime          | Host inventory, secure connection, workspace execution and local enforcement    | contracts, tool-runtime                 |
| control-server         | REST API, WebSocket gateway, agent registry and orchestration                   | contracts, identity-policy, persistence |
| engineering-controller | Project analysis, planning, execution/verification loop and memory              | contracts, persistence, tool-runtime    |
| dashboard              | Operations UI for agents, projects, tasks, approvals, logs and security         | contracts, control-server               |
| cli-installer          | Operator CLI, transactional installation, service/proxy/TLS setup and uninstall | contracts, control-server               |
| integrations           | MCP and Custom GPT/OpenAPI adapters                                             | contracts, control-server               |

Phase 2 adds category-based project memory, bounded code indexing/impact analysis, scored non-default Agent selection, context policy, autonomous approval-resumable task running, organization grouping, health telemetry, and executable deployment/TLS workflows.

Build order: contracts → identity-policy/persistence → tool-runtime → agent-runtime/control-server → engineering-controller → integrations/dashboard → cli-installer.
