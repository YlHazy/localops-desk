export function createLatestRequestGate() {
  let latestToken = 0;
  return {
    begin() {
      latestToken += 1;
      return latestToken;
    },
    isLatest(token) {
      return token === latestToken;
    },
    invalidate() {
      latestToken += 1;
    }
  };
}

export async function resolveLatestRequest(gate, token, request) {
  try {
    const value = await request;
    return gate.isLatest(token) ? { current: true, value } : { current: false };
  } catch (error) {
    if (!gate.isLatest(token)) return { current: false };
    throw error;
  }
}
