/**
 * One-time importer: flat JSON (builder/data/) -> Supabase Postgres.
 *
 *   node scripts/import-to-supabase.js --dry-run   # count rows, write nothing
 *   node scripts/import-to-supabase.js             # import for real
 *
 * Safe by design:
 *   - READ-ONLY on the JSON files (never deletes/edits them — they stay as backup).
 *   - Idempotent: re-running upserts on primary keys (no duplicates). The one
 *     append-only table (presentation_events) is delete-all-then-reinsert.
 *   - Skips orphan references (edits/presentations pointing at deleted decks) and logs them.
 *   - Ends with a validation pass: row counts read back from Postgres vs what we sent.
 *
 * Restructures applied during the move (per the plan/task):
 *   - deckEdits split OUT of slide_library into deck_slide_edits (one row per deck×slide).
 *   - translations normalized into deck_translations, dropping the duplicate `previous`.
 *   - presentation events split into their own table.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const DRY = process.argv.includes('--dry-run');
const DATA = path.join(__dirname, '..', 'data');
const TEAM = '00000000-0000-0000-0000-000000000001';          // seeded default team
const SENTINEL_USER = '11111111-1111-1111-1111-111111111111'; // single-user stand-in until auth

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── helpers ──────────────────────────────────────────────────────────────────
const rd = (rel) => JSON.parse(fs.readFileSync(path.join(DATA, rel), 'utf8'));
const exists = (rel) => fs.existsSync(path.join(DATA, rel));
const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
const val = (v) => (v === undefined ? null : v);        // undefined -> null (missing JSON keys)

const skipped = [];   // orphan/reference issues, reported at the end
const plan = [];      // [{table, count}] for the dry-run summary

async function upsert(table, rows, onConflict) {
  plan.push({ table, count: rows.length });
  if (DRY || rows.length === 0) return;
  for (const batch of chunk(rows, 500)) {
    const { error } = await supabase.from(table).upsert(batch, { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

async function replaceAll(table, rows) {
  plan.push({ table, count: rows.length });
  if (DRY) return;
  // delete every row (neq on a non-null column matches all), then insert fresh
  const { error: delErr } = await supabase.from(table).delete().neq('id', -1);
  if (delErr) throw new Error(`${table} (clear): ${delErr.message}`);
  for (const batch of chunk(rows, 500)) {
    const { error } = await supabase.from(table).insert(batch);
    if (error) throw new Error(`${table} (insert): ${error.message}`);
  }
}

// ── load source + build reference sets ────────────────────────────────────────
const settings = rd('settings.json');
const decksFile = rd('decks.json');
const library = rd('slide-library.json').slides;
const templates = rd('templates.json');
const languages = rd('languages.json').languages;
const presentations = rd('presentations.json').presentations;

const deckIds = new Set(decksFile.decks.map((d) => d.id));
const libIds = new Set(library.map((s) => s.id));

// ── transforms ────────────────────────────────────────────────────────────────
function buildLanguages() {
  return languages.map((l) => ({ code: l.code, name: l.name }));
}

function buildTemplates() {
  return templates.map((t) => ({
    id: t.id, team_id: null, name: t.name, category: val(t.category),
    slide_mode: val(t.slideMode), file: t.file,
    components: t.components || [], tags: t.tags || [], default_edits: t.defaultEdits || {},
    created_at: val(t.createdAt),
  }));
}

function buildSettings() {
  const s = settings;
  return [{
    team_id: TEAM,
    umami_website_id: val(s.umamiWebsiteId), homepage_url: val(s.homepageUrl),
    homepage_label: val(s.homepageLabel), logos: s.logos || [],
    logos_on_all_slides: s.logosOnAllSlides !== false,
    hero_bg: val(s.heroBg), hero_bg_focal: val(s.heroBgFocal), hero_bg_focal_grid: val(s.heroBgFocalGrid),
    default_primary_color: val(s.defaultPrimaryColor), default_deck_theme: val(s.defaultDeckTheme),
  }];
}

function deckTitle(deckId) {
  const rel = `decks/${deckId}/deck.json`;
  return exists(rel) ? (rd(rel).title || '') : '';
}

function buildDecks() {
  return decksFile.decks.map((d) => ({
    id: d.id, team_id: TEAM, name: d.name, theme: val(d.theme), title: deckTitle(d.id),
    logo: val(d.logo), hero_bg: val(d.heroBg), hero_bg_focal: val(d.heroBgFocal),
    hero_bg_focal_grid: val(d.heroBgFocalGrid), hero_bg_fit: val(d.heroBgFit),
    hero_bg_opacity: val(d.heroBgOpacity), hero_bg_type: val(d.heroBgType), hero_bg_color: val(d.heroBgColor),
    style_ref: val(d.styleRef), style_css: val(d.styleCss), brand_credit: val(d.brandCredit),
    website_url: val(d.websiteUrl), checkerboard: val(d.checkerboard), colors: d.colors || {},
    created_at: val(d.createdAt), updated_at: val(d.updatedAt),
  }));
}

function buildActiveDeck() {
  const id = decksFile.activeDeckId;
  if (!id || !deckIds.has(id)) return [];
  return [{ team_id: TEAM, user_id: SENTINEL_USER, deck_id: id }];
}

function buildLibrary() {
  return library.map((s) => ({
    id: s.id, team_id: TEAM, name: s.name, template_id: val(s.templateId),
    edits: s.edits || {}, gallery_enabled: !!s.galleryEnabled,
    theme_override: val(s.themeOverride), created_at: val(s.createdAt),
  }));
}

function buildDeckSlideEdits() {
  const rows = [];
  library.forEach((s) => {
    if (!s.deckEdits) return;
    Object.keys(s.deckEdits).forEach((dId) => {
      if (!deckIds.has(dId)) { skipped.push(`deck_slide_edits: slide ${s.id} edits for deleted deck ${dId}`); return; }
      rows.push({ deck_id: dId, library_slide_id: s.id, team_id: TEAM, edits: s.deckEdits[dId] || {} });
    });
  });
  return rows;
}

function buildDeckSlides() {
  const rows = [];
  decksFile.decks.forEach((d) => {
    const rel = `decks/${d.id}/deck.json`;
    if (!exists(rel)) { skipped.push(`deck_slides: no deck.json for ${d.id}`); return; }
    (rd(rel).slides || []).forEach((sl, i) => {
      if (!libIds.has(sl.librarySlideId)) { skipped.push(`deck_slides: ${d.id} refs missing library slide ${sl.librarySlideId}`); return; }
      rows.push({ deck_id: d.id, library_slide_id: sl.librarySlideId, slide_ref_id: sl.id, position: i, visible: sl.visible !== false });
    });
  });
  return rows;
}

function buildTranslations() {
  const meta = [];
  const rows = [];
  decksFile.decks.forEach((d) => {
    const rel = `decks/${d.id}/translations.json`;
    if (!exists(rel)) return;
    const t = rd(rel);
    meta.push({
      deck_id: d.id, team_id: TEAM,
      languages: t.languages || ['en'], default_language: t.defaultLanguage || 'en',
      favorites: t.favorites || [],
    });
    Object.keys(t.slides || {}).forEach((slideId) => {
      const fields = t.slides[slideId];
      Object.keys(fields).forEach((fieldKey) => {
        const byLang = fields[fieldKey];
        Object.keys(byLang).forEach((lang) => {
          const v = byLang[lang];
          const isObj = v && typeof v === 'object';
          rows.push({
            deck_id: d.id, library_slide_id: slideId, field_key: fieldKey, lang,
            value: isObj ? val(v.current) : val(v),          // drop `previous`
            dirty: isObj ? !!v.dirty : false,
            team_id: TEAM,
          });
        });
      });
    });
  });
  return { meta, rows };
}

function buildPresentations() {
  return presentations.map((p) => {
    if (p.deckId && !deckIds.has(p.deckId)) skipped.push(`presentations: ${p.id} references deleted deck ${p.deckId} (kept, deck_id not FK-enforced)`);
    return {
      id: p.id, team_id: TEAM, created_by: null, deck_id: val(p.deckId),
      presentation_name: val(p.presentationName), customer_name: val(p.customerName),
      customer_url: val(p.customerUrl), contact_name: val(p.contactName), contact_title: val(p.contactTitle),
      customer_logo_src: val(p.customerLogoSrc), show_cover_logo: val(p.showCoverLogo),
      slide_count: val(p.slideCount), slides: p.slides || [],
      default_language: val(p.defaultLanguage), languages: p.languages || [],
      created_at: val(p.createdAt), published_at: val(p.publishedAt),
      replaced_at: val(p.replacedAt), archived_at: val(p.archivedAt),
    };
  });
}

function buildPresentationEvents() {
  const rows = [];
  presentations.forEach((p) => (p.events || []).forEach((e) => {
    rows.push({ presentation_id: p.id, type: e.type, at: e.at, deck_id: val(e.deckId), deck_name: val(e.deckName) });
  }));
  return rows;
}

// ── run ────────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${DRY ? '🔎 DRY RUN — nothing will be written' : '🚀 IMPORT — writing to Supabase'}\n`);

  const trans = buildTranslations();

  // FK-safe order
  await upsert('teams', [{ id: TEAM, name: 'Default team' }], 'id');
  await upsert('languages', buildLanguages(), 'code');
  await upsert('templates', buildTemplates(), 'id');
  await upsert('settings', buildSettings(), 'team_id');
  await upsert('slide_library', buildLibrary(), 'id');
  await upsert('decks', buildDecks(), 'id');
  await upsert('user_active_deck', buildActiveDeck(), 'team_id,user_id');
  await upsert('deck_slides', buildDeckSlides(), 'deck_id,slide_ref_id');
  await upsert('deck_slide_edits', buildDeckSlideEdits(), 'deck_id,library_slide_id');
  await upsert('deck_translation_meta', trans.meta, 'deck_id');
  await upsert('deck_translations', trans.rows, 'deck_id,library_slide_id,field_key,lang');
  await upsert('presentations', buildPresentations(), 'id');
  await replaceAll('presentation_events', buildPresentationEvents());

  // ── summary ──
  console.log('Planned rows per table:');
  plan.forEach((p) => console.log(`  ${p.table.padEnd(24)} ${p.count}`));

  if (skipped.length) {
    console.log(`\n⚠️  Skipped / notes (${skipped.length}):`);
    skipped.forEach((s) => console.log(`  - ${s}`));
  } else {
    console.log('\n✓ No orphan references.');
  }

  if (DRY) { console.log('\nDry run complete. Re-run without --dry-run to import.'); return; }

  // ── validation pass: read counts back and compare ──
  console.log('\nValidating (row counts read back from Postgres):');
  let mismatch = 0;
  for (const { table, count } of plan) {
    const { count: got, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
    const ok = !error && got === count;
    if (!ok) mismatch++;
    console.log(`  ${ok ? '✅' : '❌'} ${table.padEnd(24)} expected ${count}, got ${error ? 'ERR ' + error.message : got}`);
  }
  console.log(mismatch ? `\n❌ ${mismatch} table(s) mismatched — investigate before proceeding.` : '\n🎉 All tables match. Import verified.');
  process.exit(mismatch ? 1 : 0);
}

main().catch((e) => { console.error('\n💥 Import failed:', e.message); process.exit(1); });
