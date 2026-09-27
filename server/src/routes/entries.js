import { z } from 'zod';
import { db } from '../db.js';
import { requireAuth } from '../auth.js';
import { todayIST, nowISO, isValidDate } from '../time.js';

const DEFAULT_CATEGORIES = [
  'Food', 'Transport', 'Groceries', 'Bills', 'Shopping',
  'Health', 'Entertainment', 'Salary', 'Other',
];

const dateStr = z.string().refine(isValidDate, 'Expected YYYY-MM-DD');

const entryBody = z.object({
  type: z.enum(['income', 'expense']),
  amount: z.number().positive().finite(),
  category: z.string().trim().min(1).max(40),
  note: z.string().trim().max(280).optional().nullable(),
  occurred_at: dateStr.optional(),
});
const entryPatch = entryBody.partial();

const toPaise = (rupees) => Math.round(rupees * 100);
const toRupees = (paise) => paise / 100;

const rowToEntry = (r) => ({
  id: r.id,
  type: r.type,
  amount: toRupees(r.amount_paise),
  category: r.category,
  note: r.note,
  occurred_at: r.occurred_at,
  created_at: r.created_at,
});

const insertEntry = db.prepare(
  `INSERT INTO entries (user_id, type, amount_paise, category, note, occurred_at, created_at)
   VALUES (@user_id, @type, @amount_paise, @category, @note, @occurred_at, @created_at)`
);
const getEntry = db.prepare(`SELECT * FROM entries WHERE id = ? AND user_id = ?`);
const deleteEntry = db.prepare(`DELETE FROM entries WHERE id = ? AND user_id = ?`);

export default async function entriesRoutes(app) {
  app.addHook('preHandler', requireAuth);

  app.get('/api/categories', async () => ({ categories: DEFAULT_CATEGORIES }));

  app.post('/api/entries', async (req, reply) => {
    const parsed = entryBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });
    const d = parsed.data;
    const info = insertEntry.run({
      user_id: req.user.id,
      type: d.type,
      amount_paise: toPaise(d.amount),
      category: d.category,
      note: d.note || null,
      occurred_at: d.occurred_at || todayIST(),
      created_at: nowISO(),
    });
    return reply.code(201).send(rowToEntry(getEntry.get(info.lastInsertRowid, req.user.id)));
  });

  app.get('/api/entries', async (req) => {
    const { from, to, type, category } = req.query;
    const where = ['user_id = ?'];
    const params = [req.user.id];
    if (from && isValidDate(from)) { where.push('occurred_at >= ?'); params.push(from); }
    if (to && isValidDate(to)) { where.push('occurred_at <= ?'); params.push(to); }
    if (type === 'income' || type === 'expense') { where.push('type = ?'); params.push(type); }
    if (category) { where.push('category = ?'); params.push(category); }
    const rows = db
      .prepare(`SELECT * FROM entries WHERE ${where.join(' AND ')} ORDER BY occurred_at DESC, id DESC`)
      .all(...params);
    return { entries: rows.map(rowToEntry) };
  });

  app.patch('/api/entries/:id', async (req, reply) => {
    const existing = getEntry.get(req.params.id, req.user.id);
    if (!existing) return reply.code(404).send({ error: 'Not found' });
    const parsed = entryPatch.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });
    const d = parsed.data;
    const merged = {
      type: d.type ?? existing.type,
      amount_paise: d.amount != null ? toPaise(d.amount) : existing.amount_paise,
      category: d.category ?? existing.category,
      note: d.note !== undefined ? (d.note || null) : existing.note,
      occurred_at: d.occurred_at ?? existing.occurred_at,
    };
    db.prepare(
      `UPDATE entries SET type=@type, amount_paise=@amount_paise, category=@category,
       note=@note, occurred_at=@occurred_at WHERE id=@id AND user_id=@user_id`
    ).run({ ...merged, id: existing.id, user_id: req.user.id });
    return rowToEntry(getEntry.get(existing.id, req.user.id));
  });

  app.delete('/api/entries/:id', async (req, reply) => {
    const info = deleteEntry.run(req.params.id, req.user.id);
    if (info.changes === 0) return reply.code(404).send({ error: 'Not found' });
    return { ok: true };
  });

  app.get('/api/summary', async (req) => {
    const { from, to } = req.query;
    const where = ['user_id = ?'];
    const params = [req.user.id];
    if (from && isValidDate(from)) { where.push('occurred_at >= ?'); params.push(from); }
    if (to && isValidDate(to)) { where.push('occurred_at <= ?'); params.push(to); }
    const clause = where.join(' AND ');

    const totals = db
      .prepare(`SELECT type, COALESCE(SUM(amount_paise),0) AS paise FROM entries WHERE ${clause} GROUP BY type`)
      .all(...params);
    const income = toRupees(totals.find((t) => t.type === 'income')?.paise || 0);
    const expense = toRupees(totals.find((t) => t.type === 'expense')?.paise || 0);

    const byCategory = db
      .prepare(
        `SELECT category, COALESCE(SUM(amount_paise),0) AS paise FROM entries
         WHERE ${clause} AND type='expense' GROUP BY category ORDER BY paise DESC`
      )
      .all(...params)
      .map((r) => ({ category: r.category, amount: toRupees(r.paise) }));

    // occurred_at is an IST date string, so substr(1,7) = 'YYYY-MM' groups by IST month.
    const byMonth = db
      .prepare(
        `SELECT substr(occurred_at,1,7) AS month, type, COALESCE(SUM(amount_paise),0) AS paise
         FROM entries WHERE ${clause} GROUP BY month, type ORDER BY month`
      )
      .all(...params);
    const monthMap = {};
    for (const r of byMonth) {
      monthMap[r.month] ??= { month: r.month, income: 0, expense: 0 };
      monthMap[r.month][r.type] = toRupees(r.paise);
    }

    return {
      totals: { income, expense, net: income - expense },
      byCategory,
      byMonth: Object.values(monthMap),
    };
  });
}
