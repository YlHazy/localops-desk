# Backend Modules

## Local API

- `GET /api/status`
- `GET /api/hosts`
- `GET /api/checks`
- `POST /api/checks/light`
- `POST /api/checks/deep`
- `POST /api/actions/dry-run`
- `GET /api/reports/current`
- `GET /api/agent/manifest`

## Collectors

- HTTP health collector.
- SSH resource collector.
- Docker Compose collector.
- Log summary collector.
- Database summary collector.

The MVP ships with simulated collectors and a disabled-by-default SSH adapter.

## Storage

Use local SQLite through Node's built-in SQLite module when available. Store summaries, timestamps, durations, and sanitized evidence only.

## Retention

- Raw check rows: 7 days.
- Hourly aggregates: future milestone.
- Daily aggregates: future milestone.
- Log snippets: capped and sanitized.

