# Interaction Design

## Dashboard

- `Run light check`: calls `POST /api/checks/light`, shows running state, updates dashboard and history.
- Host row/card click: selects host and opens host detail.
- Environment filter: filters dashboard data locally.

## Host Detail

- Refresh host: runs a bounded light check for the selected host. The overview action checks all configured hosts.
- View evidence: expands latest SSH, HTTP, resource, and Docker evidence.

## Actions

- Select action: displays command plan, risk tier, and expected verification.
- Dry-run: calls `POST /api/actions/dry-run`; never mutates servers.
- Execute Nginx reload: available only when the backend capability is explicitly enabled and a fresh abnormal manual diagnosis exists. Preparation shows the exact target and commands; execution requires consent plus `确认重载 Nginx`, runs preflight first, and ends with a durable receipt and verification state.
- Compose restart and every free-form command remain disabled.

## Reports

- Generate report: reads latest status and creates an incident summary.
- Copy report: copies rendered local text to clipboard.

## Agent API

- Show manifest: reads `GET /api/agent/manifest`.
- Trigger check: documented for future local agent calls.

