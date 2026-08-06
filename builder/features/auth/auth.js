// ── Auth middleware & routes ──────────────────────────────────────────────────
// Handles login/logout and protects all builder routes.
// Phase 3: real per-user accounts via Supabase Auth (email + password).

const path = require('path');
const store = require('../../lib/store');

// Routes that don't require a login
const PUBLIC_PATHS = ['/auth/login', '/auth/logout', '/auth/callback', '/auth/session'];

// Social login providers we allow → their Supabase provider id. (LinkedIn's
// current provider is "linkedin_oidc"; Slack's is "slack_oidc".)
const SOCIAL_PROVIDERS = { google: 'google', linkedin: 'linkedin_oidc', slack: 'slack_oidc' };

// Admin gate. Until Phase 5 brings real roles + RLS, "admin" is a simple email
// allowlist from .env: ADMIN_EMAILS=you@example.com,teammate@example.com. If it
// is left unset, every logged-in user is treated as admin (single-user friendly)
// — set ADMIN_EMAILS to lock user-management down to specific people.
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);

function isAdmin(req) {
  if (!req.session || !req.session.user) return false;
  if (ADMIN_EMAILS.length === 0) return true; // no allowlist configured → allow
  return ADMIN_EMAILS.indexOf((req.session.user.email || '').toLowerCase()) !== -1;
}

// Middleware for admin-only routes (JSON 403 — these are all API/admin routes).
function requireAdmin(req, res, next) {
  if (isAdmin(req)) return next();
  return res.status(403).json({ success: false, error: 'Admin access required.' });
}

// Middleware: redirect to /login if not authenticated (JSON 401 for API calls)
function requireAuth(req, res, next) {
  if (PUBLIC_PATHS.includes(req.path)) return next();
  if (req.session && req.session.user) return next();
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ success: false, error: 'Session expired. Please reload and log in again.' });
  }
  res.redirect('/auth/login');
}

// Register auth routes on an Express app
function registerAuthRoutes(app) {
  if (ADMIN_EMAILS.length === 0) {
    console.warn('[auth] ADMIN_EMAILS not set — every logged-in user can manage users. ' +
      'Set ADMIN_EMAILS in .env to restrict this.');
  }

  // GET /auth/login — serve login page
  app.get('/auth/login', function (req, res) {
    if (req.session && req.session.user) return res.redirect('/');
    res.sendFile(path.join(__dirname, 'login.html'));
  });

  // POST /auth/login — authenticate with Supabase Auth (email + password).
  app.post('/auth/login', async function (req, res) {
    const email = (req.body.email || '').trim();
    const password = (req.body.password || '');

    try {
      const { data, error } = await store.supabaseAuth.auth.signInWithPassword({ email, password });
      if (!error && data && data.user) {
        req.session.user = { id: data.user.id, email: data.user.email };
        return res.redirect('/');
      }
    } catch (e) {
      console.warn('[auth] Supabase sign-in error:', e.message);
    }

    res.redirect('/auth/login?error=1');
  });

  // GET /auth/logout — destroy the session and return to login.
  // (We keep auth server-side in express-session and don't persist the Supabase
  // client session, so there's nothing to sign out of on Supabase's side.)
  app.get('/auth/logout', function (req, res) {
    req.session.destroy(function () {
      res.redirect('/auth/login');
    });
  });

  // ── Social login (OAuth) ────────────────────────────────────────────────────
  // GET /auth/login/:provider — kick off social login. We redirect to Supabase's
  // authorize endpoint, which bounces to the provider and back to /auth/callback
  // with the session tokens in the URL hash (implicit flow — no PKCE verifier to
  // persist across requests, which is the trap for server-side OAuth).
  app.get('/auth/login/:provider', function (req, res) {
    const provider = SOCIAL_PROVIDERS[req.params.provider];
    if (!provider) return res.redirect('/auth/login?error=1');
    // redirect_to must be allow-listed in Supabase → Auth → URL Configuration.
    // (For prod behind a proxy, set `trust proxy` so req.protocol is correct.)
    const redirectTo = req.protocol + '://' + req.get('host') + '/auth/callback';
    const url = process.env.SUPABASE_URL + '/auth/v1/authorize?provider=' + provider +
      '&redirect_to=' + encodeURIComponent(redirectTo);
    res.redirect(url);
  });

  // GET /auth/callback — the provider returns tokens in the URL hash, which the
  // server never sees. Serve a tiny page that reads the hash and posts the token back.
  app.get('/auth/callback', function (req, res) {
    res.sendFile(path.join(__dirname, 'callback.html'));
  });

  // POST /auth/session { access_token } — validate the Supabase token and start our
  // express-session. This is where a social login becomes a logged-in app session.
  app.post('/auth/session', async function (req, res) {
    const token = (req.body && req.body.access_token) || '';
    if (!token) return res.status(400).json({ success: false, error: 'Missing token' });
    try {
      const { data, error } = await store.supabaseAuth.auth.getUser(token);
      if (error || !data || !data.user) {
        return res.status(401).json({ success: false, error: 'Invalid token' });
      }
      req.session.user = { id: data.user.id, email: data.user.email };
      return res.json({ success: true });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  });
}

module.exports = { requireAuth, requireAdmin, isAdmin, registerAuthRoutes };
