# Threat model

## Assets

Agent credentials, API credentials, workspace source code, secrets available to service accounts, production infrastructure, task/approval records and audit evidence.

## Trust boundaries

1. AI/API client → Master HTTPS API.
2. LLM/user content → controller intent parser.
3. Master → Agent WSS channel.
4. Agent → local OS/workspace/tool process.
5. Master → PostgreSQL and optional external model providers.

## Principal abuse cases

- Stolen API key creates a destructive task.
- Prompt injection asks the controller to bypass policy.
- Compromised Master forges a dispatch outside the workspace.
- Agent token is replayed or a disabled Agent reconnects.
- Path traversal or symlink escapes the workspace.
- Shell metacharacters turn a safe intent into arbitrary execution.
- Retry duplicates a migration/deploy/delete.
- Debug logs disclose a token, command secret or file content.
- One project reads or mutates another project's resources.

## Required controls

Independent credentials, constant-time digest comparison, explicit resource authorization, schema validation, local policy re-check, canonical workspace paths, command/tool allowlists, approval leases, idempotency, bounded payloads/timeouts/queues, redacted append-only audits and OS/container least privilege.
