# Codex Pet Integration

## Decision

Use the Codex desktop pet as the companion and conversation surface. Package LocalOps as a Codex plugin that supplies bounded server evidence and actions through MCP. Do not patch, replace, or inject code into the Codex application.

Official OpenAI documentation says choosing a pet changes appearance, not task behavior, and defines the pet's task states as Running, Needs input, Ready, and Blocked. It does not expose a public API for driving animation or mood from a third-party plugin. Therefore dynamic server-to-sprite control is not a supported requirement for this milestone. See [Pets](https://learn.chatgpt.com/docs/pets) and [Plugins](https://learn.chatgpt.com/docs/plugins).

## Flow

```text
Codex desktop pet / composer
        |
        v
localops-guardian skill (plain-language policy)
        |
        v
localops-guardian MCP server (stdio, no dependencies)
        |
        +-- optional MCP Apps status card
        |
        v
LocalOps API on 127.0.0.1:4317
        |
        +-- latest status and evidence
        +-- bounded light check
        +-- diagnostic report
        +-- dry-run recovery plan
```

## Trust boundaries

- The plugin accepts only loopback LocalOps URLs and rejects embedded credentials. Remote transport has no escape hatch in this MVP.
- The plugin requires a bearer token from `LOCALOPS_API_TOKEN` or `LOCALOPS_API_TOKEN_FILE`; it never places the token in a URL, result, or log.
- The compact status card is a standard MCP Apps resource (`text/html;profile=mcp-app`) linked by `_meta.ui.resourceUri`. It renders authoritative `structuredContent`, while the underlying tools stay usable without UI.
- Codex-triggered checks require one `hostId`, have a 15-second HTTP budget, and a 20-second plugin timeout. The full dashboard may still run an explicit all-host check.
- It does not expose host CRUD, arbitrary shell, real restart/reload, secrets, scheduler or login-start mutation, or deletion.
- A light check may call configured HTTP endpoints and allowlisted read-only SSH collectors through LocalOps; it records local check history.
- LocalOps rejects overlapping checks through an in-memory single-flight gate shared by manual and scheduled runs.
- Status freshness comes from `lastCheckedAt`/`observedAt`, never from the response generation timestamp. Expired evidence is reported as unknown.
- Recovery tools return dry-run text only. Their commands are untrusted plan output, not execution authority.
- If LocalOps is unavailable, Codex must report missing evidence rather than infer a server outage.

## Later milestones

1. Validate installation and tool discovery in a fresh Codex task while LocalOps is running.
2. Create the matching custom visual asset through Codex's documented **Create your own pet** flow. A pet asset changes appearance only; it does not receive LocalOps permissions.
3. Add opt-in scheduled monitoring through Codex automations or a LocalOps notification adapter. Monitoring cadence and notifications require a separate user choice.
4. Revisit dynamic pet mood only if OpenAI publishes a supported extension event/API.
