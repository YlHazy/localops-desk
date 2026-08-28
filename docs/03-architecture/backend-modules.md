# Backend Modules

## Local API

- `GET /api/status`
- `GET /api/hosts`
- `GET /api/checks`
- `POST /api/checks/light`
- `POST /api/diagnostics/:hostId`
- `POST /api/checks/deep`
- `POST /api/actions/dry-run`
- `GET /api/actions/capability`
- `GET /api/actions/receipts`
- `POST /api/actions/prepare`
- `POST /api/actions/execute`
- `GET /api/reports/current`
- `GET /api/agent/manifest`

## Collectors

- HTTP health collector.
- SSH resource collector.
- Docker Compose collector.
- Layer-specific, manual-only log summary collector.
- Database summary collector.

HTTP checks are real for configured URLs. SSH and bounded internal diagnostics remain disabled by default; offline practice uses deterministic zero-network evidence.

## Storage

Use local SQLite through Node's built-in SQLite module when available. Store summaries, timestamps, durations, sanitized evidence, and durable action receipts only. Short-lived approvals remain in memory and are single-use.

## Retention

- Raw check rows: 7 days.
- Hourly aggregates: future milestone.
- Daily aggregates: future milestone.
- Log snippets: capped, sanitized, response-only, and never persisted.
- Finished action receipts: same configured retention window as raw checks; `running` receipts are preserved and stale runs are marked interrupted on startup.

