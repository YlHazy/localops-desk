export async function mapWithConcurrency(items, limit, mapper) {
  if (!Array.isArray(items)) throw new TypeError("items must be an array");
  if (!Number.isInteger(limit) || limit < 1) throw new TypeError("concurrency limit must be a positive integer");
  if (typeof mapper !== "function") throw new TypeError("mapper must be a function");
  if (items.length === 0) return [];

  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

export function createConcurrencyGate(limit) {
  if (!Number.isInteger(limit) || limit < 1) throw new TypeError("concurrency limit must be a positive integer");
  let active = 0;
  const queue = [];
  const release = () => {
    active -= 1;
    const next = queue.shift();
    if (next) {
      active += 1;
      next(release);
    }
  };
  return async function withPermit(task) {
    if (typeof task !== "function") throw new TypeError("concurrency task must be a function");
    const giveBack = active < limit ? (active += 1, release) : await new Promise((resolve) => queue.push(resolve));
    try {
      return await task();
    } finally {
      giveBack();
    }
  };
}
