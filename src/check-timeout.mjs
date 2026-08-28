const minimumBatchTimeoutMs = 60_000;
const maximumBatchTimeoutMs = 600_000;
const collectorWaveBudgetMs = 20_000;
const batchConcurrency = 4;

export function batchCheckTimeoutMs(collectibleHostCount) {
  const count = Number(collectibleHostCount);
  if (!Number.isInteger(count) || count < 0) throw new TypeError("collectible host count must be a non-negative integer");
  const waves = Math.max(1, Math.ceil(count / batchConcurrency));
  return Math.min(maximumBatchTimeoutMs, Math.max(minimumBatchTimeoutMs, 30_000 + waves * collectorWaveBudgetMs));
}
