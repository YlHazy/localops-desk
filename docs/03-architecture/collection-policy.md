# Collection Policy

## Check Layers

### Light Check

Default cadence: every 10 to 15 minutes when scheduling is enabled.

Collect:

- HTTP health URL status and latency.
- SSH reachability.
- Load, CPU, memory, disk summary.
- Docker/Compose service status.
- Basic port/listener evidence.

Avoid:

- Full logs.
- Database statistics.
- Restarts or mutations.

### Deep Check

Default cadence: daily, or manual.

Collect:

- Recent 30-minute error summary.
- Docker container CPU/memory snapshot.
- Disk top-N for approved directories only.
- Database size and connection summary through a safe read-only helper.
- Dependency probe summary.

### Manual Refresh

Runs immediately when the user clicks refresh, but still respects timeouts, concurrency, and log limits.

## Failure Backoff

- Two consecutive failures: mark the host as needs attention.
- Three consecutive failures: mark the host as incident.
- Repeated failures back off scheduled checks from 10 minutes toward 30 minutes.

## Log Policy

- Max 300 lines per log pull.
- Max 256KB per service per collection.
- Default window: `--since 30m`.
- UI shows a capped digest, not an infinite log wall.
- Similar errors are grouped by hash with first/last seen timestamps.

## Storage Retention

- Raw light samples: 7 days.
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

