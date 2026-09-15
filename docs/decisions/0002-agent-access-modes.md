# ADR-002: Durable Agent-wide access modes

## Status

Accepted

## Date

2026-09-16

## Context

Task- and argument-bound approvals are useful for shared or high-risk servers,
but they make a privately operated, fully trusted engineering server stop after
each new operation. Permission level alone cannot express the operator's desired
approval posture because it controls tool eligibility rather than interruption.

## Decision

Store one access mode on each Agent: `FULL_TRUST`, `CAUTIOUS`, or
`VERY_CAUTIOUS`. A mode update also sets permission level 4, keeping every
installed tool eligible while the selected mode controls approvals.

`FULL_TRUST` bypasses approval decisions for every registered tool and is not
bound to a task, step, argument, or session. `CAUTIOUS` retains the existing
sensitive and production approval behavior. `VERY_CAUTIOUS` automatically runs
only low-risk tools explicitly marked `NEVER`.

The Master sends the durable mode in its authenticated dispatch. The Agent
repeats the policy decision using the same shared policy package. Tool registry,
assignment, expiry, authentication, and workspace checks continue to apply in
all modes.

## Alternatives considered

- Permanent wildcard approval grants: rejected because approvals are operation
  records and would keep mode semantics coupled to tasks and argument hashes.
- Permission level 4 as implicit trust: rejected because it would silently
  change existing deployments and conflate tool eligibility with approval.
- Master-only bypass: rejected because the Agent would disagree with the Master
  and reject sensitive dispatches locally.

## Consequences

Operators can make one server genuinely autonomous without repeated prompts.
Existing Agents remain cautious after migration. Full trust is intentionally
powerful, so the dashboard and documentation state its effect explicitly and
every mode change is retained in the audit log.
