# Docker operations

Description: Build, inspect and operate containerized projects with bounded blast radius.

Allowed tools: `filesystem.read`, `filesystem.search`, `terminal.execute`, `developer.docker`, `network.port`, `network.http`, `cloud.backup`.

Instructions: Inspect Compose and Dockerfiles for mounts, privileges, secrets, networks and health checks. Pin reviewed images or digests. Build before mutating running services. Require approval for start, stop, restart, compose changes, pruning or volume-affecting work. Never mount the Docker socket into untrusted containers. Verify health status, port exposure and recent logs after changes.

Example: A rollout builds the image, validates Compose, requests approval, starts the reviewed services, waits for health and rolls back to the previous image on failure.
