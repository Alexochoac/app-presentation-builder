/**
 * store.js — per-team write-through cache over Supabase Postgres.
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 *   The app's hot readers (readSettings, readDeckById, getActiveDeckId,
 *   resolveSlideEdits, …) are called SYNCHRONOUSLY from renderCartridge() and
 *   ~30 GET/render sites. Turning them async would ripple through the whole
 *   render tree and add a network round-trip per slide. So we serve reads from
 *   memory and push writes back to Postgres through a serialized per-table queue.
 *
 * WHAT CHANGED IN PHASE 5 STEP 4 — the cache is now a PROJECTION OF WHAT RLS
 * ALLOWED, instead of a mirror of the whole database.
 *
 *   Before: one process-wide cache, loaded on boot with the service_role key,
 *   which bypasses RLS. Every team's rows sat in the same Maps, and the only
 *   thing keeping them apart was the app remembering to filter. The 17 policies
 *   from step 5 were real but inert.
 *
 *   Now: one cache PER TEAM, filled lazily by `loadTeam(teamId, accessToken)`
 *   using a client that carries THE USER'S JWT. The database decides what goes
 *   in. A reader that forgets its filter cannot reach another team's rows
 *   because those rows are not in that Map — they were never fetched.
 *
 *   The cost is one `await ensureTeamLoaded()` per request, not one per slide.
 *   The render tree is untouched and every reader stayed synchronous.
 *
 * READS vs WRITES — an explicit, deliberate asymmetry
 *   READS go through a USER-scoped client. RLS enforces.
 *   WRITES stay on service_role, stamped with the team captured from the request
 *   context at ENQUEUE time. See the write-path section below for why; this is a
 *   decision, not an oversight.
 *
 * // MULTI-INSTANCE: still single-instance. With 2+ instances an upsert from A is
 *   invisible to B's cache until that team is reloaded. Multi-team makes a stale
 *   cross-team cache worse, not better — LISTEN/NOTIFY before scaling out.
 */
'use strict';

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const ctx = require('./ctx');

// ── Clients ──────────────────────────────────────────────────────────────────
// service_role = the trusted server key; bypasses RLS. Never sent to the
// browser. Used for: the write queue, the admin user API, and global reference
// data. NOT used to load team data any more — that is the point of this phase.
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// The ANON (publishable) key — for USER-facing auth calls (signInWithPassword,
// exchangeCodeForSession, refreshSession). We drive auth server-side and keep
// our own express-session, so this client does not persist a session.
const supabaseAuth = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// A client that talks to Postgres AS THE USER. This is the one RLS applies to.
// Built per load, never cached — it holds a token that expires.
function userClient(accessToken) {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: 'Bearer ' + accessToken } }
  });
}

// The seeded default team. Phase 5 removed every DATA read that assumed it —
// team now comes from the session. It survives for exactly one job: telling the
// boot-time Umami provisioner which team's settings row to stamp. Do not reach
// for it anywhere else; if you need a team, take it from ctx.teamId().
const BOOTSTRAP_TEAM = process.env.BOOTSTRAP_TEAM_ID || '00000000-0000-0000-0000-000000000001';

// ── Global (non-team) reference data ─────────────────────────────────────────
// `languages` is static ISO reference data. `templates` are the shared template
// catalog: their rows carry team_id NULL and their HTML lives on a filesystem
// path that is not team-scoped either (features/slides/slide-NN-*.html), so
// team-scoping the row while the file stays global would be isolation theatre.
// Templates are GLOBAL, on purpose, and loaded with service_role. Making
// templates+files team-owned together is a Phase 6 job.
const globals = {
  templates: new Map(), // template id -> template row
  languages: [],        // ordered [{ code, name }]
};

// ── Per-team caches ──────────────────────────────────────────────────────────
const teamCaches = new Map(); // teamId -> cache object
const loadedTeams = new Set(); // teams whose cache has actually been filled

