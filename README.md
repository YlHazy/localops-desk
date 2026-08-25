# LocalOps Desk

LocalOps Desk is a local-first operations cockpit for personal server monitoring and safe recovery workflows.

It is intentionally not a SaaS product. The app runs on `127.0.0.1`, stores summaries locally, and uses configured SSH/HTTP checks to help an operator understand server health without opening a large cloud console for every incident.

## MVP Scope

- Local dashboard for production, demo, and personal infrastructure.
- Manual light checks and scheduled-check model.
- Host configuration with SSH alias, environment, health URL, and Docker Compose project name.
- A calm daily overview, compact host details, check history, safe actions, and diagnostic reports.
- One-click automatic diagnosis reruns only the selected host's bounded light check, identifies the likely failure layer, and—when read-only SSH is available—adds a capped resource/service/log digest without storing logs or running a repair command.
- First Watch onboarding makes the zero-target, zero-connection default visible before the first host is saved; connection evidence stays opt-in.
- After the first host is saved, the overview leads with one current judgment and one server list. Actions and facts appear before optional technical evidence in the detail drawer.
- The Watch Settings (`值守设置`) page turns those distributed controls into one three-stage daily-watch relay: evidence source, automatic rhythm, and native desktop attention. The last layer completes only after the user confirms a test reminder was actually visible, and a browser preview never counts as a desktop notification channel.
- A categorized discussion summary and Codex deep link that only prefill reviewable text; they never auto-send or execute an action.
- Reports are explicitly split into identity-bearing internal diagnostics and a minimal-disclosure discussion summary; copying the internal report requires confirmation.
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
LocalOps never inserts or probes a real network target by default. The first-run
screen can explicitly enter a fully offline practice mode with three managed,
fictional hosts. They contain no URL, SSH alias, Compose project, customer
identifier, or remote collector. Practice mode is exclusive, cannot overwrite
existing hosts, and exits through a second confirmation that removes only its
exact managed rows and related checks. `LOCALOPS_SEED_DEMO=1` remains available
for automated or environment-driven demos in a fresh data directory. The retired
`LOCALOPS_SEED_HOSTS` flag no longer inserts anything.

Upgrades preserve existing SQLite host rows, including rows created by older
versions. Review and delete obsolete entries through the UI; LocalOps does not
silently remove user-owned configuration during startup.

Open `http://127.0.0.1:4317/?mode=pet` only for frontend preview. The supported daily-use form is the LocalOps Electron desktop host: a genuine independent Windows application with its own runtime, single-instance window, system tray, native always-on-top control, remembered pet bounds, and a separate full control-desk window. It is not Microsoft Edge app mode. It remains a LocalOps companion rather than an official Codex pet.

While open, pet mode reads the aggregate local status every 30 seconds without triggering a server check. One shared evidence clock drives the rendered pet, expiry notifications, and Codex discussion summary, so a long-lived window cannot keep sharing an initially healthy claim after evidence becomes stale. System anomaly notifications are explicit opt-in and fire only after a later status deterioration, evidence expiry, or an increased affected count. Notification text contains aggregate counts only: no host name, address, command, or raw evidence. In the Electron desktop host, a constrained IPC accepts only fixed ready/test requests or bounded critical/warning/unknown counts; the main process creates a Windows tray balloon and clicking it opens the full desk. Browser preview retains the Web Notification permission fallback. A one-hour quiet mode suppresses system popups without stopping status synchronization and leaves an aggregate receipt inside the pet when deterioration occurs. Enabling a channel and confirming that its test reminder was visible are stored as two local boolean markers; disabling or retesting clears the confirmation until the user explicitly sees it again.

If that local status read fails after the pet has loaded, LocalOps keeps the last evidence visibly marked as non-current and offers a dedicated read-only reconnect. A failed or timed-out light check is shown separately as an uncertain operation; it does not overwrite the prior evidence or encourage immediate duplicate submission.

The full desk also performs a 30-second read-only sync of status, recent checks, the current report, scheduler runtime state, and LocalOps-owned login-start state. When evidence expires, current judgments downgrade to unknown and the prior reading is labeled as old rather than healthy. A failed background sync keeps the last trustworthy result visible and offers an explicit retry; it does not overwrite scheduler values currently being edited or trigger a server check.

