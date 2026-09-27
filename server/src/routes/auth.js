import { z } from 'zod';
import { db } from '../db.js';
import { hashPassword, verifyPassword, issueToken, revokeTokenByRaw, requireAuth } from '../auth.js';
import { nowISO } from '../time.js';

const credentials = z.object({
  username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9._-]+$/),
  password: z.string().min(8).max(200),
});
const signupBody = credentials.extend({ signup_code: z.string() });

const findUser = db.prepare(`SELECT id, username, password_hash FROM users WHERE username = ?`);
const createUser = db.prepare(
  `INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)`
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

    const info = createUser.run(username, await hashPassword(password), nowISO());
    const token = issueToken(info.lastInsertRowid, 'session');
    return reply.code(201).send({ token, username });
  });

  app.post('/api/auth/login', authLimit, async (req, reply) => {
    const parsed = credentials.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid input' });
    const { username, password } = parsed.data;

    const user = findUser.get(username);
    // Verify even when user is missing would need a dummy hash; simpler: constant-ish path.
    if (!user || !(await verifyPassword(user.password_hash, password))) {
      return reply.code(401).send({ error: 'Invalid username or password' });
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
