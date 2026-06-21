// One-off cleanup: unwrap self-referential [data-edit] nesting in saved edits/translations.
// contenteditable can serialise a field's own wrapper inside itself (e.g. headline value
// containing <span data-edit="headline">…</span>), which makes applyEditsToHtml recurse
// forever at render → the slide 404s. Mirrors server.js unwrapSelfNestedEdit.
// Usage: node scripts/fix-nested-edits.js <dataDir> [<dataDir> ...]
'use strict';
var fs = require('fs');
var path = require('path');
var cheerio = require(path.join(__dirname, '..', 'builder', 'node_modules', 'cheerio'));

var count = 0;
function unwrapSelfNestedEdit(key, html) {
  if (typeof html !== 'string' || html.indexOf('data-edit="' + key + '"') === -1) return html;
  var $ = cheerio.load(html, { decodeEntities: false }, false);
  var changed = false;
  $('[data-edit="' + key + '"]').each(function () { $(this).replaceWith($(this).contents()); changed = true; });
  return changed ? $.html() : html;
}
function fix(key, val) {
  if (typeof val !== 'string') return val;
  var v = unwrapSelfNestedEdit(key, val);
  if (v !== val) count++;
  return v;
}
function fixEditMap(map) {            // { fieldKey: htmlString }
  if (!map || typeof map !== 'object') return;
  Object.keys(map).forEach(function (k) { map[k] = fix(k, map[k]); });
}

function fixLibrary(fp) {
  if (!fs.existsSync(fp)) return;
  var before = count;
  var lib = JSON.parse(fs.readFileSync(fp, 'utf8'));
  (lib.slides || []).forEach(function (s) {
    fixEditMap(s.edits);
    if (s.deckEdits) Object.keys(s.deckEdits).forEach(function (d) { fixEditMap(s.deckEdits[d]); });
  });
  if (count > before) { backupWrite(fp, lib, count - before); }
}
function fixTranslations(fp) {
  if (!fs.existsSync(fp)) return;
  var before = count;
  var t = JSON.parse(fs.readFileSync(fp, 'utf8'));
  if (t.slides) Object.keys(t.slides).forEach(function (sid) {
    var fields = t.slides[sid];
    Object.keys(fields).forEach(function (fk) {
      var entry = fields[fk];
      if (typeof entry === 'string') { fields[fk] = fix(fk, entry); return; }
      if (entry && typeof entry === 'object') {
        if (typeof entry.en === 'string') entry.en = fix(fk, entry.en);
        Object.keys(entry).forEach(function (lang) {
          var le = entry[lang];
          if (le && typeof le === 'object') {
            if (typeof le.current === 'string')  le.current  = fix(fk, le.current);
            if (typeof le.previous === 'string') le.previous = fix(fk, le.previous);
          }
        });
      }
    });
  });
  if (count > before) { backupWrite(fp, t, count - before); }
}
function backupWrite(fp, data, n) {
  var bak = fp + '.bak-nested';
  if (!fs.existsSync(bak)) fs.copyFileSync(fp, bak);
  fs.writeFileSync(fp, JSON.stringify(data, null, 2), 'utf8');
  console.log('  unwrapped ' + n + ' self-nested edit(s): ' + fp);
}

var dirs = process.argv.slice(2);
if (!dirs.length) { console.error('Pass one or more data dirs'); process.exit(1); }
dirs.forEach(function (dir) {
  console.log('Scanning ' + dir);
  fixLibrary(path.join(dir, 'slide-library.json'));
  var decksDir = path.join(dir, 'decks');
  if (fs.existsSync(decksDir)) {
    fs.readdirSync(decksDir).forEach(function (d) {
      fixTranslations(path.join(decksDir, d, 'translations.json'));
    });
  }
});
console.log('Done. Total self-nested edits unwrapped: ' + count);
