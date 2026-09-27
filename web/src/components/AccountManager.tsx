import { useEffect, useState } from 'preact/hooks';
import { api, type Account, type AccountType } from '../api';
import { money } from '../format';
import { ConfirmDialog } from './ConfirmDialog';

export function AccountManager() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('bank');
  const [opening, setOpening] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Account | null>(null);
  const [editName, setEditName] = useState('');
  const [editOpening, setEditOpening] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Account | null>(null);
  const [forceInfo, setForceInfo] = useState<{ account: Account; count: number } | null>(null);
  const [working, setWorking] = useState(false);

  function load() {
    api<{ accounts: Account[] }>('/api/accounts').then((r) => setAccounts(r.accounts));
  }
  useEffect(load, []);

  async function add(e: Event) {
    e.preventDefault();
    setError('');
    if (!name.trim()) return setError('Name required');
    setBusy(true);
    try {
      await api('/api/accounts', { body: { name, type, opening_balance: parseFloat(opening) || 0 } });
      setName('');
      setOpening('');
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function startEdit(a: Account) {
    setEditing(a);
    setEditName(a.name);
    setEditOpening(String(a.opening_balance));
    setError('');
  }
  async function saveEdit(e: Event) {
    e.preventDefault();
    if (!editing) return;
    setWorking(true);
    setError('');
    try {
      await api(`/api/accounts/${editing.id}`, {
        method: 'PATCH',
        body: { name: editName, opening_balance: parseFloat(editOpening) || 0 },
      });
      setEditing(null);
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setWorking(false);
    }
  }

  async function setDefault(a: Account) {
    await api(`/api/accounts/${a.id}`, { method: 'PATCH', body: { is_default: true } });
    load();
  }
  async function toggleArchive(a: Account) {
    await api(`/api/accounts/${a.id}`, { method: 'PATCH', body: { archived: !a.archived } });
    load();
  }

  async function doDelete(a: Account, force: boolean) {
    setWorking(true);
    setError('');
    try {
      await api(`/api/accounts/${a.id}${force ? '?force=1' : ''}`, { method: 'DELETE' });
      setPendingDelete(null);
      setForceInfo(null);
      load();
    } catch (err) {
      const data = (err as Error & { data?: { needs_force?: boolean; transaction_count?: number } }).data;
      if (data?.needs_force) {
        setPendingDelete(null);
        setForceInfo({ account: a, count: data.transaction_count || 0 });
      } else {
        setError((err as Error).message);
        setPendingDelete(null);
      }
    } finally {
      setWorking(false);
    }
  }

  return (
    <div class="token-card glass">
      <div class="muted" style={{ fontSize: '14px' }}>
        Bank accounts and cash. Income lands in an account, expenses draw from one, and transfers move money
        between them. The default is pre-selected for quick entry.
      </div>

      {error && <div class="error">{error}</div>}

      <form class="account-form" onSubmit={add}>
        <input class="field" value={name} placeholder="Name (e.g. HDFC)" onInput={(e) => setName((e.target as HTMLInputElement).value)} />
        <div class="account-form-row">
          <select class="field" value={type} onChange={(e) => setType((e.target as HTMLSelectElement).value as AccountType)}>
            <option value="bank">Bank</option>
            <option value="cash">Cash</option>
          </select>
          <input class="field" type="number" step="0.01" value={opening} placeholder="Opening ₹" onInput={(e) => setOpening((e.target as HTMLInputElement).value)} />
          <button class="btn-primary compact" disabled={busy} type="submit">
            {busy ? '…' : 'Add'}
          </button>
        </div>
      </form>

      <div class="divider" />

      {accounts.map((a) => (
        <div class="token-item">
          <div class="info">
            <div class="name">
              {a.name}
              {a.is_default && <span class="pill-tag">Default</span>}
              {a.archived && <span class="pill-tag muted-tag">Archived</span>}
            </div>
            <div class="val">
              {a.type === 'cash' ? 'Cash' : 'Bank'} · {money(a.balance)}
            </div>
          </div>
          <div class="account-actions">
            <button class="mini-btn" onClick={() => startEdit(a)}>
              Edit
            </button>
            {!a.is_default && !a.archived && (
              <button class="mini-btn" onClick={() => setDefault(a)}>
                Default
              </button>
            )}
            <button class="mini-btn" onClick={() => toggleArchive(a)}>
              {a.archived ? 'Restore' : 'Archive'}
            </button>
            <button class="mini-btn danger" onClick={() => setPendingDelete(a)}>
              Delete
            </button>
          </div>
        </div>
      ))}

      {editing && (
        <div class="modal-backdrop" onClick={() => setEditing(null)}>
          <form class="modal glass" onClick={(e) => e.stopPropagation()} onSubmit={saveEdit}>
            <h3>Edit account</h3>
            <div class="field-group">
              <span class="field-label">Name</span>
              <input class="field" value={editName} onInput={(e) => setEditName((e.target as HTMLInputElement).value)} />
            </div>
            <div class="field-group">
              <span class="field-label">Opening balance (₹)</span>
              <input class="field" type="number" step="0.01" value={editOpening} onInput={(e) => setEditOpening((e.target as HTMLInputElement).value)} />
              <span class="small muted">The starting balance before any entries. Adjust this to correct a wrong balance.</span>
            </div>
            {error && <div class="error">{error}</div>}
            <div class="modal-actions">
              <button type="button" class="btn-ghost" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button type="submit" class="btn-primary" disabled={working}>
                {working ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete account?"
          message={`Remove "${pendingDelete.name}"? Accounts with transactions will ask again before deleting those too.`}
          confirmLabel="Delete"
          danger
          busy={working}
          onConfirm={() => doDelete(pendingDelete, false)}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {forceInfo && (
        <ConfirmDialog
          title="Delete account + transactions?"
          message={`"${forceInfo.account.name}" has ${forceInfo.count} transaction(s). Deleting it will permanently remove those entries too. This can't be undone.`}
          confirmLabel="Delete everything"
          danger
          busy={working}
          onConfirm={() => doDelete(forceInfo.account, true)}
          onCancel={() => setForceInfo(null)}
        />
      )}
    </div>
  );
}
