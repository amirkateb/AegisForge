# Installation and operations

Automatic assignment needs at least one online Agent with a registered workspace for the project. Technology matching comes from inventory, so install relevant runtimes and database CLIs on that host. TLS workflows additionally require Certbot plus the selected Nginx/Apache/Traefik executable and publicly reachable ports 80/443. Production effects remain paused until approval.

Set `OPENAI_API_KEY` and optionally `OPENAI_MODEL` in the protected Master environment to enable automatic Understand/Plan execution. Without a provider key the deterministic API, policy and tools remain usable, while `/v1/tasks/{id}/run` returns `PLANNER_UNAVAILABLE` instead of pretending a plan was produced.

## Master

Prepare PostgreSQL and a DNS A/AAAA record, then run the installer as root. It validates Node 22, creates an unprivileged service account, copies a locked build, generates four distinct credentials, runs migrations with the production environment, installs systemd, checks DNS, installs Nginx/Certbot on apt-based systems, provisions HTTPS and verifies `/healthz`.

```bash
sudo npm run installer -- --type master \
  --database-url 'postgresql://aegisforge:password@127.0.0.1/aegisforge' \
  --domain forge.example.com --email ops@example.com
```

Credentials live in `/etc/aegisforge/master.env` with mode `0600`. Move a protected copy to a secrets manager before changing the file. The application is installed at `/opt/aegisforge` by default.

## Agent

```bash
sudo npm run installer -- --type agent \
  --master-url https://forge.example.com \
  --enrollment-key 'one-purpose-enrollment-key' \
  --agent-name app-production-01 --environment production \
  --workspace /srv/apps/store
```

Each supplied workspace is registered on the Master and its returned ID is written into the Agent mapping. Multiple `--workspace` paths are supported; use separate invocations/Agents when they need different permission levels.

## Both

`--type both` runs the Master/TLS steps first and reuses the generated enrollment credential for the local Agent. It requires a public domain or an explicit HTTPS Master URL because plaintext Agent transport is intentionally unsupported.

## Rollback and uninstall

Every successful install step registers a reverse action and runs it in reverse order after failure. PostgreSQL data and issued certificates are retained deliberately. Uninstall refuses to delete any prefix that is not a dedicated directory named `aegisforge` containing the installer marker.

```bash
sudo npm run installer -- --uninstall
```

## Upgrade

Back up PostgreSQL, stop services, deploy a reviewed release to a new directory, run migrations, switch the systemd unit and verify health. Database migrations are forward-only; rollback is restore-from-backup. Do not replace a live prefix in place.

## Verification

```bash
curl --fail https://forge.example.com/healthz
systemctl status aegisforge-master aegisforge-agent
journalctl -u aegisforge-master -u aegisforge-agent --since today
```

If a dispatch times out, AegisForge records `UNKNOWN`; inspect the Agent and target resource before retrying because the operation may have completed remotely.
