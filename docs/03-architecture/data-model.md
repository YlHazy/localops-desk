# Data Model

## Host

- `id`
- `name`
- `environment`
- `role`
- `sshAlias`
- `healthUrl`
- `composeProject`
- `tags`
- `createdAt`
- `updatedAt`

## CheckRun

- `id`
- `kind`: `light`, `deep`, `manual`
- `trigger`: `manual`, `manual-host`, `scheduled`
- `hostScope`: `all` or a configured host id
- `startedAt`
- `finishedAt`
- `durationMs`
- `overallStatus`
- `summary`

## HostCheck

- `id`
- `runId`
- `hostId`
- `status`
- `httpStatus`
- `httpLatencyMs`
- `sshStatus`
- `cpuPercent`
- `memoryPercent`
- `diskPercent`
- `dockerStatus`
- `evidenceJson`
- `sanitizedError`

## ActionPlan

- `id`
- `hostId`
- `actionKey`
- `riskTier`
- `dryRunOutput`
- `createdAt`

## Settings

- `key`
- `value`
- `updatedAt`

Current settings include scheduler enablement, light-check interval, retention days, scheduled failure count, last run time, and next run time.
