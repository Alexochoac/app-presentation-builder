/**
 * store.js — write-through in-memory cache over Supabase Postgres.
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 *   The app's hot readers (readSettings, readDeckById, getActiveDeckId,
 *   resolveSlideEdits, …) are called SYNCHRONOUSLY from renderCartridge() and
 *   ~30 GET/render sites. Turning them async would ripple through the whole
 *   render tree and add a network round-trip per slide. Instead we load every
 *   table into memory once on boot, serve reads synchronously from that cache,
 *   and push writes back to Postgres through a serialized per-table queue.
 *
 * WHAT PHASE 4 SHIPS (this file)
 *   - the Supabase client (service_role key — bypasses RLS)
 *   - `cache`: typed in-memory stores, one per table
 *   - loadAll(): fill the cache on boot
 *   - enqueueUpsert / enqueueDelete / flush(): the write path primitives
 *   Domain read/write helpers (readSettings, resolveSlideEdits, …) are added
 *   per-slice in Phase 5, ON TOP of these primitives — this file stays generic.
 *
 * // MULTI-INSTANCE: this cache assumes ONE app instance (true today). With 2+
 *   instances an upsert from instance A is invisible to instance B's cache
 *   until reboot. Before scaling out, add cache invalidation (Postgres
 *   LISTEN/NOTIFY or Supabase Realtime) or drop these reads to async.
 */
'use strict';

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// ── Supabase client ──────────────────────────────────────────────────────────
// service_role key = the trusted server key; bypasses RLS. Never sent to the
// browser. anon/authenticated roles stay locked out until Phase 5 RLS.
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// A second client using the ANON (publishable) key — for USER-facing auth calls
// only (signInWithPassword, signInWithOAuth, exchangeCodeForSession, signOut).
// Kept separate from the service_role client above, which is admin-only and
// bypasses RLS. We drive auth server-side and keep our own express-session, so
// this client does not persist its own session.
const supabaseAuth = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Fixed ids shared with the import script (single-user stand-ins until auth).
const TEAM = '00000000-0000-0000-0000-000000000001';          // seeded default team
const SENTINEL_USER = '11111111-1111-1111-1111-111111111111'; // single-user until Supabase Auth

// ── In-memory cache ──────────────────────────────────────────────────────────
// Single-PK tables → Map keyed by id. Child tables → grouped by parent id so a
// domain helper can rebuild the old nested-JSON shape without a scan. Kept
// close to "ready to read"; the JSON-shape reshaping lives in the Phase-5
// helpers, not here.
const cache = {
  settings:         new Map(), // team_id            -> settings row
  templates:        new Map(), // template id        -> template row
  languages:        [],        // ordered [{ code, name }] (dropdowns need the list)
  decks:            new Map(), // deck id            -> deck row
  library:          new Map(), // library slide id   -> slide row
  userActiveDeck:   new Map(), // `${team}:${user}`  -> deck_id
  deckSlides:       new Map(), // deck id            -> [deck_slides rows] (sorted by position)
  deckSlideEdits:   new Map(), // deck id            -> Map(library_slide_id -> edits jsonb)
  translationMeta:  new Map(), // deck id            -> meta row
  translations:     new Map(), // deck id            -> [deck_translations rows]
  presentations:    new Map(), // presentation id    -> presentation row
  presentationEvents: new Map(), // presentation id  -> [event rows] (sorted by at)
};

let ready = false;
const isReady = () => ready;

