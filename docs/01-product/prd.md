# LocalOps Desk PRD

## Problem

Personal infrastructure operations often require too much context switching. When a server or service looks broken, the operator must open a cloud console, SSH manually, remember commands, inspect Docker, read logs, and decide what is safe to restart.

LocalOps Desk provides a local cockpit that makes routine inspection and low-risk recovery visible and repeatable.

## Audience

- Individual developer/operator running several servers.
- Small engineering team members who need a local operational view without receiving broad cloud-console access.
- Codex operations agents that need a safe, structured local interface.

## Core Jobs

- See whether production/demo/personal servers are healthy.
- Manually refresh current status.
- Know when the last check ran, how long it took, and why it failed.
- Inspect CPU, memory, disk, Docker services, health endpoints, and recent errors.
- Generate a concise incident report.
- Preview safe recovery actions before execution.

## MVP Features

- Host inventory with environment, role, SSH alias, health URL, and Compose project metadata.
- Overview dashboard with red/yellow/green/gray status.
- Manual light check endpoint and UI button.
- Host detail page with resource summaries and recent events.
- Check history with collection timestamps and duration.
- Diagnostic report generated from latest checks.
- One-click host diagnosis that rechecks the selected server and explains the likely failing layer without executing repair commands.
- Dry-run action panel for safe operational plans.
- Local Agent API manifest.

## Non-Goals

- Hosted SaaS.
- Full Prometheus/Grafana replacement.
- Arbitrary SSH terminal.
- Storing secrets.
- Real cloud control-plane operations.
- Continuous high-frequency polling.

## Success Metrics

- Operator can identify the likely failure layer within 60 seconds.
- Manual refresh completes within a bounded timeout per host.
- Local database stays small through retention and summary storage.
- No sensitive values appear in UI, logs, or database.

