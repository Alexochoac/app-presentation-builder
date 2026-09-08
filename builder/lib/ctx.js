/**
 * ctx.js — the per-request "who am I acting as" context.
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS (Phase 5 step 4 — the app half of DB-enforced isolation)
 *   The cache is now keyed by team: `store.cacheFor(teamId)`. That means every
 *   hot reader needs to know which team it is reading for. The obvious way is to
 *   pass `teamId` as an argument — but readSettings/readDeckById/resolveSlideEdits
 *   are called from ~230 sites, many of them nested inside renderCartridge()'s
 *   render tree. Threading a parameter through all of that is exactly the ripple
 *   store.js was built to avoid.
 *
 *   AsyncLocalStorage gives us the same guarantee without the churn: one
 *   middleware establishes the context, and every synchronous *and* async
 *   continuation below it sees it. The readers stay synchronous and their
 *   signatures never change.
 *
 * THE SAFETY PROPERTY
 *   `teamId()` THROWS when there is no context. It never falls back to a default
 *   team, and there is no ambient "current team" global to drift out of date.
 *   So a code path that runs outside a request fails loudly instead of quietly
 *   reading (or worse, writing) somebody else's data. If you hit that throw, the
 *   fix is to establish a context — not to add a default.
 *
 * WHAT IS *NOT* HERE
 *   No token. The context carries identity, not credentials: the user's JWT is
 *   used once per request to fill the cache (see store.loadTeam) and is not
 *   needed again. Keeping it out of here stops it leaking into the write queue,
 *   which outlives the request.
 */
'use strict';

const { AsyncLocalStorage } = require('async_hooks');

const als = new AsyncLocalStorage();

// Run `fn` with `context` bound for the whole async subtree below it.
// Express-friendly: `ctx.run(c, next)` binds every downstream handler.
function run(context, fn) {
  return als.run(context, fn);
}

// The current context, or null. Use this only where "no context" is a legitimate
// state you intend to handle (e.g. an endpoint served both logged-in and out).
// Everywhere else use teamId()/userId(), which fail closed.
function peek() {
  return als.getStore() || null;
}

function required(field) {
  const c = als.getStore();
  if (!c || !c[field]) {
    throw new Error(
      '[ctx] no request context: tried to read `' + field + '` outside a team-scoped request. ' +
      'Team-scoped data can only be read inside ctx.run() — see builder/features/auth/team-context.js. ' +
      'Do NOT add a default team here; that is the bug this throw exists to catch.'
    );
  }
  return c[field];
}

// The team whose cache this request may touch. Throws when unset — by design.
function teamId() { return required('teamId'); }

// The acting user. Throws when unset — by design.
function userId() { return required('userId'); }

// Role, for the rare reader that varies by role. Null outside a context.
function role() {
  const c = als.getStore();
  return (c && c.role) || null;
}

// True when a team-scoped read would succeed. For endpoints that serve both
// logged-in and logged-out callers and degrade rather than fail.
function hasTeam() {
  const c = als.getStore();
  return !!(c && c.teamId);
}

module.exports = { run, peek, teamId, userId, role, hasTeam };
