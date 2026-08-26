# Security Boundaries

## Default Runtime Boundary

- Bind to `127.0.0.1` by default.
- Single-user local use only.
- No password, private key, AccessKey Secret, database password, `.env`, or secret URL storage.
- No arbitrary shell input in MVP.
- Real SSH collection is disabled unless explicitly enabled.
- The scheduler is local in-process only. It does not install a Windows service or remote cron job.
- Windows login-start is a separate explicit opt-in. It manages one current-user VBS Startup entry, requires no administrator rights, and launches only the checked-in pet launcher through the current Node executable.
- Login-start refuses to enable without the built UI and Edge. It never overwrites or removes an unexpected same-name entry, and public API responses omit all generated script and filesystem paths.
- Desktop lifetime uses an unlisted UUID-scoped presence endpoint on loopback. Sessions remain in memory only, expire automatically, and are excluded from Agent/MCP manifests and diagnostic reports.

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
- Manual automatic diagnosis only: `df -Pi /`, `docker system df`, bounded `docker ps -a`, `systemctl --failed`, and `ss -lnt`.
- Manual automatic diagnosis may read `docker logs --since 15m --tail 80 <validated-container>` for one container whose returned state is unhealthy, restarting, exited, or dead.

These run only when `LOCALOPS_ENABLE_SSH=1` is set. The default mode does not execute SSH.

The only implemented mutating command path is fixed in code:

- `sudo -n nginx -t` preflight.
- `sudo -n systemctl reload nginx`, only after successful preflight.

It is disabled unless both SSH and actions are enabled. It requires a fresh abnormal manual diagnosis whose deterministic layer is the Web/API entry; unrelated resource, runtime, management, connectivity, or unknown findings cannot prepare the action. An eligible request receives a two-minute single-use approval bound to the unchanged host configuration, exact target snapshot, diagnosis layer, evidence, and commands, followed by explicit consent and the typed phrase `确认重载 Nginx`. Every attempt creates a durable receipt and a reload is followed by bounded verification. An uncertain result is never retried automatically.

`docker compose restart` remains a non-executable preview because the product does not yet have a sufficiently strong service, working-directory, and rollback identity.

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
- Deep log excerpts are redacted and truncated before they reach the UI, are never written to SQLite, and are excluded from the Agent manifest and minimal-disclosure discussion flow.

## Action Tiers

- L0: read-only diagnostics. Default allowed.
- L1: fixed Nginx config test and reload. Requires both runtime gates, fresh entry-layer diagnosis evidence, two-step confirmation, single-use approval, and verification.
- L2: rolling service restart or rollback switch. Not executable in the current product.
- L3: ECS restart, migration, DNS/TLS, object/data mutation, rollback deletion. MVP forbidden; show runbook only.
