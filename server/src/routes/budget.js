import { z } from 'zod';
import { db } from '../db.js';
import { requireAuth } from '../auth.js';
import { todayIST } from '../time.js';

// Advisory only — this module never writes to `entries` or affects balances/reports.

const DEFAULT_BUCKETS = {
  Food: 'need', Groceries: 'need', Bills: 'need', Health: 'need', Transport: 'need',
  Shopping: 'wants', Entertainment: 'wants', Other: 'wants', Salary: 'need',
};
const HISTORY_MONTHS = 3;

const toPaise = (r) => Math.round(r * 100);
const toRupees = (p) => p / 100;

const bucketVal = z.enum(['need', 'wants', 'savings']);
const putBody = z.object({
  monthly_income: z.number().nonnegative().finite().optional(),
  custom_targets: z.record(z.string(), z.number().nonnegative().finite()).optional(),
  buckets: z.record(z.string(), bucketVal).optional(),
});

const getPrefs = db.prepare(`SELECT monthly_income_paise, custom_targets_json FROM user_prefs WHERE user_id = ?`);
const getMeta = db.prepare(`SELECT category, bucket FROM category_meta WHERE user_id = ?`);

function readBudget(userId) {
  const prefs = getPrefs.get(userId) || { monthly_income_paise: 0, custom_targets_json: '{}' };
  const stored = {};
  for (const r of getMeta.all(userId)) stored[r.category] = r.bucket;
  return {
    monthly_income: toRupees(prefs.monthly_income_paise),
    custom_targets: JSON.parse(prefs.custom_targets_json || '{}'),
    buckets: { ...DEFAULT_BUCKETS, ...stored },
  };
}

/** First day of the month `n` months before the current IST month, as 'YYYY-MM-01'. */
function monthsAgoStart(n) {
  const [y, m] = todayIST().split('-').map(Number);
  const idx = m - 1 - n;
  const yy = y + Math.floor(idx / 12);
  const mm = ((idx % 12) + 12) % 12;
  return `${yy}-${String(mm + 1).padStart(2, '0')}-01`;
}

export default async function budgetRoutes(app) {
  app.addHook('preHandler', requireAuth);

  app.get('/api/budget', async (req) => readBudget(req.user.id));

  app.put('/api/budget', async (req, reply) => {
    const parsed = putBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid input' });
    const d = parsed.data;
    const current = readBudget(req.user.id);
    const income = d.monthly_income != null ? toPaise(d.monthly_income) : toPaise(current.monthly_income);
    const targets = d.custom_targets ?? current.custom_targets;

    const tx = db.transaction(() => {
      db.prepare(
        `INSERT INTO user_prefs (user_id, monthly_income_paise, custom_targets_json)
         VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET monthly_income_paise = excluded.monthly_income_paise,
           custom_targets_json = excluded.custom_targets_json`
      ).run(req.user.id, income, JSON.stringify(targets));
      if (d.buckets) {
        db.prepare(`DELETE FROM category_meta WHERE user_id = ?`).run(req.user.id);
        const ins = db.prepare(`INSERT INTO category_meta (user_id, category, bucket) VALUES (?, ?, ?)`);
        for (const [cat, bucket] of Object.entries(d.buckets)) ins.run(req.user.id, cat, bucket);
      }
    });
    tx();
    return readBudget(req.user.id);
  });

  app.get('/api/budget/suggestion', async (req) => {
    const { monthly_income, custom_targets, buckets } = readBudget(req.user.id);

    // History: average monthly spend per category over the last N calendar months.
    const since = monthsAgoStart(HISTORY_MONTHS - 1); // includes current month
    const rows = db
      .prepare(
        `SELECT category, COALESCE(SUM(amount_paise),0) AS p FROM entries
         WHERE user_id = ? AND type = 'expense' AND occurred_at >= ? GROUP BY category`
      )
      .all(req.user.id, since);
    const byCategory = rows
      .map((r) => ({
        category: r.category,
        avg_monthly: toRupees(Math.round(r.p / HISTORY_MONTHS)),
        bucket: buckets[r.category] || 'wants',
      }))
      .sort((a, b) => b.avg_monthly - a.avg_monthly);
    const byBucket = { need: 0, wants: 0, savings: 0 };
    for (const c of byCategory) byBucket[c.bucket] += c.avg_monthly;
    const avgTotal = byCategory.reduce((s, c) => s + c.avg_monthly, 0);

    return {
      monthly_income,
      rule: {
        needs: Math.round(monthly_income * 0.5),
        wants: Math.round(monthly_income * 0.3),
        savings: Math.round(monthly_income * 0.2),
      },
      history: { months_analyzed: HISTORY_MONTHS, by_bucket: byBucket, by_category: byCategory, avg_total: avgTotal },
      custom_targets,
      suggested_savings: Math.round(monthly_income - avgTotal),
    };
  });
}
