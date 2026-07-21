/**
 * resync-library-to-supabase.js — Slice 3 pre-cutover sync for the library domain.
 * ---------------------------------------------------------------------------
 * WHY: slide_library + deck_slide_edits were imported on 2026-07-11, but the library
 * is still JSON-backed (Slice 3 not cut over yet), so slide-library.json has kept
 * changing since. Before flipping reads to Postgres we must bring both tables up to
 * date from the JSON (still the source of truth for this domain).
 *
 * Also backfills the 4 columns the original import dropped:
 *   template_version, template_update_ignored_at, style_ref, style_css
 * (The legacy slide-level `themeId` is deliberately NOT synced — it is write-only
 * dead data, redundant with style_ref/style_css.)
 *
 * SCOPE: writes ONLY slide_library + deck_slide_edits. It does NOT re-run the full
 * import — settings/templates/decks/translations are already cut over to
 * Postgres-as-source, and a full import would clobber them with stale JSON.
 *
 * Valid deck ids are read from the POSTGRES decks table (not the frozen decks.json),
 * because decks cut over in Slice 2. deckEdits for decks that no longer exist are
 * skipped (mirrors the original import's orphan handling).
 *
 * Idempotent: upsert on PK. Safe to re-run. Use --dry-run to preview.
 *
 * Run:  node scripts/resync-library-to-supabase.js [--dry-run]
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const DRY = process.argv.includes('--dry-run');
const DATA = path.join(__dirname, '..', 'data');
const TEAM = '00000000-0000-0000-0000-000000000001';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const rd = (rel) => JSON.parse(fs.readFileSync(path.join(DATA, rel), 'utf8'));
const val = (v) => (v === undefined ? null : v);
const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };

async function main() {
  console.log(`\n${DRY ? '🔎 DRY RUN — nothing will be written' : '🚀 RESYNC — slide_library + deck_slide_edits only'}\n`);

  const slides = rd('slide-library.json').slides;

  // valid decks come from Postgres (decks cut over in Slice 2)
  const { data: deckRows, error: deckErr } = await supabase.from('decks').select('id');
  if (deckErr) throw new Error(`read decks: ${deckErr.message}`);
  const deckIds = new Set(deckRows.map((d) => d.id));

  // ── slide_library base rows (incl. the 4 previously-dropped columns) ──
  let withVersion = 0, withStyle = 0, droppedThemeId = 0;
  const libRows = slides.map((s, i) => {
    if (s.templateVersion != null) withVersion++;
    if (s.styleRef != null || s.styleCss != null) withStyle++;
    if (s.themeId != null) droppedThemeId++;
    return {
      id: s.id, team_id: TEAM, name: s.name, template_id: val(s.templateId),
      edits: s.edits || {}, gallery_enabled: !!s.galleryEnabled,
      theme_override: val(s.themeOverride),
      position: i,                       // preserve the JSON array order (= My Library display order)
      template_version: val(s.templateVersion),
      template_update_ignored_at: val(s.templateUpdateIgnoredAt),
      style_ref: val(s.styleRef),
      style_css: val(s.styleCss),
      created_at: val(s.createdAt),
    };
  });

  // ── deck_slide_edits (THE split: one row per deck × slide) ──
  const editRows = [];
  const skipped = [];
  slides.forEach((s) => {
    if (!s.deckEdits) return;
    Object.keys(s.deckEdits).forEach((dId) => {
      if (!deckIds.has(dId)) { skipped.push(`${s.id} → deleted deck ${dId}`); return; }
      editRows.push({ deck_id: dId, library_slide_id: s.id, team_id: TEAM, edits: s.deckEdits[dId] || {} });
    });
  });

  console.log(`  slide_library    ${libRows.length} rows (${withVersion} with templateVersion, ${withStyle} with style_ref/css)`);
  console.log(`  deck_slide_edits ${editRows.length} rows`);
  if (droppedThemeId) console.log(`  (ignored ${droppedThemeId} dead themeId value(s) — intentionally not migrated)`);
  if (skipped.length) {
    console.log(`\n  ⚠️  skipped ${skipped.length} deckEdits bucket(s) for decks that no longer exist:`);
    skipped.forEach((s) => console.log(`     - ${s}`));
  }

  // stale rows that exist in Postgres but not in the JSON
  const { data: existing } = await supabase.from('slide_library').select('id');
  const jsonIds = new Set(slides.map((s) => s.id));
  const stale = (existing || []).filter((r) => !jsonIds.has(r.id)).map((r) => r.id);
  if (stale.length) console.log(`\n  ⚠️  ${stale.length} slide_library row(s) in Postgres but NOT in JSON (left alone): ${stale.join(', ')}`);

  if (DRY) { console.log('\nDry run complete. Re-run without --dry-run to write.'); return; }

  for (const batch of chunk(libRows, 500)) {
    const { error } = await supabase.from('slide_library').upsert(batch, { onConflict: 'id' });
    if (error) throw new Error(`slide_library: ${error.message}`);
  }
  for (const batch of chunk(editRows, 500)) {
    const { error } = await supabase.from('deck_slide_edits').upsert(batch, { onConflict: 'deck_id,library_slide_id' });
    if (error) throw new Error(`deck_slide_edits: ${error.message}`);
  }

  const { count: verCount } = await supabase.from('slide_library')
    .select('*', { count: 'exact', head: true }).not('template_version', 'is', null);
  const { count: editCount } = await supabase.from('deck_slide_edits')
    .select('*', { count: 'exact', head: true });
  console.log(`\n✓ Synced. Postgres: ${verCount} slides with template_version (expected ${withVersion}), ${editCount} deck_slide_edits rows (expected ${editRows.length}).`);
}

main().catch((e) => { console.error('\n❌', e.message); process.exit(1); });
