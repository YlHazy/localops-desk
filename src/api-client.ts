let cachedToken: string | null | undefined;

function apiToken() {
  if (cachedToken !== undefined) return cachedToken;
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  cachedToken = params.get("access_token");
  if (cachedToken) {
    params.delete("access_token");
    const nextHash = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${nextHash ? `#${nextHash}` : ""}`);
  }
  return cachedToken;
}

export function localOpsFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const token = apiToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
