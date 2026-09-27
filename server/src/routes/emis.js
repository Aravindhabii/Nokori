import { z } from 'zod';
import { db } from '../db.js';
import { requireAuth } from '../auth.js';
import { todayIST, nowISO, isValidDate } from '../time.js';
import { getEmis } from '../money.js';

const toPaise = (rupees) => Math.round(rupees * 100);

const createBody = z.object({
  card_id: z.number().int().positive(),
  principal: z.number().positive().finite(),
  months: z.number().int().min(2).max(120),
  monthly: z.number().positive().finite().optional(),
  category: z.string().trim().min(1).max(40),
  note: z.string().trim().max(280).optional().nullable(),
  occurred_at: z.string().refine(isValidDate, 'Expected YYYY-MM-DD').optional(),
});

const cardOwned = db.prepare(`SELECT 1 FROM credit_cards WHERE id = ? AND user_id = ?`);

export default async function emisRoutes(app) {
  app.addHook('preHandler', requireAuth);

  app.get('/api/emis', async (req) => ({ emis: getEmis(req.user.id) }));

  app.post('/api/emis', async (req, reply) => {
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });
    const d = parsed.data;
    if (!cardOwned.get(d.card_id, req.user.id)) return reply.code(400).send({ error: 'Unknown card' });

    const occurred = d.occurred_at || todayIST();
    const principalPaise = toPaise(d.principal);
    const monthlyPaise = d.monthly != null ? toPaise(d.monthly) : Math.round(principalPaise / d.months);
    // Billing starts on the first statement AFTER the purchase: this month if the
    // purchase falls before the statement day, otherwise next month.
    const card = db.prepare(`SELECT statement_day FROM credit_cards WHERE id = ?`).get(d.card_id);
    const [oy, om, od] = occurred.split('-').map(Number);
    const startMonth =
      od < card.statement_day
        ? `${oy}-${String(om).padStart(2, '0')}`
        : `${om === 12 ? oy + 1 : oy}-${String(om === 12 ? 1 : om + 1).padStart(2, '0')}`;
    const now = nowISO();

    // Circular link: create plan, then the purchase entry (emi_plan_id), then backfill purchase_entry_id.
    const tx = db.transaction(() => {
      const plan = db
        .prepare(
          `INSERT INTO emi_plans (user_id, card_id, purchase_entry_id, principal_paise, months, monthly_paise, start_month, created_at)
           VALUES (?, ?, NULL, ?, ?, ?, ?, ?)`
        )
        .run(req.user.id, d.card_id, principalPaise, d.months, monthlyPaise, startMonth, now);
      const entry = db
        .prepare(
          `INSERT INTO entries
             (user_id, type, amount_paise, category, note, occurred_at, created_at, card_id, emi_plan_id)
           VALUES (?, 'expense', ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(req.user.id, principalPaise, d.category, d.note || null, occurred, now, d.card_id, plan.lastInsertRowid);
      db.prepare(`UPDATE emi_plans SET purchase_entry_id = ? WHERE id = ?`).run(
        entry.lastInsertRowid,
        plan.lastInsertRowid
      );
      return plan.lastInsertRowid;
    });
    const planId = tx();
    return reply.code(201).send(getEmis(req.user.id).find((e) => e.id === Number(planId)));
  });

  app.delete('/api/emis/:id', async (req, reply) => {
    const plan = db.prepare(`SELECT * FROM emi_plans WHERE id = ? AND user_id = ?`).get(req.params.id, req.user.id);
    if (!plan) return reply.code(404).send({ error: 'Not found' });
    // Remove the plan and its linked purchase entry so outstanding reverses cleanly.
    const tx = db.transaction(() => {
      if (plan.purchase_entry_id)
        db.prepare(`DELETE FROM entries WHERE id = ? AND user_id = ?`).run(plan.purchase_entry_id, req.user.id);
      db.prepare(`DELETE FROM emi_plans WHERE id = ? AND user_id = ?`).run(plan.id, req.user.id);
    });
    tx();
    return { ok: true };
  });
}
