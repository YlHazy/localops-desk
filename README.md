# LocalOps Desk

LocalOps Desk is a local-first operations cockpit for personal server monitoring and safe recovery workflows.

It is intentionally not a SaaS product. The app runs on `127.0.0.1`, stores summaries locally, and uses configured SSH/HTTP checks to help an operator understand server health without opening a large cloud console for every incident.

## MVP Scope

- Local dashboard for production, demo, and personal infrastructure.
- Manual light checks and scheduled-check model.
- Host configuration with SSH alias, environment, health URL, and Docker Compose project name.
- Status overview, host detail, check history, dry-run action panel, and diagnostic report.
- Evidence-first Guardian Brief with HTTP, SSH, runtime, and next-action reasoning stages.
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
