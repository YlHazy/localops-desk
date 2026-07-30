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

