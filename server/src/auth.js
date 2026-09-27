import argon2 from 'argon2';
import { randomBytes, createHash } from 'node:crypto';
import { db } from './db.js';
import { nowISO } from './time.js';

export const hashPassword = (pw) => argon2.hash(pw);
export const verifyPassword = (hash, pw) => argon2.verify(hash, pw).catch(() => false);

/** Generate a raw opaque token (returned once) and its stored hash. */
export function newToken() {
  const raw = randomBytes(32).toString('base64url');
  return { raw, hash: hashToken(raw) };
}

export const hashToken = (raw) => createHash('sha256').update(raw).digest('hex');

const insertToken = db.prepare(
  `INSERT INTO tokens (user_id, token_hash, kind, label, created_at) VALUES (?, ?, ?, ?, ?)`
);
const findToken = db.prepare(
  `SELECT t.id, t.user_id, t.kind, u.username
   FROM tokens t JOIN users u ON u.id = t.user_id
   WHERE t.token_hash = ?`
);
const touchToken = db.prepare(`UPDATE tokens SET last_used_at = ? WHERE id = ?`);
const deleteTokenByHash = db.prepare(`DELETE FROM tokens WHERE token_hash = ?`);

/** Create and persist a token; returns the raw value to hand to the client once. */
export function issueToken(userId, kind, label = null) {
  const { raw, hash } = newToken();
  insertToken.run(userId, hash, kind, label, nowISO());
  return raw;
}

export function revokeTokenByRaw(raw) {
  deleteTokenByHash.run(hashToken(raw));
}

/** Fastify preHandler: resolve `Authorization: Bearer <token>` to a user. */
export function requireAuth(req, reply, done) {
  const header = req.headers.authorization || '';
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    reply.code(401).send({ error: 'Missing bearer token' });
    return;
  }
  const row = findToken.get(hashToken(m[1]));
  if (!row) {
    reply.code(401).send({ error: 'Invalid token' });
    return;
  }
  touchToken.run(nowISO(), row.id);
  req.user = { id: row.user_id, username: row.username };
  req.tokenId = row.id;
  req.tokenRaw = m[1];
  done();
}
