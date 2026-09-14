# ADR-001: Modular TypeScript control plane with PostgreSQL

## Status

Accepted

## Date

2026-09-14

## Context

The platform needs shared contracts across server, Agent, controller, CLI and dashboard; durable task/approval state; and independently deployable Master and Agents.

## Decision

Use a strict TypeScript npm-workspace monorepo. PostgreSQL is the durable system of record. Agent transport is authenticated WebSocket, operator/API transport is versioned HTTPS REST, and MCP/Actions are adapters over the same application services.

## Alternatives considered

- Fork DesktopCommanderMCP/Relay: rejected because their privileged local-tool and transport assumptions are not a suitable authorization core.
- Microservices from day one: rejected because distributed transactions and operations would add risk before load requires them.
- SQLite primary storage: rejected because concurrent workflows and multi-node evolution require a networked ACID database.

## Consequences

The modular monolith keeps transactions and policy consistent. Module ports permit later extraction. PostgreSQL and a reverse proxy are production prerequisites.
