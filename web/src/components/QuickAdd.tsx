import { useEffect, useState } from 'preact/hooks';
import { api, type EntryType } from '../api';
import { todayIST } from '../format';

export function QuickAdd({ onAdded }: { onAdded: () => void }) {
  const [type, setType] = useState<EntryType>('expense');
  const [amount, setAmount] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayIST());
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ categories: string[] }>('/api/categories')
      .then((r) => {
        setCategories(r.categories);
        setCategory(r.categories[0] || '');
      })
      .catch(() => {});
  }, []);

  async function submit(e: Event) {
    e.preventDefault();
    setError('');
    const value = parseFloat(amount);
    if (!(value > 0)) {
      setError('Enter an amount greater than 0');
      return;
    }
    setBusy(true);
    try {
      await api('/api/entries', {
        body: { type, amount: value, category, note: note || undefined, occurred_at: date },
      });
      setAmount('');
      setNote('');
      setFlash('Saved ✓');
      setTimeout(() => setFlash(''), 1500);
      onAdded();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form class="card glass quick-add" onSubmit={submit}>
      <div class="seg">
        <button type="button" class={type === 'expense' ? 'on expense' : ''} onClick={() => setType('expense')}>
          Expense
        </button>
        <button type="button" class={type === 'income' ? 'on income' : ''} onClick={() => setType('income')}>
          Income
        </button>
      </div>

      <div class="amount-hero">
        <span class="cap">Amount (₹)</span>
        <div class="amount-row">
          <span class="rupee">₹</span>
          <input
            class="amount-input"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={amount}
            onInput={(e) => setAmount((e.target as HTMLInputElement).value)}
            autofocus
          />
        </div>
      </div>

      <div class="field-group">
        <span class="field-label">Category</span>
        <select class="field" value={category} onChange={(e) => setCategory((e.target as HTMLSelectElement).value)}>
          {categories.map((c) => (
            <option value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div class="field-group">
        <span class="field-label">Note (optional)</span>
        <input
          class="field"
          value={note}
          placeholder="e.g. lunch with team"
          onInput={(e) => setNote((e.target as HTMLInputElement).value)}
        />
      </div>

      <div class="field-group">
        <span class="field-label">Date</span>
        <input class="field" type="date" value={date} onInput={(e) => setDate((e.target as HTMLInputElement).value)} />
      </div>

      {error && <div class="error center">{error}</div>}
      <button class="btn-primary" disabled={busy} type="submit">
        {busy ? 'Saving…' : flash || (type === 'expense' ? 'Add expense' : 'Add income')}
      </button>
    </form>
  );
}
