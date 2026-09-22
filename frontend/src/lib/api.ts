"use client";

import type { Paginated, User } from "./types";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") ?? "http://127.0.0.1:8000";

const ACCESS_KEY = "safar.access";
const REFRESH_KEY = "safar.refresh";

export const tokens = {
  access: () => (typeof window === "undefined" ? null : localStorage.getItem(ACCESS_KEY)),
  refresh: () => (typeof window === "undefined" ? null : localStorage.getItem(REFRESH_KEY)),
  set(access: string, refresh?: string) {
    localStorage.setItem(ACCESS_KEY, access);
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }

  /** Field errors from DRF, ready to show next to inputs. */
  get fieldErrors(): Record<string, string> {
    if (!this.data || typeof this.data !== "object") return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(this.data as Record<string, unknown>)) {
      out[key] = Array.isArray(value) ? String(value[0]) : String(value);
    }
    return out;
  }
}

function friendlyMessage(data: unknown, status: number): string {
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    const first = record.detail ?? Object.values(record)[0];
    if (Array.isArray(first)) return String(first[0]);
    if (typeof first === "string") return first;
  }
  if (status === 401) return "Please log in again.";
  if (status >= 500) return "Something went wrong at our end. Please try again.";
  return "That didn't work. Please try again.";
}

async function refreshAccessToken(): Promise<string | null> {
  const refresh = tokens.refresh();
  if (!refresh) return null;
  const res = await fetch(`${API_BASE}/api/auth/token/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access: string; refresh?: string };
  tokens.set(data.access, data.refresh);
  return data.access;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Send as multipart instead of JSON — used for photo uploads. */
  form?: FormData;
  signal?: AbortSignal;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, form, signal } = options;

  const send = async (token: string | null): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (!form && body !== undefined) headers["Content-Type"] = "application/json";
    return fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
      signal,
    });
  };

  let res = await send(tokens.access());

  // One transparent retry after refreshing an expired access token.
  if (res.status === 401 && tokens.refresh()) {
    const fresh = await refreshAccessToken();
    if (fresh) {
      res = await send(fresh);
    } else {
      tokens.clear();
    }
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new ApiError(friendlyMessage(data, res.status), res.status, data);
  }
  return data as T;
}

export const api = {
  get: <T,>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T,>(path: string, body?: unknown) => request<T>(path, { method: "POST", body }),
  patch: <T,>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  put: <T,>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body }),
  del: <T,>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T,>(path: string, form: FormData) => request<T>(path, { method: "POST", form }),
};

/** DRF paginates list endpoints; most screens just want the rows. */
export function rows<T>(payload: Paginated<T> | T[] | undefined): T[] {
  if (!payload) return [];
  return Array.isArray(payload) ? payload : payload.results;
}

export async function login(username: string, password: string): Promise<User> {
  const res = await fetch(`${API_BASE}/api/auth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(
      res.status === 401
        ? "That username and password didn't match."
        : friendlyMessage(data, res.status),
      res.status,
      data,
    );
  }
  tokens.set(data.access, data.refresh);
  return api.get<User>("/api/auth/me/");
}

export async function signup(payload: {
  username: string;
  password: string;
  display_name: string;
  email?: string;
  home_city?: string;
  avatar_emoji?: string;
}): Promise<User> {
  const res = await fetch(`${API_BASE}/api/auth/register/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(friendlyMessage(data, res.status), res.status, data);
  tokens.set(data.access, data.refresh);
  return data.user as User;
}
