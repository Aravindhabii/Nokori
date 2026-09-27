import { useEffect, useState } from 'preact/hooks';
import { api } from '../api';
import { money } from '../format';

type Bucket = 'need' | 'wants' | 'savings';
interface Suggestion {
  monthly_income: number;
  rule: { needs: number; wants: number; savings: number };
  history: {
    months_analyzed: number;
    by_bucket: Record<Bucket, number>;
    by_category: { category: string; avg_monthly: number; bucket: Bucket }[];
    avg_total: number;
  };
  custom_targets: Record<string, number>;
  suggested_savings: number;
}
interface BudgetData {
  monthly_income: number;
  custom_targets: Record<string, number>;
  buckets: Record<string, Bucket>;
}

export function Budget() {
  const [sug, setSug] = useState<Suggestion | null>(null);
  const [buckets, setBuckets] = useState<Record<string, Bucket>>({});
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [income, setIncome] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState('');

  async function loadAll() {
    const [b, s] = await Promise.all([
      api<BudgetData>('/api/budget'),
      api<Suggestion>('/api/budget/suggestion'),
    ]);
    setBuckets(b.buckets);
    setIncome(b.monthly_income ? String(b.monthly_income) : '');
    setTargets(Object.fromEntries(Object.entries(b.custom_targets).map(([k, v]) => [k, String(v)])));
    setSug(s);
    setLoading(false);
  }
  useEffect(() => {
    loadAll();
  }, []);

  async function save() {
    setSaving(true);
    try {
      const custom_targets: Record<string, number> = {};
      for (const [k, v] of Object.entries(targets)) {
        const n = parseFloat(v);
        if (n > 0) custom_targets[k] = n;
      }
      await api('/api/budget', {
        method: 'PUT',
        body: { monthly_income: parseFloat(income) || 0, custom_targets, buckets },
      });
      await loadAll();
      setFlash('Saved ✓');
      setTimeout(() => setFlash(''), 1500);
    } finally {
      setSaving(false);
    }
  }

  if (loading || !sug) return <div class="empty">Loading…</div>;

  const avgByCat = Object.fromEntries(sug.history.by_category.map((c) => [c.category, c.avg_monthly]));
  const categories = Object.keys(buckets).filter((c) => c !== 'Salary');

  // Compute the plan LIVE from what's typed (server history stays fixed) so it updates
  // as you type, not only after "Save plan".
  const inc = parseFloat(income) || 0;
  const rule = { needs: inc * 0.5, wants: inc * 0.3, savings: inc * 0.2 };
  const avgTotal = sug.history.avg_total;
  const suggestedSavings = inc - avgTotal;

  return (
    <>
      <div class="hint">Planning only — nothing here affects your entries, balances, or reports.</div>

      <div class="card glass">
        <div class="field-group">
          <span class="field-label">Monthly income (₹)</span>
          <input
            class="field"
            type="number"
            value={income}
            placeholder="e.g. 80000"
            onInput={(e) => setIncome((e.target as HTMLInputElement).value)}
          />
        </div>
      </div>

      <div class="section">
        <div class="section-label">50 / 30 / 20 plan</div>
        <div class="stats">
          <div class="stat glass">
            <span class="stat-label">NEEDS 50%</span>
            <span class="stat-value">{money(rule.needs)}</span>
          </div>
          <div class="stat glass">
            <span class="stat-label">WANTS 30%</span>
            <span class="stat-value">{money(rule.wants)}</span>
          </div>
          <div class="stat glass">
            <span class="stat-label">SAVE 20%</span>
            <span class="stat-value income">{money(rule.savings)}</span>
          </div>
        </div>
        <div class="hint" style={{ textAlign: 'left', padding: '0 4px' }}>
          A guideline: aim to keep <strong>needs ≤ {money(rule.needs)}</strong>, <strong>wants ≤ {money(rule.wants)}</strong>,
          and save/invest <strong>≥ {money(rule.savings)}</strong> each month.
        </div>
      </div>

      <div class="card glass total-card">
        <span class="cap">Suggested to save / invest (income − recent avg spend)</span>
        <span class={`total-value ${suggestedSavings < 0 ? 'over' : ''}`}>{money(suggestedSavings)}</span>
        <span class="row-meta">
          {inc > 0
            ? `₹${inc.toLocaleString('en-IN')} income − ₹${avgTotal.toLocaleString('en-IN')} avg spend (last ${sug.history.months_analyzed} mo)`
            : 'Enter your monthly income above to see this'}
        </span>
      </div>

      <div class="section">
        <div class="section-label">Categories — tag &amp; target</div>
        <div class="list glass budget-list">
          <div class="budget-row budget-head">
            <span>Category</span>
            <span>Avg/mo</span>
            <span>Bucket</span>
            <span>Target</span>
          </div>
          {categories.map((cat) => (
            <div class="budget-row">
              <span class="bcat">{cat}</span>
              <span class="bavg">{money(avgByCat[cat] || 0)}</span>
              <select
                class="field bsel"
                value={buckets[cat]}
                onChange={(e) => setBuckets({ ...buckets, [cat]: (e.target as HTMLSelectElement).value as Bucket })}
              >
                <option value="need">Need</option>
                <option value="wants">Wants</option>
                <option value="savings">Savings</option>
              </select>
              <input
                class="field btarget"
                type="number"
                placeholder="—"
                value={targets[cat] ?? ''}
                onInput={(e) => setTargets({ ...targets, [cat]: (e.target as HTMLInputElement).value })}
              />
            </div>
          ))}
        </div>
      </div>

      <button class="btn-primary" disabled={saving} onClick={save}>
        {saving ? 'Saving…' : flash || 'Save plan'}
      </button>
    </>
  );
}
