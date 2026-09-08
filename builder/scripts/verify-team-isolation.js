/**
 * verify-team-isolation.js — prove the APP now honours the isolation the
 * database enforces (Phase 5 step 4, the app half of Option B).
 *
 * verify-rls.js proved the POLICIES are right by talking to Postgres directly.
 * That is necessary but not sufficient: the server used to connect as
 * service_role, which bypasses every one of those policies, so a passing
 * verify-rls.js said nothing about what the app would actually serve.
 *
 * This script tests the thing that matters — two real logins against the running
 * HTTP server, checking that each session only ever sees its own team's data.
 *
 *   1. start the builder on a spare port
 *   2. node builder/scripts/verify-team-isolation.js            (default :3010)
 *      APP_URL=http://localhost:3000 node builder/scripts/verify-team-isolation.js
 *
 * Creates two throwaway users — one in the real default team, one in a fresh
 * empty team — and deletes both plus everything they made on the way out.
 */
'use strict';

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

// Creating a presentation also mints its output folder. Track them so the probe
// doesn't leave directories behind in the repo.
const madeDirs = [];

const APP = (process.env.APP_URL || 'http://localhost:3010').replace(/\/+$/, '');
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } });

const TEAM_A = process.env.BOOTSTRAP_TEAM_ID || '00000000-0000-0000-0000-000000000001'; // the real team, has data
// A FRESH team id every run. A fixed one would collide with the running server's
// per-team cache: that cache is keyed by team id and lives for the process, so a
// second run against the same server would be served the previous run's rows and
// fail for a reason that has nothing to do with isolation.
const TEAM_B = require('crypto').randomUUID();
const PW = 'Iso-verify-' + 'k'.repeat(12);

const stamp = Date.now();
const USERS = [
  { tag: 'A', email: 'iso-probe-a-' + stamp + '@example.com', team: TEAM_A },
  { tag: 'B', email: 'iso-probe-b-' + stamp + '@example.com', team: TEAM_B },
];

let pass = 0, fail = 0;
function check(label, ok, detail) {
  (ok ? pass++ : fail++);
  console.log('   ' + (ok ? '✅' : '🔴') + ' ' + label + (detail ? '  — ' + detail : ''));
}

// ── a very small cookie-jar HTTP client ──────────────────────────────────────
function makeAgent() {
  let cookie = '';
  async function req(method, url, body, isForm) {
    const headers = {};
    if (cookie) headers.Cookie = cookie;
    if (body) headers['Content-Type'] = isForm ? 'application/x-www-form-urlencoded' : 'application/json';
    const res = await fetch(APP + url, {
      method,
      headers,
      body: body ? (isForm ? new URLSearchParams(body).toString() : JSON.stringify(body)) : undefined,
      redirect: 'manual',
    });
    const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    setCookie.forEach((c) => { cookie = c.split(';')[0]; });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}
    return { status: res.status, location: res.headers.get('location'), json, text };
  }
  return {
    get:  (u) => req('GET', u),
    post: (u, b) => req('POST', u, b, false),
    login: (email, password) => req('POST', '/auth/login', { email, password }, true),
  };
}

async function setup() {
  await admin.from('teams').upsert({ id: TEAM_B, name: 'Isolation probe team B' });
  for (const u of USERS) {
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email, password: PW, email_confirm: true,
    });
    if (error) throw new Error('create ' + u.email + ': ' + error.message);
    u.id = data.user.id;
    const { error: mErr } = await admin.from('team_members')
      .insert({ team_id: u.team, user_id: u.id, role: 'admin' });
    if (mErr) throw new Error('membership ' + u.email + ': ' + mErr.message);
    u.agent = makeAgent();
  }
}

async function teardown() {
  // FK order matters twice over: presentations reference auth.users via
  // created_by, and teams can't go until every child row referencing them has.
  // A partial teardown leaves rows that make the NEXT run's counts wrong.
  await admin.from('presentations').delete().eq('team_id', TEAM_B);
  for (const u of USERS) if (u.id) await admin.auth.admin.deleteUser(u.id).catch(() => {});
  const children = [
    'deck_translations', 'deck_translation_meta', 'deck_slide_edits',
    'slide_library', 'user_active_deck', 'decks', 'settings', 'team_members',
  ];
  for (const t of children) {
    const { error } = await admin.from(t).delete().eq('team_id', TEAM_B);
    if (error) console.warn('   (teardown) ' + t + ': ' + error.message);
  }
  const { error } = await admin.from('teams').delete().eq('id', TEAM_B);
  if (error) console.warn('   (teardown) teams: ' + error.message);

  madeDirs.forEach(function (d) {
    try { fs.rmSync(d, { recursive: true, force: true }); }
    catch (e) { console.warn('   (teardown) ' + d + ': ' + e.message); }
  });
}

