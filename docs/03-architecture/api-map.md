# API Map

## Status

`GET /api/status`

Returns latest host states, last check time, and dashboard aggregates.

## Hosts

`GET /api/hosts`

Lists local host configuration. The configuration stores labels, SSH aliases, health URLs, and tags only.

`POST /api/hosts`

Creates a local host configuration without secrets.

`PUT /api/hosts/:id`

Updates a local host configuration.

`DELETE /api/hosts/:id`

Deletes a local host configuration and its local check evidence.

## Checks

`POST /api/checks/light`

Runs a low-pressure collection pass. By default this uses safe simulated collectors unless real SSH is explicitly enabled.

`POST /api/checks/deep`

MVP returns a dry-run deep-check plan.

## Actions

`POST /api/actions/dry-run`

Returns an action plan and verification steps. It does not mutate remote state.

## Reports

`GET /api/reports/current`

Returns a concise incident-oriented report generated from latest check summaries.

## Agent

`GET /api/agent/manifest`

Describes the safe local API endpoints that a Codex operations agent may call.

`GET /api/agent/status`

Returns status, recent checks, and the current diagnostic report in one agent-friendly payload.
