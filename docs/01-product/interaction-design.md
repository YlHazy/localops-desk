# Interaction Design

## Dashboard

- `Run light check`: calls `POST /api/checks/light`, shows running state, updates dashboard and history.
- Host row/card click: selects host and opens host detail.
- Environment filter: filters dashboard data locally.

## Host Detail

- Refresh host: calls light check for the selected host in a later milestone; MVP refreshes all hosts.
- View evidence: expands latest SSH, HTTP, resource, and Docker evidence.

## Actions

- Select action: displays command plan, risk tier, and expected verification.
- Dry-run: calls `POST /api/actions/dry-run`; never mutates servers.
- Execute: disabled in MVP with clear boundary copy.

## Reports

- Generate report: reads latest status and creates an incident summary.
- Copy report: copies rendered local text to clipboard.

## Agent API

- Show manifest: reads `GET /api/agent/manifest`.
- Trigger check: documented for future local agent calls.

