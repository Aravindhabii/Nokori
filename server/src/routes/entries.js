import { z } from 'zod';
import { db } from '../db.js';
import { requireAuth } from '../auth.js';
import { todayIST, nowISO, isValidDate } from '../time.js';
import { getDefaultAccountId } from '../money.js';

const DEFAULT_CATEGORIES = [
  'Food', 'Transport', 'Groceries', 'Bills', 'Shopping',
  'Health', 'Entertainment', 'Salary', 'Other',
];

const dateStr = z.string().refine(isValidDate, 'Expected YYYY-MM-DD');
const id = z.number().int().positive();

const entryBody = z.object({
  type: z.enum(['income', 'expense', 'transfer']).default('expense'),
  amount: z.number().positive().finite(),
  category: z.string().trim().min(1).max(40).optional().nullable(),
  note: z.string().trim().max(280).optional().nullable(),
  occurred_at: dateStr.optional(),
  account_id: id.optional(),
  card_id: id.optional(),
  from_account_id: id.optional(),
  to_account_id: id.optional(),
  to_card_id: id.optional(),
});
const entryPatch = entryBody.partial();

const toPaise = (rupees) => Math.round(rupees * 100);
const toRupees = (paise) => paise / 100;

const accountOwned = db.prepare(`SELECT 1 FROM accounts WHERE id = ? AND user_id = ?`);
const cardOwned = db.prepare(`SELECT 1 FROM credit_cards WHERE id = ? AND user_id = ?`);

const selectEntry = `
  SELECT e.*,
    sa.name AS account_name, sc.name AS card_name,
    fa.name AS from_account_name, ta.name AS to_account_name, tc.name AS to_card_name
  FROM entries e
  LEFT JOIN accounts sa     ON sa.id = e.account_id
  LEFT JOIN credit_cards sc ON sc.id = e.card_id
  LEFT JOIN accounts fa     ON fa.id = e.from_account_id
  LEFT JOIN accounts ta     ON ta.id = e.to_account_id
  LEFT JOIN credit_cards tc ON tc.id = e.to_card_id`;

const getEntry = db.prepare(`${selectEntry} WHERE e.id = ? AND e.user_id = ?`);

function rowToEntry(r) {
  let source_label = null;
  let dest_label = null;
  if (r.type === 'income') dest_label = r.account_name;
  else if (r.type === 'expense') source_label = r.account_name || r.card_name;
  else if (r.type === 'transfer') {
    source_label = r.from_account_name;
    dest_label = r.to_account_name || r.to_card_name;
  }
  return {
    id: r.id,
    type: r.type,
    amount: toRupees(r.amount_paise),
    category: r.category,
    note: r.note,
    occurred_at: r.occurred_at,
    created_at: r.created_at,
    account_id: r.account_id,
    card_id: r.card_id,
    from_account_id: r.from_account_id,
    to_account_id: r.to_account_id,
    to_card_id: r.to_card_id,
    emi_plan_id: r.emi_plan_id,
    source_label,
    dest_label,
  };
}

const insertEntry = db.prepare(`
  INSERT INTO entries
    (user_id, type, amount_paise, category, note, occurred_at, created_at,
     account_id, card_id, from_account_id, to_account_id, to_card_id, emi_plan_id)
  VALUES
    (@user_id, @type, @amount_paise, @category, @note, @occurred_at, @created_at,
     @account_id, @card_id, @from_account_id, @to_account_id, @to_card_id, @emi_plan_id)
`);

/** Validate that referenced accounts/cards belong to the user. Returns error string or null. */
function checkRefs(userId, refs) {
  for (const [k, v] of Object.entries(refs)) {
    if (v == null) continue;
    const ok = k.includes('card') ? cardOwned.get(v, userId) : accountOwned.get(v, userId);
    if (!ok) return `Unknown ${k}`;
  }
  return null;
}

