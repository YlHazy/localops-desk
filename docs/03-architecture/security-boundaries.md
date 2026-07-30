# Security Boundaries

## Default Runtime Boundary

- Bind to `127.0.0.1` by default.
- Single-user local use only.
- No password, private key, AccessKey Secret, database password, `.env`, or secret URL storage.
- No arbitrary shell input in MVP.
- Real SSH collection is disabled unless explicitly enabled.

## SSH Rules

- Store SSH Host aliases, not private keys.
- Prefer the user's existing `~/.ssh/config`.
- No password-based SSH in MVP.
- Per-host SSH concurrency limit: 1.
- Global SSH concurrency limit: 3.
- Timeouts:
  - Light checks: 5 seconds per command.
  - Deep checks: 20 seconds per command.
  - Recovery action verification: 60 seconds.

## Command Allowlist

Allowed read-only families:

- System: `uptime`, `free`, `df`, `vmstat`, `iostat`, `ss`.
- Docker: `docker ps`, `docker stats --no-stream`, `docker compose ps`, `docker inspect` with environment values stripped.
- Logs: `journalctl --since ... -n ...`, `docker logs --since ... --tail ...`.
- Services: `systemctl status`, `nginx -t`.

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

