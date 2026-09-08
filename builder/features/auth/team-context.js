/**
 * team-context.js — the one `await` that makes DB-enforced isolation work.
 * ---------------------------------------------------------------------------
 * Sits directly under requireAuth. For every authenticated request it:
 *
 *   1. gets a live access token for the session (refreshing it if the ~1h token
 *      has aged out under the 8h session — see tokens.js);
 *   2. makes sure this team's cache is loaded, filling it with a client carrying
 *      THAT token, so RLS decides what lands in memory;
 *   3. binds { teamId, userId, role } for the rest of the request, so the ~230
 *      synchronous readers below can find their team without taking a parameter.
 *
 * ONE await per request, not one per slide. renderCartridge() and the whole
 * render tree stay exactly as synchronous as they were.
 *
 * FAILURES ARE LOGOUTS, NOT FALLBACKS. If the token can't be refreshed the
 * session is destroyed and the user logs in again. There is deliberately no
 * "fall back to service_role" branch: that would silently restore the bypass
 * this phase exists to close, and it would do it precisely when something is
 * already wrong.
 */
'use strict';

const store = require('../../lib/store');
const ctx = require('../../lib/ctx');
const tokens = require('./tokens');

/**
 * @param {object} opts
 * @param {function} [opts.onFirstTeamLoad] — run once per team, inside that
 *        team's context, right after its cache is first filled. This is where
 *        the old boot-time repairs go now that there is no boot-time load.
 */
function makeTeamContext(opts) {
  const onFirstTeamLoad = (opts && opts.onFirstTeamLoad) || null;

  return function teamContext(req, res, next) {
    const u = req.session && req.session.user;
    // No session, or a public path: requireAuth has already decided. Run without
    // a context — any team-scoped read below will throw rather than guess.
    if (!u || !u.teamId) return next();

    (async function () {
      const accessToken = await tokens.getAccessToken(req);
      return store.ensureTeamLoaded(u.teamId, accessToken);
    })().then(
      function (result) {
        const context = { teamId: u.teamId, userId: u.id, role: u.role, email: u.email };
        ctx.run(context, function () {
          if (result && result.firstLoad && onFirstTeamLoad) {
            try {
              onFirstTeamLoad(u.teamId);
            } catch (e) {
              console.warn('[team-context] first-load hook failed for team ' + u.teamId + ':', e.message);
            }
          }
          next();
        });
      },
      function (err) {
        if (err instanceof tokens.SessionExpired) {
          console.warn('[team-context] session expired for ' + u.email + ':', err.message);
          return req.session.destroy(function () {
            if (req.path.startsWith('/api/')) {
              return res.status(401).json({
                success: false,
                error: 'Session expired. Please reload and log in again.'
              });
            }
            res.redirect('/auth/login?error=expired');
          });
        }
        // A load failure is NOT an auth failure — don't log the user out over a
        // Supabase blip. Fail the request loudly instead; an empty cache would
        // render as "you have no decks", which looks like data loss.
        console.error('[team-context] could not load team ' + u.teamId + ':', err.message);
        if (req.path.startsWith('/api/')) {
          return res.status(503).json({ success: false, error: 'Could not load your team data. Please retry.' });
        }
        res.status(503).type('text/plain').send('Could not load your team data. Please retry.');
      }
    );
  };
}

module.exports = { makeTeamContext };