export default async function entriesRoutes(app) {
  app.addHook('preHandler', requireAuth);

  app.get('/api/categories', async () => ({ categories: DEFAULT_CATEGORIES }));

  app.post('/api/entries', async (req, reply) => {
    const parsed = entryBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });
    const d = parsed.data;

    // Build the typed row, defaulting the source to the user's default account.
    const row = {
      user_id: req.user.id,
      type: d.type,
      amount_paise: toPaise(d.amount),
      category: d.category || null,
      note: d.note || null,
      occurred_at: d.occurred_at || todayIST(),
      created_at: nowISO(),
      account_id: null, card_id: null,
      from_account_id: null, to_account_id: null, to_card_id: null,
      emi_plan_id: null,
    };

    if (d.type === 'income') {
      row.account_id = d.account_id ?? getDefaultAccountId(req.user.id);
      if (!row.account_id) return reply.code(400).send({ error: 'No account to deposit into' });
      if (!row.category) return reply.code(400).send({ error: 'Category required' });
    } else if (d.type === 'expense') {
      if (d.card_id) row.card_id = d.card_id;
      else row.account_id = d.account_id ?? getDefaultAccountId(req.user.id);
      if (!row.account_id && !row.card_id)
        return reply.code(400).send({ error: 'No payment source' });
      if (!row.category) return reply.code(400).send({ error: 'Category required' });
    } else {
      // transfer
      row.from_account_id = d.from_account_id;
      if (!row.from_account_id) return reply.code(400).send({ error: 'Transfer needs a source account' });
      if (d.to_card_id) row.to_card_id = d.to_card_id;
      else row.to_account_id = d.to_account_id;
      if (!row.to_account_id && !row.to_card_id)
        return reply.code(400).send({ error: 'Transfer needs a destination' });
      if (row.to_account_id === row.from_account_id)
        return reply.code(400).send({ error: "Can't transfer to the same account" });
    }

    const refErr = checkRefs(req.user.id, {
      account_id: row.account_id, card_id: row.card_id,
      from_account_id: row.from_account_id, to_account_id: row.to_account_id, to_card_id: row.to_card_id,
    });
    if (refErr) return reply.code(400).send({ error: refErr });

    const info = insertEntry.run(row);
    return reply.code(201).send(rowToEntry(getEntry.get(info.lastInsertRowid, req.user.id)));
  });

  app.get('/api/entries', async (req) => {
    const { from, to, type, category } = req.query;
    const where = ['e.user_id = ?'];
    const params = [req.user.id];
    if (from && isValidDate(from)) { where.push('e.occurred_at >= ?'); params.push(from); }
    if (to && isValidDate(to)) { where.push('e.occurred_at <= ?'); params.push(to); }
    if (type === 'income' || type === 'expense' || type === 'transfer') { where.push('e.type = ?'); params.push(type); }
    if (category) { where.push('e.category = ?'); params.push(category); }
    const rows = db
      .prepare(`${selectEntry} WHERE ${where.join(' AND ')} ORDER BY e.occurred_at DESC, e.id DESC`)
      .all(...params);
    return { entries: rows.map(rowToEntry) };
  });

  app.patch('/api/entries/:id', async (req, reply) => {
    const existing = getEntry.get(req.params.id, req.user.id);
    if (!existing) return reply.code(404).send({ error: 'Not found' });
    const parsed = entryPatch.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });
    const d = parsed.data;

    // Merge onto the existing row, keeping the entry's type fixed. CHECK enforces validity.
    const merged = {
      amount_paise: d.amount != null ? toPaise(d.amount) : existing.amount_paise,
      category: d.category !== undefined ? d.category || null : existing.category,
      note: d.note !== undefined ? d.note || null : existing.note,
      occurred_at: d.occurred_at ?? existing.occurred_at,
      account_id: d.account_id !== undefined ? d.account_id : existing.account_id,
      card_id: d.card_id !== undefined ? d.card_id : existing.card_id,
      from_account_id: d.from_account_id !== undefined ? d.from_account_id : existing.from_account_id,
      to_account_id: d.to_account_id !== undefined ? d.to_account_id : existing.to_account_id,
      to_card_id: d.to_card_id !== undefined ? d.to_card_id : existing.to_card_id,
    };
    const refErr = checkRefs(req.user.id, merged);
    if (refErr) return reply.code(400).send({ error: refErr });

    try {
      db.prepare(
        `UPDATE entries SET amount_paise=@amount_paise, category=@category, note=@note,
           occurred_at=@occurred_at, account_id=@account_id, card_id=@card_id,
           from_account_id=@from_account_id, to_account_id=@to_account_id, to_card_id=@to_card_id
         WHERE id=@id AND user_id=@user_id`
      ).run({ ...merged, id: existing.id, user_id: req.user.id });
    } catch {
      return reply.code(400).send({ error: 'Invalid combination for this entry type' });
    }
    return rowToEntry(getEntry.get(existing.id, req.user.id));
  });

  app.delete('/api/entries/:id', async (req, reply) => {
    const info = db.prepare(`DELETE FROM entries WHERE id = ? AND user_id = ?`).run(req.params.id, req.user.id);
    if (info.changes === 0) return reply.code(404).send({ error: 'Not found' });
    return { ok: true };
  });

  app.get('/api/summary', async (req) => {
    const { from, to } = req.query;
    // Category/spending reports use income+expense only (transfers move money, not spend it).
    const where = ["user_id = ?", "type IN ('income','expense')"];
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
