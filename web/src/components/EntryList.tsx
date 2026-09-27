import { useEffect, useState } from 'preact/hooks';
import { api, type Entry } from '../api';
import { money } from '../format';
import { ConfirmDialog } from './ConfirmDialog';

const EditIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
    <path d="M4 20h4L19 9l-4-4L4 16z" />
  </svg>
);
const DeleteIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export function EntryList({ version, onChange }: { version: number; onChange: () => void }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'expense' | 'income'>('all');
  const [editing, setEditing] = useState<Entry | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Entry | null>(null);
  const [deleting, setDeleting] = useState(false);

  function load() {
    setLoading(true);
    const q = filter === 'all' ? '' : `?type=${filter}`;
    api<{ entries: Entry[] }>(`/api/entries${q}`)
      .then((r) => setEntries(r.entries))
      .finally(() => setLoading(false));
  }
  useEffect(load, [version, filter]);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await api(`/api/entries/${pendingDelete.id}`, { method: 'DELETE' });
      setPendingDelete(null);
      onChange();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div class="seg small glass">
        {(['all', 'expense', 'income'] as const).map((f) => (
          <button class={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
            {f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div class="list glass">
        {loading ? (
          <div class="empty">Loading…</div>
        ) : entries.length === 0 ? (
          <div class="empty">No entries yet.</div>
        ) : (
          entries.map((e) => (
            <div class="row">
              <div class={`row-dot ${e.type}`}>
                <i />
              </div>
              <div class="row-main">
                <div class="row-cat">{e.category}</div>
                <div class="row-meta">
                  {e.occurred_at}
                  {e.note ? ` · ${e.note}` : ''}
                </div>
              </div>
              <div class="row-right">
                <div class={`row-amount ${e.type}`}>
                  {e.type === 'expense' ? '−' : '+'}
                  {money(e.amount)}
                </div>
                <div class="row-actions">
                  <button class="icon-circle" title="Edit" onClick={() => setEditing(e)}>
                    <EditIcon />
                  </button>
                  <button class="icon-circle danger" title="Delete" onClick={() => setPendingDelete(e)}>
                    <DeleteIcon />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {editing && (
        <EditModal
          entry={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChange();
          }}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete entry?"
          message={`${pendingDelete.category} · ${money(pendingDelete.amount)} on ${pendingDelete.occurred_at} will be permanently removed.`}
          confirmLabel="Delete"
          danger
          busy={deleting}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}

function EditModal({ entry, onClose, onSaved }: { entry: Entry; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState(String(entry.amount));
  const [category, setCategory] = useState(entry.category);
  const [note, setNote] = useState(entry.note || '');
  const [date, setDate] = useState(entry.occurred_at);
  const [type, setType] = useState(entry.type);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(e: Event) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/api/entries/${entry.id}`, {
        method: 'PATCH',
        body: { type, amount: parseFloat(amount), category, note: note || null, occurred_at: date },
      });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div class="modal-backdrop" onClick={onClose}>
      <form class="modal glass" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <h3>Edit entry</h3>
        <div class="seg">
          <button type="button" class={type === 'expense' ? 'on expense' : ''} onClick={() => setType('expense')}>
            Expense
          </button>
          <button type="button" class={type === 'income' ? 'on income' : ''} onClick={() => setType('income')}>
            Income
          </button>
        </div>
        <div class="field-group">
          <span class="field-label">Amount (₹)</span>
          <input class="field" type="number" step="0.01" min="0" value={amount} onInput={(e) => setAmount((e.target as HTMLInputElement).value)} />
        </div>
        <div class="field-group">
          <span class="field-label">Category</span>
          <input class="field" value={category} onInput={(e) => setCategory((e.target as HTMLInputElement).value)} />
        </div>
        <div class="field-group">
          <span class="field-label">Note</span>
          <input class="field" value={note} onInput={(e) => setNote((e.target as HTMLInputElement).value)} />
        </div>
        <div class="field-group">
          <span class="field-label">Date</span>
          <input class="field" type="date" value={date} onInput={(e) => setDate((e.target as HTMLInputElement).value)} />
        </div>
        {error && <div class="error">{error}</div>}
        <div class="modal-actions">
          <button type="button" class="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" class="btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
