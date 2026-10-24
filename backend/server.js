'use strict';
/**
 * server.js — SkillLink API server.
 *
 *   Browser  --HTTPS-->  server.js  --service_role-->  Supabase (Postgres, Auth, Storage)
 *                            |
 *                            +--> gemini.js --> Google Gemini API
 *
 * The service_role key and the Gemini key live only in this process. Every business
 * rule is enforced in the database functions (supabase_schema.sql); this file does
 * authentication, input shaping, uploads, rate limiting, live-tracking streams and AI.
 *
 * Run:   cp .env.example .env   (fill it in)   &&   npm install   &&   npm start
 * Needs: Node 22+, the schema applied in Supabase, and last.html (+ last.css) next to this file.
 *
 * Payments: money is RECORDED (held / released / cash due / paid), not processed. Card
 * numbers are never accepted: the client sends only the last 4 digits. Plug a payment
 * gateway (e.g. PayMongo, Xendit) into POST /api/bookings and finish/cancel when you
 * need real charges and payouts.
 */

const path = require('node:path');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { EventEmitter } = require('node:events');

try { require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true }); } catch { /* dotenv is optional */ }

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const multer = require('multer');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

const gemini = require('./gemini');

/* ============================================================================
 * Configuration
 * ========================================================================= */

const PUBLIC_BUCKET = 'skilllink-public';      // avatars + review photos (public read)
const EVIDENCE_BUCKET = 'skilllink-evidence';  // report evidence (private)
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function loadConfig(env) {
  const int = (v, d) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d);
  const trust = env.TRUST_PROXY;
  return {
    port: int(env.PORT, 3000),
    production: env.NODE_ENV === 'production',
    supabaseUrl: (env.SUPABASE_URL || '').replace(/\/+$/, ''),
    anonKey: env.SUPABASE_ANON_KEY || '',
    serviceKey: env.SUPABASE_SERVICE_ROLE_KEY || '',
    trustProxy: trust === undefined || trust === '' ? false : trust === 'true' ? true : trust === 'false' ? false : /^\d+$/.test(trust) ? Number(trust) : trust,
    corsOrigins: (env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
    appHtml: env.APP_HTML || 'skillLink.html',
    timeZone: env.APP_TIMEZONE || 'Asia/Manila',
    adminEmail: (env.ADMIN_EMAIL || '').trim().toLowerCase(),
    adminPassword: env.ADMIN_PASSWORD || '',
    passwordMin: int(env.PASSWORD_MIN_LENGTH, 8),
    adminIdleMs: int(env.ADMIN_IDLE_MINUTES, 30) * 60000,
    adminMaxAttempts: int(env.ADMIN_MAX_ATTEMPTS, 5),
    adminLockMs: int(env.ADMIN_LOCK_MINUTES, 5) * 60000,
    disableCsp: env.DISABLE_CSP === '1' || env.DISABLE_CSP === 'true',
    disableRateLimit: env.DISABLE_RATE_LIMIT === '1'
  };
}

/* ============================================================================
 * Errors and small helpers
 * ========================================================================= */

class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

const log = {
  info: (...a) => console.log(new Date().toISOString(), 'INFO ', ...a),
  warn: (...a) => console.warn(new Date().toISOString(), 'WARN ', ...a),
  error: (...a) => console.error(new Date().toISOString(), 'ERROR', ...a)
};

const CODE_STATUS = { not_found: 404, forbidden: 403, conflict: 409, invalid: 422, unauthorized: 401 };

/** Turn a Supabase/Postgres error into an ApiError. SL:<code>:<message> comes from our SQL functions. */
function mapDbError(error, where) {
  const m = /^SL:([a-z_]+):([\s\S]*)$/.exec(error.message || '');
  if (m) return new ApiError(CODE_STATUS[m[1]] || 400, m[1], m[2].trim());
  const code = error.code || '';
  if (['22P02', '22003', '22007', '22008', '22001', '22023', '23502', '23514'].includes(code)) {
    return new ApiError(422, 'invalid', 'Some of the information you entered is not valid.');
  }
  if (code === '23505') return new ApiError(409, 'conflict', 'That already exists.');
  if (code === '23503') return new ApiError(409, 'conflict', 'That item is no longer available.');
  log.error(`database error in ${where}:`, error.code || '', error.message || error);
  return new ApiError(500, 'server_error', 'Something went wrong on our side. Please try again.');
}

const ah = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidParam = v => { if (typeof v !== 'string' || !UUID_RE.test(v)) throw new ApiError(400, 'invalid', 'Invalid id.'); return v.toLowerCase(); };
const idParam = v => { if (!/^\d{1,15}$/.test(String(v))) throw new ApiError(400, 'invalid', 'Invalid id.'); return Number(v); };

const bodyOf = req => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});
const pick = (obj, keys) => keys.reduce((o, k) => (obj[k] !== undefined ? (o[k] = obj[k], o) : o), {});
const first = v => (Array.isArray(v) ? v[0] : v);
const qstr = v => { const x = first(v); return typeof x === 'string' ? x : undefined; };
const toStringList = v => (Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [])
  .filter(x => typeof x === 'string').map(x => x.trim()).filter(Boolean);
const peso = n => '₱' + Math.round(Number(n) || 0).toLocaleString('en-PH');
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const validTimeZone = tz => { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; } };

/** "Wed, Oct 21, 9:00 AM" for a local date + time (the wall-clock time, in any time zone). */
function whenLabel(date, time) {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Intl.DateTimeFormat('en-PH', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC'
  }).format(new Date(Date.UTC(y, m - 1, d, hh, mm)));
}

function localNow(tz) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).formatToParts(new Date()).reduce((o, x) => (o[x.type] = x.value, o), {});
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

