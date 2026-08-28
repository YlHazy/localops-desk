# Changelog

## 0.2.0 - 2026-08-28

Codex pet and multi-server workflow release.

- Adds a compact transparent Codex pet view with hover status, focused server details, and clear drag and resize controls.
- Shows HTTP, SSH, Docker, CPU, memory, disk, and load signals directly in the compact view.
- Prioritizes unhealthy hosts and locks actions to visible targets so a hidden server cannot be operated accidentally.
- Adds bounded multi-host collection concurrency and adaptive request timeouts for slower fleets.
- Routes desktop alerts to the highest-priority current incident and pauses polling while the Codex panel is hidden.
- Improves command readability and preserves explicit approval plus risk warnings before any mutating remote action.

The Windows x64 portable executable is unsigned. Verify its SHA-256 value from the GitHub Release before running it.

## 0.1.0 - 2026-08-26

First public Windows desktop release.

- Adds the always-on-top 小哨 desktop companion, tray-backed background watch, and a separate responsive control desk.
- Keeps the overview focused on current server state, attention-needed reminders, evidence freshness, and one-click read-only checks.
- Adds automatic single-host diagnosis and explicit approval gates before any mutating server command.
- Shows CPU, load averages, memory, system disk, uptime, and Docker container health when bounded SSH collection is enabled.
- Keeps host identity, connection details, raw evidence, and commands local when preparing a Codex discussion summary.
- Defaults to zero configured targets, zero implicit network scans, and remote actions disabled.

The Windows x64 portable executable is unsigned. Verify its SHA-256 value from the GitHub Release before running it.
