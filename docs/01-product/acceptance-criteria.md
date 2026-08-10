# Acceptance Criteria

- The app starts locally with a Web UI and local API.
- A new data directory starts with zero hosts and never probes a network target without user configuration.
- `LOCALOPS_SEED_DEMO=1` adds three generic offline-only examples with no Health URL, SSH alias, or Compose project.
- Manual light check updates last-run timestamps and history.
- At least one host can show green, one yellow, and one gray/unknown state in safe simulation.
- The diagnostic report distinguishes HTTP failure, SSH failure, dependency warning, and unknown collector state.
- Dry-run action output is visible and does not execute a real command.
- The Agent API manifest lists supported local endpoints.
- No user, machine, repository, customer, production host, domain, IP, or SSH identifier is present in demo data or output.
- `?mode=pet` presents a compact 320–380 px guardian view instead of the full dashboard.
- The pet's expression, copy, and accent reflect the worst current host state.
- The pet can run a light check, disclose local API errors, list host states, and open the full desk.
- The pet loads from `/api/status` independently of report, history, and scheduler endpoints.
- Empty configuration shows an explicit empty state; an API failure shows a retry action instead of a permanent spinner.
- Opening the full desk from an empty pet state provides an in-product “添加服务器” flow; no API-only dead end remains.
- Evidence older than the configured freshness window is shown as unknown, and the footer uses observation time rather than response generation time.
- A pet or Codex-triggered light check refreshes exactly one host.
- Motion respects `prefers-reduced-motion`; keyboard focus remains visible.

