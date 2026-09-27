import { z } from 'zod';
import { authenticator } from 'otplib';
import { db } from '../db.js';
import { hashPassword, verifyPassword, issueToken, revokeTokenByRaw, requireAuth } from '../auth.js';
import { nowISO } from '../time.js';

const credentials = z.object({
  username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9._-]+$/),
  password: z.string().min(8).max(200),
});
const signupBody = credentials.extend({ signup_code: z.string() });
const loginBody = credentials.extend({ code: z.string().optional() });

const findUser = db.prepare(
  `SELECT id, username, password_hash, totp_enabled, totp_secret FROM users WHERE username = ?`
);
const createUser = db.prepare(
  `INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)`
);
const createDefaultAccount = db.prepare(
  `INSERT INTO accounts (user_id, name, type, opening_balance_paise, is_default, archived, created_at)
   VALUES (?, 'Cash', 'cash', 0, 1, 0, ?)`
);

// Tighter limit on credential endpoints to slow brute-force / spam signups.
const authLimit = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

export default async function authRoutes(app) {
  app.post('/api/auth/signup', authLimit, async (req, reply) => {
    const parsed = signupBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid input' });
    const { username, password, signup_code } = parsed.data;

    const expected = process.env.SIGNUP_CODE;
    if (!expected || signup_code !== expected) {
      return reply.code(403).send({ error: 'Invalid signup code' });
    }
    if (findUser.get(username)) {
      return reply.code(409).send({ error: 'Username already taken' });
    }

    const now = nowISO();
    const info = createUser.run(username, await hashPassword(password), now);
    createDefaultAccount.run(info.lastInsertRowid, now);
    const token = issueToken(info.lastInsertRowid, 'session');
    return reply.code(201).send({ token, username });
  });

  app.post('/api/auth/login', authLimit, async (req, reply) => {
    const parsed = loginBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid input' });
    const { username, password, code } = parsed.data;

    const user = findUser.get(username);
    if (!user || !(await verifyPassword(user.password_hash, password))) {
      return reply.code(401).send({ error: 'Invalid username or password' });
    }
    if (user.totp_enabled) {
      if (!code) return reply.code(401).send({ error: 'Enter your authenticator code', twofa_required: true });
      if (!authenticator.check(code.replace(/\s/g, ''), user.totp_secret)) {
        return reply.code(401).send({ error: 'Invalid authenticator code', twofa_required: true });
      }
    }
    const token = issueToken(user.id, 'session');
    return reply.send({ token, username: user.username });
  });

  app.post('/api/auth/logout', { preHandler: requireAuth }, async (req, reply) => {
    revokeTokenByRaw(req.tokenRaw);
    return reply.send({ ok: true });
  });

  app.get('/api/me', { preHandler: requireAuth }, async (req) => ({ username: req.user.username }));
}
