/**
 * backfill-translation-previous.js — one-off backfill for Slice 2.
 * ---------------------------------------------------------------------------
 * WHY: the Phase-3 import dropped the translation `previous` field, but it turned
 * out to power the Translation Center "↻ Restore" button (254 live values). We
 * added a `previous text` column to deck_translations; this script fills it in
 * from the JSON source.
 *
 * SCOPE: touches ONLY deck_translations. It deliberately does NOT re-run the full
 * import — settings/templates were already cut over to Postgres-as-source (Slices
 * 0–1), so a full re-import would clobber post-cutover edits with stale JSON.
 * Translations are not cut over yet, so JSON is still their source of truth here;
 * re-upserting value/dirty is a no-op and only `previous` actually changes.
 *
 * Idempotent: upsert on the PK. Safe to re-run. Use --dry-run to preview counts.
 *
 * Run:  node builder/scripts/backfill-translation-previous.js [--dry-run]
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const DRY = process.argv.includes('--dry-run');
const DATA = path.join(__dirname, '..', 'data');
const TEAM = '00000000-0000-0000-0000-000000000001'; // seeded default team

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const rd = (rel) => JSON.parse(fs.readFileSync(path.join(DATA, rel), 'utf8'));
const exists = (rel) => fs.existsSync(path.join(DATA, rel));
const val = (v) => (v === undefined ? null : v);
const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };

// Mirror the import's flattening exactly, but KEEP `previous` this time.
function buildRows() {
  const decksFile = rd('decks.json');
  const rows = [];
  let withPrev = 0;
  decksFile.decks.forEach((d) => {
    const rel = `decks/${d.id}/translations.json`;
    if (!exists(rel)) return;
    const t = rd(rel);
    Object.keys(t.slides || {}).forEach((slideId) => {
      const fields = t.slides[slideId];
      Object.keys(fields).forEach((fieldKey) => {
        const byLang = fields[fieldKey];
        Object.keys(byLang).forEach((lang) => {
          const v = byLang[lang];
          const isObj = v && typeof v === 'object';
          const previous = isObj ? val(v.previous) : null; // en source is a scalar → no previous
          if (previous !== null) withPrev++;
          rows.push({
            deck_id: d.id, library_slide_id: slideId, field_key: fieldKey, lang,
            value: isObj ? val(v.current) : val(v),
            previous,
            dirty: isObj ? !!v.dirty : false,
            team_id: TEAM,
          });
        });
      });
    });
  });
  return { rows, withPrev };
}

async function main() {
  console.log(`\n${DRY ? '🔎 DRY RUN — nothing will be written' : '🚀 BACKFILL — writing deck_translations only'}\n`);
  const { rows, withPrev } = buildRows();
  console.log(`  ${rows.length} translation rows built, ${withPrev} of them carry a non-null previous.`);

  if (DRY) { console.log('\nDry run complete. Re-run without --dry-run to write.'); return; }

  for (const batch of chunk(rows, 500)) {
    const { error } = await supabase
      .from('deck_translations')
      .upsert(batch, { onConflict: 'deck_id,library_slide_id,field_key,lang' });
    if (error) throw new Error(`deck_translations: ${error.message}`);
  }

  // verify: read back the non-null previous count from Postgres
  const { count, error } = await supabase
    .from('deck_translations')
    .select('*', { count: 'exact', head: true })
    .not('previous', 'is', null);
  if (error) throw new Error(`verify: ${error.message}`);
  console.log(`\n✓ Wrote ${rows.length} rows. Postgres now has ${count} rows with a non-null previous (expected ${withPrev}).`);
}

main().catch((e) => { console.error('\n❌', e.message); process.exit(1); });
