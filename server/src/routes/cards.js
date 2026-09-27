import { z } from 'zod';
import { db } from '../db.js';
import { requireAuth } from '../auth.js';
import { nowISO } from '../time.js';
import { getCards } from '../money.js';

const toPaise = (rupees) => Math.round(rupees * 100);
const day = z.number().int().min(1).max(28);

const createBody = z.object({
  name: z.string().trim().min(1).max(40),
  credit_limit: z.number().nonnegative().finite(),
  statement_day: day,
  due_day: day,
});
const patchBody = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  credit_limit: z.number().nonnegative().finite().optional(),
  statement_day: day.optional(),
  due_day: day.optional(),
  archived: z.boolean().optional(),
});

const getOne = db.prepare(`SELECT * FROM credit_cards WHERE id = ? AND user_id = ?`);
const usedByEntries = db.prepare(
  `SELECT COUNT(*) AS n FROM entries WHERE user_id = ? AND (card_id = ? OR to_card_id = ?)`
);
const usedByEmis = db.prepare(`SELECT COUNT(*) AS n FROM emi_plans WHERE user_id = ? AND card_id = ?`);

export default async function cardsRoutes(app) {
  app.addHook('preHandler', requireAuth);

  app.get('/api/cards', async (req) => ({ cards: getCards(req.user.id) }));

  app.post('/api/cards', async (req, reply) => {
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });
    const d = parsed.data;
    const info = db
      .prepare(
        `INSERT INTO credit_cards (user_id, name, credit_limit_paise, statement_day, due_day, archived, created_at)
         VALUES (?, ?, ?, ?, ?, 0, ?)`
      )
      .run(req.user.id, d.name, toPaise(d.credit_limit), d.statement_day, d.due_day, nowISO());
    return reply.code(201).send(getCards(req.user.id).find((c) => c.id === Number(info.lastInsertRowid)));
  });

  app.patch('/api/cards/:id', async (req, reply) => {
    const existing = getOne.get(req.params.id, req.user.id);
    if (!existing) return reply.code(404).send({ error: 'Not found' });
    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0].message });
    const d = parsed.data;
    db.prepare(
      `UPDATE credit_cards SET name=?, credit_limit_paise=?, statement_day=?, due_day=?, archived=?
       WHERE id=? AND user_id=?`
    ).run(
      d.name ?? existing.name,
      d.credit_limit != null ? toPaise(d.credit_limit) : existing.credit_limit_paise,
      d.statement_day ?? existing.statement_day,
      d.due_day ?? existing.due_day,
      d.archived != null ? (d.archived ? 1 : 0) : existing.archived,
      existing.id,
      req.user.id
    );
    return getCards(req.user.id).find((c) => c.id === existing.id);
  });

  app.delete('/api/cards/:id', async (req, reply) => {
    const existing = getOne.get(req.params.id, req.user.id);
    if (!existing) return reply.code(404).send({ error: 'Not found' });
    if (usedByEntries.get(req.user.id, existing.id, existing.id).n > 0 ||
        usedByEmis.get(req.user.id, existing.id).n > 0) {
      return reply.code(409).send({ error: 'Card has transactions/EMIs — archive it instead of deleting.' });
    }
    db.prepare(`DELETE FROM credit_cards WHERE id = ? AND user_id = ?`).run(existing.id, req.user.id);
    return { ok: true };
  });
}
