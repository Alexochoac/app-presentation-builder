// ── Auth middleware & routes ──────────────────────────────────────────────────
// Handles login/logout and protects all builder routes.
// Phase 1: single user, credentials from .env, sessions in memory.

const path = require('path');

// Routes that don't require a login
const PUBLIC_PATHS = ['/auth/login', '/auth/logout'];

// Middleware: redirect to /login if not authenticated
function requireAuth(req, res, next) {
  if (PUBLIC_PATHS.includes(req.path)) return next();
  if (req.session && req.session.loggedIn) return next();
  res.redirect('/auth/login');
}

// Register auth routes on an Express app
function registerAuthRoutes(app) {
  const user = process.env.BUILDER_USER || 'admin';
  const pass = process.env.BUILDER_PASS;

  if (!pass) {
    console.warn('[auth] WARNING: BUILDER_PASS not set in .env — login will be disabled');
  }

  // GET /auth/login — serve login page
  app.get('/auth/login', function (req, res) {
    if (req.session && req.session.loggedIn) return res.redirect('/');
    res.sendFile(path.join(__dirname, 'login.html'));
  });

  // POST /auth/login — check credentials
  app.post('/auth/login', function (req, res) {
    var username = (req.body.username || '').trim();
    var password = (req.body.password || '');

    if (username === user && password === pass) {
      req.session.loggedIn = true;
      req.session.username = username;
      return res.redirect('/');
    }

    res.redirect('/auth/login?error=1');
  });

  // GET /auth/logout — destroy session and redirect to login
  app.get('/auth/logout', function (req, res) {
    req.session.destroy(function () {
      res.redirect('/auth/login');
    });
  });
}

module.exports = { requireAuth, registerAuthRoutes };
