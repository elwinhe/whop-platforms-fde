const SANDBOX_BASE_URL = new URL("https://sandbox-api.whop.com/api/v1/");

export function createWhopSandboxClient(options: {
  apiKey?: string;
  timeoutMs?: number;
} = {}) {
  const apiKey = options.apiKey ?? process.env.WHOP_API_KEY;
  const timeoutMs = options.timeoutMs ?? Number(process.env.WHOP_TIMEOUT_MS ?? 5_000);

  if (!apiKey) throw new Error("WHOP_API_KEY is required for sandbox requests");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("WHOP_TIMEOUT_MS must be a positive safe integer");
  }

  return {
    request(path: string, init: RequestInit = {}) {
      const url = new URL(path, SANDBOX_BASE_URL);
      const isRelativePath =
        !/^[a-z][a-z\d+.-]*:/i.test(path) &&
        !path.startsWith("/") &&
        !path.startsWith("\\");
      if (
        !isRelativePath ||
        url.origin !== SANDBOX_BASE_URL.origin ||
        !url.pathname.startsWith(SANDBOX_BASE_URL.pathname)
      ) {
        throw new Error("Whop client accepts sandbox-relative paths only");
      }

      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${apiKey}`);
      headers.set("Accept", "application/json");
      return fetch(url, {
        ...init,
        headers,
        redirect: "error",
        signal: init.signal
          ? AbortSignal.any([init.signal, AbortSignal.timeout(timeoutMs)])
          : AbortSignal.timeout(timeoutMs),
      });
    },
  };
}