function emptyTeamCache() {
  return {
    settings:           new Map(), // team_id            -> settings row
    decks:              new Map(), // deck id            -> deck row
    library:            new Map(), // library slide id   -> slide row
    userActiveDeck:     new Map(), // `${team}:${user}`  -> deck_id
    deckSlides:         new Map(), // deck id            -> [deck_slides rows] (sorted by position)
    deckSlideEdits:     new Map(), // deck id            -> Map(library_slide_id -> edits jsonb)
    translationMeta:    new Map(), // deck id            -> meta row
    translations:       new Map(), // deck id            -> [deck_translations rows]
    presentations:      new Map(), // presentation id    -> presentation row
    presentationEvents: new Map(), // presentation id    -> [event rows] (sorted by at)
  };
}

// The cache Maps for one team. Creates an EMPTY one on demand — an empty cache
// reads as "this team has no data", which is the correct fail-safe answer for a
// team we were not allowed to load.
function cacheFor(teamId) {
  if (!teamId) throw new Error('[store] cacheFor() needs a teamId');
  if (!teamCaches.has(teamId)) teamCaches.set(teamId, emptyTeamCache());
  return teamCaches.get(teamId);
}

const isTeamLoaded = (teamId) => loadedTeams.has(teamId);

// Drop a team's cache — next request reloads it through RLS. Call after a
// membership/role change so a demoted user doesn't keep reading a warm cache.
function invalidateTeam(teamId) {
  teamCaches.delete(teamId);
  loadedTeams.delete(teamId);
}

let globalsReady = false;
const isReady = () => globalsReady;

