# Linux operations

Description: Diagnose Linux hosts and operate services with least privilege and observable verification.

Allowed tools: `system.info`, `system.process.list`, `system.service.status`, `system.service.control`, `filesystem.read`, `terminal.execute`, `network.port`.

Instructions: Read status and logs before mutation. Scope process and service names exactly. Require approval for start/stop/restart/reload, package changes, permissions, users, firewall or scheduled jobs. Never disable host security controls to make a task pass. Verify service state, listening ports, resource pressure and recent errors after changes.

Example: A service recovery checks systemd state and logs, explains impact, requests restart approval, restarts once, then verifies active state and the application health endpoint.
