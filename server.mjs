import http from 'node:http';
import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, 'public');
const files = new Map([
  ['/', 'index.html'], ['/index.html', 'index.html'],
  ['/dashboard.html', 'dashboard.html'], ['/arena.html', 'arena.html'],
  ['/admin-login.html', 'admin-login.html'],
  ['/style.css', 'style.css'], ['/login.js', 'login.js'],
  ['/dashboard.js', 'dashboard.js'], ['/arena.js', 'arena.js'], ['/admin.js', 'admin.js'],
  ['/admin-login.js', 'admin-login.js'],
]);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const SESSION_MS = 4 * 60 * 60 * 1000;

function json(res, status, data, extra = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
  res.end(JSON.stringify(data));
}
function tokenHash(token) { return createHash('sha256').update(token).digest('hex'); }
function equalSecret(a, b) {
  if (typeof a !== 'string' || !a || typeof b !== 'string') return false;
  return timingSafeEqual(Buffer.from(tokenHash(a), 'hex'), Buffer.from(tokenHash(b), 'hex'));
}
async function bodyJson(req, max = 4096) {
  let length = 0;
  const buffers = [];
  for await (const chunk of req) {
    length += chunk.length;
    if (length > max) { const e = Error('Request too large'); e.status = 413; throw e; }
    buffers.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(buffers).toString('utf8')); }
  catch { const e = Error('Invalid JSON'); e.status = 400; throw e; }
}
function load(pathname) {
  if (!existsSync(pathname)) return [];
  const records = JSON.parse(readFileSync(pathname, 'utf8'));
  if (!Array.isArray(records)) throw Error('Invalid records file');
  return records;
}
function save(pathname, records) {
  mkdirSync(path.dirname(pathname), { recursive: true });
  const temporary = `${pathname}.${randomBytes(6).toString('hex')}.tmp`;
  writeFileSync(temporary, JSON.stringify(records, null, 2), { mode: 0o600 });
  renameSync(temporary, pathname);
}
function limited(map, key, limit, ms = 60_000) {
  const now = Date.now();
  const list = (map.get(key) || []).filter(t => now - t < ms);
  if (list.length >= limit) return true;
  list.push(now); map.set(key, list);
  if (map.size > 5000) map.clear();
  return false;
}
function cookieValue(req, key) {
  const parts = (req.headers.cookie || '').split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx > 0 && part.slice(0, idx).trim() === key) return part.slice(idx + 1).trim();
  }
  return '';
}
function originAllowed(req) {
  if (!req.headers.origin) return true;
  try { return new URL(req.headers.origin).host === req.headers.host; }
  catch { return false; }
}
function page(res, filename) {
  res.writeHead(200, { 'Content-Type': types[path.extname(filename)], 'Cache-Control': 'no-store' });
  res.end(readFileSync(path.join(publicDir, filename)));
}
function redirect(res, target) {
  res.writeHead(302, { Location: target, 'Cache-Control': 'no-store' });
  res.end();
}

