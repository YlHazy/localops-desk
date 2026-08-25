# Task Breakdown

## Phase 1: Local MVP

- Create repo and project skeleton.
- Build local API with empty-by-default SQLite persistence and explicit offline demo data.
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

- Add and verify a compact pet-mode surface driven by the existing local API.
- Package the LocalOps Guardian Codex plugin and bounded MCP tools.
- Combine the native Codex pet's task lifecycle with LocalOps evidence without patching Codex.
- Add and verify a dependency-light Windows Edge app-window launcher for the pet surface; reuse only a recognizable loopback LocalOps API and stop only a launcher-owned API process.
- Make launcher-owned API lifetime follow an ephemeral page-presence session so Edge bootstrap handoff cannot terminate monitoring early.
- Build and verify a dependency-free Windows portable CI artifact with an allow-listed file manifest, SHA-256 integrity, empty-state runtime smoke, and no local data or secrets.
- Add and verify 30-second read-only pet observation plus opt-in, aggregate-only deterioration notifications with stable-state deduplication.
- Add and verify full-desk read-only auto-sync with visible runtime state, preserved editing drafts, and explicit recovery.
- Add and verify an in-product, zero-network first-run practice profile with exclusive state, visible labeling, collision-safe cleanup, and legacy-row compatibility.
- Add and verify explicit current-user Windows login-start with readiness checks, two-step UI confirmation, exact ownership matching, and fail-closed removal.
- Consolidate evidence coverage, scheduling, desktop attention, and optional login-start into one beginner-readable Watch Settings relay without adding another backend state model.
- Require an explicit local “seen” receipt after a test reminder before the relay claims desktop attention is connected; never infer visibility from the notification API response.
- Evaluate a native always-on-top shell only after the pet workflow is validated; avoid taking Electron/Tauri weight by default.
- Add local encrypted configuration if needed.
