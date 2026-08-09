# Acceptance Criteria

- The app starts locally with a Web UI and local API.
- Dashboard displays at least three seed hosts: `lexhub-prod-01`, `lexhub-prod-02`, and `lexhub-demo-01`.
- Manual light check updates last-run timestamps and history.
- At least one host can show green, one yellow, and one gray/unknown state in safe simulation.
- The diagnostic report distinguishes HTTP failure, SSH failure, dependency warning, and unknown collector state.
- Dry-run action output is visible and does not execute a real command.
- The Agent API manifest lists supported local endpoints.
- No sensitive values are present in seed data or output.
- `?mode=pet` presents a compact 320–380 px guardian view instead of the full dashboard.
- The pet's expression, copy, and accent reflect the worst current host state.
- The pet can run a light check, disclose local API errors, list host states, and open the full desk.
- The pet loads from `/api/status` independently of report, history, and scheduler endpoints.
- Empty configuration shows an explicit empty state; an API failure shows a retry action instead of a permanent spinner.
- Opening the full desk from an empty pet state provides an in-product “添加服务器” flow; no API-only dead end remains.
- Evidence older than the configured freshness window is shown as unknown, and the footer uses observation time rather than response generation time.
- A pet or Codex-triggered light check refreshes exactly one host.
- Motion respects `prefers-reduced-motion`; keyboard focus remains visible.

