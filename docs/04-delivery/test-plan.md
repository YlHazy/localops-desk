# Test Plan

- TypeScript typecheck.
- Production build.
- Portable package manifest, forbidden-file scan, packaged-runtime API/UI smoke, full zero-network practice lifecycle/cleanup, and Windows Edge launcher check.
- Desktop launcher tests cover identity-free aggregate presence, duplicate-window refusal, malformed presence responses, and session expiry.
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
  - Copyable SSH commands exactly match the runtime allowlist and contain no Compose, sudo, restart, or systemctl mutation path.
  - Codex discussion deep links contain only fixed status/freshness categories and exclude injected identity, connection, command, summary, and evidence markers.
  - The report surface separates the identity-bearing internal report from the tested minimal-disclosure summary and gates internal copy behind confirmation.
  - Host tags survive the desk status/edit round trip but remain absent from Agent status.
  - Empty host names return a typed 400 response; form copy distinguishes HTTP access, SSH opt-in, and metadata-only fields.
  - Operation-state tests prove that only a real check renders check-busy UI and that each supported operation exposes one truthful purpose flag.
  - Latest-request-gate tests prove that out-of-order and post-unmount responses cannot replace a newer desk or pet snapshot.
  - Evidence-trust tests prove that an expired snapshot atomically downgrades every host and aggregate count to unknown without mutating or discarding retained readings; source delivery checks keep that view wired into the desk headline and evidence-hold UI.
  - Pet-monitor tests cross the freshness boundary with the shared desk view and prove one identity-free unknown-state notification, stable-state deduplication, and source-level ownership of the single evidence clock.
- Security smoke:
  - Search outputs for obvious secret placeholders.
  - Ensure real SSH is disabled without `LOCALOPS_ENABLE_SSH=1`.

