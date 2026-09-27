import { useEffect, useState } from 'preact/hooks';
import { api, type Account, type Balances, type CreditCard, type Emi } from '../api';
import { money } from '../format';
import { ConfirmDialog } from './ConfirmDialog';

export function Accounts({ version, onChange }: { version: number; onChange: () => void }) {
  const [data, setData] = useState<Balances | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payCard, setPayCard] = useState<CreditCard | null>(null);
  const [pendingEmi, setPendingEmi] = useState<Emi | null>(null);
  const [deletingEmi, setDeletingEmi] = useState(false);
  const [localBump, setLocalBump] = useState(0);

  async function confirmDeleteEmi() {
    if (!pendingEmi) return;
    setDeletingEmi(true);
    try {
      await api(`/api/emis/${pendingEmi.id}`, { method: 'DELETE' });
      setPendingEmi(null);
      setLocalBump((n) => n + 1);
      onChange();
    } finally {
      setDeletingEmi(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    setError('');
    api<Balances>('/api/balances')
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        setError((e as Error).message);
        setLoading(false);
      });
  }, [version, localBump]);

  if (loading) return <div class="empty">Loading…</div>;
  if (error) return <div class="error center">{error}</div>;
  if (!data) return <div class="empty">No data.</div>;

  const activeAccounts = data.accounts.filter((a) => !a.archived);
  const activeCards = data.cards.filter((c) => !c.archived);
  const activeEmis = data.emis.filter((e) => !e.done);

  return (
    <>
      <div class="card glass total-card">
        <span class="cap">Money on hand</span>
        <span class="total-value">{money(data.total_assets)}</span>
      </div>

      <div class="section">
        <div class="section-label">Accounts</div>
        <div class="list glass">
          {activeAccounts.length === 0 ? (
            <div class="empty">No accounts yet — add one in Settings.</div>
          ) : (
            activeAccounts.map((a) => (
              <div class="row">
                <div class={`row-dot ${a.type === 'cash' ? 'income' : 'transfer'}`}>
                  <i />
                </div>
                <div class="row-main">
                  <div class="row-cat">
                    {a.name}
                    {a.is_default && <span class="pill-tag">Default</span>}
                  </div>
                  <div class="row-meta">{a.type === 'cash' ? 'Cash' : 'Bank account'}</div>
                </div>
                <div class="row-right">
                  <div class="row-amount">{money(a.balance)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {activeCards.length > 0 && (
        <div class="section">
          <div class="section-label">Credit cards</div>
          {activeCards.map((c) => (
            <div class="card glass card-tile">
              <div class="card-tile-head">
                <span class="card-name">💳 {c.name}</span>
                <button class="mini-btn" onClick={() => setPayCard(c)}>
                  Pay bill
                </button>
              </div>
              <div class="card-stats">
                <div>
                  <span class="cap">Outstanding</span>
                  <span class="card-out">{money(c.outstanding)}</span>
                </div>
                <div>
                  <span class="cap">Available</span>
                  <span class="card-avail">{money(c.available)}</span>
                </div>
              </div>
              <div class="card-meter">
                <div
                  class="card-meter-fill"
                  style={{ width: `${Math.min(100, c.credit_limit ? (c.outstanding / c.credit_limit) * 100 : 0)}%` }}
                />
              </div>
              <div class="row-meta">
                {c.last_statement_amount > 0
                  ? `${money(c.last_statement_amount)} due by ${c.due_date}`
                  : `No bill due · limit ${money(c.credit_limit)}`}
                {c.current_cycle_spend > 0 ? ` · ${money(c.current_cycle_spend)} this cycle` : ''}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeEmis.length > 0 && (
        <div class="section">
          <div class="section-label">Active EMIs</div>
          <div class="list glass">
            {activeEmis.map((e) => (
              <div class="row">
                <div class="row-main">
                  <div class="row-cat">
                    {e.card_name} · {money(e.monthly)}/mo
                  </div>
                  <div class="row-meta">
                    {e.elapsed}/{e.months} paid · {money(e.remaining_amount)} left · till {e.end_month}
                  </div>
                </div>
                <div class="row-right">
                  <button class="icon-circle danger" title="Remove EMI" onClick={() => setPendingEmi(e)}>
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {pendingEmi && (
        <ConfirmDialog
          title="Remove EMI?"
          message={`This removes the ${money(pendingEmi.principal)} EMI on ${pendingEmi.card_name} and its original purchase from your records.`}
          confirmLabel="Remove"
          danger
          busy={deletingEmi}
          onConfirm={confirmDeleteEmi}
          onCancel={() => setPendingEmi(null)}
        />
      )}

      {payCard && (
        <PayBillModal
          card={payCard}
          accounts={activeAccounts}
          onClose={() => setPayCard(null)}
          onPaid={() => {
            setPayCard(null);
            setLocalBump((n) => n + 1);
            onChange();
          }}
        />
      )}
    </>
  );
}

function PayBillModal({
  card,
  accounts,
  onClose,
  onPaid,
}: {
  card: CreditCard;
  accounts: Account[];
  onClose: () => void;
  onPaid: () => void;
}) {
  const [amount, setAmount] = useState(card.outstanding > 0 ? String(card.outstanding) : '');
  const [fromId, setFromId] = useState<number | null>(accounts.find((a) => a.is_default)?.id ?? accounts[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function pay(e: Event) {
    e.preventDefault();
    const value = parseFloat(amount);
    if (!(value > 0)) return setError('Enter an amount');
    if (!fromId) return setError('Pick an account');
    setBusy(true);
    setError('');
    try {
      await api('/api/entries', {
        body: { type: 'transfer', amount: value, from_account_id: fromId, to_card_id: card.id },
      });
      onPaid();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div class="modal-backdrop" onClick={onClose}>
      <form class="modal glass" onClick={(e) => e.stopPropagation()} onSubmit={pay}>
        <h3>Pay {card.name} bill</h3>
        <div class="field-group">
          <span class="field-label">Amount (₹)</span>
          <input class="field" type="number" step="0.01" min="0" value={amount} onInput={(e) => setAmount((e.target as HTMLInputElement).value)} autofocus />
        </div>
        <div class="field-group">
          <span class="field-label">Pay from</span>
          <select class="field" value={fromId ?? ''} onChange={(e) => setFromId(Number((e.target as HTMLSelectElement).value) || null)}>
            {accounts.map((a) => (
              <option value={a.id}>
                {a.name} · ₹{a.balance.toLocaleString('en-IN')}
              </option>
            ))}
          </select>
        </div>
        {error && <div class="error">{error}</div>}
        <div class="modal-actions">
          <button type="button" class="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" class="btn-primary" disabled={busy}>
            {busy ? 'Paying…' : 'Pay bill'}
          </button>
        </div>
      </form>
    </div>
  );
}
