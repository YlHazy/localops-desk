# Task Breakdown

## Phase 1: Local MVP

- Create repo and project skeleton.
- Build local API with seed hosts and SQLite persistence.
- Build dashboard UI with overview, details, checks, actions, report, and agent API views.
- Add safe simulated collectors and dry-run action plans.
- Verify local startup and build.

## Phase 2: Real SSH Read-Only

- Add SSH allowlist command runner.
- Add timeouts, concurrency limits, and output sanitization.
- Add host-level manual refresh.

## Phase 3: Recovery Actions

- Add explicit confirmation flows.
- Add low-risk actions only.
- Add audit trail and verification checks.

## Phase 4: Desktop Package

- Wrap local Web app in Tauri or Electron.
- Add local encrypted configuration if needed.

