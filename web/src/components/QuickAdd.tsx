import { useEffect, useState } from 'preact/hooks';
import { api, type Account, type CreditCard, type EntryType } from '../api';
import { todayIST } from '../format';

// Refs are encoded as "a:<id>" (account) or "c:<id>" (card) in the <select> values.
const parseRef = (v: string) => {
  const [kind, id] = v.split(':');
  return kind === 'c' ? { card_id: Number(id) } : { account_id: Number(id) };
};

export function QuickAdd({ onAdded }: { onAdded: () => void }) {
  const [type, setType] = useState<EntryType>('expense');
  const [amount, setAmount] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [sourceVal, setSourceVal] = useState('');
  const [toVal, setToVal] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayIST());
  const [emi, setEmi] = useState(false);
  const [months, setMonths] = useState('6');
  const [monthly, setMonthly] = useState('');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState('');
  const [error, setError] = useState('');

  const isCardSource = sourceVal.startsWith('c:');
  const showEmi = type === 'expense' && isCardSource;

  useEffect(() => {
    api<{ categories: string[] }>('/api/categories')
      .then((r) => {
        setCategories(r.categories);
        setCategory(r.categories[0] || '');
      })
      .catch(() => {});
    Promise.all([
      api<{ accounts: Account[] }>('/api/accounts'),
      api<{ cards: CreditCard[] }>('/api/cards'),
    ])
      .then(([ar, cr]) => {
        const acc = ar.accounts.filter((a) => !a.archived);
        const crd = cr.cards.filter((c) => !c.archived);
        setAccounts(acc);
        setCards(crd);
        const def = acc.find((a) => a.is_default) || acc[0];
        if (def) setSourceVal(`a:${def.id}`);
        const other = acc.find((a) => a.id !== def?.id);
        if (other) setToVal(`a:${other.id}`);
      })
      .catch(() => {});
  }, []);

  async function submit(e: Event) {
    e.preventDefault();
    setError('');
    const value = parseFloat(amount);
    if (!(value > 0)) return setError('Enter an amount greater than 0');

    // Card expense converted to EMI → the EMI endpoint (creates purchase + schedule).
    if (showEmi && emi) {
      const n = parseInt(months, 10);
      if (!(n >= 2)) return setError('EMI needs at least 2 months');
      setBusy(true);
      try {
        await api('/api/emis', {
          body: {
            card_id: Number(sourceVal.split(':')[1]),
            principal: value,
            months: n,
            monthly: monthly ? parseFloat(monthly) : undefined,
            category,
            note: note || undefined,
            occurred_at: date,
          },
        });
        setAmount('');
        setNote('');
        setMonthly('');
        setFlash('EMI added ✓');
        setTimeout(() => setFlash(''), 1500);
        onAdded();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(false);
      }
      return;
    }

    let body: Record<string, unknown>;
    if (type === 'transfer') {
      if (!sourceVal || !toVal) return setError('Pick both source and destination');
      if (sourceVal === toVal) return setError("Source and destination can't match");
      const to = parseRef(toVal);
      body = {
        type,
        amount: value,
        from_account_id: Number(sourceVal.split(':')[1]),
        ...(to.card_id ? { to_card_id: to.card_id } : { to_account_id: to.account_id }),
        note: note || undefined,
        occurred_at: date,
      };
    } else {
      body = { type, amount: value, category, note: note || undefined, occurred_at: date, ...parseRef(sourceVal) };
    }
    setBusy(true);
    try {
      await api('/api/entries', { body });
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

  const acctOpts = accounts.map((a) => (
    <option value={`a:${a.id}`}>
      {a.name} · ₹{a.balance.toLocaleString('en-IN')}
    </option>
  ));
  const cardOpts = cards.map((c) => (
    <option value={`c:${c.id}`}>💳 {c.name} · ₹{c.available.toLocaleString('en-IN')} left</option>
  ));

  // Source options: expense can use accounts+cards; income/transfer-from use accounts only.
  const sourceOpts = type === 'expense' ? [...acctOpts, ...cardOpts] : acctOpts;
  const sourceLabel = type === 'income' ? 'Deposit to' : type === 'transfer' ? 'From' : 'Paid from';

  return (
    <form class="card glass quick-add" onSubmit={submit}>
      <div class="seg">
        <button type="button" class={type === 'expense' ? 'on expense' : ''} onClick={() => setType('expense')}>
          Expense
        </button>
        <button type="button" class={type === 'income' ? 'on income' : ''} onClick={() => setType('income')}>
          Income
        </button>
        <button type="button" class={type === 'transfer' ? 'on' : ''} onClick={() => setType('transfer')}>
          Transfer
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

      {type !== 'transfer' && (
        <div class="field-group">
          <span class="field-label">Category</span>
          <select class="field" value={category} onChange={(e) => setCategory((e.target as HTMLSelectElement).value)}>
            {categories.map((c) => (
              <option value={c}>{c}</option>
            ))}
          </select>
        </div>
      )}

      <div class="field-group">
        <span class="field-label">{sourceLabel}</span>
        <select class="field" value={sourceVal} onChange={(e) => setSourceVal((e.target as HTMLSelectElement).value)}>
          {sourceOpts}
        </select>
      </div>

      {type === 'transfer' && (
        <div class="field-group">
          <span class="field-label">To (account or card to pay)</span>
          <select class="field" value={toVal} onChange={(e) => setToVal((e.target as HTMLSelectElement).value)}>
            {acctOpts}
            {cardOpts}
          </select>
        </div>
      )}

      {showEmi && (
        <div class="emi-box">
          <label class="emi-toggle">
            <input type="checkbox" checked={emi} onChange={(e) => setEmi((e.target as HTMLInputElement).checked)} />
            <span>Pay as EMI</span>
          </label>
          {emi && (
            <div class="account-form-row">
              <label class="inline-field">
                <span class="field-label">Months</span>
                <input class="field" type="number" min="2" value={months} onInput={(e) => setMonths((e.target as HTMLInputElement).value)} />
              </label>
              <label class="inline-field">
                <span class="field-label">Monthly ₹ (optional)</span>
                <input
                  class="field"
                  type="number"
                  value={monthly}
                  placeholder={amount && months ? String(Math.round((parseFloat(amount) / parseInt(months, 10)) * 100) / 100) : 'auto'}
                  onInput={(e) => setMonthly((e.target as HTMLInputElement).value)}
                />
              </label>
            </div>
          )}
        </div>
      )}

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
        {busy
          ? 'Saving…'
          : flash ||
            (showEmi && emi ? 'Add EMI' : type === 'expense' ? 'Add expense' : type === 'income' ? 'Add income' : 'Transfer')}
      </button>
    </form>
  );
}
