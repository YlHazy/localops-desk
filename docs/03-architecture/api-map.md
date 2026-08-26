# API Map

## Status

`GET /api/status`

Returns latest host states, last check time, and dashboard aggregates.

## Pet Presence

`GET /api/pet-presence`

Returns only whether any unexpired pet heartbeat exists and the aggregate active count. It never returns session IDs and lets the Windows launcher avoid opening an ordinary duplicate window.

`GET /api/pet-presence/:sessionId`

Returns presence and last-seen time for one random desktop-launch session.

`PUT /api/pet-presence/:sessionId`

Accepts only `open` or `closing`. State is memory-only, automatically expires, and is not part of the Agent/MCP tool surface.

## Hosts

`GET /api/hosts`

Lists local host configuration. The configuration stores labels, SSH aliases, health URLs, and tags only.

`POST /api/hosts`

Creates a local host configuration without secrets.

`PUT /api/hosts/:id`

Updates a local host configuration.

`DELETE /api/hosts/:id`

Deletes a local host configuration and its local check evidence.

## Offline Practice

`POST /api/practice/offline`

Installs three exact, fictional, connection-free practice hosts only when the host table is empty. Repeating the request is idempotent; existing or colliding user data returns `409` without modification. This UI-only endpoint is deliberately absent from the Agent/MCP manifest.

`DELETE /api/practice/offline`

Removes only the complete set of exact current or legacy LocalOps-managed practice hosts, their host-check rows, and check runs left empty by that removal. It fails closed on collisions and stops scheduling only when no hosts remain.

## Checks

`POST /api/checks/light`

Runs a low-pressure collection pass. Practice hosts use offline generated evidence. Ordinary hosts may call their configured HTTP health URL; allowlisted read-only SSH is added only when explicitly enabled.

`POST /api/checks/light/:hostId`

Runs the same bounded light check for one configured host and records the run as `manual-host`.

`POST /api/checks/deep`

Compatibility endpoint for a host-scoped automatic diagnosis. Requires `hostId`, reruns the bounded light check, and then reads only the same layer-specific deep evidence as `/api/diagnostics/:hostId`.

`POST /api/diagnostics/:hostId`

Runs one user-triggered host-scoped automatic diagnosis. The categorized diagnosis remains identity-free; the local UI response may additionally contain sanitized, bounded internal evidence. The endpoint is deliberately absent from the Agent manifest.

## Scheduler

`GET /api/scheduler`

Returns the in-process local scheduler state, including enabled flag, interval, retention days, last run, next run, and consecutive failures.

`PUT /api/scheduler`

Updates local scheduler settings. The scheduler only runs while the LocalOps Desk process is alive.

## Login Start

`GET /api/startup`

Returns only the public state of the LocalOps-owned current-user login entry: support, readiness, enablement, conflict state, blockers, and explanatory copy. Local paths and generated script content are excluded.

`PUT /api/startup`

Accepts an explicit boolean `enabled`. On Windows it creates or removes only the exact LocalOps-owned current-user VBS Startup entry. A missing build/browser or unexpected same-name file returns a typed failure without modification.

## Maintenance

`POST /api/maintenance/retention`

Deletes expired local check history, orphan check rows, and finished action receipts according to the configured retention window. Receipts still marked `running` are preserved. Optional `vacuum` compacts the local SQLite database.

## Actions

`POST /api/actions/dry-run`

Returns an allow-listed action plan, its explicit local target `{id, name}`, and verification steps. It does not mutate remote state. The UI pins the remaining review flow to that id and rejects a mismatched response. Read-only plans may return a copyable configured target; practice and mutating plans return non-copyable placeholders and never disclose the configured SSH alias. Unknown action keys are rejected.

`GET /api/actions/capability`

Returns whether the fixed Nginx recovery path is available and why it is disabled. This endpoint and all executable action endpoints are UI-only and absent from the Agent manifest.

`GET /api/actions/receipts`

Returns bounded local action receipts without adding a command surface.

`POST /api/actions/prepare`

Validates both runtime gates, a fresh abnormal manual diagnosis whose deterministic layer is `entry`, and the exact supported action. Other diagnosis layers return `ACTION_NOT_RECOMMENDED`. Returns a two-minute single-use approval bound to the host configuration, target snapshot, diagnosis layer, evidence, and fixed commands.

`POST /api/actions/execute`

Consumes the approval only after target/digest checks, explicit consent, and the exact confirmation phrase. Runs Nginx preflight before reload, records each step, and always performs bounded post-check verification after a reload attempt.

## Reports

`GET /api/reports/current`

Returns a concise incident-oriented report generated from latest check summaries.

## Agent

`GET /api/agent/manifest`

Describes the safe local API endpoints that a Codex operations agent may call.

`GET /api/agent/status`

Returns status, recent checks, and the current diagnostic report in one agent-friendly payload.
