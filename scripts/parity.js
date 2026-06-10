#!/usr/bin/env node
/*
 * scripts/parity.js — "does every slide reach the finished presentation the same way?"
 *
 * The builder and the published deck share ONE render function in server.js:
 *     renderCartridge(resolved, { ..., editable })
 * The builder serves slides with editable:true (inline editing, image upload, builder controls);
 * publishing serves them with editable:false and then strips the editing chrome.
 *
 * This test renders every slide in a deck BOTH ways through that same function, applies the
 * identical "freeze" normalisation the publisher applies, and diffs the result.
 *   PASS  = the published slide is exactly the builder slide minus its editing-only chrome.
 *   DIFF  = something other than editing chrome changes between builder and published — a real
 *           divergence to investigate.
 *
 * Usage:   node scripts/parity.js [deckId]      (default: deck-rebuild)
 * No server needed; nothing is written to disk.
 */

const path = require('path');
const fs   = require('fs');
const { createRequire } = require('module');

const ROOT        = path.join(__dirname, '..');
const BUILDER_DIR = path.join(ROOT, 'builder');
const SERVER_PATH = path.join(BUILDER_DIR, 'server.js');
const cheerio     = require(path.join(BUILDER_DIR, 'node_modules', 'cheerio'));

const deckId = process.argv[2] || 'deck-rebuild';

// ── Load server.js's render functions WITHOUT its boot side effects ───────────
// Everything we need is defined before the boot tail (file-writing migrations + app.listen),
// which starts at `(function rebuildSlideDecks()`. We cut the source there and run the rest in a
// function whose top-level declarations we hand back. `pg` is required but only connects lazily,
// so no database is touched.
function loadServerApi() {
  let src = fs.readFileSync(SERVER_PATH, 'utf8');
  const cut = src.indexOf('(function rebuildSlideDecks()');
  if (cut === -1) throw new Error('Could not find the boot tail marker in server.js — has it been refactored?');
  src = src.slice(0, cut);

  const NEEDED = [
    'getDeckConfig', 'readDeckById', 'resolveTemplate', 'resolveSlideEdits',
    'renderCartridge', 'renderLayoutToHtml',
  ];
  src += '\n;return { ' + NEEDED.map(n => n + ': typeof ' + n + " !== 'undefined' ? " + n + ' : undefined').join(', ') + ' };';

  const serverRequire = createRequire(SERVER_PATH);
  const mod = { exports: {} };
  // eslint-disable-next-line no-new-func
  const factory = new Function('require', 'module', 'exports', '__dirname', '__filename', src);
  return factory(serverRequire, mod, mod.exports, BUILDER_DIR, SERVER_PATH);
}

// ── The freeze normalisation the publisher applies (server.js buildFrozenPresentation) ────────
// Applied IDENTICALLY to both renders so the only thing that can survive a diff is a genuine
// content difference — not the editing chrome we expect to be removed on publish.
function freezeNormalise(fragment) {
  const $ = cheerio.load(fragment, { xmlMode: false }, false);
  $('[data-builder-only],[data-ls-add-row],[data-ls-add],[data-ls-restore]').remove();
  $('[contenteditable]').removeAttr('contenteditable');
  $('[spellcheck]').removeAttr('spellcheck');
  $('[data-edit="customer-logo"]').removeAttr('onclick').removeAttr('title');
  $('input[type="file"]').remove();
  // Reserialise so attribute order / whitespace are canonical on both sides.
  return ($.html() || '').replace(/\s+/g, ' ').trim();
}

// ── First-difference window, for a readable DIFF report ───────────────────────
function firstDiff(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const from = Math.max(0, i - 40);
  return {
    at: i,
    builder:  a.slice(from, i + 80),
    finished: b.slice(from, i + 80),
  };
}

// ── Run ───────────────────────────────────────────────────────────────────────
const api = loadServerApi();
for (const fn of ['readDeckById', 'getDeckConfig', 'resolveTemplate', 'resolveSlideEdits', 'renderCartridge']) {
  if (typeof api[fn] !== 'function') throw new Error('server.js did not expose ' + fn + ' — its name may have changed.');
}

const library   = JSON.parse(fs.readFileSync(path.join(BUILDER_DIR, 'data', 'slide-library.json'), 'utf8'));
const deckBrand = api.getDeckConfig(deckId);          // branding/accent (may be {} — fine, applied to both)
const deck      = api.readDeckById(deckId);           // the slide list
if (!deck || !Array.isArray(deck.slides) || !deck.slides.length) { console.error('Deck not found or empty: ' + deckId); process.exit(1); }

console.log('Parity check — builder vs finished, deck "' + deckId + '"\n');

let pass = 0, diff = 0, skipped = 0;
deck.slides.forEach((s, idx) => {
  if (s.visible === false) return;
  const libSlide = (library.slides || []).find(l => l.id === s.librarySlideId);
  const label = '#' + (idx + 1) + ' ' + (s.librarySlideId || s.id);
  if (!libSlide) { console.log('  ?  ' + label + '  — library slide missing, skipped'); skipped++; return; }

  const resolved = api.resolveTemplate(libSlide.templateId);
  if (!resolved) { console.log('  ?  ' + label + '  — template missing, skipped'); skipped++; return; }
  if (resolved.source === 'canvas') { console.log('  ·  ' + label + '  — legacy canvas slide, skipped (no cartridge)'); skipped++; return; }

  const edits = api.resolveSlideEdits(libSlide, deckId);
  const opts  = { galleryEnabled: libSlide.galleryEnabled, rawEdits: edits, deck: deckBrand };

  let builder, finished;
  try {
    builder  = freezeNormalise(api.renderCartridge(resolved, Object.assign({}, opts, { editable: true })));
    finished = freezeNormalise(api.renderCartridge(resolved, Object.assign({}, opts, { editable: false })));
  } catch (err) {
    console.log('  !  ' + label + '  — render error: ' + err.message); diff++; return;
  }

  if (builder === finished) { console.log('  ✓  ' + label + '  match'); pass++; }
  else {
    diff++;
    const d = firstDiff(builder, finished);
    console.log('  ✗  ' + label + '  DIFF at char ' + d.at);
    console.log('       builder : …' + d.builder + '…');
    console.log('       finished: …' + d.finished + '…');
  }
});

console.log('\n' + pass + ' pass · ' + diff + ' diff' + (skipped ? ' · ' + skipped + ' skipped' : ''));
process.exit(diff ? 1 : 0);
