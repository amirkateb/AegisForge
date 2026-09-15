# REST, WSS and MCP API

The stable REST prefix is `/v1`. Send `Authorization: Bearer <MASTER_API_KEY>` for operator calls or `<MCP_KEY>` for the limited AI surface. Mutations that create tasks require `Idempotency-Key`; reusing a key with different content returns `IDEMPOTENCY_MISMATCH`.

## Primary routes

| Method   | Route                          | Credential  | Purpose                                      |
| -------- | ------------------------------ | ----------- | -------------------------------------------- |
| GET      | `/healthz`                     | none        | liveness/version                             |
| POST     | `/v1/session`                  | key in body | exchange Master key for protected UI session |
| GET/POST | `/v1/agents`                   | Master      | inventory/create identity                    |
| POST     | `/v1/agents/enroll`            | enrollment  | create one Agent token                       |
| POST     | `/v1/agents/{id}/disable`      | Master      | disable and disconnect                       |
| POST     | `/v1/agents/{id}/revoke`       | Master      | permanently revoke                           |
| POST     | `/v1/agents/{id}/rotate-token` | Master      | rotate and disconnect                        |
| POST     | `/v1/agent/workspaces`         | Agent       | register its local root and Project          |
| GET/POST | `/v1/projects`                 | Master      | list/create Projects                         |
| GET      | `/v1/projects/{id}/context`    | Master      | load durable context                         |
| PUT      | `/v1/projects/{id}/context/{category}` | Master | update one context category           |
| GET      | `/v1/projects/{id}/impact?symbol=User` | Master | code impact query                     |
| POST     | `/v1/projects/{id}/deployments` | Master/MCP | create and run a staged deployment plan |
| POST     | `/v1/projects/{id}/tls`         | Master/MCP | create and run a DNS-to-HTTPS plan          |
| POST     | `/v1/workspaces`               | Master      | bind Project, Agent and root                 |
| GET/POST | `/v1/tasks`                    | Master/MCP  | list/create automatic or explicit tasks      |
| POST     | `/v1/tasks/{id}/run`           | Master/MCP  | run/resume the autonomous controller         |
| GET      | `/v1/approvals`                | Master      | list approval queue                          |
| POST     | `/v1/approvals/{id}/decision`  | Master      | once/session/deny                            |
| POST     | `/v1/tools/run`                | Master/MCP  | evaluate and dispatch exact tool intent      |
| GET      | `/v1/logs`                     | Master      | redacted events with bounded filters         |
| GET      | `/v1/logs/export`              | Master      | filtered redacted CSV export                 |
| *        | `/mcp`                         | MCP         | stateless MCP transport                      |
| WSS      | `/v1/agent/connect`            | Agent       | HELLO, heartbeat, DISPATCH and RESULT        |

## Task creation

```json
{
  "projectId": "uuid",
  "agentId": "uuid",
  "workspaceId": "uuid",
  "goal": "Run tests, repair failures, verify and report",
  "maxFixAttempts": 2
}
```

The Master rejects cross-boundary assignments. If more than one Agent is suitable, the caller must select explicitly; AegisForge never guesses a default.

For automatic assignment omit both `agentId` and `workspaceId`; optionally send `requiredPermissionLevel` and `technologies`. No candidate or an equal top score returns `409 AGENT_SELECTION_REQUIRED` with actionable details.

## Tool execution and approvals

`POST /v1/tools/run` requires task/project/Agent/workspace IDs, step ID, advertised tool name, arguments, reason, expected impact and affected resources. A safe operation returns `200 EXECUTED`. A sensitive operation returns `202 APPROVAL_REQUIRED`; decide the approval, then repeat the identical request with `approvalId`. Any argument change invalidates it.

Errors use `{ "error": { "code", "message", "requestId", "details?" } }`. Validation failures are `422`; authentication is `401`; policy denial is `403`; disconnected/unavailable state is `409`.

The complete machine-readable contract is [openapi.yaml](openapi.yaml).
