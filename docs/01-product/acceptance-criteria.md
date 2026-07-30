# Acceptance Criteria

- The app starts locally with a Web UI and local API.
- Dashboard displays at least three seed hosts: `lexhub-prod-01`, `lexhub-prod-02`, and `lexhub-demo-01`.
- Manual light check updates last-run timestamps and history.
- At least one host can show green, one yellow, and one gray/unknown state in safe simulation.
- The diagnostic report distinguishes HTTP failure, SSH failure, dependency warning, and unknown collector state.
- Dry-run action output is visible and does not execute a real command.
- The Agent API manifest lists supported local endpoints.
- No sensitive values are present in seed data or output.

