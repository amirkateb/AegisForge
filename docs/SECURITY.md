# Security model

## Trust boundaries

AI output, task text, repository contents, tool arguments and Agent metadata are untrusted. The Master validates transport contracts, assignment and policy. The Agent validates the signed-by-context dispatch again and resolves every filesystem target through a canonical Workspace root. Neither side uses an interpolated shell command.

## Context-aware execution firewall

Each execution is evaluated using the Agent's durable access mode, permission,
environment, project/workspace binding, trusted tool metadata, structured
arguments, affected paths and risk. In cautious modes, recursive deletion aimed
at root/protected paths is denied and production mutations require exact,
expiring approval. `FULL_TRUST` intentionally allows every registered tool with
no approval or policy denial. The Agent repeats the shared mode decision before
running a process without shell interpolation.

Code indexing excludes dependency, VCS, build and log directories and persists metadata rather than source bodies. Context, evidence, learning and audit payloads pass through secret redaction.

## Credentials

- `MASTER_API_KEY`: human/operator REST and CLI access
- `MCP_KEY`: MCP and AI-client access
- `AGENT_ENROLLMENT_KEY`: one-purpose Agent enrollment
- `AGENT_TOKEN`: unique to one Agent and stored only as SHA-256 digest on Master
- `DASHBOARD_SESSION_SECRET`: HMAC session signing only

All four Master secrets must be different. Environment files are created with mode `0600`; secrets are excluded by `.gitignore`. Rotate an Agent token with `POST /v1/agents/{id}/rotate-token`; the current socket is closed immediately. Revoked identities cannot be enabled again.

## Approval semantics

An approval includes reason, expected impact, affected resources, risk, tool name and an argument hash. `Approve Once` expires after ten minutes and is consumed atomically after execution. `Approve Session` expires after one hour. A changed argument, step, task or tool invalidates the grant. These grants apply to `CAUTIOUS` and `VERY_CAUTIOUS`; `FULL_TRUST` is a persistent Agent-wide operator decision and does not create or consume approvals.

## Files and processes

WorkspaceGuard resolves both existing targets and the nearest existing parent with `realpath`, blocking `..` and symlink escapes. Process tools use executable plus argument arrays with `shell:false`, explicit allowlists, timeouts and output caps. Restore, service mutation, Docker mutation and database commands follow the selected Agent access mode.

## Web security

Production traffic terminates at Nginx with Let's Encrypt. Agents require `wss://`; installer and API clients require `https://`. Dashboard credentials are exchanged for `HttpOnly; SameSite=Strict; Secure` sessions. Responses deny framing, MIME sniffing, referrers and caching. CORS is disabled unless explicit origins are configured.

## Logs

Audit records contain timestamp, Agent, Project, user, action, duration, status and bounded metadata. The redactor removes keys or values resembling passwords, authorization headers, tokens, cookies, private keys and common API-key formats before persistence/logging. Do not place credentials in filenames, project names, task goals or command arguments.

## Operational hardening

- Run Master and Agent as the unprivileged `aegisforge` account.
- Use `CAUTIOUS` or `VERY_CAUTIOUS` on shared/untrusted hosts. Selecting any access mode synchronizes level 4 so mode policy, rather than unavailable tools, governs execution.
- Use separate Master instances or strict project assignment for different trust domains.
- Restrict PostgreSQL to the Master host and require verified TLS for remote databases.
- Ship audit events to append-only storage and alert on `DENIED`, `FAILED`, `UNKNOWN`, token rotation and repeated authentication failure.
- Restore from a tested backup before considering a destructive result resolved.

See `THREAT_MODEL.md` for abuse cases and residual risks.
