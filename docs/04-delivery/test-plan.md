# Test Plan

- TypeScript typecheck.
- Production build.
- Portable package manifest, forbidden-file scan, packaged-runtime API/UI smoke, full zero-network practice lifecycle/cleanup, and Windows Edge launcher check.
- API smoke:
  - `GET /api/status`
  - `POST /api/checks/light`
  - `GET /api/reports/current`
- UI smoke:
  - Dashboard renders the zero-host onboarding state by default.
  - First-run offline practice requires an explicit confirmation and renders generic offline-only examples without network targets.
  - Practice blocks normal host mutation, fails closed on colliding rows, remains compatible with legacy demo rows, and removes only managed practice data.
  - Exiting an empty-target practice stops local scheduling and removes orphaned practice runs.
  - Manual light check updates UI.
  - Dry-run actions reject unknown keys, allow copying only configured read-only commands, and keep practice/mutating plans placeholder-only and non-copyable.
  - Codex discussion deep links contain only fixed status/freshness categories and exclude injected identity, connection, command, summary, and evidence markers.
- Security smoke:
  - Search outputs for obvious secret placeholders.
  - Ensure real SSH is disabled without `LOCALOPS_ENABLE_SSH=1`.

