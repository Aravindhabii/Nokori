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
          entries.map((e) => {
            const where =
              e.type === 'transfer'
                ? `${e.source_label} → ${e.dest_label}`
                : e.type === 'income'
                ? `to ${e.dest_label}`
                : `from ${e.source_label}`;
            const sign = e.type === 'expense' ? '−' : e.type === 'income' ? '+' : '';
            return (
              <div class="row">
                <div class={`row-dot ${e.type}`}>
                  <i />
                </div>
                <div class="row-main">
                  <div class="row-cat">{e.type === 'transfer' ? 'Transfer' : e.category}</div>
                  <div class="row-meta">
                    {e.occurred_at} · {where}
                    {e.note ? ` · ${e.note}` : ''}
                  </div>
                </div>
                <div class="row-right">
                  <div class={`row-amount ${e.type}`}>
                    {sign}
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
            );
          })
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
          message={`${pendingDelete.type === 'transfer' ? 'Transfer' : pendingDelete.category} · ${money(pendingDelete.amount)} on ${pendingDelete.occurred_at} will be permanently removed.`}
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

// Edit keeps the entry's type fixed (to change type, delete + re-add). Transfers
// edit amount/note/date only; income/expense also edit category.
function EditModal({ entry, onClose, onSaved }: { entry: Entry; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState(String(entry.amount));
  const [category, setCategory] = useState(entry.category || '');
  const [note, setNote] = useState(entry.note || '');
  const [date, setDate] = useState(entry.occurred_at);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isTransfer = entry.type === 'transfer';

  async function save(e: Event) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body: Record<string, unknown> = { amount: parseFloat(amount), note: note || null, occurred_at: date };
      if (!isTransfer) body.category = category;
      await api(`/api/entries/${entry.id}`, { method: 'PATCH', body });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div class="modal-backdrop" onClick={onClose}>
      <form class="modal glass" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <h3>Edit {isTransfer ? 'transfer' : entry.type}</h3>
        <div class="field-group">
          <span class="field-label">Amount (₹)</span>
          <input class="field" type="number" step="0.01" min="0" value={amount} onInput={(e) => setAmount((e.target as HTMLInputElement).value)} />
        </div>
        {!isTransfer && (
          <div class="field-group">
            <span class="field-label">Category</span>
            <input class="field" value={category} onInput={(e) => setCategory((e.target as HTMLInputElement).value)} />
          </div>
        )}
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
