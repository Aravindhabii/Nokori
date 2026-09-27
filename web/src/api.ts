const TOKEN_KEY = 'et_token';
const USER_KEY = 'et_user';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const getUser = () => localStorage.getItem(USER_KEY);
export function setSession(token: string, username: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, username);
}
export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

type Opts = { method?: string; body?: unknown; headers?: Record<string, string> };

export async function api<T = any>(path: string, opts: Opts = {}): Promise<T> {
  const headers: Record<string, string> = { ...opts.headers };
  // Only set JSON content-type when there's a body — otherwise Fastify rejects
  // bodyless requests (e.g. DELETE) with FST_ERR_CTP_EMPTY_JSON_BODY (400).
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, {
    method: opts.method || (opts.body ? 'POST' : 'GET'),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401) {
    clearSession();
    window.dispatchEvent(new Event('et-logout'));
  }
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).error || `Error ${res.status}`);
  return data as T;
}

// ---- Types ----
export type EntryType = 'income' | 'expense';
export interface Entry {
  id: number;
  type: EntryType;
  amount: number;
  category: string;
  note: string | null;
  occurred_at: string;
  created_at: string;
}
export interface Summary {
  totals: { income: number; expense: number; net: number };
  byCategory: { category: string; amount: number }[];
  byMonth: { month: string; income: number; expense: number }[];
}
export interface ApiToken {
  id: number;
  label: string;
  created_at: string;
  last_used_at: string | null;
}
