import * as SecureStore from "expo-secure-store";

/** The machine running `manage.py runserver` — see mobile/README.md for how to set this
 *  for your own network. Falls back to localhost, which only works in a web/simulator
 *  build where "localhost" is the same machine as the backend. */
export const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? "http://127.0.0.1:8000";

const ACCESS_KEY = "safar.access";
const REFRESH_KEY = "safar.refresh";

type Tokens = { access: string; refresh: string };

/** The tokens, kept in memory once read: SecureStore is an encrypted native
 *  read, far too slow to do twice for every single request. `undefined`
 *  means "not read yet", `null` means "signed out". */
let cachedTokens: Tokens | null | undefined;

export async function getTokens(): Promise<Tokens | null> {
  if (cachedTokens !== undefined) return cachedTokens;
  const [access, refresh] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_KEY),
    SecureStore.getItemAsync(REFRESH_KEY),
  ]);
  cachedTokens = access && refresh ? { access, refresh } : null;
  return cachedTokens;
}

export async function setTokens(tokens: Tokens): Promise<void> {
  cachedTokens = tokens;
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_KEY, tokens.access),
    SecureStore.setItemAsync(REFRESH_KEY, tokens.refresh),
  ]);
}

export async function clearTokens(): Promise<void> {
  cachedTokens = null;
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
  /** Skip attaching the bearer token — for Google sign-in. */
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

/** Uploads a multipart form (a photo) with the same token handling as `api`. */
export async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  async function attempt(): Promise<Response> {
    const tokens = await getTokens();
    return fetch(`${API_BASE}${path}`, {
      method: "POST",
      // No Content-Type: fetch sets the multipart boundary itself.
      headers: tokens ? { Authorization: `Bearer ${tokens.access}` } : {},
      body: form,
    });
  }
  let res = await attempt();
  if (res.status === 401) {
    const newAccess = await refreshAccessToken();
    if (newAccess) res = await attempt();
  }
  if (!res.ok) {
    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      // Not JSON — fall back to a generic message.
    }
    throw new ApiError(res.status, extractMessage(res.status, parsed));
  }
  return (await res.json()) as T;
}

/** A media path from the API ("/media/…") as a full URL; full URLs pass through. */
export function mediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return path.startsWith("/") ? `${API_BASE}${path}` : path;
}
