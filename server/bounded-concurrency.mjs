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
