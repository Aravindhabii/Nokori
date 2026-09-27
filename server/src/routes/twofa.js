import { z } from 'zod';
import { authenticator } from 'otplib';
import { db } from '../db.js';
import { requireAuth } from '../auth.js';

const codeBody = z.object({ code: z.string().min(6).max(10) });

const getUser = db.prepare(`SELECT id, username, totp_enabled, totp_secret FROM users WHERE id = ?`);
const setSecret = db.prepare(`UPDATE users SET totp_secret = ?, totp_enabled = 0 WHERE id = ?`);
const enable = db.prepare(`UPDATE users SET totp_enabled = 1 WHERE id = ?`);
const disable = db.prepare(`UPDATE users SET totp_enabled = 0, totp_secret = NULL WHERE id = ?`);

const clean = (c) => c.replace(/\s/g, '');

export default async function twofaRoutes(app) {
  app.addHook('preHandler', requireAuth);

  app.get('/api/2fa/status', async (req) => {
    const u = getUser.get(req.user.id);
    return { enabled: !!u.totp_enabled };
  });

  // Generate (or regenerate) a secret. Not enabled until verified.
  app.post('/api/2fa/setup', async (req) => {
    const secret = authenticator.generateSecret();
    setSecret.run(secret, req.user.id);
    const otpauth = authenticator.keyuri(req.user.username, 'Expense Tracker', secret);
    return { secret, otpauth };
  });

  app.post('/api/2fa/enable', async (req, reply) => {
    const parsed = codeBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Enter the 6-digit code' });
    const u = getUser.get(req.user.id);
    if (!u.totp_secret) return reply.code(400).send({ error: 'Run setup first' });
    if (!authenticator.check(clean(parsed.data.code), u.totp_secret)) {
      return reply.code(400).send({ error: 'Code did not match — try again' });
    }
    enable.run(req.user.id);
    return { enabled: true };
  });

  app.post('/api/2fa/disable', async (req, reply) => {
    const parsed = codeBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Enter the 6-digit code' });
    const u = getUser.get(req.user.id);
    if (!u.totp_enabled || !u.totp_secret) return { enabled: false };
    if (!authenticator.check(clean(parsed.data.code), u.totp_secret)) {
      return reply.code(400).send({ error: 'Code did not match' });
    }
    disable.run(req.user.id);
    return { enabled: false };
  });
}
