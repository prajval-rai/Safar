import * as SecureStore from "expo-secure-store";

/** The machine running `manage.py runserver` — see mobile/README.md for how to set this
 *  for your own network. Falls back to localhost, which only works in a web/simulator
 *  build where "localhost" is the same machine as the backend. */
export const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? "http://127.0.0.1:8000";

const ACCESS_KEY = "safar.access";
const REFRESH_KEY = "safar.refresh";

export async function getTokens(): Promise<{ access: string; refresh: string } | null> {
  const [access, refresh] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_KEY),
    SecureStore.getItemAsync(REFRESH_KEY),
  ]);
  return access && refresh ? { access, refresh } : null;
}

export async function setTokens(tokens: { access: string; refresh: string }): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_KEY, tokens.access),
    SecureStore.setItemAsync(REFRESH_KEY, tokens.refresh),
  ]);
}

export async function clearTokens(): Promise<void> {
  await Promise.all([SecureStore.deleteItemAsync(ACCESS_KEY), SecureStore.deleteItemAsync(REFRESH_KEY)]);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Turns whatever shape DRF sent back (`{"detail": "..."}`, `{"field": ["msg"]}`, plain
 *  text) into one readable line. */
function extractMessage(status: number, body: unknown): string {
  if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    if (typeof obj.detail === "string") return obj.detail;
    const firstKey = Object.keys(obj)[0];
    if (firstKey) {
      const value = obj[firstKey];
      const text = Array.isArray(value) ? value[0] : value;
      if (typeof text === "string") return text;
    }
  }
  return `Request failed (${status}).`;
}

let refreshing: Promise<string | null> | null = null;

/** Swaps the refresh token for a new access token. Shared across concurrent 401s so
 *  a screen that fires several requests at once doesn't race to refresh separately. */
async function refreshAccessToken(): Promise<string | null> {
  if (!refreshing) {
    refreshing = (async () => {
      const tokens = await getTokens();
      if (!tokens) return null;
      try {
        const res = await fetch(`${API_BASE}/api/auth/token/refresh/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh: tokens.refresh }),
        });
        if (!res.ok) {
          await clearTokens();
          return null;
        }
        const data = (await res.json()) as { access: string };
        await setTokens({ access: data.access, refresh: tokens.refresh });
        return data.access;
      } catch {
        return null;
      }
    })();
  }
  try {
    return await refreshing;
  } finally {
    refreshing = null;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** Skip attaching the bearer token — for login/register. */
  anonymous?: boolean;
}

/** Every authenticated call to the Django API goes through here: attaches the bearer
 *  token, retries once through a token refresh on a 401, and throws `ApiError` with a
 *  message worth showing a person on any other failure. */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, anonymous = false } = options;

  async function attempt(): Promise<Response> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (!anonymous) {
      const tokens = await getTokens();
      if (tokens) headers.Authorization = `Bearer ${tokens.access}`;
    }
    return fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
    });
  }

  let res = await attempt();
  if (res.status === 401 && !anonymous) {
    const newAccess = await refreshAccessToken();
    if (newAccess) res = await attempt();
  }

  if (!res.ok) {
    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      // Body wasn't JSON (a proxy error page, an empty 500) — extractMessage falls
      // back to a generic message for this status.
    }
    throw new ApiError(res.status, extractMessage(res.status, parsed));
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