function shiftDate(date, days) {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}
const dowOf = date => { const [y, m, d] = date.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const isOpenDay = (availability, date) => {
  const dow = dowOf(date);
  return availability === 'Weekdays' ? dow >= 1 && dow <= 5 : availability === 'Weekends' ? dow === 0 || dow === 6 : true;
};

/** Identify an image by its first bytes (never trust the filename or the client's content type). */
function sniffImage(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  const head = buf.slice(0, 6).toString('latin1');
  if (head === 'GIF87a' || head === 'GIF89a') return { mime: 'image/gif', ext: 'gif' };
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

/* ============================================================================
 * App factory
 * ========================================================================= */

/**
 * @param {{env?: object, createClient?: Function}} [opts]  both injectable for tests
 * @returns {{app: import('express').Express, init: () => Promise<void>, config: object}}
 */
function createApp(opts = {}) {
  const cfg = loadConfig(opts.env || process.env);
  const createClient = opts.createClient || require('@supabase/supabase-js').createClient;

  for (const [k, v] of [['SUPABASE_URL', cfg.supabaseUrl], ['SUPABASE_ANON_KEY', cfg.anonKey], ['SUPABASE_SERVICE_ROLE_KEY', cfg.serviceKey]]) {
    if (!v) throw new Error(`Missing ${k}. Copy .env.example to .env and fill it in.`);
  }
  if (!validTimeZone(cfg.timeZone)) throw new Error(`APP_TIMEZONE "${cfg.timeZone}" is not a valid time zone.`);

  const clientOpts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  const db = createClient(cfg.supabaseUrl, cfg.serviceKey, clientOpts);          // service role: server only
  const newAnon = () => createClient(cfg.supabaseUrl, cfg.anonKey, clientOpts);  // for password sign-in / refresh

  const state = { platformFee: 0.05 };
  const bus = new EventEmitter();
  bus.setMaxListeners(0);

  async function rpc(name, args = {}) {
    const { data, error } = await db.rpc(name, args);
    if (error) throw mapDbError(error, name);
    return data;
  }

  /* ---------------------------------------------------------------- auth */

  const tokenCache = new Map();   // access token -> { user, at }   (20 s, spares an Auth round trip per call)
  const TOKEN_TTL = 20000;

  async function userFromToken(token) {
    const hit = tokenCache.get(token);
    if (hit && Date.now() - hit.at < TOKEN_TTL) return hit.user;
    const { data, error } = await db.auth.getUser(token);
    if (error || !data || !data.user) return null;
    const user = { id: data.user.id, email: data.user.email || '' };
    if (tokenCache.size > 2000) tokenCache.clear();
    tokenCache.set(token, { user, at: Date.now() });
    return user;
  }

  const bearer = req => {
    const h = req.headers.authorization || '';
    return /^Bearer\s+/i.test(h) ? h.replace(/^Bearer\s+/i, '').trim() : '';
  };

  /** auth(): required login.  auth({optional:true}): anonymous allowed.  auth({query:true}): token may be in ?access_token= (EventSource). */
  const auth = (o = {}) => ah(async (req, res, next) => {
    const token = bearer(req) || (o.query ? qstr(req.query.access_token) || '' : '');
    const user = token ? await userFromToken(token) : null;
    if (!user && !o.optional) throw new ApiError(401, 'unauthorized', 'Please log in to continue.');
    req.user = user;
    req.token = token;
    next();
  });

  const adminSeen = new Map();   // admin user id -> last activity (idle time-out)
  const requireAdmin = [
    auth(),
    ah(async (req, res, next) => {
      if (!(await rpc('api_is_admin', { p_user: req.user.id }))) throw new ApiError(403, 'forbidden', 'Admin access required.');
      const seen = adminSeen.get(req.user.id);
      if (!seen || Date.now() - seen > cfg.adminIdleMs) {
        adminSeen.delete(req.user.id);
        throw new ApiError(401, 'session_expired', 'Your admin session expired. Please sign in again.');
      }
      adminSeen.set(req.user.id, Date.now());
      next();
    })
  ];

  const sessionOut = s => ({
    accessToken: s.access_token, refreshToken: s.refresh_token,
    expiresAt: s.expires_at || null, expiresIn: s.expires_in || null
  });

  async function passwordLogin(email, password) {
    const { data, error } = await newAnon().auth.signInWithPassword({ email, password });
    if (error || !data || !data.session) return null;
    return data;
  }

  /* ----------------------------------------------------------- rate limits */

  const limiter = (windowMs, limit, extra = {}) => cfg.disableRateLimit
    ? (req, res, next) => next()
    : rateLimit({
      windowMs, limit, standardHeaders: 'draft-7', legacyHeaders: false,
      handler: (req, res) => res.status(429).json({ error: { code: 'rate_limited', message: 'Too many requests. Please slow down and try again shortly.' } }),
      ...extra
    });
  const byUser = req => (req.user ? `u:${req.user.id}` : ipKeyGenerator(req.ip));

  const apiLimiter = limiter(60000, 600);
  const authLimiter = limiter(15 * 60000, 30, { skipSuccessfulRequests: true });
  const signupLimiter = limiter(60 * 60000, 20);
  const uploadLimiter = limiter(60000, 20, { keyGenerator: byUser });
  const aiLimiter = limiter(60000, 20, { keyGenerator: byUser });
  const chatLimiter = limiter(60000, 60, { keyGenerator: byUser });
  const trackLimiter = limiter(60000, 180, { keyGenerator: byUser });
  const writeLimiter = limiter(60000, 120, { keyGenerator: byUser });

  /* ---------------------------------------------------------------- app */

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', cfg.trustProxy);

  const connectSrc = ["'self'", 'https://nominatim.openstreetmap.org', cfg.supabaseUrl, cfg.supabaseUrl.replace(/^http/, 'ws')];
  if (!cfg.disableCsp) {
    app.use(helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'default-src': ["'self'"],
          // the page uses inline <script>/<style>, Leaflet from unpkg, Google Fonts, OSM tiles and avatars
          'script-src': ["'self'", "'unsafe-inline'", 'https://unpkg.com'],
          'script-src-attr': ["'unsafe-inline'"],
          'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://unpkg.com'],
          'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
          'img-src': ["'self'", 'data:', 'blob:', 'https:'],
          'connect-src': connectSrc,
          'frame-src': ["'self'", 'https://www.openstreetmap.org'],
          'object-src': ["'none'"],
          'upgrade-insecure-requests': cfg.production ? [] : null
        }
      },
      crossOriginEmbedderPolicy: false,
      // helmet's default is "no-referrer", which makes OpenStreetMap's tile servers and Nominatim reject the map's
      // requests (they require a Referer). Send the origin to other sites, the full URL only within this site.
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
    }));
  } else {
    app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false, referrerPolicy: { policy: 'strict-origin-when-cross-origin' } }));
  }
  if (cfg.corsOrigins.length) app.use('/api', cors({ origin: cfg.corsOrigins, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], maxAge: 600 }));

  app.use((req, res, next) => {            // one short line per API request; never logs bodies or tokens
    if (!req.path.startsWith('/api/') || req.path === '/api/health') return next();
    const t0 = Date.now();
    res.on('finish', () => { if (res.statusCode >= 500 || process.env.LOG_REQUESTS === '1') log.info(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - t0}ms`); });
    next();
  });

  app.use('/api', express.json({ limit: '100kb' }));
  app.use('/api', apiLimiter);
  app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  /* ------------------------------------------------- static front-end files */

  const sendAsset = (file, type) => (req, res, next) => {
    const full = path.resolve(__dirname, '..', file);
    if (!fs.existsSync(full)) return next();
    res.type(type).set('Cache-Control', 'no-cache').sendFile(full);
  };
  app.get(['/', '/index.html'], sendAsset(cfg.appHtml, 'html'));
  app.get('/' + cfg.appHtml, sendAsset(cfg.appHtml, 'html'));
  app.get('/skillLink.js', sendAsset('skillLink.js', 'js'));
  app.get('/last.css', sendAsset('last.css', 'css'));
  if (fs.existsSync(path.join(__dirname, 'public'))) app.use(express.static(path.join(__dirname, 'public'), { dotfiles: 'ignore', index: false }));

  /* ------------------------------------------------------------- health, config */

  app.get('/api/health', (req, res) => res.json({ ok: true, ai: gemini.status() }));

  app.get('/api/config', ah(async (req, res) => {
    res.json({
      platformFee: state.platformFee,
      timeZone: cfg.timeZone,
      payMethods: gemini.PAY_METHODS,
      units: gemini.UNITS,
      availability: ['Weekdays', 'Weekends', 'Every day'],
      categories: await rpc('api_list_categories'),
      lowRating: { max: state.lowMax, removeAt: state.removeAt },
      passwordMinLength: cfg.passwordMin,
      aiEnabled: gemini.isConfigured()
    });
  }));

  app.get('/api/categories', ah(async (req, res) => res.json({ items: await rpc('api_list_categories') })));

  /* ------------------------------------------------------- sign up / log in */

  async function sessionResponse(data) {
    const me = await rpc('api_me', { p_user: data.user.id });
    return { session: sessionOut(data.session), user: { id: data.user.id, email: data.user.email }, me };
  }

  app.post('/api/auth/signup', signupLimiter, ah(async (req, res) => {
    const email = String(bodyOf(req).email || '').trim().toLowerCase();
    const password = String(bodyOf(req).password || '');
    if (!EMAIL_RE.test(email) || email.length > 254) throw new ApiError(422, 'invalid', 'Enter a valid email address.');
    if (password.length < cfg.passwordMin) throw new ApiError(422, 'invalid', `Password must be at least ${cfg.passwordMin} characters.`);
    if (password.length > 72) throw new ApiError(422, 'invalid', 'Password can be at most 72 characters.');

    const { data: created, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) {
      if (error.code === 'email_exists' || /already|registered|exists/i.test(error.message || '')) {
        throw new ApiError(409, 'conflict', 'An account with this email already exists.');
      }
      if (error.code === 'weak_password') throw new ApiError(422, 'invalid', error.message);
      log.error('signup failed:', error.code || '', error.message);
      throw new ApiError(500, 'server_error', 'Could not create your account. Please try again.');
    }
    await rpc('api_ensure_profile', { p_user: created.user.id, p_email: email });
    const data = await passwordLogin(email, password);
    if (!data) throw new ApiError(500, 'server_error', 'Your account was created. Please log in.');
    res.status(201).json(await sessionResponse(data));
  }));

  app.post('/api/auth/login', authLimiter, ah(async (req, res) => {
    const email = String(bodyOf(req).email || '').trim().toLowerCase();
    const password = String(bodyOf(req).password || '');
    if (!email || !password) throw new ApiError(422, 'invalid', 'Enter your email and password.');
    const data = await passwordLogin(email, password);
    if (!data) throw new ApiError(401, 'invalid_credentials', 'Incorrect email or password.');
    await rpc('api_ensure_profile', { p_user: data.user.id, p_email: data.user.email });
    res.json(await sessionResponse(data));
  }));

  app.post('/api/auth/refresh', authLimiter, ah(async (req, res) => {
    const refresh = String(bodyOf(req).refreshToken || '');
    if (!refresh) throw new ApiError(422, 'invalid', 'Missing refresh token.');
    const { data, error } = await newAnon().auth.refreshSession({ refresh_token: refresh });
    if (error || !data || !data.session) throw new ApiError(401, 'unauthorized', 'Your session expired. Please log in again.');
    res.json({ session: sessionOut(data.session), user: { id: data.user.id, email: data.user.email } });
  }));

  app.post('/api/auth/logout', auth({ optional: true }), ah(async (req, res) => {
    if (req.token) {
      tokenCache.delete(req.token);
      try { await db.auth.admin.signOut(req.token, 'local'); } catch { /* best effort */ }
    }
    if (req.user) adminSeen.delete(req.user.id);
    res.json({ ok: true });
  }));

  /* ------------------------------------------------------------ admin login */

  const attempts = new Map();   // "ip|email" -> { n, lockUntil }
  setInterval(() => { const now = Date.now(); for (const [k, v] of attempts) if (v.lockUntil < now && now - (v.at || 0) > cfg.adminLockMs) attempts.delete(k); }, 60000).unref();

  app.post('/api/admin/login', authLimiter, ah(async (req, res) => {
    const email = String(bodyOf(req).email || '').trim().toLowerCase();
    const password = String(bodyOf(req).password || '');
    const key = `${req.ip}|${email}`;
    const rec = attempts.get(key) || { n: 0, lockUntil: 0 };

    if (rec.lockUntil > Date.now()) {
      const mins = Math.ceil((rec.lockUntil - Date.now()) / 60000);
      throw new ApiError(429, 'locked', `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`);
    }
    if (!email || !password) throw new ApiError(422, 'invalid', 'Enter your email and password.');

    const data = await passwordLogin(email, password);
    const isAdmin = data ? await rpc('api_is_admin', { p_user: data.user.id }) : false;
    if (!data || !isAdmin) {                 // same answer whether the account is unknown or simply not an admin
      rec.n += 1; rec.at = Date.now();
      let message = `Incorrect email or password. ${Math.max(0, cfg.adminMaxAttempts - rec.n)} tries left.`;
      if (rec.n >= cfg.adminMaxAttempts) { rec.lockUntil = Date.now() + cfg.adminLockMs; rec.n = 0; message = `Too many failed attempts. Locked for ${Math.round(cfg.adminLockMs / 60000)} minutes.`; }
      attempts.set(key, rec);
      throw new ApiError(rec.lockUntil > Date.now() ? 429 : 401, rec.lockUntil > Date.now() ? 'locked' : 'invalid_credentials', message);
    }
    attempts.delete(key);
    adminSeen.set(data.user.id, Date.now());
    await rpc('api_admin_log_event', { p_admin: data.user.id, p_text: 'Admin signed in' });
    res.json({ session: sessionOut(data.session), user: { id: data.user.id, email: data.user.email }, idleMinutes: cfg.adminIdleMs / 60000 });
  }));

  app.post('/api/admin/logout', requireAdmin, ah(async (req, res) => {
    await rpc('api_admin_log_event', { p_admin: req.user.id, p_text: 'Admin signed out' });
    adminSeen.delete(req.user.id);
    tokenCache.delete(req.token);
    try { await db.auth.admin.signOut(req.token, 'local'); } catch { /* best effort */ }
    res.json({ ok: true });
  }));

  /* ------------------------------------------------------------ me / profile */

  app.get('/api/me', auth(), ah(async (req, res) => res.json(await rpc('api_me', { p_user: req.user.id }))));

  app.patch('/api/me', auth(), writeLimiter, ah(async (req, res) => {
    const patch = pick(bodyOf(req), ['name', 'age', 'contact', 'location', 'bio']);
    const email = bodyOf(req).email === undefined ? null : String(bodyOf(req).email).trim().toLowerCase();
    if (email !== null && (!EMAIL_RE.test(email) || email.length > 254)) throw new ApiError(422, 'invalid', 'Enter a valid email address.');

    const before = await rpc('api_me', { p_user: req.user.id });
    let profile = before.profile;
    if (Object.keys(patch).length) profile = await rpc('api_update_profile', { p_user: req.user.id, p_patch: patch });

    if (email !== null && email !== before.profile.email.toLowerCase()) {
      const { error } = await db.auth.admin.updateUserById(req.user.id, { email, email_confirm: true });
      if (error) {
        if (/already|registered|exists/i.test(error.message || '') || error.code === 'email_exists') throw new ApiError(409, 'conflict', 'That email is already in use.');
        log.error('email change failed:', error.code || '', error.message);
        throw new ApiError(500, 'server_error', 'Could not change your email. Please try again.');
      }
      try {
        profile = await rpc('api_update_profile', { p_user: req.user.id, p_patch: { email } });
      } catch (e) {
        await db.auth.admin.updateUserById(req.user.id, { email: before.profile.email, email_confirm: true }).catch(() => { });
        throw e;
      }
      tokenCache.delete(req.token);
    }
    res.json({ profile });
  }));

  /* ------------------------------------------------------------------ uploads */

  const uploader = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES, files: 4, fields: 4, parts: 12 } });
  const receive = (mw) => (req, res, next) => mw(req, res, err => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return next(new ApiError(413, 'too_large', 'Each image can be at most 5 MB.'));
    if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') return next(new ApiError(422, 'invalid', 'You can upload up to 4 images.'));
    return next(new ApiError(400, 'invalid', 'The upload could not be read.'));
  });

  async function storeImages(files, bucket, prefix) {
    const out = [];
    for (const f of files) {
      const type = sniffImage(f.buffer);
      if (!type) throw new ApiError(415, 'unsupported_media', 'Only JPG, PNG, GIF or WebP images are allowed.');
      const objectPath = `${prefix}/${randomUUID()}.${type.ext}`;
      const { error } = await db.storage.from(bucket).upload(objectPath, f.buffer, { contentType: type.mime, upsert: false, cacheControl: '31536000' });
      if (error) { log.error('upload failed:', error.message); throw new ApiError(500, 'server_error', 'Could not save the image. Please try again.'); }
      out.push(objectPath);
    }
    return out;
  }

  const publicUrl = objectPath => db.storage.from(PUBLIC_BUCKET).getPublicUrl(objectPath).data.publicUrl;
  const publicPrefix = `${cfg.supabaseUrl}/storage/v1/object/public/${PUBLIC_BUCKET}/`;

  // Only URLs of images this user uploaded may be attached to a review (blocks javascript: and foreign links).
  function ownedPublicUrls(list, userId) {
    const urls = toStringList(list);
    if (urls.length > 4) throw new ApiError(422, 'invalid', 'You can attach up to 4 images.');
    for (const u of urls) {
      if (!u.startsWith(`${publicPrefix}reviews/${userId}/`) || u.includes('..') || /[\s"'<>]/.test(u)) {
        throw new ApiError(422, 'invalid', 'One of the images was not uploaded through SkillLink.');
      }
    }
    return urls;
  }

  app.put('/api/me/avatar', auth(), uploadLimiter, receive(uploader.single('image')), ah(async (req, res) => {
    if (!req.file) throw new ApiError(422, 'invalid', 'Choose an image.');
    const [objectPath] = await storeImages([req.file], PUBLIC_BUCKET, `avatars/${req.user.id}`);
    const before = await rpc('api_me', { p_user: req.user.id });
    const profile = await rpc('api_set_avatar', { p_user: req.user.id, p_url: publicUrl(objectPath) });
    const old = before.profile.avatar;
    if (old && old.startsWith(`${publicPrefix}avatars/${req.user.id}/`)) {
      db.storage.from(PUBLIC_BUCKET).remove([old.slice(publicPrefix.length)]).catch(() => { });
    }
    res.json({ profile });
  }));

  app.delete('/api/me/avatar', auth(), ah(async (req, res) => {
    const before = await rpc('api_me', { p_user: req.user.id });
    const profile = await rpc('api_set_avatar', { p_user: req.user.id, p_url: null });
    const old = before.profile.avatar;
    if (old && old.startsWith(`${publicPrefix}avatars/${req.user.id}/`)) {
      db.storage.from(PUBLIC_BUCKET).remove([old.slice(publicPrefix.length)]).catch(() => { });
    }
    res.json({ profile });
  }));

  app.post('/api/uploads/review', auth(), uploadLimiter, receive(uploader.array('images', 4)), ah(async (req, res) => {
    if (!req.files || !req.files.length) throw new ApiError(422, 'invalid', 'Choose at least one image.');
    const paths = await storeImages(req.files, PUBLIC_BUCKET, `reviews/${req.user.id}`);
    res.status(201).json({ urls: paths.map(publicUrl) });
  }));

  app.post('/api/uploads/evidence', auth(), uploadLimiter, receive(uploader.array('images', 4)), ah(async (req, res) => {
    if (!req.files || !req.files.length) throw new ApiError(422, 'invalid', 'Add at least one photo or screenshot as evidence.');
    const paths = await storeImages(req.files, EVIDENCE_BUCKET, `reports/${req.user.id}`);
    res.status(201).json({ paths });
  }));

  /* ------------------------------------------------------------- directory */

  app.get('/api/services', auth({ optional: true }), ah(async (req, res) => {
    const q = req.query;
    const filters = {};
    for (const k of ['category', 'q', 'unit', 'sort']) if (qstr(q[k])) filters[k] = qstr(q[k]).slice(0, 120);
    for (const k of ['maxPrice', 'minRating', 'limit', 'offset']) {
      const v = qstr(q[k]);
      if (v !== undefined && v !== '') { if (!Number.isFinite(Number(v))) throw new ApiError(422, 'invalid', `${k} must be a number.`); filters[k] = Number(v); }
    }
    if (qstr(q.providerId)) filters.providerId = uuidParam(qstr(q.providerId));
    res.json(await rpc('api_list_services', { p_filters: filters }));
  }));

  app.get('/api/services/:id', auth({ optional: true }), ah(async (req, res) => {
    res.json(await rpc('api_get_service', { p_id: idParam(req.params.id), p_viewer: req.user ? req.user.id : null }));
  }));

  app.get('/api/providers/:id', auth({ optional: true }), ah(async (req, res) => {
    res.json(await rpc('api_get_provider', { p_id: uuidParam(req.params.id), p_viewer: req.user ? req.user.id : null }));
  }));

  /* ------------------------------------------------------------------ cart */

  app.get('/api/cart', auth(), ah(async (req, res) => res.json(await rpc('api_cart_list', { p_user: req.user.id }))));
  app.post('/api/cart', auth(), writeLimiter, ah(async (req, res) => {
    res.status(201).json(await rpc('api_cart_add', { p_user: req.user.id, p_service: idParam(bodyOf(req).serviceId) }));
  }));
  app.delete('/api/cart/:serviceId', auth(), writeLimiter, ah(async (req, res) => {
    res.json(await rpc('api_cart_remove', { p_user: req.user.id, p_service: idParam(req.params.serviceId) }));
  }));

  /* -------------------------------------------------------- service requests */

  app.post('/api/service-requests', auth(), writeLimiter, ah(async (req, res) => {
    const data = pick(bodyOf(req), ['name', 'category', 'budget', 'location', 'description']);
    res.status(201).json(await rpc('api_create_request', { p_user: req.user.id, p_data: data }));
  }));

  /* ------------------------------------------------------ provider dashboard */

  app.post('/api/provider/register', auth(), writeLimiter, ah(async (req, res) => {
    const data = pick(bodyOf(req), ['fullName', 'contact', 'email', 'availability', 'address', 'city', 'province', 'lat', 'lng', 'about']);
    const out = await rpc('api_become_provider', { p_user: req.user.id, p_data: data });
    res.status(out.created ? 201 : 200).json(out);
  }));

  app.get('/api/provider/dashboard', auth(), ah(async (req, res) => res.json(await rpc('api_provider_dashboard', { p_user: req.user.id }))));
  app.get('/api/provider/demand', auth(), ah(async (req, res) => {
    if (!(await rpc('api_is_provider', { p_user: req.user.id }))) throw new ApiError(403, 'forbidden', 'Become a provider first.');
    res.json({ items: await rpc('api_demand', { p_limit: 5 }) });
  }));

  const serviceBody = req => ({ ...pick(bodyOf(req), ['name', 'category', 'price', 'unit', 'description']), skills: toStringList(bodyOf(req).skills) });

  app.post('/api/provider/services', auth(), writeLimiter, ah(async (req, res) => {
    res.status(201).json(await rpc('api_provider_save_service', { p_user: req.user.id, p_id: null, p_data: serviceBody(req) }));
  }));
  app.put('/api/provider/services/:id', auth(), writeLimiter, ah(async (req, res) => {
    res.json(await rpc('api_provider_save_service', { p_user: req.user.id, p_id: idParam(req.params.id), p_data: serviceBody(req) }));
  }));
  app.delete('/api/provider/services/:id', auth(), writeLimiter, ah(async (req, res) => {
    res.json(await rpc('api_provider_delete_service', { p_user: req.user.id, p_id: idParam(req.params.id) }));
  }));
  app.get('/api/provider/services/:id/reviews', auth(), ah(async (req, res) => {
    res.json(await rpc('api_provider_service_reviews', { p_user: req.user.id, p_service: idParam(req.params.id) }));
  }));
  app.post('/api/provider/reviews/:id/reply', auth(), writeLimiter, ah(async (req, res) => {
    const text = typeof bodyOf(req).text === 'string' ? bodyOf(req).text : '';
    res.status(201).json(await rpc('api_provider_reply', { p_user: req.user.id, p_review: idParam(req.params.id), p_text: text }));
  }));

  app.get('/api/provider/bookings', auth(), ah(async (req, res) => res.json({ items: await rpc('api_provider_bookings', { p_user: req.user.id }) })));

  /** The provider's phone posts its position while on the way. */
  app.post('/api/provider/bookings/:id/location', auth(), trackLimiter, ah(async (req, res) => {
    const b = bodyOf(req);
    const lat = Number(b.lat), lng = Number(b.lng), speed = b.speed === undefined || b.speed === null ? 0 : Number(b.speed);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw new ApiError(422, 'invalid', 'Location is not valid.');
    }
    const id = uuidParam(req.params.id);
    await rpc('api_post_location', { p_user: req.user.id, p_booking: id, p_lat: lat, p_lng: lng, p_speed: Number.isFinite(speed) ? Math.max(0, Math.min(speed, 250)) : 0 });
    bus.emit(`track:${id}`);
    res.json({ ok: true });
  }));

  /* -------------------------------------------------------------- bookings */

  const CARD_KEYS = ['number', 'cardNumber', 'card_number', 'pan', 'cvc', 'cvv', 'exp', 'expiry', 'expiryDate'];

  app.post('/api/bookings', auth(), writeLimiter, ah(async (req, res) => {
    const b = bodyOf(req);
    if (CARD_KEYS.some(k => b[k] !== undefined) || (b.card && typeof b.card === 'object')) {
      throw new ApiError(422, 'invalid', 'Do not send card numbers to SkillLink. Send only the last 4 digits as "last4".');
    }
    const data = pick(b, ['serviceId', 'location', 'date', 'time', 'qty', 'method', 'last4', 'lat', 'lng']);
    const tz = typeof b.timezone === 'string' && validTimeZone(b.timezone) ? b.timezone : cfg.timeZone;
    if (typeof data.date === 'string' && typeof data.time === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.date) && /^\d{2}:\d{2}$/.test(data.time)) {
      data.whenLabel = whenLabel(data.date, data.time);
    }
    data.tz = tz;
    res.status(201).json(await rpc('api_create_booking', { p_user: req.user.id, p_data: data }));
  }));

  app.get('/api/bookings', auth(), ah(async (req, res) => res.json({ items: await rpc('api_list_bookings', { p_user: req.user.id }) })));
  app.get('/api/bookings/:id', auth(), ah(async (req, res) => res.json(await rpc('api_get_booking', { p_user: req.user.id, p_id: uuidParam(req.params.id) }))));

  const after = (id, out) => { bus.emit(`track:${id}`); return out; };
  app.post('/api/bookings/:id/finish', auth(), writeLimiter, ah(async (req, res) => {
    const id = uuidParam(req.params.id);
    res.json(after(id, await rpc('api_finish_booking', { p_user: req.user.id, p_id: id })));
  }));
  app.post('/api/bookings/:id/cancel', auth(), writeLimiter, ah(async (req, res) => {
    const id = uuidParam(req.params.id);
    res.json(after(id, await rpc('api_cancel_booking', { p_user: req.user.id, p_id: id })));
  }));

  app.post('/api/bookings/:id/rating', auth(), writeLimiter, ah(async (req, res) => {
    const stars = Number(bodyOf(req).stars);
    if (!Number.isInteger(stars)) throw new ApiError(422, 'invalid', 'Choose a rating from 1 to 5.');
    res.status(201).json(await rpc('api_rate_booking', { p_user: req.user.id, p_id: uuidParam(req.params.id), p_stars: stars }));
  }));

  app.post('/api/bookings/:id/review', auth(), writeLimiter, ah(async (req, res) => {
    const b = bodyOf(req);
    res.status(201).json(await rpc('api_review_booking', {
      p_user: req.user.id, p_booking: uuidParam(req.params.id), p_service: null,
      p_text: typeof b.text === 'string' ? b.text : '', p_images: ownedPublicUrls(b.images, req.user.id)
    }));
  }));

  // Same thing from the service page: attaches to the user's latest rated job of that service
  app.post('/api/services/:id/reviews', auth(), writeLimiter, ah(async (req, res) => {
    const b = bodyOf(req);
    res.status(201).json(await rpc('api_review_booking', {
      p_user: req.user.id, p_booking: null, p_service: idParam(req.params.id),
      p_text: typeof b.text === 'string' ? b.text : '', p_images: ownedPublicUrls(b.images, req.user.id)
    }));
  }));

  app.post('/api/bookings/:id/report', auth(), writeLimiter, ah(async (req, res) => {
    const b = bodyOf(req);
    const evidence = toStringList(b.evidence);
    for (const p of evidence) {
      if (!p.startsWith(`reports/${req.user.id}/`) || p.includes('..') || /[\s"'<>]/.test(p)) {
        throw new ApiError(422, 'invalid', 'One of the evidence images was not uploaded through SkillLink.');
      }
    }
    res.status(201).json(await rpc('api_report_booking', {
      p_user: req.user.id, p_id: uuidParam(req.params.id),
      p_reason: typeof b.reason === 'string' ? b.reason : '', p_details: typeof b.details === 'string' ? b.details : '', p_evidence: evidence
    }));
  }));

  /* ------------------------------------------------------------- live tracking */

  app.get('/api/bookings/:id/track', auth(), trackLimiter, ah(async (req, res) => {
    res.json(await rpc('api_track', { p_user: req.user.id, p_booking: uuidParam(req.params.id) }));
  }));

  const streams = new Map();   // user id -> open stream count
  app.get('/api/bookings/:id/track/stream', auth({ query: true }), trackLimiter, ah(async (req, res) => {
    const id = uuidParam(req.params.id);
    const userId = req.user.id;
    const snap = await rpc('api_track', { p_user: userId, p_booking: id });   // also proves the user is part of this booking
    if ((streams.get(userId) || 0) >= 5) throw new ApiError(429, 'too_many_streams', 'Too many open tracking views.');
    streams.set(userId, (streams.get(userId) || 0) + 1);

    res.status(200).set({
      'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive', 'X-Accel-Buffering': 'no'
    });
    res.flushHeaders();
    res.write('retry: 4000\n\n');

    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    const fingerprint = t => JSON.stringify({ ...t, ageSeconds: 0 });
    let last = fingerprint(snap), busy = false, closed = false;
    send('track', snap);

    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(poll); clearInterval(beat);
      bus.off(`track:${id}`, refresh);
      streams.set(userId, Math.max(0, (streams.get(userId) || 1) - 1));
    };
    async function refresh() {
      if (busy || closed) return;
      busy = true;
      try {
        const t = await rpc('api_track', { p_user: userId, p_booking: id });
        const fp = fingerprint(t);
        if (fp !== last) { last = fp; send('track', t); }
        if (t.status !== 'Ongoing') { send('end', { status: t.status }); cleanup(); res.end(); }
      } catch (e) {
        if (e.status === 404) { cleanup(); res.end(); }
      } finally { busy = false; }
    }
    const poll = setInterval(refresh, 5000);          // also covers writes from other server instances
    const beat = setInterval(() => { if (!closed) res.write(': ping\n\n'); }, 25000);
    bus.on(`track:${id}`, refresh);
    req.on('close', cleanup);
    if (snap.status !== 'Ongoing') { send('end', { status: snap.status }); cleanup(); res.end(); }
  }));

  /* ------------------------------------------------------------ notifications */

  app.get('/api/notifications', auth(), ah(async (req, res) => res.json(await rpc('api_notifications', { p_user: req.user.id }))));
  app.post('/api/notifications/read-all', auth(), ah(async (req, res) => res.json(await rpc('api_notifications_read_all', { p_user: req.user.id }))));
  app.patch('/api/notifications/:id', auth(), ah(async (req, res) => {
    const unread = bodyOf(req).unread;
    if (typeof unread !== 'boolean') throw new ApiError(422, 'invalid', '"unread" must be true or false.');
    res.json(await rpc('api_notification_update', { p_user: req.user.id, p_id: idParam(req.params.id), p_unread: unread }));
  }));
  app.delete('/api/notifications/:id', auth(), ah(async (req, res) => {
    res.json(await rpc('api_notification_delete', { p_user: req.user.id, p_id: idParam(req.params.id) }));
  }));

  /* ---------------------------------------------------------------- chat */

  app.get('/api/chats', auth(), ah(async (req, res) => res.json({ items: await rpc('api_chat_list', { p_user: req.user.id }) })));
  app.get('/api/chats/:userId/messages', auth(), ah(async (req, res) => {
    const afterId = qstr(req.query.after);
    res.json(await rpc('api_chat_messages', {
      p_user: req.user.id, p_other: uuidParam(req.params.userId), p_after: afterId && /^\d{1,15}$/.test(afterId) ? Number(afterId) : 0
    }));
  }));
  app.post('/api/chats/:userId/messages', auth(), chatLimiter, ah(async (req, res) => {
    const text = typeof bodyOf(req).text === 'string' ? bodyOf(req).text : '';
    res.status(201).json(await rpc('api_chat_send', { p_user: req.user.id, p_other: uuidParam(req.params.userId), p_text: text }));
  }));

  /* -------------------------------------------------------------------- AI */

  /** Database-backed tools handed to the assistant (gemini.js). */
  function assistantTools(user) {
    const compact = s => ({ id: s.id, name: s.name, category: s.category, provider: s.provider, price: s.price, unit: s.unit, rating: s.rating, reviews: s.reviews, availability: s.availability });

    async function prepareBooking(a) {
      let svc;
      try { svc = await rpc('api_get_service', { p_id: a.serviceId, p_viewer: user.id }); }
      catch (e) { if (e instanceof ApiError && e.status !== 404) throw e; throw new ApiError(404, 'not_found', 'That service is not available.'); }
      if (svc.isOwn) throw new ApiError(422, 'invalid', 'You cannot hire your own service.');
      if (svc.status !== 'active') throw new ApiError(404, 'not_found', 'That service is not available.');

      const now = localNow(cfg.timeZone);
      const notes = [];
      let date = a.date, time = a.time;
      const assumedDay = a.assumedDay !== undefined ? a.assumedDay : !date;
      const assumedTime = a.assumedTime !== undefined ? a.assumedTime : !time;
      if (!date) date = shiftDate(now.date, 1);
      if (!time) time = '09:00';
      if (date < now.date || (date === now.date && time <= now.time)) { date = shiftDate(date < now.date ? now.date : date, 1); }

      let moved = false;
      for (let i = 0; i < 8 && !isOpenDay(svc.availability, date); i++) { date = shiftDate(date, 1); moved = true; }

      const method = a.paymentMethod || 'cash';
      const qty = svc.unit === 'per job' ? 1 : Math.max(1, Math.min(30, Math.trunc(a.quantity) || 1));
      const subtotal = Number(svc.price) * qty;
      const fee = Math.round(subtotal * state.platformFee);
      const label = whenLabel(date, time);

      if (assumedDay) notes.push('You did not give a day, so I used tomorrow.');
      if (assumedTime) notes.push('You did not give a time, so I used 9:00 AM.');
      if (!a.paymentMethod) notes.push('You did not choose a payment method, so I used cash.');
      if (moved) notes.push(`${svc.provider} works ${svc.availability.toLowerCase()}, so I moved it to the next open day.`);

      const summary = `${svc.name} by ${svc.provider} is rated ${Number(svc.rating).toFixed(1)}. Here is the booking I would make. Nothing is charged until you confirm. ${notes.join(' ')}`.trim();
      return {
        result: {
          service: { id: svc.id, name: svc.name, provider: svc.provider, price: svc.price, unit: svc.unit, availability: svc.availability },
          date, time, whenLabel: label, quantity: qty, paymentMethod: method, subtotal, fee, total: subtotal + fee, notes, summary
        },
        steps: [`Matched ${svc.name} by ${svc.provider}`, `Checked availability (${svc.availability})`, 'Prepared a booking for your review'],
        card: { type: 'book', serviceId: svc.id, qty, method, state: 'proposed', date, time, whenLabel: label }
      };
    }

    return {
      async searchServices({ query, category, maxPrice, sort }) {
        const filters = { limit: 5, sort: sort || 'rating' };
        if (query) filters.q = query;
        if (category) filters.category = category;
        if (Number.isFinite(maxPrice)) filters.maxPrice = maxPrice;
        const out = await rpc('api_list_services', { p_filters: filters });
        const steps = [`Found ${out.total} matching service${out.total === 1 ? '' : 's'}`];
        if (Number.isFinite(maxPrice)) steps.push(`Filtered to ${peso(maxPrice)} or less`);
        return { result: { total: out.total, items: out.items.map(compact) }, steps, resultIds: out.items.map(i => i.id) };
      },

      prepareBooking,

      async providerLocation() {
        const booking = await rpc('api_active_booking', { p_user: user.id });
        if (!booking) return { result: { found: false, summary: 'You have no ongoing booking to track.' }, steps: [] };
        const t = await rpc('api_track', { p_user: user.id, p_booking: booking.id });
        const dist = t.distanceM == null ? null : t.distanceM < 1000 ? `${t.distanceM} m` : `${(t.distanceM / 1000).toFixed(1)} km`;
        const summary = t.step === 2 ? `${booking.provider} has arrived for ${booking.service}.`
          : t.step === 1 ? (dist ? `${booking.provider} is about ${dist} away, roughly ${t.etaMin} min.` : `${booking.provider} is on the way.`)
            : `${booking.provider} accepted ${booking.service} (${booking.ref}) and has not left yet.`;
        return {
          result: { found: true, ref: booking.ref, provider: booking.provider, service: booking.service, step: t.step, distance: dist, etaMin: t.etaMin, summary },
          steps: ['Found your active booking', `Read ${booking.provider}'s live location`],
          card: { type: 'track', ref: booking.ref }
        };
      },

      async paymentSummary() {
        const p = await rpc('api_payment_summary', { p_user: user.id });
        if (!p.any) return { result: { summary: 'You have no payments yet.' }, steps: ['Read your payment records'] };
        const parts = [];
        if (Number(p.held)) parts.push(`${peso(p.held)} is held until your jobs are finished`);
        if (Number(p.released)) parts.push(`${peso(p.released)} was released to providers`);
        if (Number(p.dueCash)) parts.push(`${peso(p.dueCash)} is cash still due`);
        if (Number(p.paidCash)) parts.push(`${peso(p.paidCash)} was paid in cash`);
        return { result: { ...p, summary: parts.length ? parts.join('; ') + '.' : 'Nothing is pending right now.' }, steps: ['Read your payment records'] };
      }
    };
  }

  app.get('/api/assistant/status', auth(), (req, res) => res.json({ ai: gemini.status() }));

  app.post('/api/assistant/chat', auth(), aiLimiter, ah(async (req, res) => {
    const b = bodyOf(req);
    if (typeof b.message !== 'string' || !b.message.trim()) throw new ApiError(422, 'invalid', 'Write a message.');
    if (b.message.length > 600) throw new ApiError(422, 'invalid', 'Messages can be at most 600 characters.');
    const history = Array.isArray(b.history) ? b.history.filter(h => h && typeof h.text === 'string').slice(-10).map(h => ({ role: h.role === 'user' || h.who === 'me' ? 'user' : 'bot', text: h.text.slice(0, 600) })) : [];
    const reply = await gemini.assistantReply({ message: b.message, history, tools: assistantTools(req.user), timeZone: cfg.timeZone });
    const { error, ...safe } = reply;   // internal error text stays in the logs
    if (error) log.warn('assistant fell back:', error);
    res.json({ reply: safe });
  }));

  // The "Book" button on a result card: a deterministic proposal, no AI involved.
  app.post('/api/assistant/propose', auth(), writeLimiter, ah(async (req, res) => {
    const b = bodyOf(req);
    const text = typeof b.text === 'string' ? b.text.slice(0, 300) : '';
    const w = gemini.parseWhen(text, new Date(), cfg.timeZone);
    const out = await assistantTools(req.user).prepareBooking({
      serviceId: idParam(b.serviceId),
      date: /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : (text ? w.date : undefined),
      time: /^\d{2}:\d{2}$/.test(b.time || '') ? b.time : (text ? w.time : undefined),
      paymentMethod: gemini.PAY_METHODS.includes(b.method) ? b.method : gemini.parseMethod(text),
      quantity: Number(b.qty) || undefined,
      assumedDay: b.date ? false : text ? w.assumedDay : true,
      assumedTime: b.time ? false : text ? w.assumedTime : true
    });
    res.json({ reply: { who: 'bot', source: 'rules', steps: out.steps, text: out.result.summary, card: out.card } });
  }));

  app.post('/api/provider/recommendations', auth(), aiLimiter, ah(async (req, res) => {
    if (!(await rpc('api_is_provider', { p_user: req.user.id }))) throw new ApiError(403, 'forbidden', 'Become a provider first.');
    const skills = toStringList(bodyOf(req).skills);
    if (!skills.length) throw new ApiError(422, 'invalid', 'Enter at least one skill.');
    const market = await rpc('api_market_snapshot', { p_user: req.user.id });
    const out = await gemini.recommendServices({ skills, market });
    if (out.error) log.warn('recommendations fell back:', out.error);
    delete out.error;
    res.json(out);
  }));

  /* ----------------------------------------------------------------- admin */

  app.get('/api/admin/overview', requireAdmin, ah(async (req, res) => res.json(await rpc('api_admin_overview', { p_admin: req.user.id }))));

  app.get('/api/admin/providers', requireAdmin, ah(async (req, res) => {
    const filters = {};
    for (const k of ['q', 'status', 'sort']) if (qstr(req.query[k])) filters[k] = qstr(req.query[k]).slice(0, 80);
    res.json({ items: await rpc('api_admin_providers', { p_admin: req.user.id, p_filters: filters }) });
  }));

  app.get('/api/admin/providers/:id', requireAdmin, ah(async (req, res) => {
    const d = await rpc('api_admin_provider_detail', { p_admin: req.user.id, p_provider: uuidParam(req.params.id) });
    // evidence is private: hand out 10-minute signed links
    const all = d.reports.flatMap(r => r.evidence);
    const signed = new Map();
    if (all.length) {
      const { data } = await db.storage.from(EVIDENCE_BUCKET).createSignedUrls(all, 600);
      for (const s of data || []) if (s && s.signedUrl) signed.set(s.path, s.signedUrl);
    }
    d.reports = d.reports.map(r => ({ ...r, evidence: r.evidence.map(p => signed.get(p)).filter(Boolean) }));
    res.json(d);
  }));

  app.post('/api/admin/providers/:id/warnings', requireAdmin, ah(async (req, res) => {
    const b = bodyOf(req);
    res.status(201).json(await rpc('api_admin_warn', {
      p_admin: req.user.id, p_provider: uuidParam(req.params.id),
      p_reason: typeof b.reason === 'string' ? b.reason : '', p_message: typeof b.message === 'string' ? b.message : ''
    }));
  }));
  app.post('/api/admin/services/:id/remove', requireAdmin, ah(async (req, res) => res.json(await rpc('api_admin_remove_service', { p_admin: req.user.id, p_service: idParam(req.params.id) }))));
  app.post('/api/admin/services/:id/restore', requireAdmin, ah(async (req, res) => res.json(await rpc('api_admin_restore_service', { p_admin: req.user.id, p_service: idParam(req.params.id) }))));
  app.post('/api/admin/reports/:id/resolve', requireAdmin, ah(async (req, res) => res.json(await rpc('api_admin_resolve_report', { p_admin: req.user.id, p_report: idParam(String(req.params.id).replace(/^R-/i, '')) }))));

  /* ------------------------------------------------------- fallthrough + errors */

  app.use('/api', (req, res) => res.status(404).json({ error: { code: 'not_found', message: 'Not found.' } }));

  app.use((err, req, res, next) => {   // eslint-disable-line no-unused-vars
    if (res.headersSent) return res.end();
    if (err instanceof ApiError) return res.status(err.status).json({ error: { code: err.code, message: err.message } });
    if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: { code: 'invalid_json', message: 'The request body is not valid JSON.' } });
    if (err && err.type === 'entity.too.large') return res.status(413).json({ error: { code: 'too_large', message: 'The request is too large.' } });
    log.error(`${req.method} ${req.path}:`, err && err.stack || err);
    res.status(500).json({ error: { code: 'server_error', message: 'Something went wrong on our side. Please try again.' } });
  });

  /* ---------------------------------------------------------------- startup */

  async function ensureBuckets() {
    const wanted = [[PUBLIC_BUCKET, true], [EVIDENCE_BUCKET, false]];
    for (const [id, isPublic] of wanted) {
      try {
        const { data } = await db.storage.getBucket(id);
        if (data) continue;
        const { error } = await db.storage.createBucket(id, { public: isPublic, fileSizeLimit: MAX_IMAGE_BYTES, allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] });
        if (error && !/already exists/i.test(error.message || '')) throw error;
        log.info(`created storage bucket ${id}`);
      } catch (e) {
        log.warn(`could not verify storage bucket ${id}: ${e.message || e}. Uploads will fail until it exists (run supabase_schema.sql).`);
      }
    }
  }

  async function bootstrapAdmin() {
    if (!cfg.adminEmail) return;
    let id = await rpc('api_find_user_id', { p_email: cfg.adminEmail });
    if (!id) {
      if (!cfg.adminPassword) { log.warn(`ADMIN_EMAIL is set but no account exists and ADMIN_PASSWORD is empty. Admin not created.`); return; }
      const { data, error } = await db.auth.admin.createUser({ email: cfg.adminEmail, password: cfg.adminPassword, email_confirm: true });
      if (error) { log.error('could not create the admin account:', error.message); return; }
      id = data.user.id;
      await rpc('api_ensure_profile', { p_user: id, p_email: cfg.adminEmail });
      log.info('admin account created');
    } else if (cfg.adminPassword) {
      // The configured credentials are authoritative for this admin account too.
      // Existing Supabase users otherwise keep their old password indefinitely.
      const { error } = await db.auth.admin.updateUserById(id, { password: cfg.adminPassword });
      if (error) throw new Error(`Could not apply ADMIN_PASSWORD to the configured admin account: ${error.message}`);
    }
    await rpc('api_set_admin', { p_user: id, p_value: true });
    log.info('admin account ready');
  }

  async function init() {
    const conf = await rpc('api_config');          // fails fast if the schema is missing
    state.platformFee = Number(conf.platformFee);
    state.lowMax = Number(conf.lowRatingMax);
    state.removeAt = Number(conf.lowRatingRemoveAt);
    await ensureBuckets();
    await bootstrapAdmin();
  }

  return { app, init, config: cfg };
}

/* ============================================================================
 * Start
 * ========================================================================= */

async function start() {
  const { app, init, config } = createApp();
  try {
    await init();
  } catch (e) {
    log.error('Start-up check failed:', e.message || e);
    log.error('Did you run supabase_schema.sql in the Supabase SQL editor, and are the keys in .env correct?');
    process.exit(1);
  }
  const server = app.listen(config.port, () => {
    log.info(`SkillLink listening on http://localhost:${config.port}`);
    log.info(gemini.isConfigured() ? `AI: Gemini enabled (${gemini.status().models.join(', ')})` : 'AI: GEMINI_API_KEY not set, using built-in fallbacks');
    if (!fs.existsSync(path.resolve(__dirname, '..', config.appHtml))) log.warn(`${config.appHtml} not found next to the app root, so the web page will not be served.`);
  });
  server.requestTimeout = 60000;
  const stop = () => { log.info('shutting down'); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 10000).unref(); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

if (require.main === module) start();

module.exports = { createApp, start, _internals: { whenLabel, sniffImage, shiftDate, isOpenDay, mapDbError, ApiError } };
