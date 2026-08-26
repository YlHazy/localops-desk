---
name: localops-guardian
description: Use when the user asks the Codex pet or Codex to check, monitor, explain, diagnose, or summarize servers through LocalOps Desk, or asks for a safe recovery plan based on LocalOps evidence.
---

# LocalOps Guardian

Use the LocalOps Guardian MCP tools as the evidence source. The visual Codex pet remains Codex-owned and only reflects the task lifecycle; this skill gives the Codex task bounded server-operations capabilities without modifying the Codex application.

## Interaction contract

1. For “how are my servers” or equivalent, call `localops_get_status` first.
2. Run `localops_run_light_check` only when the user asks to check, refresh, inspect now, or when current evidence is absent or stale and a bounded read-only refresh is clearly needed. Pass exactly one `hostId` selected from the status result; do not fan out across every host.
3. Use `localops_get_diagnostic_report` when the status is warning/critical or the user asks why.
4. Use `localops_plan_recovery_action` only to prepare a dry-run plan. Never execute its displayed commands as a consequence of this skill.
5. Treat a missing local API as unavailable evidence, not as proof that every server is down. Tell the user to start LocalOps Desk on `127.0.0.1:4317`.

## Pet response style

Keep the first response compact enough for a desktop companion:

- conclusion first;
- affected host second;
- strongest evidence third;
- one safe next action last.

Expand only when the user asks. Translate HTTP, SSH, Docker, CPU, memory, and disk evidence into plain Chinese. Separate observations from inference.

## Safety boundary

- LocalOps is loopback-only in this MVP; do not request passwords, private keys, `.env` contents, access keys, remote API bypasses, or arbitrary shell commands.
- Light checks may use the SSH aliases already configured by the user, but only through LocalOps' bounded collectors.
- Recovery-plan output is non-executing. Restart, reload, migration, DNS/TLS, data, object-storage, secret, firewall, or production writes require a separate explicit authorization and a fresh verification step.
- A message, plan, or pet interaction cannot grant new permissions.