export function createApp({
  storagePath = path.join(root, 'data', 'visits.json'),
  adminToken = process.env.ADMIN_TOKEN || randomBytes(24).toString('hex'),
} = {}) {
  const attempts = new Map();
  const sessions = new Map();
  const cookieName = 'sh_demo_admin';

  const getSession = (req) => {
    const raw = cookieValue(req, cookieName);
    if (!/^[a-f0-9]{64}$/.test(raw)) return null;
    const key = tokenHash(raw);
    const session = sessions.get(key);
    if (!session) return null;
    if (session.expires < Date.now()) { sessions.delete(key); return null; }
    return session;
  };
  const makeCookie = (req, value, age) => {
    // Set NODE_ENV=production only behind HTTPS, for Secure cookies.
    const secure = process.env.NODE_ENV === 'production' || !!req.socket.encrypted;
    return `${cookieName}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secure ? '; Secure' : ''}`;
  };

  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    const url = new URL(req.url || '/', 'http://localhost');
    const session = getSession(req);

    try {
      if (url.pathname === '/api/health' && req.method === 'GET') return json(res, 200, { ok: true, type: 'demo', version: '5' });

      // Collect an explicitly labeled, non-secret challenge phrase, with informed consent. Never accept account password fields.
      if (url.pathname === '/api/demo-session' && req.method === 'POST') {
        if (!originAllowed(req)) return json(res, 403, { error: 'Origin not allowed' });
        if (limited(attempts, `demo:${req.socket.remoteAddress}`, 30)) return json(res, 429, { error: 'Too many submissions' });
        if (!(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 415, { error: 'JSON required' });
        const body = await bodyJson(req);
        if (!body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).some(k => !['handle','challengeText','consent'].includes(k))) {
          return json(res, 400, { error: 'Only demo handle, challenge phrase and consent are accepted' });
        }
        const handle = typeof body.handle === 'string' ? body.handle.trim() : '';
        const challengeText = body.challengeText;
        if (!/^[A-Za-z0-9._-]{2,30}$/.test(handle) || body.consent !== true)
          return json(res, 400, { error: 'Valid demo handle and consent are required' });
        // Non-secret challenge phrase only; preserve original whitespace and Unicode exactly.
        // Never use this endpoint as authentication or to collect actual account credentials.
        if (typeof challengeText !== 'string' || !challengeText.trim() ||
            [...challengeText].length > 80 || Buffer.byteLength(challengeText, 'utf8') > 400 ||
            /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(challengeText))
          return json(res, 400, { error: 'Provide a short, non-secret test phrase (1–80 characters), not an account password' });
        const arenaTicket = randomBytes(32).toString('hex');
        const record = { id: randomUUID(), handle, challengeText, createdAt: new Date().toISOString(), arenaTicketHash: tokenHash(arenaTicket) };
        save(storagePath, [...load(storagePath), record].slice(-5000));
        // Do not echo the challenge phrase back in the public response.
        return json(res, 201, { id: record.id, handle: record.handle, createdAt: record.createdAt, arenaTicket });
      }

      // Reaction-timing demo; proof-of-visit ticket is only for associating a result.
      // Client measured values are not anti-cheat-secure and are not used as authentication.
      if (url.pathname === '/api/reaction/result' && req.method === 'POST') {
        if (!originAllowed(req)) return json(res, 403, { error: 'Origin not allowed' });
        if (limited(attempts, `reaction:${req.socket.remoteAddress}`, 40)) return json(res, 429, { error: 'Too many submissions' });
        if (!(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 415, { error: 'JSON required' });
        const body = await bodyJson(req);
        if (!body || Array.isArray(body) || typeof body !== 'object' ||
          Object.keys(body).some(k => !['id', 'ticket', 'reactionMs'].includes(k)) ||
          typeof body.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(body.id) ||
          typeof body.ticket !== 'string' || !/^[a-f0-9]{64}$/.test(body.ticket) ||
          !Number.isInteger(body.reactionMs) || body.reactionMs < 1 || body.reactionMs > 30000) {
          return json(res, 400, { error: 'Invalid reaction game result' });
        }
        const records = load(storagePath);
        const record = records.find(r => r.id === body.id);
        // Compare ticket hashes in constant time. Never send ticket or hash to the admin API.
        if (!record || !equalSecret(tokenHash(body.ticket), record.arenaTicketHash))
          return json(res, 403, { error: 'Invalid demo session' });
        const previous = record.reaction;
        record.reaction = {
          bestMs: Math.min(previous?.bestMs ?? Infinity, body.reactionMs),
          lastMs: body.reactionMs,
          attempts: (previous?.attempts ?? 0) + 1,
          completedAt: new Date().toISOString(),
        };
        save(storagePath, records);
        return json(res, 200, { saved: true, bestMs: record.reaction.bestMs, attempts: record.reaction.attempts });
      }

      if (url.pathname === '/api/admin/login' && req.method === 'POST') {
        if (!originAllowed(req)) return json(res, 403, { error: 'Origin not allowed' });
        if (limited(attempts, `admin-login:${req.socket.remoteAddress}`, 10, 10 * 60_000)) return json(res, 429, { error: 'محاولات كثيرة. أعد المحاولة لاحقًا.' });
        const body = await bodyJson(req);
        if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).join() !== 'token' || !equalSecret(body.token, adminToken)) {
          return json(res, 401, { error: 'رمز الأدمن غير صحيح.' });
        }
        const secret = randomBytes(32).toString('hex');
        const csrf = randomBytes(24).toString('hex');
        sessions.set(tokenHash(secret), { csrf, expires: Date.now() + SESSION_MS });
        if (sessions.size > 2000) for (const [key, item] of sessions) if (item.expires < Date.now()) sessions.delete(key);
        return json(res, 200, { authenticated: true }, { 'Set-Cookie': makeCookie(req, secret, SESSION_MS / 1000) });
      }

      if (url.pathname === '/api/admin/me' && req.method === 'GET') {
        if (!session) return json(res, 401, { authenticated: false });
        return json(res, 200, { authenticated: true, csrf: session.csrf });
      }
      if (url.pathname === '/api/admin/logout' && req.method === 'POST') {
        if (!originAllowed(req)) return json(res, 403, { error: 'Origin not allowed' });
        const raw = cookieValue(req, cookieName);
        if (raw) sessions.delete(tokenHash(raw));
        return json(res, 200, { ok: true }, { 'Set-Cookie': makeCookie(req, '', 0) });
      }
      if (url.pathname === '/api/admin/visits' && ['GET', 'DELETE'].includes(req.method)) {
        if (!session) return json(res, 401, { error: 'Admin login required' });
        if (req.method === 'DELETE') {
          if (!originAllowed(req) || req.headers['x-csrf-token'] !== session.csrf) return json(res, 403, { error: 'Security verification failed' });
          save(storagePath, []);
          return json(res, 200, { cleared: true });
        }
        return json(res, 200, { visits: load(storagePath).slice().reverse().map(({arenaTicketHash, ...record}) => record) });
      }

      // Gate the actual admin HTML at the server, not only with a front-end redirect.
      if (req.method === 'GET' && ['/admin', '/admin.html'].includes(url.pathname)) {
        if (!session) return redirect(res, '/admin-login.html');
        return page(res, 'admin.html');
      }
      if (req.method === 'GET' && url.pathname === '/admin-login.html' && session) return redirect(res, '/admin');
      const filename = files.get(url.pathname);
      if (req.method === 'GET' && filename) return page(res, filename);
      return json(res, 404, { error: 'Not found' });
    } catch (error) {
      if (error.status && error.status < 500) return json(res, error.status, { error: error.message });
      console.error('Server error:', error);
      return json(res, 500, { error: 'Internal server error' });
    }
  });
  return { server, adminToken };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  const { server, adminToken } = createApp();
  server.listen(port, () => {
    console.log(`Social Hub v5: http://localhost:${port}`);
    console.log(`Admin login (private URL): http://localhost:${port}/admin-login.html`);
    if (!process.env.ADMIN_TOKEN) console.log(`Temporary ADMIN_TOKEN: ${adminToken}`);
  });
}
