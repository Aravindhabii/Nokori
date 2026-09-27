import { z } from 'zod';
import { db } from '../db.js';
import { requireAuth, issueToken } from '../auth.js';

const tokenBody = z.object({ label: z.string().trim().min(1).max(40) });

const listApiTokens = db.prepare(
  `SELECT id, label, created_at, last_used_at FROM tokens
   WHERE user_id = ? AND kind = 'api' ORDER BY id DESC`
);
const deleteApiToken = db.prepare(
  `DELETE FROM tokens WHERE id = ? AND user_id = ? AND kind = 'api'`
);

export default async function tokensRoutes(app) {
  app.addHook('preHandler', requireAuth);

  app.get('/api/tokens', async (req) => ({ tokens: listApiTokens.all(req.user.id) }));

  app.post('/api/tokens', async (req, reply) => {
    const parsed = tokenBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid label' });
    const raw = issueToken(req.user.id, 'api', parsed.data.label);
    // Returned once — only the hash is stored.
    return reply.code(201).send({ token: raw, label: parsed.data.label });
  });

  app.delete('/api/tokens/:id', async (req, reply) => {
    const info = deleteApiToken.run(req.params.id, req.user.id);
    if (info.changes === 0) return reply.code(404).send({ error: 'Not found' });
    return { ok: true };
  });
}
