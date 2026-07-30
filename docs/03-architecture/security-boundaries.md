# Security Boundaries

## Default Runtime Boundary

- Bind to `127.0.0.1` by default.
- Single-user local use only.
- No password, private key, AccessKey Secret, database password, `.env`, or secret URL storage.
- No arbitrary shell input in MVP.
- Real SSH collection is disabled unless explicitly enabled.
- The scheduler is local in-process only. It does not install a Windows service or remote cron job.

## SSH Rules

- Store SSH Host aliases, not private keys.
- Prefer the user's existing `~/.ssh/config`.
- A configured host must be resolvable by `ssh -G <alias>` before LocalOps can collect SSH evidence.
- No password-based SSH in MVP.
- Per-host SSH concurrency limit: 1.
- Global SSH concurrency limit: 3.
- Timeouts:
  - Light checks: 5 seconds per command.
  - Deep checks: 20 seconds per command.
  - Recovery action verification: 60 seconds.
- Scheduled checks use the same read-only collectors and never expand the command allowlist.

## Command Allowlist

Allowed read-only families:

- System: `uptime`, `free`, `df`, `vmstat`, `iostat`, `ss`.
- Docker: `docker ps`, `docker stats --no-stream`, `docker compose ps`, `docker inspect` with environment values stripped.
- Logs: `journalctl --since ... -n ...`, `docker logs --since ... --tail ...`.
- Services: `systemctl status`, `nginx -t`.

Current implemented SSH allowlist:

- `uptime`
- `free -m`
- `df -P /`
- `docker ps --format '{{.Names}} {{.Status}}'`

These run only when `LOCALOPS_ENABLE_SSH=1` is set. The default mode does not execute SSH.

Allowed low-risk families in future releases:

- `systemctl reload nginx`.
- `docker compose restart <allowlisted-service>`.

Forbidden:

- Arbitrary `bash -c` or user-provided shell.
- `rm`, recursive permission changes, disk formatting, destructive Docker prune/volume removal.
- Database writes, migrations, object copy, DNS/TLS mutation, cloud instance restart, rollback cleanup.

## Sanitization

Before any output is shown, stored, exported, or sent to an agent:

- Replace password/token/secret/key-like fields.
- Strip Bearer tokens, JWTs, AccessKey secrets, and database URL password segments.
- Never collect `.env` file contents.
- Do not persist Docker `Env` values.
- Run sanitization again before report export.

## Action Tiers

- L0: read-only diagnostics. Default allowed.
- L1: low-risk local recovery such as reload Nginx. Requires UI confirmation in future.
- L2: rolling service restart or rollback switch. Requires two-step confirmation and verification.
- L3: ECS restart, migration, DNS/TLS, object/data mutation, rollback deletion. MVP forbidden; show runbook only.