// ── Loading ──────────────────────────────────────────────────────────────────
// Pull an entire table (PostgREST caps a select at 1000 rows/page; page through).
async function fetchAll(client, table, opts) {
  const { orderCol, eq } = opts || {};
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    let q = client.from(table).select('*').range(from, from + PAGE - 1);
    if (eq) Object.keys(eq).forEach((col) => { q = q.eq(col, eq[col]); });
    if (orderCol) q = q.order(orderCol, { ascending: true });
    const { data, error } = await q;
    if (error) throw new Error(`load ${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// push `row` into an array bucket keyed by `key` inside Map `m`
function group(m, key, row) {
  if (!m.has(key)) m.set(key, []);
  m.get(key).push(row);
}

/**
 * Load the global reference data. Call once on boot BEFORE serving requests.
 * Team data is NOT loaded here — it can't be, it needs a user's token.
 */
async function loadGlobals() {
  async function pull() {
    return Promise.all([
      fetchAll(supabase, 'templates'),
      fetchAll(supabase, 'languages'),
      // Presentation ids are a global max+1 counter, not per-team — see
      // nextPresentationSeq() for why that matters now that there are teams.
      // Must THROW rather than resolve with {error}, or a transient clock-skew
      // rejection here would sail past the retry below and kill the boot.
      supabase.from('presentations').select('id').then(function (r) {
        if (r.error) throw new Error('load presentation ids: ' + r.error.message);
        return r.data || [];
      }),
    ]);
  }

  let fetched;
  try {
    fetched = await pull();
  } catch (err) {
    // A cold boot can hit a transient clock-skew rejection ("JWT issued at future").
    console.warn(`[store] globals load failed (${err.message}) — retrying once in 1.5s…`);
    await sleep(1500);
    fetched = await pull(); // let a second failure throw (fail-fast boot)
  }
  const [templates, languages, presIds] = fetched;

  globals.templates.clear();
  templates.forEach((r) => globals.templates.set(r.id, r));
  globals.languages = languages;

  primePresentationSeq(presIds.map((r) => r.id));

  globalsReady = true;
  console.log(
    `[store] globals loaded — ${globals.templates.size} templates, ` +
    `${globals.languages.length} languages, presentation seq at ${presentationSeq}`
  );
}

/**
 * Fill one team's cache using a client carrying THE USER'S JWT.
 *
 * Two filters, deliberately overlapping:
 *   1. RLS narrows every query to teams this user belongs to. That is the
 *      enforcement — if the app is wrong, the database still says no.
 *   2. `.eq('team_id', teamId)` narrows further to the ONE team on the session.
 *      This is not redundant: a user who belongs to two teams would otherwise
 *      pull both teams' rows into a cache labelled with one of them, and every
 *      reader below would happily serve the mix.
 *
 * The two child tables have no team_id of their own, so they are filtered by
 * parent membership after the parents land.
 */
async function loadTeam(teamId, accessToken) {
  if (!teamId) throw new Error('[store] loadTeam() needs a teamId');
  if (!accessToken) throw new Error('[store] loadTeam() needs the user access token — service_role would bypass RLS and defeat the purpose');

  const db = userClient(accessToken);
  const scope = { eq: { team_id: teamId } };

  const [
    settings, decks, library, activeDeck,
    deckSlideEdits, translationMeta, translations, presentations,
  ] = await Promise.all([
    fetchAll(db, 'settings', scope),
    fetchAll(db, 'decks', scope),
    // My Library renders in server order — must be deterministic.
    fetchAll(db, 'slide_library', { ...scope, orderCol: 'position' }),
    fetchAll(db, 'user_active_deck', scope),
    fetchAll(db, 'deck_slide_edits', scope),
    fetchAll(db, 'deck_translation_meta', scope),
    fetchAll(db, 'deck_translations', scope),
    fetchAll(db, 'presentations', scope),
  ]);

  const deckIds = new Set(decks.map((r) => r.id));
  const presIds = new Set(presentations.map((r) => r.id));

  // Children: RLS already narrowed these to this user's teams; keep only the
  // rows whose parent is in the team we just loaded. Volumes are small (tens of
  // rows), so a fetch-and-filter beats chunking a big `.in(...)`.
  const [deckSlides, events] = await Promise.all([
    fetchAll(db, 'deck_slides'),
    fetchAll(db, 'presentation_events'),
  ]);

  const c = emptyTeamCache();

  settings.forEach((r) => c.settings.set(r.team_id, r));
  decks.forEach((r) => c.decks.set(r.id, r));
  library.forEach((r) => c.library.set(r.id, r));
  activeDeck.forEach((r) => c.userActiveDeck.set(`${r.team_id}:${r.user_id}`, r.deck_id));

  deckSlides
    .filter((r) => deckIds.has(r.deck_id))
    .forEach((r) => group(c.deckSlides, r.deck_id, r));
  c.deckSlides.forEach((arr) => arr.sort((a, b) => a.position - b.position));

  deckSlideEdits.forEach((r) => {
    if (!c.deckSlideEdits.has(r.deck_id)) c.deckSlideEdits.set(r.deck_id, new Map());
    c.deckSlideEdits.get(r.deck_id).set(r.library_slide_id, r.edits);
  });

  translationMeta.forEach((r) => c.translationMeta.set(r.deck_id, r));
  translations.forEach((r) => group(c.translations, r.deck_id, r));
  presentations.forEach((r) => c.presentations.set(r.id, r));

  events
    .filter((r) => presIds.has(r.presentation_id))
    .forEach((r) => group(c.presentationEvents, r.presentation_id, r));
  c.presentationEvents.forEach((arr) => arr.sort((a, b) => new Date(a.at) - new Date(b.at)));

  teamCaches.set(teamId, c);
  loadedTeams.add(teamId);

  console.log(
    `[store] team ${teamId} loaded — ${c.decks.size} decks, ${c.library.size} library, ` +
    `${c.presentations.size} presentations, ${translations.length} translations`
  );
}

// One in-flight load per team, so a burst of parallel requests on a cold cache
// doesn't fire eight identical full-table pulls.
const loading = new Map(); // teamId -> Promise

/**
 * Make sure this team's cache is populated. Returns { firstLoad } so the caller
 * can run once-per-team startup work (the duplicate-slide repair) inside the
 * request's context.
 */
async function ensureTeamLoaded(teamId, accessToken) {
  if (loadedTeams.has(teamId)) return { firstLoad: false };
  let pending = loading.get(teamId);
  if (!pending) {
    pending = loadTeam(teamId, accessToken);
    loading.set(teamId, pending);
    pending.then(
      function () { loading.delete(teamId); },
      function () { loading.delete(teamId); }
    );
  }
  await pending;
  return { firstLoad: true };
}

// ── Presentation id allocation (global, not per-team) ────────────────────────
// presentations.id is a GLOBAL primary key but the app mints it as max+1 over
// what it can see. Once reads are team-scoped, team B's "max" no longer includes
// team A's rows — so both teams would mint the same id, and the write queue's
// upsert(…, 'id') would silently OVERWRITE the other team's presentation
// (service_role, so RLS wouldn't stop it either). Primed once from a global
// service_role select at boot, then handed out in process.
let presentationSeq = 0;

function primePresentationSeq(ids) {
  presentationSeq = ids.reduce((max, id) => {
    const n = parseInt(id, 10);
    return isNaN(n) ? max : Math.max(max, n);
  }, 0);
}

// Next free presentation id. `alsoSeen` lets the caller fold in ids from its own
// cache, so a locally-created row can never be reused even before the DB write lands.
function nextPresentationSeq(alsoSeen) {
  (alsoSeen || []).forEach((id) => {
    const n = parseInt(id, 10);
    if (!isNaN(n) && n > presentationSeq) presentationSeq = n;
  });
  presentationSeq += 1;
  return presentationSeq;
}

// ── Write path: serialized per-table queue ───────────────────────────────────
// WHY WRITES STAY ON service_role — complication #2 from the Phase 5 plan.
//
//   enqueueUpsert/flush are decoupled from the request: a queued write may land
//   long after the response, when the user's token is gone. Two options were on
//   the table.
//
//   (a) Capture the user's token with the queued item and write as the user.
//       Rejected. An expired token doesn't make a write fail loudly — under RLS
//       an UPDATE or DELETE that matches nothing returns SUCCESS with 0 rows
//       affected. The queue cannot tell "wrote it" from "silently wrote nothing",
//       so the failure mode is invisible data loss on the app's highest-stakes
//       path (publish, deck save). Refreshing a token from a queue that has no
//       request and no session to save back to is not workable either.
//
//   (b) Keep writes on service_role, stamped with the team taken from the
//       REQUEST CONTEXT at enqueue time. Chosen.
//
//   The insight that makes (b) safe rather than a cop-out: the queue never
//   needed the token, it needed the TEAM. Team identity is known synchronously at
//   enqueue time (ctx is still bound — the domain helper is running inside the
//   request), so it is captured then and travels with the item. Only the network
//   round-trip is deferred.
//
//   And the guards below turn "the app must remember to filter" into "the queue
//   refuses to write anything it can't attribute":
//     * team-scoped tables — every row's team_id must equal the enqueuing
//       request's team, or the write throws before it reaches Postgres;
//     * deletes get team_id merged into the match, so a delete aimed at another
//       team's row matches nothing instead of destroying it;
//     * the two child tables with no team_id are checked against their parent in
//       that team's cache, which by construction only holds that team's rows.
//
//   This is weaker than RLS on writes and is written down as such. It is
//   defence-in-depth over a cache that already can't see other teams, not the
//   only thing standing between two customers.

// Tables carrying their own team_id: every write must be stamped with it.
const TEAM_SCOPED_TABLES = new Set([
  'settings', 'decks', 'slide_library', 'presentations',
  'deck_translations', 'deck_slide_edits', 'deck_translation_meta', 'user_active_deck',
]);

// Tables with no team_id — scoped through their parent. (Decision recorded: scope
// via parent rather than adding a column. The RLS policies already do exactly
// this with an EXISTS subquery, so app and database agree on one rule.)
const CHILD_TABLES = {
  deck_slides:         { fk: 'deck_id',         parentCache: 'decks' },
  presentation_events: { fk: 'presentation_id', parentCache: 'presentations' },
};

// Global tables the queue may write without a team stamp (see `globals` above).
const GLOBAL_TABLES = new Set(['templates']);

class TeamScopeError extends Error {
  constructor(message) { super(message); this.name = 'TeamScopeError'; }
}

// Check a write against the team of the request that enqueued it. Runs
// SYNCHRONOUSLY at enqueue time, while ctx is still bound — that is the whole
// trick that lets a deferred queue stay team-safe.
function assertWritable(op, table, rowsOrMatch) {
  if (GLOBAL_TABLES.has(table)) return null;

  const teamId = ctx.teamId(); // throws outside a request — intentional
  const rows = Array.isArray(rowsOrMatch) ? rowsOrMatch : [rowsOrMatch];

  if (TEAM_SCOPED_TABLES.has(table)) {
    rows.forEach((row) => {
      if (op === 'delete') return; // deletes get team_id merged in by the caller below
      if (row.team_id !== teamId) {
        throw new TeamScopeError(
          `[store] refused ${op} on ${table}: row team_id=${row.team_id} but this request is team ${teamId}. ` +
          'Stamp the row from ctx.teamId().'
        );
      }
    });
    return teamId;
  }

  const child = CHILD_TABLES[table];
  if (child) {
    const parents = cacheFor(teamId)[child.parentCache];
    rows.forEach((row) => {
      const parentId = row[child.fk];
      if (parentId == null) {
        throw new TeamScopeError(`[store] refused ${op} on ${table}: no ${child.fk} to scope it by`);
      }
      if (!parents.has(parentId)) {
        throw new TeamScopeError(
          `[store] refused ${op} on ${table}: ${child.fk}=${parentId} is not in team ${teamId}'s cache. ` +
          'A child row can only be written under a parent this team owns.'
        );
      }
    });
    return teamId;
  }

  throw new TeamScopeError(
    `[store] refused ${op} on unknown table "${table}". Add it to TEAM_SCOPED_TABLES, ` +
    'CHILD_TABLES or GLOBAL_TABLES so its team scope is an explicit decision.'
  );
}