// These endpoints disagree about shape: some return { data: [...] }, some
// { data: { decks: [...] } }, some { data: { slides: [...] } }. Handle all three.
function list(r, key) {
  const d = r.json && r.json.data;
  if (Array.isArray(d)) return d;
  if (d && Array.isArray(d[key])) return d[key];
  return null;
}
const count = (r, key) => { const l = list(r, key); return l ? l.length : null; };

(async () => {
  let created = null;
  try {
    // Fail early with a clear message rather than a wall of fetch errors.
    try { await fetch(APP + '/auth/login'); }
    catch (e) { throw new Error('no server at ' + APP + ' — start it first (PORT=3010 node builder/server.js)'); }

    await setup();
    const [A, B] = USERS;

    console.log('\n1. Both probes can log in and get a session');
    for (const u of USERS) {
      const r = await u.agent.login(u.email, PW);
      check(u.tag + ' logs in', r.status === 302 && r.location === '/',
        'status ' + r.status + ' → ' + r.location);
      const me = await u.agent.get('/api/me');
      u.me = me.json && me.json.data;
      check(u.tag + ' /api/me carries the right team',
        !!u.me && u.me.teamId === u.team, u.me ? u.me.teamId : 'no body');
    }

    console.log('\n2. Team A (the real team) sees its data');
    const aDecks = await A.agent.get('/api/decks');
    const aLib   = await A.agent.get('/api/slide-library');
    const aPres  = await A.agent.get('/api/presentations');
    const aDeckN = count(aDecks, 'decks'), aLibN = count(aLib, 'slides'), aPresN = count(aPres, 'presentations');
    check('A sees decks', aDeckN > 0, aDeckN + ' decks');
    check('A sees library slides', aLibN > 0, aLibN + ' slides');
    check('A sees presentations', aPresN > 0, aPresN + ' presentations');

    console.log('\n3. Team B sees NOTHING of team A — the whole point');
    const bDecks = await B.agent.get('/api/decks');
    const bLib   = await B.agent.get('/api/slide-library');
    const bPres  = await B.agent.get('/api/presentations');
    check('B sees 0 decks', count(bDecks, 'decks') === 0, count(bDecks, 'decks') + '');
    check('B sees 0 library slides', count(bLib, 'slides') === 0, count(bLib, 'slides') + '');
    check('B sees 0 presentations', count(bPres, 'presentations') === 0, count(bPres, 'presentations') + '');

    console.log('\n4. B cannot reach one of A\'s rows by guessing its id');
    const someADeck = list(aDecks, 'decks')[0].id;
    const someAPres = list(aPres, 'presentations')[0].id;
    const bPresPeek = await B.agent.get('/api/presentations/' + someAPres);
    check('B GET of A\'s presentation 404s', bPresPeek.status === 404, 'status ' + bPresPeek.status);
    // Switching to a deck you can't see must be refused, not silently accepted —
    // an accepted switch would point B's session at a deck in another team.
    const bSwitch = await B.agent.post('/api/decks/active', { id: someADeck });
    check('B cannot switch to A\'s deck', bSwitch.status === 404, 'status ' + bSwitch.status);

    console.log('\n5. B\'s writes land in B, and are invisible to A');
    const mk = await B.agent.post('/api/decks', { name: 'B probe deck', theme: 'dark' });
    created = mk.json && mk.json.data;
    check('B can create its own deck', mk.status === 200 && !!created, 'status ' + mk.status);
    const bAfter = await B.agent.get('/api/decks');
    check('B now sees exactly 1 deck', count(bAfter, 'decks') === 1, count(bAfter, 'decks') + '');
    const aAfter = await A.agent.get('/api/decks');
    check('A\'s deck count is unchanged', count(aAfter, 'decks') === aDeckN,
      aDeckN + ' → ' + count(aAfter, 'decks'));
    if (created) {
      const { data: row } = await admin.from('decks').select('team_id').eq('id', created.id).single();
      check('B\'s deck row is stamped with team B', row && row.team_id === TEAM_B, row && row.team_id);
    }

    console.log('\n6. Attribution + per-user active deck');
    const { data: presRows } = await admin.from('presentations').select('id, created_by').eq('team_id', TEAM_A);
    check('every team A presentation has a creator',
      presRows && presRows.length > 0 && presRows.every((r) => r.created_by),
      (presRows || []).filter((r) => !r.created_by).length + ' still NULL');
    const bActive = await B.agent.get('/api/decks/active');
    const aActive = await A.agent.get('/api/decks/active');
    const bActiveId = bActive.json && (bActive.json.data && (bActive.json.data.activeDeckId || bActive.json.data.id));
    const aActiveId = aActive.json && (aActive.json.data && (aActive.json.data.activeDeckId || aActive.json.data.id));
    check('A and B have different active decks', !!aActiveId && aActiveId !== bActiveId,
      'A=' + aActiveId + ' B=' + bActiveId);

    console.log('\n7. Presentation ids stay globally unique across teams');
    // The id is a global PK minted from max+1. Before this phase that max was
    // computed over every row; now a team only sees its own, so B's "next id"
    // must still come from the global counter or it would collide with A's rows
    // and the queue's upsert(…,'id') would overwrite them.
    const bNewPres = await B.agent.post('/api/presentations', { customerName: 'B probe customer' });
    const bPresId = bNewPres.json && bNewPres.json.data && bNewPres.json.data.id;
    check('B can create a presentation', bNewPres.status === 200 && !!bPresId, 'status ' + bNewPres.status);
    if (bPresId) {
      madeDirs.push(path.join(__dirname, '..', '..', 'finished-presentations', bPresId));
      const aIds = list(aPres, 'presentations').map((p) => p.id);
      check('B\'s new id does not collide with any of A\'s', aIds.indexOf(bPresId) === -1, 'id ' + bPresId);
      const { data: row } = await admin.from('presentations')
        .select('team_id, created_by').eq('id', bPresId).single();
      check('the row is stamped team B', row && row.team_id === TEAM_B, row && row.team_id);
      check('the row is attributed to B\'s user', row && row.created_by === B.id, row && row.created_by);
      const aStill = await A.agent.get('/api/presentations');
      check('A\'s presentations are untouched', count(aStill, 'presentations') === aPresN,
        aPresN + ' → ' + count(aStill, 'presentations'));
    }

    console.log('\n8. The write queue refuses writes it cannot attribute');
    // Complication #2: writes stay on service_role (which bypasses RLS), so the
    // queue itself has to be the thing that refuses. These are checked in-process
    // because no HTTP route will ever construct a cross-team row — that is the
    // point. Every case below throws synchronously, before any network call.
    const store = require('../lib/store');
    const ctxLib = require('../lib/ctx');
    const threw = (fn) => { try { fn(); return null; } catch (e) { return e; } };

    let e = threw(() => store.enqueueUpsert('decks', { id: 'x', team_id: TEAM_A }, 'id'));
    check('a write with no request context throws', !!e && /no request context/.test(e.message),
      e && e.message.slice(0, 60));

    ctxLib.run({ teamId: TEAM_B, userId: B.id }, function () {
      e = threw(() => store.enqueueUpsert('decks', { id: 'x', team_id: TEAM_A }, 'id'));
      check('a row stamped with another team is refused',
        !!e && e.name === 'TeamScopeError', e && e.name);

      e = threw(() => store.enqueueUpsert('deck_slides', [{ deck_id: someADeck, slide_ref_id: 's' }], 'deck_id,slide_ref_id'));
      check('a child row under another team\'s parent is refused',
        !!e && e.name === 'TeamScopeError', e && e.name);

      e = threw(() => store.enqueueUpsert('some_table_nobody_declared', { team_id: TEAM_B }));
      check('an undeclared table is refused rather than assumed safe',
        !!e && e.name === 'TeamScopeError', e && e.name);
    });

    console.log('\n9. Logged-out callers still get nothing');
    const anon = makeAgent();
    const anonSettings = await anon.get('/api/settings');
    check('/api/settings requires a login now',
      anonSettings.status === 401 || anonSettings.status === 302, 'status ' + anonSettings.status);
    const anonDecks = await anon.get('/api/decks');
    check('/api/decks requires a login', anonDecks.status === 401 || anonDecks.status === 302,
      'status ' + anonDecks.status);

  } catch (e) {
    fail++;
    console.error('\n🔴 harness error:', e.message);
  } finally {
    await teardown();
  }

  console.log('\n' + (fail === 0 ? '✅' : '🔴') + ' ' + pass + '/' + (pass + fail) + ' checks passed');
  process.exit(fail === 0 ? 0 : 1);
})();
