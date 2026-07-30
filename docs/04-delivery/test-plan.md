# Test Plan

- TypeScript typecheck.
- Production build.
- API smoke:
  - `GET /api/status`
  - `POST /api/checks/light`
  - `GET /api/reports/current`
- UI smoke:
  - Dashboard renders seed topology.
  - Manual light check updates UI.
  - Dry-run action renders a non-mutating plan.
- Security smoke:
  - Search outputs for obvious secret placeholders.
  - Ensure real SSH is disabled without `LOCALOPS_ENABLE_SSH=1`.

