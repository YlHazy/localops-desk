# Decisions

## D1: Local-first, not SaaS

The MVP runs locally and binds to loopback by default. Server state and history remain on the user's machine.

## D2: Agentless SSH first

The first implementation uses configured SSH aliases and HTTP health URLs. A server-side agent can be considered later, but is not required for MVP.

## D3: Dry-run first for recovery

Operational actions are modeled and previewed before execution. Real restarts, migrations, cloud operations, DNS/TLS, or rollback cleanup remain explicit future boundaries.

## D4: Low-pressure polling

The tool uses manual refresh and low-frequency checks. It stores summaries and aggregates, not unlimited raw logs.

## D5: Local API for Codex agents

The MVP exposes a local HTTP API so a future Codex operations team can call standard inspection functions instead of improvising SSH commands.