For source development, run `npm run desktop`. For a distributable Windows build, run `npm run package:desktop`; the output is `release/LocalOps-Guardian-0.1.0-x64.exe`. The packaged app includes Electron's Node/Chromium runtime and therefore requires neither a separately installed Node.js nor Microsoft Edge. Closing the pet window hides it to the system tray and keeps the local watch alive; the first close explains where it went. Only the explicit tray action “退出 LocalOps（停止本次值守）” stops an API process owned by that desktop session; a recognizable API that was already running is reused and never killed by LocalOps Desktop. `npm run assets:desktop-icons` derives the checked-in 256px PNG and four-size Windows ICO from the close-up 小哨 badge.

The Watch Settings page uses Electron's native current-user login setting in the packaged desktop app. The setting requires explicit in-product confirmation, never requests administrator rights, and starts the same packaged executable into its tray-backed lifecycle. Source previews refuse to write a login item. The former `npm run pet:window` Edge launcher and VBS portable folder remain temporarily available as a compatibility path while migration tests settle; they are no longer the primary desktop product.

Windows Node 24 CI publishes both the legacy dependency-light folder and `localops-guardian-windows-desktop` for 14 days. The desktop artifact is a single-file development executable. CI builds it and runs a packaged renderer/API lifecycle smoke check. It is currently unsigned, so Windows may identify the publisher as unknown; it is not yet a signed public release.

The full desk and pet can prepare a Codex discussion task from categorized status only. Server names, environments, roles, raw evidence, connection URLs, SSH aliases, Compose projects, and commands are structurally excluded from that cross-app summary; detailed and identifying context stays in the local desk. The deep link only prefills reviewable text and never sends or executes it automatically.

For frontend-only iteration, `npm run dev:web` runs Vite at `http://127.0.0.1:5177` and proxies API calls to `4317`.

## Codex Pet Integration

`plugins/localops-guardian` packages LocalOps as a local Codex plugin, and `.agents/plugins/marketplace.json` exposes it as a repo-local marketplace entry. It lets a Codex task represented by the native Codex pet read and explain server status, run a bounded single-host light check, fetch diagnostic evidence, and prepare dry-run recovery plans through the LocalOps API. It does not modify Codex, drive native pet animations, or expose arbitrary shell/restart tools.

The plugin expects LocalOps at `http://127.0.0.1:4317` by default. See `docs/03-architecture/codex-pet-integration.md` for the trust model and supported boundary.

The matching visual identity is **小哨 / Sentry Otter**. Its character brief,
state direction, official hatch prompt, and asset acceptance gate are in
`docs/02-design/guardian-pet-identity.md`. The compact LocalOps companion uses
the genuine-alpha cutout at `src/assets/localops-sentry-otter.png`; it is a UI
character asset, not an installable Codex sprite. The original concept remains
a direction reference, and official upload stays blocked until a genuine
transparent 1536 × 1872 asset is produced through the supported Codex pet flow.

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

Remote recovery is separately disabled unless both `LOCALOPS_ENABLE_ACTIONS=1` and `LOCALOPS_ENABLE_SSH=1` are set. The only executable recovery is the fixed Nginx path: `sudo -n nginx -t`, followed by `sudo -n systemctl reload nginx` only if preflight succeeds. It requires a fresh abnormal manual diagnosis that specifically locates the problem at the Web/API entry layer; resource, runtime, management-channel, connectivity, and unknown diagnoses are rejected. A two-minute single-use approval is bound to the exact host configuration, diagnosis evidence, and commands, followed by an explicit checkbox and the typed phrase `确认重载 Nginx`. LocalOps records a durable receipt and performs a bounded post-check; it never accepts arbitrary commands or automatically retries an uncertain result. Compose restart remains preview-only.

When SSH is enabled, host entries must reference aliases that already work in the local user's `~/.ssh/config`. Aliases are limited to letters, numbers, `.`, `_`, and `-`, and cannot start with `-`. A quick preflight is `ssh -G <alias>`; if it does not resolve to the intended host, LocalOps will still run HTTP checks but SSH resource and Docker evidence will be reported as unavailable.
