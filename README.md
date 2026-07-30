# LocalOps Desk

LocalOps Desk is a local-first operations cockpit for personal server monitoring and safe recovery workflows.

It is intentionally not a SaaS product. The app runs on `127.0.0.1`, stores summaries locally, and uses configured SSH/HTTP checks to help an operator understand server health without opening a large cloud console for every incident.

## MVP Scope

- Local dashboard for production, demo, and personal infrastructure.
- Manual light checks and scheduled-check model.
- Host configuration with SSH alias, environment, health URL, and Docker Compose project name.
- Status overview, host detail, check history, dry-run action panel, and diagnostic report.
- Local API surface intended for future Codex operations agents.
- Secret-safe defaults: no passwords, private keys, `.env` contents, or cloud AccessKey secrets are stored or printed.

## Development

```powershell
npm install
npm run build
npm run dev:api
```

Open `http://127.0.0.1:4317` after the server starts. The local API serves both `/api/*` and the built Web UI from `dist/`.

For frontend-only iteration, `npm run dev:web` runs Vite at `http://127.0.0.1:5177` and proxies API calls to `4317`.

## Safety Defaults

Real SSH collection is disabled unless `LOCALOPS_ENABLE_SSH=1` is set. Without that flag, checks use deterministic simulated collectors so UI and workflow development remain safe.

When SSH is enabled, host entries must reference aliases that already work in the local user's `~/.ssh/config`. A quick preflight is `ssh -G <alias>`; if it does not resolve to the intended host, LocalOps will still run HTTP checks but SSH resource and Docker evidence will be reported as unavailable.
