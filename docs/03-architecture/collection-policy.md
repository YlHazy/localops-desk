# Collection Policy

## Check Layers

### Light Check

Default cadence: configurable, 15 minutes by default when scheduling is enabled.

Collect:

- HTTP health URL status and latency through real local `fetch` probes.
- SSH reachability.
- Load, CPU, memory, disk summary.
- Docker/Compose service status.
- Basic port/listener evidence.

Avoid:

- Full logs.
- Database statistics.
- Restarts or mutations.

Current implementation note: HTTP collection is real. SSH/resource collection remains simulated unless `LOCALOPS_ENABLE_SSH=1` is set, and then only allowlisted read-only commands may run.

### Deep Check (planned, not implemented)

Default cadence: daily, or manual.

Collect:

- Recent 30-minute error summary.
- Docker container CPU/memory snapshot.
- Disk top-N for approved directories only.
- Database size and connection summary through a safe read-only helper.
- Dependency probe summary.

### Manual Refresh

Runs immediately when the user clicks refresh, but still respects timeouts, concurrency, and log limits.

Manual refresh may target all configured hosts or one specific host. Host-scoped runs are recorded with `trigger=manual-host` and `hostScope=<hostId>`.

### Local Scheduler

The scheduler is in-process and local-only. It starts only when the LocalOps Desk process is running and the user has enabled it through `PUT /api/scheduler`.

- Default interval: 15 minutes.
- Default retention: 7 days of raw check runs.
- Each scheduled pass applies retention cleanup after collection.
- Consecutive scheduled failures are counted and add bounded backoff before the next run.

## Failure Backoff

- Scheduler execution failures are recorded at scheduler level and do not reclassify a host without host-specific evidence.
- The first scheduler failure keeps the configured interval, the second uses twice that interval, and the third and later failures use three times that interval.

The open pet window observes `GET /api/status` every 30 seconds. This is a read-only UI sync, not a collection schedule: it does not call a check endpoint, open SSH, write check history, or keep monitoring after the local process/window is closed. Browser system notifications are separately opt-in and compare only aggregate status transitions in page memory.

The open full desk performs the same 30-second observation cadence across `GET /api/status`, `GET /api/checks`, `GET /api/reports/current`, `GET /api/scheduler`, and `GET /api/startup`. It updates scheduler runtime output separately from the editable scheduler draft. A sync failure retains the most recent successful snapshot and never changes server health on its own.

## Log Policy

- Max 300 lines per log pull.
- Max 256KB per service per collection.
- Default window: `--since 30m`.
- UI shows a capped digest, not an infinite log wall.
- Similar errors are grouped by hash with first/last seen timestamps.

## Storage Retention

- Raw light samples: 7 days.
- Current MVP deletes expired `check_runs`, their `host_checks`, and orphan host checks for removed hosts.
- Optional SQLite `VACUUM` is available through the maintenance endpoint.
- Hourly aggregates: 30 days.
- Daily aggregates: 180 days.
- Log snippets: 7 days.
- Diagnostic reports: 30 days unless pinned.
- If local DB exceeds a configured ceiling, pause deep log collection and keep status summaries only.

## Status Matrix

- Green: public HTTP, SSH, critical containers, and readiness are normal.
- Yellow: service is available, but a resource, management channel, or non-critical worker needs attention.
- Red: user-facing access, API readiness, critical container, disk, or database dependency is failing.
- Gray: not enough evidence, local network issue, or collector failure.

## HTTP/SSH Interpretation

- HTTP ok + SSH ok: service and management channel likely healthy.
- HTTP fail + SSH ok: inspect application, Nginx, Docker, ALB, or dependency layer.
- HTTP ok + SSH fail: service may be alive; management channel is impaired.
- HTTP fail + SSH fail: likely host, network path, security group, cloud instance, or local egress issue.
- SSH auth failure is credential/config, not proof of server downtime.
