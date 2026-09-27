import { z } from 'zod';
import { db } from '../db.js';
import { requireAuth } from '../auth.js';
import { nowISO } from '../time.js';
import { getAccounts, getTotalAssets, getCards, getEmis } from '../money.js';

const toPaise = (rupees) => Math.round(rupees * 100);

const createBody = z.object({
  name: z.string().trim().min(1).max(40),
  type: z.enum(['bank', 'cash']),
  opening_balance: z.number().finite().optional(),
  is_default: z.boolean().optional(),
});
const patchBody = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  opening_balance: z.number().finite().optional(),
  is_default: z.literal(true).optional(),
  archived: z.boolean().optional(),
});

const getOne = db.prepare(`SELECT * FROM accounts WHERE id = ? AND user_id = ?`);
const clearDefaults = db.prepare(`UPDATE accounts SET is_default = 0 WHERE user_id = ?`);
const countEntriesUsing = db.prepare(
  `SELECT COUNT(*) AS n FROM entries
   WHERE user_id = ? AND (account_id = ? OR from_account_id = ? OR to_account_id = ?)`
);

export default async function accountsRoutes(app) {
  app.addHook('preHandler', requireAuth);

  app.get('/api/accounts', async (req) => ({ accounts: getAccounts(req.user.id) }));

  app.get('/api/balances', async (req) => ({
    accounts: getAccounts(req.user.id),
    total_assets: getTotalAssets(req.user.id),
    cards: getCards(req.user.id),
    emis: getEmis(req.user.id),
  }));

  app.post('/api/accounts', async (req, reply) => {
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid input' });
    const d = parsed.data;
    const makeDefault = d.is_default === true;
    const tx = db.transaction(() => {
      if (makeDefault) clearDefaults.run(req.user.id);
      const info = db
        .prepare(
          `INSERT INTO accounts (user_id, name, type, opening_balance_paise, is_default, archived, created_at)
           VALUES (?, ?, ?, ?, ?, 0, ?)`
        )
        .run(req.user.id, d.name, d.type, toPaise(d.opening_balance || 0), makeDefault ? 1 : 0, nowISO());
      return info.lastInsertRowid;
    });
    const id = tx();
    return reply.code(201).send(getAccounts(req.user.id).find((a) => a.id === id));
  });

  app.patch('/api/accounts/:id', async (req, reply) => {
    const existing = getOne.get(req.params.id, req.user.id);
    if (!existing) return reply.code(404).send({ error: 'Not found' });
    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid input' });
    const d = parsed.data;
    const tx = db.transaction(() => {
      if (d.is_default === true) clearDefaults.run(req.user.id);
      db.prepare(
        `UPDATE accounts SET
           name = ?, opening_balance_paise = ?, is_default = ?, archived = ?
         WHERE id = ? AND user_id = ?`
      ).run(
        d.name ?? existing.name,
        d.opening_balance != null ? toPaise(d.opening_balance) : existing.opening_balance_paise,
        d.is_default === true ? 1 : existing.is_default,
        d.archived != null ? (d.archived ? 1 : 0) : existing.archived,
        existing.id,
        req.user.id
      );
    });
    tx();
    return getAccounts(req.user.id).find((a) => a.id === existing.id);
  });

  app.delete('/api/accounts/:id', async (req, reply) => {
    const existing = getOne.get(req.params.id, req.user.id);
    if (!existing) return reply.code(404).send({ error: 'Not found' });
    const force = req.query.force === '1' || req.query.force === 'true';
    const used = countEntriesUsing.get(req.user.id, existing.id, existing.id, existing.id).n;

    const acctCount = db.prepare(`SELECT COUNT(*) AS n FROM accounts WHERE user_id = ?`).get(req.user.id).n;
    if (acctCount <= 1) {
      return reply.code(409).send({
        error: 'You need at least one account. Add another first, or just delete the wrong entry in History.',
      });
    }
    if (used > 0 && !force) {
      // Tell the UI it can retry with ?force=1 (which also deletes the transactions).
      return reply.code(409).send({
        error: `This account has ${used} transaction(s).`,
        needs_force: true,
        transaction_count: used,
      });
    }

    const id = existing.id;
    const tx = db.transaction(() => {
      if (force) {
        db.prepare(
          `DELETE FROM entries WHERE user_id = ? AND (account_id = ? OR from_account_id = ? OR to_account_id = ?)`
        ).run(req.user.id, id, id, id);
      }
      db.prepare(`DELETE FROM accounts WHERE id = ? AND user_id = ?`).run(id, req.user.id);
      if (existing.is_default) {
        const next = db.prepare(`SELECT id FROM accounts WHERE user_id = ? ORDER BY archived ASC, id LIMIT 1`).get(req.user.id);
        if (next) db.prepare(`UPDATE accounts SET is_default = 1 WHERE id = ?`).run(next.id);
      }
    });
    tx();
    return { ok: true };
  });
}
