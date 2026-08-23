# Test Plan

- TypeScript typecheck.
- Production build.
- Portable package manifest, forbidden-file scan, packaged-runtime API/UI smoke, and Windows Edge launcher check.
- API smoke:
  - `GET /api/status`
  - `POST /api/checks/light`
  - `GET /api/reports/current`
- UI smoke:
  - Dashboard renders the zero-host onboarding state by default.
  - Explicit demo mode renders generic offline-only examples without network targets.
  - Manual light check updates UI.
  - Dry-run action renders a non-mutating plan.
- Security smoke:
  - Search outputs for obvious secret placeholders.
  - Ensure real SSH is disabled without `LOCALOPS_ENABLE_SSH=1`.

