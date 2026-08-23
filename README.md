# LocalOps Desk

LocalOps Desk is a local-first operations cockpit for personal server monitoring and safe recovery workflows.

It is intentionally not a SaaS product. The app runs on `127.0.0.1`, stores summaries locally, and uses configured SSH/HTTP checks to help an operator understand server health without opening a large cloud console for every incident.

## MVP Scope

- Local dashboard for production, demo, and personal infrastructure.
- Manual light checks and scheduled-check model.
- Host configuration with SSH alias, environment, health URL, and Docker Compose project name.
- Status overview, host detail, check history, dry-run action panel, and diagnostic report.
- Evidence-first Guardian Brief with HTTP, SSH, runtime, and next-action reasoning stages.
- First Watch onboarding makes the zero-target, zero-connection default visible before the first host is saved; connection evidence stays opt-in.
- After the first host is saved, the desk returns to the overview and shows a four-stage Watch Path: register a server, obtain evidence, enable automatic checks, then optionally add the desktop/login companion.
- A categorized discussion summary and Codex deep link that only prefill reviewable text; they never auto-send or execute an action.
- Local API surface intended for future Codex operations agents.
- Secret-safe defaults: no passwords, private keys, `.env` contents, or cloud AccessKey secrets are stored or printed.

## Development

```powershell
npm install
npm run build
npm run dev:api
```

Open `http://127.0.0.1:4317` after the server starts. The local API serves both `/api/*` and the built Web UI from `dist/`.

New data directories start empty. Add a host through the in-product setup flow;
LocalOps never inserts or probes a real network target by default. For a fully
offline UI demonstration, set `LOCALOPS_SEED_DEMO=1` before the first start of a
fresh data directory. The three sample hosts contain no URL, SSH alias, Compose
project, customer identifier, or remote collector. The retired
`LOCALOPS_SEED_HOSTS` flag no longer inserts anything.

Upgrades preserve existing SQLite host rows, including rows created by older
versions. Review and delete obsolete entries through the UI; LocalOps does not
silently remove user-owned configuration during startup.

Open `http://127.0.0.1:4317/?mode=pet` for LocalOps' compact companion view. It surfaces the worst current signal first, refreshes one host at a time, and expands into the full control desk when detailed work is needed. This view is a future desktop-shell prototype, not the official Codex pet.

While open, pet mode reads the aggregate local status every 30 seconds without triggering a server check. System anomaly notifications are explicit opt-in and fire only after a later status deterioration or an increased affected count. Notification text contains aggregate counts only: no host name, address, command, or raw evidence. The preference stays in the current browser profile (the launcher uses an isolated profile) and can be disabled from the pet at any time.

If that local status read fails after the pet has loaded, LocalOps keeps the last evidence visibly marked as non-current and offers a dedicated read-only reconnect. A failed or timed-out light check is shown separately as an uncertain operation; it does not overwrite the prior evidence or encourage immediate duplicate submission.

The full desk also performs a 30-second read-only sync of status, recent checks, the current report, scheduler runtime state, and LocalOps-owned login-start state. Its watch rail distinguishes syncing, current, and paused states. A failed background sync keeps the last trustworthy result visible and offers an explicit retry; it does not overwrite scheduler values currently being edited or trigger a server check.

After `npm run build`, Windows users can run `npm run pet:window` to open the companion as an isolated Microsoft Edge app window. The launcher reuses an API only after its loopback manifest and bounded status contract identify it as LocalOps; otherwise it fails closed. When no API is running, it starts its own process and stops only that owned process after the random pet session stops sending its local presence heartbeat. This remains correct when Edge hands the app request from a short-lived bootstrap process to another browser process. A page that never loads fails closed within 10 seconds; a crashed page expires from memory without persisting a session token. Stopping the launcher also closes its own browser child when that child still exists. The isolated Edge profile disables extensions and stays under ignored local data. Use `npm run pet:window:check` to verify the browser, build, URL, and API state without opening a window. The app window is not always-on-top yet.

