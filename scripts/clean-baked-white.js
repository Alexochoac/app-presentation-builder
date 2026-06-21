// One-off cleanup: strip baked theme-default white (color / -webkit-text-fill-color)
// out of existing deck + library content. Mirrors the server-side sanitizeEditHtml so
// already-saved slides stop rendering white-on-white on light/Checkerboard slides.
// Usage: node scripts/clean-baked-white.js <dataDir> [<dataDir> ...]
'use strict';
var fs = require('fs');
var path = require('path');
var cheerio = require(path.join(__dirname, '..', 'builder', 'node_modules', 'cheerio'));

// Mirrors server.js sanitizeEditHtml: strip baked inline white + unwrap white <font> tags.
var WHITE_VAL = '(?:white|#fff(?:fff)?|rgba?\\(\\s*255\\s*,\\s*255\\s*,\\s*255\\s*(?:,[^)]*)?\\))';
var BAKED_WHITE_RE = new RegExp('(?<![-\\w])(?:-webkit-text-fill-color|text-fill-color|color)\\s*:\\s*' + WHITE_VAL + '\\s*;?', 'gi');
function isWhiteColorAttr(v) {
  var c = String(v || '').toLowerCase().replace(/\s+/g, '');
  return c === 'white' || c === '#fff' || c === '#ffffff' || /^rgba?\(255,255,255/.test(c);
}
function unwrapWhiteFonts(html) {
  if (!/<font[^>]*color/i.test(html)) return html;
  var $ = cheerio.load(html, { decodeEntities: false }, false);
  var changed = false;
  $('font[color]').each(function () {
    if (isWhiteColorAttr($(this).attr('color'))) { $(this).replaceWith($(this).contents()); changed = true; }
  });
  return changed ? $.html() : html;
}
function sanitizeEditHtml(html) {
  if (typeof html !== 'string') return html;
  if (html.indexOf('255') === -1 && !/#fff|white/i.test(html)) return html;
  return unwrapWhiteFonts(html)
    .replace(BAKED_WHITE_RE, '')
    .replace(/;\s*;/g, '; ')
    .replace(/style="\s*"/gi, '');
}

var count = 0;
function walk(o) {
  if (Array.isArray(o)) { for (var i = 0; i < o.length; i++) o[i] = walk(o[i]); return o; }
  if (o && typeof o === 'object') { for (var k in o) o[k] = walk(o[k]); return o; }
  if (typeof o === 'string') { var s = sanitizeEditHtml(o); if (s !== o) count++; return s; }
  return o;
}

function cleanFile(fp) {
  if (!fs.existsSync(fp)) return;
  var before = count;
  var data = JSON.parse(fs.readFileSync(fp, 'utf8'));
  walk(data);
  var changed = count - before;
  if (changed > 0) {
    var bak = fp + '.bak-cleanwhite';
    if (!fs.existsSync(bak)) fs.copyFileSync(fp, bak);
    fs.writeFileSync(fp, JSON.stringify(data, null, 2), 'utf8');
    console.log('  cleaned ' + changed + ' string(s): ' + fp);
  }
}

var dirs = process.argv.slice(2);
if (!dirs.length) { console.error('Pass one or more data dirs'); process.exit(1); }
dirs.forEach(function (dir) {
  console.log('Scanning ' + dir);
  cleanFile(path.join(dir, 'slide-library.json'));
  var decksDir = path.join(dir, 'decks');
  if (fs.existsSync(decksDir)) {
    fs.readdirSync(decksDir).forEach(function (d) {
      cleanFile(path.join(decksDir, d, 'translations.json'));
    });
  }
});
console.log('Done. Total strings changed: ' + count);
