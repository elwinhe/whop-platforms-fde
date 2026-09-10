const SANDBOX_BASE_URL = new URL("https://sandbox-api.whop.com/api/v1/");

export type WhopJsonResponse = { response: Response; data: unknown };

export function createWhopSandboxClient(options: {
  apiKey?: string;
  bearerToken?: string;
  timeoutMs?: number;
} = {}) {
  const bearerToken = options.bearerToken ?? options.apiKey ?? process.env.WHOP_API_KEY;
  const timeoutMs = options.timeoutMs ?? Number(process.env.WHOP_TIMEOUT_MS ?? 5_000);

  if (!bearerToken) throw new Error("A Whop sandbox bearer credential is required");
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
      headers.set("Authorization", `Bearer ${bearerToken}`);
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
    async json(path: string, init: RequestInit = {}): Promise<WhopJsonResponse> {
      const response = await this.request(path, init);
      const text = await response.text();
      let data: unknown = {};
      try { data = text ? JSON.parse(text) : {}; } catch { data = { error: { message: "Whop returned non-JSON content" } }; }
      return { response, data };
    },
  };
}