For normal daily use on Windows, double-click `Start LocalOps Guardian.vbs` after the first production build. The entry opens the same bounded Edge pet without a console window and waits for it to close. It does not install dependencies, request administrator rights, create a service, or change login-start settings. If prerequisites are missing, it shows a visible checklist instead of silently exiting. Node.js 22–24 and Microsoft Edge are required.

The Windows Node 24 CI job also publishes `localops-guardian-windows-portable` for 14 days. That artifact already contains the production UI and the exact standard-library runtime files, so it needs no `npm install`: download, extract the whole folder, then double-click `Start LocalOps Guardian.vbs`. CI verifies every packaged SHA-256, rejects data, logs, `.env`, SQLite, and `node_modules`, then starts the API from the packaged directory and checks the built home page, empty default state, and recognizable LocalOps manifest. This is an unsigned development artifact, not a signed installer or release.

On Windows, the Automatic Checks page can explicitly enable login-start after a production build and Edge are available. LocalOps writes one UTF-16 current-user Startup entry that launches the same bounded pet launcher without a console window. It never installs a Windows service or requests administrator rights. Enabling and disabling both require an in-product confirmation; a same-name entry with unexpected content is never overwritten or removed. Closing the pet still ends the launcher-owned API, so login-start does not imply invisible monitoring after the window closes.

The full desk and pet can prepare a Codex discussion task from categorized status only. Raw evidence, connection URLs, SSH aliases, and commands are deliberately excluded from that cross-app summary; detailed evidence stays in the local desk.

For frontend-only iteration, `npm run dev:web` runs Vite at `http://127.0.0.1:5177` and proxies API calls to `4317`.

## Codex Pet Integration

`plugins/localops-guardian` packages LocalOps as a local Codex plugin, and `.agents/plugins/marketplace.json` exposes it as a repo-local marketplace entry. It lets a Codex task represented by the native Codex pet read and explain server status, run a bounded single-host light check, fetch diagnostic evidence, and prepare dry-run recovery plans through the LocalOps API. It does not modify Codex, drive native pet animations, or expose arbitrary shell/restart tools.

The plugin expects LocalOps at `http://127.0.0.1:4317` by default. See `docs/03-architecture/codex-pet-integration.md` for the trust model and supported boundary.

The matching visual identity is **小哨 / Sentry Otter**. Its character brief,
state direction, official hatch prompt, and asset acceptance gate are in
`docs/02-design/guardian-pet-identity.md`. The checked-in image is a concept
reference, not an installable sprite; it intentionally remains blocked until a
genuine transparent 1536 × 1872 asset is produced through the supported Codex
pet flow.

Installable pet sprite sheets are admitted only through `pets/`. The repository
delivery gate checks exact PNG dimensions, encoded transparency, file size, and
plugin/MCP references; concept art under `docs/` is never treated as an
installable asset. Run `npm run check:delivery` locally. GitHub CI repeats that
gate, server and plugin tests, and the production build on Windows Node 22/24.

From a local clone, install the repo marketplace and plugin with:

```powershell
codex plugin marketplace add .
codex plugin add localops-guardian@localops-desk
```

Start a new Codex task after installation so the skill and MCP tools are discovered.

## Safety Defaults

Real SSH collection is disabled unless `LOCALOPS_ENABLE_SSH=1` is set. Without that flag, checks use deterministic simulated collectors so UI and workflow development remain safe.

When SSH is enabled, host entries must reference aliases that already work in the local user's `~/.ssh/config`. Aliases are limited to letters, numbers, `.`, `_`, and `-`, and cannot start with `-`. A quick preflight is `ssh -G <alias>`; if it does not resolve to the intended host, LocalOps will still run HTTP checks but SSH resource and Docker evidence will be reported as unavailable.
