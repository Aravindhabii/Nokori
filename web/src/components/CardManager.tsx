import { useEffect, useState } from 'preact/hooks';
import { api, type CreditCard } from '../api';
import { money } from '../format';
import { ConfirmDialog } from './ConfirmDialog';

export function CardManager() {
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [name, setName] = useState('');
  const [limit, setLimit] = useState('');
  const [stmt, setStmt] = useState('1');
  const [due, setDue] = useState('20');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pendingDelete, setPendingDelete] = useState<CreditCard | null>(null);
  const [deleting, setDeleting] = useState(false);

  function load() {
    api<{ cards: CreditCard[] }>('/api/cards').then((r) => setCards(r.cards));
  }
  useEffect(load, []);

  async function add(e: Event) {
    e.preventDefault();
    setError('');
    if (!name.trim()) return setError('Name required');
    setBusy(true);
    try {
      await api('/api/cards', {
        body: {
          name,
          credit_limit: parseFloat(limit) || 0,
          statement_day: Number(stmt),
          due_day: Number(due),
        },
      });
      setName('');
      setLimit('');
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleArchive(c: CreditCard) {
    await api(`/api/cards/${c.id}`, { method: 'PATCH', body: { archived: !c.archived } });
    load();
  }
  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    setError('');
    try {
      await api(`/api/cards/${pendingDelete.id}`, { method: 'DELETE' });
      setPendingDelete(null);
      load();
    } catch (err) {
      setError((err as Error).message);
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  const days = Array.from({ length: 28 }, (_, i) => i + 1);

  return (
    <div class="token-card glass">
      <div class="muted" style={{ fontSize: '14px' }}>
        Credit cards are tracked as credit (not cash): a limit, running outstanding, and available credit. Card
        spends never touch your bank until you pay the bill.
      </div>

      {error && <div class="error">{error}</div>}

      <form class="account-form" onSubmit={add}>
        <input class="field" value={name} placeholder="Card name (e.g. ICICI)" onInput={(e) => setName((e.target as HTMLInputElement).value)} />
        <div class="account-form-row">
          <input class="field" type="number" step="1" value={limit} placeholder="Limit ₹" onInput={(e) => setLimit((e.target as HTMLInputElement).value)} />
          <button class="btn-primary compact" disabled={busy} type="submit">
            {busy ? '…' : 'Add'}
          </button>
        </div>
        <div class="account-form-row">
          <label class="inline-field">
            <span class="field-label">Statement day</span>
            <select class="field" value={stmt} onChange={(e) => setStmt((e.target as HTMLSelectElement).value)}>
              {days.map((d) => (
                <option value={d}>{d}</option>
              ))}
            </select>
          </label>
          <label class="inline-field">
            <span class="field-label">Due day</span>
            <select class="field" value={due} onChange={(e) => setDue((e.target as HTMLSelectElement).value)}>
              {days.map((d) => (
                <option value={d}>{d}</option>
              ))}
            </select>
          </label>
        </div>
      </form>

      <div class="divider" />

      {cards.length === 0 ? (
        <div class="muted" style={{ fontSize: '15px' }}>
          No cards yet.
        </div>
      ) : (
        cards.map((c) => (
          <div class="token-item">
            <div class="info">
              <div class="name">
                {c.name}
                {c.archived && <span class="pill-tag muted-tag">Archived</span>}
              </div>
              <div class="val">
                Limit {money(c.credit_limit)} · stmt {c.statement_day} · due {c.due_day} · outstanding{' '}
                {money(c.outstanding)}
              </div>
            </div>
            <div class="account-actions">
              <button class="mini-btn" onClick={() => toggleArchive(c)}>
                {c.archived ? 'Restore' : 'Archive'}
              </button>
              <button class="mini-btn danger" onClick={() => setPendingDelete(c)}>
                Delete
              </button>
            </div>
          </div>
        ))
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete card?"
          message={`"${pendingDelete.name}" will be removed. Cards with transactions/EMIs can't be deleted — archive them instead.`}
          confirmLabel="Delete"
          danger
          busy={deleting}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
