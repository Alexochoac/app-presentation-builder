// ── Auth middleware & routes ──────────────────────────────────────────────────
// Handles login/logout and protects all builder routes.
// Phase 3: real per-user accounts via Supabase Auth (email + password).
// Phase 5: the session also carries the user's team + role, read from the
//          `team_members` table. Roles come from the DB now, not from .env.

const path = require('path');
const store = require('../../lib/store');

// Routes that don't require a login
const PUBLIC_PATHS = ['/auth/login', '/auth/logout', '/auth/callback', '/auth/session'];

// Social login providers we allow → their Supabase provider id. (LinkedIn's
// current provider is "linkedin_oidc"; Slack's is "slack_oidc".)
const SOCIAL_PROVIDERS = { google: 'google', linkedin: 'linkedin_oidc', slack: 'slack_oidc' };

function parseEmailList(raw) {
  return (raw || '').split(',')
    .map(function (s) { return s.trim().toLowerCase(); })
    .filter(Boolean);
}

// ADMIN_EMAILS is no longer the admin gate — `team_members.role` is (Phase 5).
// It survives only as the fallback for ALLOWED_EMAILS below, so an existing .env
// keeps working. Warn if someone is still relying on it to mean "admin".
const ADMIN_EMAILS = parseEmailList(process.env.ADMIN_EMAILS);

// Sign-in gate for SOCIAL login. Password accounts can only be created by an
// admin via /api/users, but social login is an implicit *signup* path — Supabase
// mints an account for any Google/LinkedIn user who completes the flow. This is
// a SEPARATE job from roles: it decides who may authenticate at all, before any
// team membership is looked up. Fails CLOSED — no allowlist, no social login.
// Falls back to ADMIN_EMAILS so a solo setup only needs one variable.
const ALLOWED_EMAILS = parseEmailList(process.env.ALLOWED_EMAILS || process.env.ADMIN_EMAILS);

function isAllowedEmail(email) {
  if (ALLOWED_EMAILS.length === 0) return false; // fail closed — see above
  return ALLOWED_EMAILS.indexOf((email || '').toLowerCase()) !== -1;
}

// Look up which team a user belongs to, and as what. Returns null if they have
// no membership — the caller MUST treat that as "refuse the login". Do not
// invent a default team: silently dropping an unknown account into the shared
// team is exactly the hole that let a stranger in before db08fc4.
// A user in several teams isn't a thing yet; take the earliest and revisit when
// team-switching ships.
async function loadMembership(userId) {
  const { data, error } = await store.supabase
    .from('team_members')
    .select('team_id, role')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) {
    console.warn('[auth] team_members lookup failed:', error.message);
    return null; // fail closed — a broken lookup must not grant access
  }
  return (data && data[0]) || null;
}

function isAdmin(req) {
  return !!(req.session && req.session.user && req.session.user.role === 'admin');
}

// Start a logged-in session. Regenerates the session id first, so a cookie an
// attacker planted before login can't be replayed once we grant access (session
// fixation) — which matters more now that sessions persist in Postgres.
// `membership` is required: no membership, no session.
function startSession(req, user, membership, done) {
  req.session.regenerate(function (err) {
    if (err) return done(err);
    req.session.user = {
      id: user.id,
      email: user.email,
      teamId: membership.team_id,
      role: membership.role
    };
    req.session.save(done);
  });
}

// Middleware factory for role-gated routes (JSON 403 — these are API/admin routes).
function requireRole(role) {
  return function (req, res, next) {
    var u = req.session && req.session.user;
    if (u && u.role === role) return next();
    return res.status(403).json({ success: false, error: 'Requires the "' + role + '" role.' });
  };
}

// Back-compat alias for the existing admin-only routes.
const requireAdmin = requireRole('admin');

// Middleware: redirect to /login if not authenticated (JSON 401 for API calls)
function requireAuth(req, res, next) {
  if (PUBLIC_PATHS.includes(req.path)) return next();
  // `teamId` is required, not just `user`. Sessions minted BEFORE Phase 5 are
  // still sitting in the Postgres session store and carry no team or role —
  // they'd otherwise sail past this check and then hit `undefined` teamId deeper
  // in. Treating them as expired forces one clean re-login instead, so the
  // upgrade self-heals without truncating the session table by hand.
  if (req.session && req.session.user && req.session.user.teamId) return next();
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ success: false, error: 'Session expired. Please reload and log in again.' });
  }
  res.redirect('/auth/login');
}

// Register auth routes on an Express app.
// opts.publicBaseUrl — the app's canonical external URL, used to build the OAuth
// redirect_to. Taken from the caller rather than req.protocol/req.get('host'),
// which report the *internal* http://… hop when running behind a reverse proxy.
function registerAuthRoutes(app, opts) {
  const publicBaseUrl = ((opts && opts.publicBaseUrl) || 'http://localhost:3000').replace(/\/+$/, '');

  if (ALLOWED_EMAILS.length === 0) {
    console.warn('[auth] Neither ALLOWED_EMAILS nor ADMIN_EMAILS is set — social login is ' +
      'DISABLED (it would let any Google/LinkedIn account in). Set one in .env to enable it.');
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
        // Authenticated, but not yet authorised — they need a team.
        const membership = await loadMembership(data.user.id);
        if (!membership) {
          console.warn('[auth] Login refused — no team membership:', data.user.email);
          return res.redirect('/auth/login?error=noteam');
        }
        return startSession(req, data.user, membership, function (err) {
          if (err) {
            console.warn('[auth] Session start failed:', err.message);
            return res.redirect('/auth/login?error=1');
          }
          res.redirect('/');
        });
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
    // Don't start a flow we're going to reject at /auth/session anyway.
    if (ALLOWED_EMAILS.length === 0) return res.redirect('/auth/login?error=disabled');
    // redirect_to must be allow-listed in Supabase → Auth → URL Configuration.
    const redirectTo = publicBaseUrl + '/auth/callback';
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
      // getUser proves the token is genuine — not that this person may use the
      // app. Supabase happily creates an account for any Google/LinkedIn user,
      // so check the allowlist before handing out a session.
      if (!isAllowedEmail(data.user.email)) {
        console.warn('[auth] Blocked social login for non-allowlisted email:', data.user.email);
        return res.status(403).json({ success: false, error: 'This account is not allowed to sign in.' });
      }
      // Allowlisted, but still needs a team — same rule as password login.
      const membership = await loadMembership(data.user.id);
      if (!membership) {
        console.warn('[auth] Social login refused — no team membership:', data.user.email);
        return res.status(403).json({ success: false, code: 'noteam',
          error: 'This account is not a member of any team yet.' });
      }
      return startSession(req, data.user, membership, function (err) {
        if (err) return res.status(500).json({ success: false, error: 'Could not start session.' });
        res.json({ success: true });
      });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  });
}

module.exports = { requireAuth, requireAdmin, requireRole, isAdmin, loadMembership, registerAuthRoutes };
