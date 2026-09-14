# AegisForge task list

## Foundation

- [x] T01 Bootstrap npm workspace and strict TypeScript configuration. Verify: clean build.
- [x] T02 Define versioned contracts and errors. Verify: schema contract tests.
- [x] T03 Implement permission/risk/approval policy. Verify: policy tests.
- [x] T04 Add PostgreSQL schema and repositories. Verify: migration and repository build.
- [x] T05 Add structured redacted audit logging. Verify: secret-leak security tests.

## Secure Agents

- [x] T06 Implement Agent enrollment, hashing, rotation, disable and revoke. Verify: lifecycle integration tests.
- [x] T07 Implement authenticated WebSocket v1 protocol and heartbeat. Verify: real connection test.
- [x] T08 Collect host inventory and installed-tool metadata. Verify: normalized inventory.
- [x] T09 Enforce workspace and command policy locally. Verify: traversal/symlink/injection tests.

## Engineering workflow

- [x] T10 Implement Project and Workspace registration. Verify: authorization tests.
- [x] T11 Implement plugin registry and core read/search/edit/execute/system tools. Verify: registry validation and build.
- [x] T12 Implement Understand/Plan/Execute/Verify/Fix task state machine. Verify: loop and transition tests.
- [x] T13 Define durable project memory and execution evidence schema.
- [x] T14 Implement approval once/session/deny leases. Verify: expiration and replay behavior.

## Interfaces and operations

- [x] T15 Expose REST v1 and idempotent mutations. Verify: API integration suite.
- [x] T16 Expose MCP and Custom GPT/OpenAPI adapters. Verify: typed build and documented contract.
- [x] T17 Build CLI commands. Verify: strict build.
- [x] T18 Build responsive operations dashboard. Verify: live browser and accessibility checks.
- [x] T19 Build transactional Master/Agent/Both installer and guarded uninstall. Verify: rollback tests.
- [x] T20 Add Docker/systemd/Nginx/TLS deployment assets. Verify: template and health-path tests.
- [x] T21 Complete docs, sample project and end-to-end test environment. Verify: full release checklist.

Live Let's Encrypt issuance and systemd installation require a real Linux host, PostgreSQL instance and delegated domain; the installer validates and performs these steps, but they cannot be exercised in the repository-only test environment.
