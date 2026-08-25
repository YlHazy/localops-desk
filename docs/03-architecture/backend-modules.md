# Backend Modules

## Local API

- `GET /api/status`
- `GET /api/hosts`
- `GET /api/checks`
- `POST /api/checks/light`
- `POST /api/diagnostics/:hostId`
- `POST /api/checks/deep`
- `POST /api/actions/dry-run`
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

Use local SQLite through Node's built-in SQLite module when available. Store summaries, timestamps, durations, and sanitized evidence only.

## Retention

- Raw check rows: 7 days.
- Hourly aggregates: future milestone.
- Daily aggregates: future milestone.
- Log snippets: capped, sanitized, response-only, and never persisted.

