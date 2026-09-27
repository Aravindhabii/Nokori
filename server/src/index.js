import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import './db.js';
import authRoutes from './routes/auth.js';
import entriesRoutes from './routes/entries.js';
import tokensRoutes from './routes/tokens.js';
import accountsRoutes from './routes/accounts.js';
import cardsRoutes from './routes/cards.js';
import emisRoutes from './routes/emis.js';
import budgetRoutes from './routes/budget.js';
import twofaRoutes from './routes/twofa.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = resolve(process.env.PUBLIC_DIR || join(__dirname, '..', 'public'));

const app = Fastify({ logger: true, trustProxy: true });

// Security headers. CSP allows same-origin assets + inline style attributes the PWA
// uses; all scripts are external so script-src stays strict.
await app.register(helmet, {
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      manifestSrc: ["'self'"],
      workerSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
  hsts: { maxAge: 15552000, includeSubDomains: true }, // effective over HTTPS
  crossOriginEmbedderPolicy: false,
});

await app.register(rateLimit, { global: true, max: 200, timeWindow: '1 minute' });

app.get('/healthz', { config: { rateLimit: false } }, async () => ({ ok: true }));

await app.register(authRoutes);
await app.register(entriesRoutes);
await app.register(tokensRoutes);
await app.register(accountsRoutes);
await app.register(cardsRoutes);
await app.register(emisRoutes);
await app.register(budgetRoutes);
await app.register(twofaRoutes);

// Serve the built PWA (if present) and fall back to index.html for client-side routes.
if (existsSync(PUBLIC_DIR)) {
  await app.register(fastifyStatic, { root: PUBLIC_DIR, wildcard: false });
  app.setNotFoundHandler((req, reply) => {
    if (req.method === 'GET' && !req.url.startsWith('/api') && !req.url.startsWith('/healthz')) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ error: 'Not found' });
  });
} else {
  app.log.warn(`PUBLIC_DIR ${PUBLIC_DIR} not found — API only (build the web app to serve the PWA).`);
}

if (!process.env.SIGNUP_CODE) {
  app.log.warn('SIGNUP_CODE is not set — signup is disabled until you set it.');
}

try {
  await app.listen({ port: PORT, host: HOST });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
