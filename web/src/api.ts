import { Capacitor } from '@capacitor/core';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { cacheGet, cacheSet, enqueueEntry, flushQueue } from './offline';

const TOKEN_KEY = 'et_token';
const USER_KEY = 'et_user';

// On native, the app isn't served by the backend, so calls need an absolute URL.
// Set VITE_API_BASE_URL to your https domain for native builds; empty = same-origin (web).
const API_BASE = (import.meta.env.VITE_API_BASE_URL as string) || '';
const native = Capacitor.isNativePlatform();

// Token/user live in the OS keychain on native, localStorage on web. An in-memory
// cache keeps getToken()/getUser() synchronous; writes persist in the background.
let _token: string | null = null;
let _user: string | null = null;

async function storeGet(k: string): Promise<string | null> {
  if (native) {
    const v = await SecureStorage.get(k);
    return typeof v === 'string' ? v : null;
  }
  return localStorage.getItem(k);
}
function storeSet(k: string, v: string) {
  if (native) void SecureStorage.set(k, v);
  else localStorage.setItem(k, v);
}
function storeRemove(k: string) {
  if (native) void SecureStorage.remove(k);
  else localStorage.removeItem(k);
}

/** Load persisted session into the cache. Await before first render. */
export async function initSession() {
  try {
    _token = await storeGet(TOKEN_KEY);
    _user = await storeGet(USER_KEY);
  } catch {
    _token = null;
    _user = null;
  }
}

export const getToken = () => _token;
export const getUser = () => _user;
export function setSession(token: string, username: string) {
  _token = token;
  _user = username;
  storeSet(TOKEN_KEY, token);
  storeSet(USER_KEY, username);
}
export function clearSession() {
  _token = null;
  _user = null;
  storeRemove(TOKEN_KEY);
  storeRemove(USER_KEY);
}

type Opts = { method?: string; body?: unknown; headers?: Record<string, string> };

export async function api<T = any>(path: string, opts: Opts = {}): Promise<T> {
  const headers: Record<string, string> = { ...opts.headers };
  // Only set JSON content-type when there's a body — otherwise Fastify rejects
  // bodyless requests (e.g. DELETE) with FST_ERR_CTP_EMPTY_JSON_BODY (400).
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const method = opts.method || (opts.body ? 'POST' : 'GET');

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch (netErr) {
    // Offline / unreachable: serve cached reads; queue expense adds.
    if (method === 'GET') {
      const cached = cacheGet(path);
      if (cached !== undefined) return cached as T;
    }
    if (method === 'POST' && path === '/api/entries') {
      return enqueueEntry(opts.body) as T;
    }
    throw netErr;
  }

  if (res.status === 401) {
    clearSession();
    window.dispatchEvent(new Event('et-logout'));
  }
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((data as any).error || `Error ${res.status}`) as Error & { data?: any };
    err.data = data;
    throw err;
  }
  if (method === 'GET') cacheSet(path, data); // keep last-known for offline reads
  return data as T;
}

/** Replay queued offline entry-adds. Called on reconnect and at startup. */
export async function syncNow(): Promise<void> {
  await flushQueue(async (body) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const t = getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
    const res = await fetch(`${API_BASE}/api/entries`, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error('sync failed');
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void syncNow());
}

// ---- Types ----
export type EntryType = 'income' | 'expense' | 'transfer';
export interface Entry {
  id: number;
  type: EntryType;
  amount: number;
  category: string | null;
  note: string | null;
  occurred_at: string;
  created_at: string;
  account_id: number | null;
  card_id: number | null;
  from_account_id: number | null;
  to_account_id: number | null;
  to_card_id: number | null;
  emi_plan_id: number | null;
  source_label: string | null;
  dest_label: string | null;
}

export type AccountType = 'bank' | 'cash';
export interface Account {
  id: number;
  name: string;
  type: AccountType;
  is_default: boolean;
  archived: boolean;
  opening_balance: number;
  balance: number;
}
export interface CreditCard {
  id: number;
  name: string;
  credit_limit: number;
  statement_day: number;
  due_day: number;
  archived: boolean;
  outstanding: number;
  available: number;
  current_cycle_spend: number;
  last_statement_amount: number;
  due_date: string;
}
export interface Emi {
  id: number;
  card_id: number;
  card_name: string;
  principal: number;
  months: number;
  monthly: number;
  start_month: string;
  end_month: string;
  elapsed: number;
  remaining: number;
  remaining_amount: number;
  done: boolean;
}
export interface Balances {
  accounts: Account[];
  total_assets: number;
  cards: CreditCard[];
  emis: Emi[];
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
