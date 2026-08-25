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

### Bounded Deep Evidence

Manual only. It runs inside a user-triggered automatic diagnosis and is never added to the scheduler.

- Resource findings read the root filesystem percentage, root inode percentage, and `docker system df` summary.
- Entry/runtime findings read the Docker container state list, failed systemd units, and TCP listener summary.
- Recent container logs are read only when a container is explicitly reported as unhealthy, restarting, exited, or dead. The container name must pass a strict identifier validator before it can enter the fixed command.
- Logs are limited to the latest 15 minutes and 80 lines, then redacted, truncated, returned to the local detail UI, and not persisted.
- When SSH is disabled, missing, or itself the failed layer, the result says that internal evidence was unavailable and does not infer it.
- No database inspection, directory top-N traversal, arbitrary command, restart, cleanup, or mutation is included.

### Automatic Diagnosis

Manual and host-scoped. The user must click **自动排查** for one selected server.

- Re-runs the existing bounded light check for that server only.
- Uses deterministic local rules to locate the first failing layer: entry, connectivity, SSH, runtime, or resources.
- Returns only categorized signals, percentages, a plain-language finding, and a safe next step; it does not return server identity or raw evidence in the diagnosis object.
- For an actionable resource/entry/runtime layer, immediately adds the bounded deep evidence above. This internal evidence is local-only and deliberately excluded from the Agent manifest and discussion summary.
- Records the underlying check with `trigger=manual-diagnosis` so the result remains auditable.
- Never runs repair commands. Read-only command steps remain a separate preview, and mutating plans remain blocked templates.

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

The open pet window observes `GET /api/status` every 30 seconds. This is a read-only UI sync, not a collection schedule: it does not call a check endpoint, open SSH, or write check history. A launcher-created window additionally sends a memory-only presence heartbeat every 15 seconds containing only its random session UUID and `open`/`closing` state. Notifications are separately opt-in and compare only aggregate status transitions in page memory. The packaged desktop app sends only an allow-listed ready/test request or bounded critical/warning/unknown counts through isolated IPC; the main process generates fixed Windows tray balloon copy and respects quiet time. Browser preview retains the Web Notification permission path.

The open full desk performs the same 30-second observation cadence across `GET /api/status`, `GET /api/checks`, `GET /api/reports/current`, `GET /api/scheduler`, and `GET /api/startup`. It updates scheduler runtime output separately from the editable scheduler draft. A sync failure retains the most recent successful snapshot and never changes server health on its own.

## Log Policy

- Max 80 lines for one suspect container per manual diagnosis.
- Max 4,000 characters after collection and 1,800 characters after final redaction.
- Fixed window: `--since 15m`.
- UI keeps the redacted excerpt collapsed until requested.
- Log excerpts are response-only and are not written to SQLite.

## Storage Retention

- Raw light samples: 7 days.
- Current MVP deletes expired `check_runs`, their `host_checks`, and orphan host checks for removed hosts.
- Optional SQLite `VACUUM` is available through the maintenance endpoint.
- Hourly aggregates: 30 days.
- Daily aggregates: 180 days.
- Log snippets: not persisted.
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
