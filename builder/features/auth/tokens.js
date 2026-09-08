/**
 * tokens.js — the Supabase token bundle that lives on the express-session.
 * ---------------------------------------------------------------------------
 * COMPLICATION #1 FROM THE PHASE 5 PLAN, SOLVED HERE.
 *
 * The problem: a Supabase access token lasts ~1 hour; our express-session lasts
 * 8. Once the app started filling its cache with a client carrying the USER's
 * JWT (that is the whole point of Option B — RLS filters at load time), an hour
 * into a session every cache load would start failing with "JWT expired" and the
 * user would see errors without ever being logged out. The session outliving its
 * own credentials is not an edge case, it is the normal path.
 *
 * The fix: keep the refresh token next to the access token on the session, and
 * refresh on demand — just before a load that needs a live token, not on a timer.
 *
 * WHY ON-DEMAND, NOT A BACKGROUND TIMER
 *   Sessions live in Postgres and can outlive the process; a timer would have to
 *   scan the session table and would keep refreshing tokens for users who went
 *   home. Refreshing at the point of use means we only ever spend a round-trip
 *   for a session that is actually being used.
 *
 * WHY SINGLE-FLIGHT
 *   A page load fires many parallel requests. Without coordination they would all
 *   see the same expired token and all call refreshSession() with the SAME
 *   refresh token. Supabase rotates refresh tokens, and while it allows a short
 *   reuse window, racing it is how you get a session that randomly dies. One
 *   in-flight refresh per session id; everyone else awaits that promise.
 *
 * FAILURE MODE IS DELIBERATE
 *   A refresh that fails throws SessionExpired. The caller destroys the session
 *   and sends the user back to /auth/login. We do NOT silently fall back to
 *   service_role — that would quietly re-open the hole this phase exists to shut.
 */
'use strict';

const store = require('../../lib/store');

// Refresh this long before the token actually expires, so a request that takes a
// moment to reach Postgres isn't holding a token that dies in flight.
const SKEW_MS = 60 * 1000;

// sessionID -> Promise<bundle>. Cleared as soon as the refresh settles.
const inflight = new Map();

// Thrown when the session can no longer produce a usable access token. The
// caller's contract: destroy the session, send the user to log in again.
class SessionExpired extends Error {
  constructor(message) { super(message); this.name = 'SessionExpired'; }
}

// Normalize whatever Supabase handed us into the shape we persist.
// `expires_at` from Supabase is UNIX SECONDS; we store milliseconds so every
// comparison in this file is against Date.now() with no unit confusion.
function toBundle(session) {
  if (!session || !session.access_token) return null;
  const expiresAtMs = session.expires_at
    ? session.expires_at * 1000
    : Date.now() + (session.expires_in ? session.expires_in * 1000 : 3600 * 1000);
  return {
    access_token:  session.access_token,
    refresh_token: session.refresh_token || null,
    expires_at:    expiresAtMs
  };
}

// Called from the login paths. `session` is the Supabase session object.
function put(req, session) {
  const bundle = toBundle(session);
  if (!bundle) return false;
  req.session.sb = bundle;
  return true;
}

function clear(req) {
  if (req.session) delete req.session.sb;
}

function saveSession(req) {
  return new Promise(function (resolve, reject) {
    req.session.save(function (err) { return err ? reject(err) : resolve(); });
  });
}

async function doRefresh(req, refreshToken) {
  let data, error;
  try {
    ({ data, error } = await store.supabaseAuth.auth.refreshSession({ refresh_token: refreshToken }));
  } catch (e) {
    throw new SessionExpired('refresh threw: ' + e.message);
  }
  if (error || !data || !data.session) {
    throw new SessionExpired('refresh rejected: ' + ((error && error.message) || 'no session returned'));
  }
  const bundle = toBundle(data.session);
  if (!bundle) throw new SessionExpired('refresh returned no access token');

  req.session.sb = bundle;
  // Persist the ROTATED refresh token immediately. If the process died between
  // the rotation and the save, the stored refresh token would already be spent
  // and the session would be unrecoverable on the next request.
  try {
    await saveSession(req);
  } catch (e) {
    console.warn('[auth] could not persist refreshed tokens:', e.message);
  }
  return bundle;
}

/**
 * A live access token for this request, refreshing first if needed.
 * Throws SessionExpired when the session can no longer produce one.
 */
async function getAccessToken(req) {
  const sb = req.session && req.session.sb;
  if (!sb || !sb.access_token) {
    // Sessions minted before this change carry no tokens at all. Same treatment
    // as the pre-Phase-5 sessions in requireAuth: expired, re-login, self-heals.
    throw new SessionExpired('session carries no Supabase tokens (minted before token storage)');
  }
  if (Date.now() < sb.expires_at - SKEW_MS) return sb.access_token;
  if (!sb.refresh_token) throw new SessionExpired('access token expired and the session has no refresh token');

  const key = req.sessionID;
  let pending = inflight.get(key);
  if (!pending) {
    pending = doRefresh(req, sb.refresh_token);
    inflight.set(key, pending);
    // Detach the cleanup so a rejection here doesn't surface as unhandled — the
    // awaiting callers below get the rejection and handle it.
    pending.then(
      function () { inflight.delete(key); },
      function () { inflight.delete(key); }
    );
  }

  const bundle = await pending;
  // Concurrent requests each hold their OWN copy of the session object, loaded
  // separately from the store. Copy the fresh bundle onto this one too, or a
  // later save() from this request would write the stale token back over it.
  if (req.session) req.session.sb = bundle;
  return bundle.access_token;
}

module.exports = { getAccessToken, put, clear, SessionExpired };
