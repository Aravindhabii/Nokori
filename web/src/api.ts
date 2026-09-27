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
  if (!res.ok) {
    const err = new Error((data as any).error || `Error ${res.status}`) as Error & { data?: any };
    err.data = data;
    throw err;
  }
  return data as T;
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
