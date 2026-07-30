# Task Breakdown

## Phase 1: Local MVP

- Create repo and project skeleton.
- Build local API with seed hosts and SQLite persistence.
- Build dashboard UI with overview, details, checks, actions, report, and agent API views.
- Add safe simulated collectors and dry-run action plans.
- Verify local startup and build.

## Phase 2: Real SSH Read-Only

- Add host configuration CRUD.
- Add real HTTP health probes.
- Enhance history and diagnostic report.
- Upgrade first-screen information architecture.
- Add SSH allowlist command runner.
- Add timeouts and output sanitization.
- Add agent-friendly status API.
- Add host-level manual refresh.
- Add in-process scheduler controls.
- Add local SQLite retention cleanup.

## Phase 3: Recovery Actions

- Add explicit confirmation flows.
- Add low-risk actions only.
- Add audit trail and verification checks.

## Phase 4: Desktop Package

- Wrap local Web app in Tauri or Electron.
- Add local encrypted configuration if needed.
