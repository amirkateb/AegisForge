# AegisForge Phase 2 task list

## Intelligence foundation

### P201: Add Phase 2 contracts

**Status:** Complete.

**Acceptance criteria:** Context categories, code graph, health and automatic-assignment inputs are schema validated and backward compatible.

**Verification:** Contract/type tests and `npm run typecheck`.

**Dependencies:** None.

### P202: Build project and code intelligence

**Status:** Complete.

**Acceptance criteria:** Detect common project structures; extract bounded symbols, imports, routes and database entities; return affected symbols/files.

**Verification:** `vitest run test/unit/project-intelligence.test.ts`.

**Dependencies:** P201.

### P203: Make project memory durable and complete

**Status:** Complete.

**Acceptance criteria:** Load/save architecture, dependencies, environment, database, routes, decisions, issues and bounded history independently in both stores.

**Verification:** `vitest run test/integration/project-memory.test.ts`.

**Dependencies:** P201-P202.

## Agent brain and secure routing

### P204: Select an Agent deterministically

**Status:** Complete.

**Acceptance criteria:** Only online project workspaces are eligible; permission, load, disk and technology affect score; failure returns actionable reasons.

**Verification:** `vitest run test/unit/agent-selection.test.ts`.

**Dependencies:** P201.

### P205: Enforce context-based policy

**Status:** Complete.

**Acceptance criteria:** Existing behavior remains; environment, dangerous commands, protected paths and risk influence decisions.

**Verification:** `vitest run test/unit/policy.test.ts test/security/context-policy.test.ts`.

**Dependencies:** P201.

### P206: Implement resumable engineering cycle

**Status:** Complete.

**Acceptance criteria:** Context load precedes planning, evidence/fixes persist, failures are diagnosed, learning is recorded and interrupted steps remain resumable.

**Verification:** controller and memory suites.

**Dependencies:** P202-P205.

### P207: Expose intelligence and automatic assignment APIs

**Status:** Complete.

**Acceptance criteria:** Explicit task creation remains; omitted assignment selects a unique Agent/workspace; context and impact endpoints are typed.

**Verification:** API integration suite.

**Dependencies:** P203-P206.

## Operations and release

### P208: Expand typed operational tools

**Status:** Complete.

**Acceptance criteria:** Dedicated tools cover requested Linux, Docker, Laravel, WordPress, Git and database operations; deployment/TLS workflows are staged and verifiable.

**Verification:** registry and workflow tests.

**Dependencies:** P205.

### P209: Complete monitoring and logs

**Status:** Complete.

**Acceptance criteria:** Heartbeat, latency, version and health score are visible; logs support bounded filters/export and remain redacted.

**Verification:** connection, API and security suites.

**Dependencies:** P204.

### P210: Update dashboard and documentation

**Status:** Complete.

**Acceptance criteria:** Dashboard shows health/context; all requested English docs and OpenAPI match behavior.

**Verification:** dashboard build, OpenAPI inspection and full `npm run check`.

**Dependencies:** P207-P209.

## Private GPT integration

### P301: Complete the GPT-facing API

**Status:** Complete.

**Acceptance criteria:** A private GPT can discover all assigned servers and
workspaces, create a task, inspect/edit/test with task-scoped tools, submit a
plan, and read task details using only `MCP_KEY`.

**Verification:** Focused API and WebSocket integration tests.

### P302: Make execution plan-safe and observable

**Status:** Complete.

**Acceptance criteria:** Unplanned tasks do not auto-fail; planned tasks execute;
all execution failures are redacted and available in the dashboard snapshot.

**Verification:** Task runner, connection, redaction, and dashboard build checks.

### P303: Publish the ready-to-import GPT contract

**Status:** Complete.

**Acceptance criteria:** OpenAPI and Persian/English setup documents match the
implemented endpoints and contain paste-ready GPT instructions.

**Verification:** OpenAPI inspection and full `npm run check`.

## Agent access modes

### P401: Persist and expose Agent access mode

**Status:** Complete.

**Acceptance criteria:** Every Agent has `FULL_TRUST`, `CAUTIOUS`, or
`VERY_CAUTIOUS`; changing it is Agent-wide, audited, and synchronizes permission
level 4.

**Verification:** Contract, store, migration, and API integration tests.

### P402: Enforce the mode end to end

**Status:** Complete.

**Acceptance criteria:** Master and Agent agree on the policy decision;
`FULL_TRUST` never produces `APPROVAL_REQUIRED` and the other modes implement the
documented matrix.

**Verification:** Policy, task-runner, API, and WebSocket tests.

### P403: Add dashboard controls and documentation

**Status:** Complete.

**Acceptance criteria:** The Agents panel explains and saves all three modes,
and English/Persian/OpenAPI documentation matches runtime behavior.

**Verification:** Typecheck, dashboard build, documentation inspection, and full
`npm run check`.
