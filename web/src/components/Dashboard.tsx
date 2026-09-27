import { useEffect, useState } from 'preact/hooks';
import { api, type Summary } from '../api';
import { money, monthLabel } from '../format';

const PALETTE = ['#3cd6bc', '#8a96ff', '#f5b34a', '#f07070', '#c98cf0', '#5ab8f5', '#9aa3b8'];

export function Dashboard({ version }: { version: number }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    api<Summary>('/api/summary')
      .then((s) => {
        setSummary(s);
        setLoading(false);
      })
      .catch((e) => {
        setError((e as Error).message);
        setLoading(false);
      });
  }, [version]);

  if (loading) return <div class="empty">Loading…</div>;
  if (error) return <div class="error center">{error}</div>;
  if (!summary) return <div class="empty">No data.</div>;

  const { totals, byCategory, byMonth } = summary;

  // Donut: conic-gradient stops from expense category shares. Guard divide-by-zero.
  const totE = byCategory.reduce((a, c) => a + c.amount, 0);
  let acc = 0;
  const stops = byCategory.map((c, i) => {
    const start = acc;
    acc += totE > 0 ? (c.amount / totE) * 360 : 0;
    return `${PALETTE[i % PALETTE.length]} ${start}deg ${acc}deg`;
  });
  const donutBg = totE > 0 ? `conic-gradient(${stops.join(',')})` : 'var(--glass-bg)';
  const legend = byCategory.map((c, i) => ({
    name: c.category,
    color: PALETTE[i % PALETTE.length],
    pct: totE > 0 ? Math.round((c.amount / totE) * 100) + '%' : '0%',
  }));

  // Bars: heights relative to the max income/expense across the returned months.
  const max = Math.max(1, ...byMonth.flatMap((m) => [m.income, m.expense]));
  const barH = (v: number) => (v > 0 ? `${Math.max(4, (v / max) * 100)}%` : '4px');

  return (
    <>
      <div class="stats">
        <div class="stat glass">
          <span class="stat-label">INCOME</span>
          <span class="stat-value income">{money(totals.income)}</span>
        </div>
        <div class="stat glass">
          <span class="stat-label">EXPENSE</span>
          <span class="stat-value expense">{money(totals.expense)}</span>
        </div>
        <div class="stat glass">
          <span class="stat-label">NET</span>
          <span class={`stat-value ${totals.net < 0 ? 'expense' : 'income'}`}>{money(totals.net)}</span>
        </div>
      </div>

      <div class="report-card glass">
        <div class="card-title">Spending by category</div>
        {byCategory.length ? (
          <div class="donut-wrap">
            <div class="donut" style={{ background: donutBg }}>
              <div class="donut-hole">
                <span class="cap">Spent</span>
                <span class="val">{money(totals.expense)}</span>
              </div>
            </div>
            <div class="legend">
              {legend.map((l) => (
                <div class="legend-item">
                  <span class="swatch" style={{ background: l.color }} />
                  <span class="name">{l.name}</span>
                  <span class="pct">{l.pct}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div class="empty">No expenses yet.</div>
        )}
      </div>

      <div class="report-card glass">
        <div class="chart-head">
          <div class="card-title">Monthly income vs expense</div>
          <div class="chart-legend">
            <span>
              <span class="swatch" style={{ background: '#4fd49a' }} />
              Income
            </span>
            <span>
              <span class="swatch" style={{ background: '#f07070' }} />
              Expense
            </span>
          </div>
        </div>
        {byMonth.length ? (
          <div class="bars">
            {byMonth.map((m) => (
              <div class="bar-col">
                <div class="bar-pair">
                  <div class="bar income" style={{ height: barH(m.income) }} />
                  <div class="bar expense" style={{ height: barH(m.expense) }} />
                </div>
                <div class="bar-label">{monthLabel(m.month)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div class="empty">No data yet.</div>
        )}
      </div>
    </>
  );
}
