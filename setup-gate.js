import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const KEY = process.env.SETUP_KEY || 'IDK68-PRO-2026';
// A fresh secret per boot means restarting the server re-locks every browser.
const SECRET = process.env.SESSION_SECRET || randomBytes(32).toString('hex');
const COOKIE = 'ugs_setup';
const MAX_AGE = 60 * 60 * 24 * 30;

// Paths the setup flow itself needs before a session exists.
const PUBLIC = [
  /^\/$/,
  /^\/index\.html$/,
  /^\/css\/setup\.css$/,
  /^\/js\/setup\.js$/,
  /^\/assets\//,
  /^\/favicon\.ico$/
];

// Hashing first keeps the comparison constant time whatever the lengths are.
function equals(a, b) {
  const digest = value => createHash('sha256').update(String(value)).digest();
  return timingSafeEqual(digest(a), digest(b));
}

function sign(expiry) {
  return `${expiry}.${createHmac('sha256', SECRET).update(String(expiry)).digest('hex')}`;
}

function valid(token) {
  const [expiry, digest] = String(token).split('.');
  if (!expiry || !digest || Number(expiry) < Date.now()) return false;
  const expected = createHmac('sha256', SECRET).update(expiry).digest('hex');
  return equals(digest, expected);
}

export function hasSession(req) {
  const cookies = req.headers.cookie ?? '';
  const match = cookies.split(';').map(part => part.trim().split('='))
    .find(([name]) => name === COOKIE);
  return Boolean(match && valid(decodeURIComponent(match[1])));
}

export function setupRoutes(app) {
  app.post('/api/setup', (req, res) => {
    if (!equals(String(req.body?.key ?? '').toUpperCase(), KEY.toUpperCase())) {
      return res.status(403).json({ ok: false });
    }
    const token = sign(Date.now() + MAX_AGE * 1000);
    res.cookie(COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: MAX_AGE * 1000,
      secure: req.secure || req.headers['x-forwarded-proto'] === 'https'
    });
    res.json({ ok: true });
  });

  app.use((req, res, next) => {
    if (PUBLIC.some(pattern => pattern.test(req.path)) || hasSession(req)) return next();
    if (req.method === 'GET' && req.accepts('html')) return res.redirect('/');
    res.sendStatus(403);
  });
}
