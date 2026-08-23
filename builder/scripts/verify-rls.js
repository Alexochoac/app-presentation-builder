/**
 * verify-rls.js — prove team isolation is enforced BY THE DATABASE.
 *
 * Creates two throwaway users in two different teams, signs each in for a real
 * JWT, and checks what that token can actually reach. Cleans up after itself.
 *
 * Why it's written this way: the server's service_role key BYPASSES RLS, so
 * checking isolation with it passes no matter how broken a policy is. The only
 * meaningful test uses the anon key plus a real user's access token — exactly
 * what a browser or a leaked token would have.
 *
 *   node builder/scripts/verify-rls.js
 */
'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

const URL  = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } });

const TEAM_A = '00000000-0000-0000-0000-000000000001';        // the real default team (has data)
const TEAM_B = '00000000-0000-0000-0000-0000000000b2';        // throwaway, empty
const PW = 'Rls-verify-' + 'k'.repeat(12);
const USERS = [
  { tag: 'A', email: 'rls-probe-team-a@example.com', team: TEAM_A },
  { tag: 'B', email: 'rls-probe-team-b@example.com', team: TEAM_B },
];

let pass = 0, fail = 0;
function check(label, ok, detail) {
  (ok ? pass++ : fail++);
  console.log('   ' + (ok ? '✅' : '🔴') + ' ' + label + (detail ? '  — ' + detail : ''));
}

// A client that talks to Postgres AS THE USER, carrying their JWT.
function userClient(token) {
  return createClient(URL, ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: 'Bearer ' + token } }
  });
}

async function setup() {
  await admin.from('teams').upsert({ id: TEAM_B, name: 'RLS probe team B' });
  for (const u of USERS) {
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email, password: PW, email_confirm: true
    });
    if (error) throw new Error('create ' + u.email + ': ' + error.message);
    u.id = data.user.id;
    const { error: mErr } = await admin.from('team_members')
      .insert({ team_id: u.team, user_id: u.id, role: 'admin' });
    if (mErr) throw new Error('membership ' + u.email + ': ' + mErr.message);

    const anon = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: s, error: sErr } = await anon.auth.signInWithPassword({ email: u.email, password: PW });
    if (sErr) throw new Error('signin ' + u.email + ': ' + sErr.message);
    u.token = s.session.access_token;
    u.db = userClient(u.token);
  }
}

async function teardown() {
  for (const u of USERS) if (u.id) await admin.auth.admin.deleteUser(u.id).catch(() => {});
  await admin.from('teams').delete().eq('id', TEAM_B);
}

async function count(db, table) {
  const { data, error } = await db.from(table).select('*');
  return { n: data ? data.length : 0, error: error ? error.message : null };
}

(async () => {
  try {
    await setup();
    const [A, B] = USERS;

    console.log('\n=== 1. Team A (the real team, has data) can read its own rows ===');
    for (const t of ['decks', 'slide_library', 'presentations', 'settings']) {
      const r = await count(A.db, t);
      check(t + ' → ' + r.n + ' rows', r.n > 0 && !r.error, r.error);
    }

    console.log('\n=== 2. Team B (empty team) must see NONE of team A\'s data ===');
    for (const t of ['decks', 'slide_library', 'presentations', 'settings',
                     'deck_translations', 'deck_slide_edits', 'deck_slides']) {
      const r = await count(B.db, t);
      check(t + ' → ' + r.n + ' rows (want 0)', r.n === 0, r.error);
    }

    console.log('\n=== 3. Shared/reference data is still readable by both ===');
    const langA = await count(A.db, 'languages');
    const tplB  = await count(B.db, 'templates');
    check('languages readable by team A → ' + langA.n, langA.n > 0, langA.error);
    check('global templates readable by team B → ' + tplB.n, tplB.n > 0, tplB.error);

    console.log('\n=== 4. Team B cannot WRITE into team A ===');
    const ins = await B.db.from('decks').insert({
      id: 'rls-probe-should-fail', team_id: TEAM_A, name: 'should not exist', colors: {}
    }).select();
    check('insert a deck stamped with team A → rejected',
      !!ins.error || !(ins.data && ins.data.length), ins.error ? ins.error.message : 'NO ERROR — row went in!');

    const upd = await B.db.from('decks').update({ name: 'hijacked' }).eq('team_id', TEAM_A).select();
    check('update team A\'s decks → affects 0 rows',
      !(upd.data && upd.data.length), upd.error ? upd.error.message : null);

    const del = await B.db.from('presentations').delete().eq('team_id', TEAM_A).select();
    check('delete team A\'s presentations → affects 0 rows',
      !(del.data && del.data.length), del.error ? del.error.message : null);

    console.log('\n=== 5. Team rosters are not cross-visible ===');
    const rosterB = await B.db.from('team_members').select('user_id, team_id');
    const sawA = (rosterB.data || []).some(r => r.team_id === TEAM_A);
    check('team B\'s roster excludes team A', !sawA,
      rosterB.error ? rosterB.error.message : (rosterB.data || []).length + ' rows visible');

    console.log('\n=== 6. A signed-OUT (anon) caller sees nothing ===');
    const anon = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
    for (const t of ['decks', 'presentations', 'team_members']) {
      const r = await count(anon, t);
      check('anon ' + t + ' → ' + r.n + ' rows (want 0)', r.n === 0, null);
    }

    console.log('\n=== 7. Sanity: service_role still bypasses RLS (the server needs this) ===');
    const svc = await count(admin, 'decks');
    check('service_role sees all decks → ' + svc.n, svc.n > 0, svc.error);

  } catch (e) {
    console.error('\n🔴 SETUP/RUN ERROR: ' + e.message);
    fail++;
  } finally {
    await teardown();
    console.log('\ncleaned up probe users + team B');
    console.log('\n' + (fail === 0 ? '✅ ALL ' + pass + ' CHECKS PASSED — the database enforces isolation.'
                                   : '🔴 ' + fail + ' FAILED, ' + pass + ' passed.'));
    process.exit(fail === 0 ? 0 : 1);
  }
})();
