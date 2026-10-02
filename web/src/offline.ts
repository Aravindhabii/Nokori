// Lightweight offline support: cache GET responses so views render without a
// connection, and queue "add expense" while offline, syncing on reconnect.
// Scope: reads are cached for all GETs; the write queue covers POST /api/entries
// (the main on-the-go action). Offline edits/deletes surface an error (rare).

const CACHE_PREFIX = 'cache:';
const QUEUE_KEY = 'et_queue';

export function cacheGet(path: string): any {
  try {
    const v = localStorage.getItem(CACHE_PREFIX + path);
    return v == null ? undefined : JSON.parse(v);
  } catch {
    return undefined;
  }
}
export function cacheSet(path: string, data: unknown) {
  try {
    localStorage.setItem(CACHE_PREFIX + path, JSON.stringify(data));
  } catch {
    /* quota / disabled — ignore */
  }
}

interface Queued { body: any }
const readQueue = (): Queued[] => {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
};
const writeQueue = (q: Queued[]) => localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
export const queueCount = () => readQueue().length;

const todayLocal = () => new Date().toISOString().slice(0, 10);

/** Queue an entry create while offline and optimistically show it in the cached list. */
export function enqueueEntry(body: any): any {
  const q = readQueue();
  q.push({ body });
  writeQueue(q);

  const optimistic = {
    id: -Date.now(),
    type: body.type || 'expense',
    amount: body.amount,
    category: body.category ?? null,
    note: body.note ?? null,
    occurred_at: body.occurred_at || todayLocal(),
    created_at: new Date().toISOString(),
    account_id: null, card_id: null, from_account_id: null, to_account_id: null, to_card_id: null,
    emi_plan_id: null,
    source_label: 'Pending sync',
    dest_label: null,
    _pending: true,
  };
  const listKey = '/api/entries';
  const cached = cacheGet(listKey);
  if (cached && Array.isArray(cached.entries)) {
    cached.entries.unshift(optimistic);
    cacheSet(listKey, cached);
  }
  window.dispatchEvent(new Event('et-queue-changed'));
  return optimistic;
}

/** Replay queued creates. `post` should perform a real network POST (throw on failure). */
export async function flushQueue(post: (body: any) => Promise<void>): Promise<void> {
  const q = readQueue();
  if (!q.length) return;
  const remaining: Queued[] = [];
  for (const item of q) {
    try {
      await post(item.body);
    } catch {
      remaining.push(item); // keep for the next attempt
    }
  }
  writeQueue(remaining);
  window.dispatchEvent(new Event('et-queue-changed'));
  if (remaining.length === 0) window.dispatchEvent(new Event('et-synced'));
}