const chains = new Map(); // table -> Promise (its serialized tail)

function chain(table, work) {
  const prev = chains.get(table) || Promise.resolve();
  const next = prev.then(work, work); // run regardless of a prior failure
  // keep the chain alive but swallow so one failure doesn't reject the tail
  chains.set(table, next.catch(() => {}));
  return next;
}

// Upsert one row (or array of rows). Returns a promise that resolves when the DB
// write completes; fire-and-forget for low-stakes edits, or await for high-stakes
// paths (publish, deck save).
function enqueueUpsert(table, rowOrRows, onConflict) {
  const rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
  assertWritable('upsert', table, rows); // synchronous, inside the request — throws to the caller
  return chain(table, async () => {
    if (rows.length === 0) return;
    const { error } = await supabase.from(table).upsert(rows, onConflict ? { onConflict } : undefined);
    if (error) { logWriteError('upsert', table, error, rows); throw error; }
  });
}

// Delete rows matching an equality filter, e.g. enqueueDelete('deck_slides', { deck_id }).
// For team-scoped tables the caller's team is merged into the match, so a delete
// can only ever reach rows this team owns.
function enqueueDelete(table, match) {
  const teamId = assertWritable('delete', table, match);
  const scopedMatch = (teamId && TEAM_SCOPED_TABLES.has(table))
    ? Object.assign({}, match, { team_id: teamId })
    : match;
  return chain(table, async () => {
    const { error } = await supabase.from(table).delete().match(scopedMatch);
    if (error) { logWriteError('delete', table, error, scopedMatch); throw error; }
  });
}

// Wait for every pending write across all tables to settle. Use before responding
// on high-stakes paths, or on graceful shutdown.
async function flush() {
  await Promise.allSettled([...chains.values()]);
}

// A cached write whose DB upsert fails looks saved but vanishes on the next cache
// load — so failures MUST be loud.
function logWriteError(op, table, error, payload) {
  console.error(`[store] ❌ ${op} ${table} FAILED: ${error.message}`);
  try { console.error('[store]   payload:', JSON.stringify(payload).slice(0, 500)); } catch (_) {}
}

module.exports = {
  supabase,
  supabaseAuth,
  userClient,
  globals,
  cacheFor,
  isTeamLoaded,
  invalidateTeam,
  loadGlobals,
  loadTeam,
  ensureTeamLoaded,
  isReady,
  enqueueUpsert,
  enqueueDelete,
  flush,
  nextPresentationSeq,
  TeamScopeError,
  BOOTSTRAP_TEAM,
};