// Pull an entire table (Supabase caps a select at 1000 rows/page; page through).
async function fetchAll(table, orderCol) {
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select('*').range(from, from + PAGE - 1);
    if (orderCol) q = q.order(orderCol, { ascending: true });
    const { data, error } = await q;
    if (error) throw new Error(`load ${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

// small delay (used to ride out the transient "JWT issued at future" clock skew)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Pull every table in parallel. Retried once by loadAll() because a cold boot
// can hit a transient clock-skew rejection ("JWT issued at future").
function fetchEverything() {
  return Promise.all([
    fetchAll('settings'),
    fetchAll('templates'),
    fetchAll('languages'),
    fetchAll('decks'),
    fetchAll('slide_library', 'position'), // My Library renders in server order — must be deterministic
    fetchAll('user_active_deck'),
    fetchAll('deck_slides'),
    fetchAll('deck_slide_edits'),
    fetchAll('deck_translation_meta'),
    fetchAll('deck_translations'),
    fetchAll('presentations'),
    fetchAll('presentation_events'),
  ]);
}

// Fill the cache from Postgres. Call once on boot BEFORE serving requests.
async function loadAll() {
  let fetched;
  try {
    fetched = await fetchEverything();
  } catch (err) {
    console.warn(`[store] load failed (${err.message}) — retrying once in 1.5s…`);
    await sleep(1500);
    fetched = await fetchEverything(); // let a second failure throw to the caller (fail-fast boot)
  }
  const [
    settings, templates, languages, decks, library, activeDeck,
    deckSlides, deckSlideEdits, translationMeta, translations,
    presentations, events,
  ] = fetched;

  cache.settings.clear();
  settings.forEach((r) => cache.settings.set(r.team_id, r));

  cache.templates.clear();
  templates.forEach((r) => cache.templates.set(r.id, r));

  cache.languages = languages;

  cache.decks.clear();
  decks.forEach((r) => cache.decks.set(r.id, r));

  cache.library.clear();
  library.forEach((r) => cache.library.set(r.id, r));

  cache.userActiveDeck.clear();
  activeDeck.forEach((r) => cache.userActiveDeck.set(`${r.team_id}:${r.user_id}`, r.deck_id));

  cache.deckSlides.clear();
  deckSlides.forEach((r) => group(cache.deckSlides, r.deck_id, r));
  cache.deckSlides.forEach((arr) => arr.sort((a, b) => a.position - b.position));

  cache.deckSlideEdits.clear();
  deckSlideEdits.forEach((r) => {
    if (!cache.deckSlideEdits.has(r.deck_id)) cache.deckSlideEdits.set(r.deck_id, new Map());
    cache.deckSlideEdits.get(r.deck_id).set(r.library_slide_id, r.edits);
  });

  cache.translationMeta.clear();
  translationMeta.forEach((r) => cache.translationMeta.set(r.deck_id, r));

  cache.translations.clear();
  translations.forEach((r) => group(cache.translations, r.deck_id, r));

  cache.presentations.clear();
  presentations.forEach((r) => cache.presentations.set(r.id, r));

  cache.presentationEvents.clear();
  events.forEach((r) => group(cache.presentationEvents, r.presentation_id, r));
  cache.presentationEvents.forEach((arr) => arr.sort((a, b) => new Date(a.at) - new Date(b.at)));

  ready = true;
  console.log(
    '[store] cache loaded — ' +
    `${cache.settings.size} settings, ${cache.decks.size} decks, ${cache.library.size} library, ` +
    `${cache.templates.size} templates, ${cache.languages.length} languages, ` +
    `${cache.presentations.size} presentations`
  );
}

// push `row` into an array bucket keyed by `key` inside Map `m`
function group(m, key, row) {
  if (!m.has(key)) m.set(key, []);
  m.get(key).push(row);
}

// ── Write path: serialized per-table queue ───────────────────────────────────
// One in-flight write per table (per-row upsert, NOT whole-file overwrite — this
// is what fixes the last-writer-wins data loss). Different tables run in
// parallel; same-table writes are ordered. Domain helpers mutate `cache`
// synchronously first (so the next read is correct), then enqueue the DB write.
const chains = new Map(); // table -> Promise (its serialized tail)

function chain(table, work) {
  const prev = chains.get(table) || Promise.resolve();
  const next = prev.then(work, work); // run regardless of a prior failure
  // keep the chain alive but swallow so one failure doesn't reject the tail
  chains.set(table, next.catch(() => {}));
  return next;
}

// Upsert one row (or array of rows). Returns a promise that resolves when the
// DB write completes; fire-and-forget for low-stakes edits, or await for
// high-stakes paths (publish, deck save).
function enqueueUpsert(table, rowOrRows, onConflict) {
  const rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
  return chain(table, async () => {
    if (rows.length === 0) return;
    const { error } = await supabase.from(table).upsert(rows, onConflict ? { onConflict } : undefined);
    if (error) { logWriteError('upsert', table, error, rows); throw error; }
  });
}

// Delete rows matching an equality filter, e.g. enqueueDelete('deck_slides', { deck_id }).
function enqueueDelete(table, match) {
  return chain(table, async () => {
    const { error } = await supabase.from(table).delete().match(match);
    if (error) { logWriteError('delete', table, error, match); throw error; }
  });
}

// Wait for every pending write across all tables to settle. Use before
// responding on high-stakes paths, or on graceful shutdown.
async function flush() {
  await Promise.allSettled([...chains.values()]);
}

// A cached write whose DB upsert fails looks saved but vanishes on reboot — so
// failures MUST be loud. JSON files remain the backup of record until Phase 5
// verifies every slice in production.
function logWriteError(op, table, error, payload) {
  console.error(`[store] ❌ ${op} ${table} FAILED: ${error.message}`);
  try { console.error('[store]   payload:', JSON.stringify(payload).slice(0, 500)); } catch (_) {}
}

module.exports = {
  supabase,
  supabaseAuth,
  cache,
  loadAll,
  isReady,
  enqueueUpsert,
  enqueueDelete,
  flush,
  TEAM,
  SENTINEL_USER,
};
