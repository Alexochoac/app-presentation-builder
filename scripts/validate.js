#!/usr/bin/env node
// scripts/validate.js — check slide cartridges against the Slide System Rulebook.
// Usage: node scripts/validate.js [--summary] [path/to/one-slide.html]
//   No args: validates every cartridge in builder/features/slides/.
//   --summary: print only the summary table (skip per-slide detail).
//   A file path: validate just that one file.
//
// Read-only. Exits 1 if any ERROR-level issue is found (so it can gate a pipeline), else 0.
// Rules come from architecture/slide-system-rulebook.md.

const path    = require('path');
const fs      = require('fs');
const cheerio = require('../builder/node_modules/cheerio');

const SLIDES_DIR    = path.join(__dirname, '..', 'builder', 'features', 'slides');
const TEMPLATES_PATH = path.join(__dirname, '..', 'builder', 'data', 'templates.json');

// The app's source of truth is templates.json — only registered templates are real "slides".
// Returns { registered: [filenames], duplicates: [filenames registered more than once] }.
function registeredTemplates() {
  const raw = JSON.parse(fs.readFileSync(TEMPLATES_PATH, 'utf8'));
  const list = Array.isArray(raw) ? raw : (raw.templates || Object.values(raw));
  const entries = [], byFile = {};
  for (const t of list) {
    const file = (t.file || '').replace('features/slides/', '');
    if (!file) continue;
    entries.push({ id: t.id, file });           // one per template ID (the app counts these)
    (byFile[file] = byFile[file] || []).push(t.id);
  }
  const sharedFiles = Object.entries(byFile)
    .filter(([f, ids]) => ids.length > 1)
    .map(([file, ids]) => ({ file, ids }));
  return { entries, files: Object.keys(byFile), sharedFiles };
}

// ── The contract (rulebook §3 Layer 1) ───────────────────────────────────────
// Derived from the real runtime stylesheet's :root (the single source of truth),
// so the allowlist can never drift from what actually exists. Includes the bridged
// legacy names (--bg-card → --card-bg) and structural vars (--nav-bg, --orb-a, …).
const SHARED_CSS = path.join(__dirname, '..', 'builder', 'features', 'slides', 'style.css');
const CSS_VARS = (function () {
  const set = new Set();
  try {
    const css = fs.readFileSync(SHARED_CSS, 'utf8');
    let m; const re = /(--[a-z0-9-]+)\s*:/gi;   // custom-property definitions (name followed by ':')
    while ((m = re.exec(css))) set.add(m[1].toLowerCase());
  } catch (e) { /* leave empty → ghost check effectively disabled if file missing */ }
  return set;
})();

// Heuristic blocklist of real customer/company data that must NOT appear in a template (§9 —
// templates use generic placeholder data; the real content lives in the deck). This list is a
// maintained best-effort signal (WARN, not a hard block), so keep terms distinctive to avoid
// false positives on legitimately-generic copy. Add new real brands/products/places/people here.
const REAL_DATA_TERMS = [
  'SoftSolution', 'LiteSentry', 'GlassQuality', 'StrainOptics', 'Waidhofen', 'Burnsville',
  'LineScanner', 'BowScanner', 'CulletScanner', 'VirtualDigitizing', 'Osprey', 'LoadValidator',
  'MoldWatcher', 'ThermalWatch', 'NightHawk', 'QualityStation', '@softsolution', 'Alex Ochoa',
];

// ── Severity ──────────────────────────────────────────────────────────────────
const ERROR = 'ERROR', WARN = 'WARN', INFO = 'INFO';
const COLOR = { ERROR: '\x1b[31m', WARN: '\x1b[33m', INFO: '\x1b[36m', reset: '\x1b[0m', dim: '\x1b[2m', green: '\x1b[32m' };
const c = (k, s) => (process.stdout.isTTY ? (COLOR[k] || '') + s + COLOR.reset : s);

// Each check pushes { level, rule, msg } onto `issues`.
function validateCartridge(file, html) {
  const issues = [];
  const add = (level, rule, msg) => issues.push({ level, rule, msg });
  const $ = cheerio.load(html, { decodeEntities: false }, false);

  const root = $('[data-slide]').first();

  // — §3 Layer 4: root attributes —
  if (!root.length) {
    add(ERROR, 'slide-mode', 'no [data-slide] root element found');
  } else {
    const id = root.attr('data-slide') || '';
    if (!root.attr('data-slide-mode')) add(ERROR, 'slide-mode', 'root is missing data-slide-mode');

    // — §4: ID convention —
    if (!/^template\d+-[a-z0-9-]+$/.test(id)) {
      add(WARN, 'id-convention', `data-slide="${id}" — should be template[NN]-[name] (legacy id → migrate)`);
    }
    // CSS scope class should match the id
    const cls = (root.attr('class') || '').split(/\s+/);
    if (id && !cls.includes(id)) add(WARN, 'scope-class', `root class list does not include its id "${id}"`);
  }

  // — §3 Layer 3: tracking must use Track.*(), never raw umami.track() —
  // Strip comments first so a mention in a comment isn't mistaken for a real call.
  const codeOnly = html
    .replace(/<!--[\s\S]*?-->/g, ' ')        // HTML comments
    .replace(/\/\*[\s\S]*?\*\//g, ' ')        // block comments
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');    // line comments (but not the // in https://)
  const rawTrack = (codeOnly.match(/umami\.track\(/g) || []).length;
  if (rawTrack) add(ERROR, 'tracking', `${rawTrack} raw umami.track() call(s) — use Track.*() instead`);

  // — §2 / §8: scoped style + script —
  if ($('style').length === 0) add(WARN, 'scoped-style', 'no scoped <style> block');
  if ($('script').length === 0) add(WARN, 'scoped-script', 'no scoped <script> block');

  // — §3 Layer 1: CSS variables + no hardcoding (inspect <style> blocks) —
  const styleSrc = $('style').map((i, el) => $(el).html()).get().join('\n');
  // non-existent variables
  const usedVars = new Set();
  let m; const varRe = /var\(\s*(--[a-z0-9-]+)/gi;
  while ((m = varRe.exec(styleSrc))) usedVars.add(m[1].toLowerCase());
  const ghostVars = [...usedVars].filter(v => !CSS_VARS.has(v));
  if (ghostVars.length) add(ERROR, 'ghost-css-var', `uses variable(s) that do not exist: ${ghostVars.join(', ')}`);
  // hardcoded theme colors
  const hexCount  = (styleSrc.match(/#[0-9a-fA-F]{3,8}\b/g) || []).length;
  const rgbLit    = (styleSrc.match(/\brgba?\(\s*[\d.]/g) || []).length; // rgba(123,...) not rgba(var(--..))
  if (hexCount) add(WARN, 'hardcoded-color', `${hexCount} hardcoded hex color(s) — use a CSS variable`);
  if (rgbLit)   add(WARN, 'hardcoded-color', `${rgbLit} hardcoded rgb/rgba literal(s) — use rgba(var(--accent-rgb), …)`);
  if (/font-family\s*:/i.test(styleSrc)) add(WARN, 'hardcoded-font', 'sets font-family directly — use var(--font-body/--font-heading)');

  // — §3 Layer 1: responsive, mobile-first — flag desktop-first max-width overrides —
  const maxw = (styleSrc.match(/@media[^{]*max-width/gi) || []).length;
  if (maxw) add(WARN, 'responsive', `${maxw} desktop-first @media(max-width…) block(s) — use mobile-first @media(min-width:769px)`);

  // — §3 Layer 2: translation keys off data-edit; contenteditable text must carry data-edit —
  let editableNoKey = 0;
  $('[contenteditable]').each((i, el) => { if (!$(el).attr('data-edit')) editableNoKey++; });
  if (editableNoKey) add(WARN, 'translation', `${editableNoKey} contenteditable node(s) without data-edit (not saved/translatable)`);
  // data-lang-key is unused by the app — dead markup to remove
  const deadLang = $('[data-lang-key]').length;
  if (deadLang) add(INFO, 'dead-lang-key', `${deadLang} data-lang-key attribute(s) — unused by the app, remove`);

  // — Logo-row: templates are brand-neutral — the logo-row defaults to the product logo and
  //   gets the deck's real logos injected at serve time (withLiveLogos). So it MUST carry
  //   data-edit="logo-row" (the injection hook) and default to the product logo, never a
  //   specific customer/brand logo. See rulebook §8/§9. —
  const PRODUCT_LOGO = '/shared/brand/logo.svg';
  const logoRow = $('.slide-logo-row').first();
  if (logoRow.length) {
    if (logoRow.attr('data-edit') !== 'logo-row') {
      add(ERROR, 'logo-default', '.slide-logo-row must carry data-edit="logo-row" so deck branding can override it');
    }
    if (logoRow.attr('data-managed') === undefined) {
      add(ERROR, 'logo-default', '.slide-logo-row must carry data-managed (server-injected, not hand-editable) so auto-save cannot serialise injected logos back into it');
    }
    const firstImgSrc = (logoRow.find('img').first().attr('src') || '').trim();
    if (firstImgSrc !== PRODUCT_LOGO) {
      add(ERROR, 'logo-default', `.slide-logo-row default must be the product logo ("${PRODUCT_LOGO}"), not "${firstImgSrc || '(none)'}"`);
    }
  }

  // — §9: templates use generic placeholder data, not real customer data (heuristic) —
  //   Scan only visible text + image alt text — NOT class names, CSS, scripts, or asset paths
  //   (e.g. the shared `.softsolution-credit` class must not trip this).
  const $scan = cheerio.load(html, { decodeEntities: false }, false);
  $scan('style, script').remove();
  let contentText = $scan.root().text();
  $scan('img[alt]').each((i, el) => { contentText += ' ' + ($scan(el).attr('alt') || ''); });
  const hits = REAL_DATA_TERMS.filter(term => new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(contentText));
  if (hits.length) {
    add(WARN, 'real-data', `${hits.length} real-customer term(s) in a template — use generic placeholders (§9): ${hits.slice(0, 5).join(', ')}${hits.length > 5 ? '…' : ''}`);
  }

  // — §3 skeleton: count legacy per-slide bespoke classes (informational migration signal) —
  const bespoke = new Set();
  $('[class]').each((i, el) => {
    (($(el).attr('class') || '').split(/\s+/)).forEach(k => { if (/^ls\d+-/.test(k)) bespoke.add(k); });
  });
  if (bespoke.size) add(INFO, 'bespoke-class', `${bespoke.size} legacy per-slide class(es) (e.g. ${[...bespoke].slice(0, 3).join(', ')}…) — migrate to standard classes`);

  return issues;
}

// ── Runner ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const summaryOnly = args.includes('--summary');
const fileArg = args.find(a => !a.startsWith('--'));

// A "unit" is one template (by ID) → its cartridge file. Two templates can share a file.
let units, orphans = [], sharedFiles = [];
if (fileArg) {
  const p = path.resolve(fileArg);
  units = [{ id: path.basename(p), file: p }];
} else {
  const reg = registeredTemplates();
  sharedFiles = reg.sharedFiles;
  const regFiles = new Set(reg.files);
  const disk = fs.readdirSync(SLIDES_DIR).filter(f => f.endsWith('.html') && f !== 'index.html');
  orphans = disk.filter(f => !regFiles.has(f)).sort();
  units = reg.entries
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(e => ({ id: e.id, file: path.join(SLIDES_DIR, e.file) }));
}
const total = units.length;

const ruleTotals = {};            // rule -> { ERROR, WARN, INFO, templates:Set }
let cleanCount = 0, errorTemplates = 0;

console.log(c('dim', `\nValidating ${total} registered template(s) against the Slide System Rulebook\n`));

for (const u of units) {
  const label = u.file.endsWith('.html') && !fileArg ? `${u.id}  ${c('dim', '(' + path.basename(u.file) + ')')}` : u.id;
  const issues = fs.existsSync(u.file)
    ? validateCartridge(u.file, fs.readFileSync(u.file, 'utf8'))
    : [{ level: ERROR, rule: 'missing-file', msg: `cartridge file not found: ${path.basename(u.file)}` }];

  const errs  = issues.filter(i => i.level === ERROR).length;
  const warns = issues.filter(i => i.level === WARN).length;
  if (errs) errorTemplates++;
  if (!issues.length) cleanCount++;

  for (const i of issues) {
    const t = ruleTotals[i.rule] || (ruleTotals[i.rule] = { ERROR: 0, WARN: 0, INFO: 0, templates: new Set() });
    t[i.level]++; t.templates.add(u.id);
  }

  if (!summaryOnly) {
    const tag = issues.length === 0 ? c('green', '✓ clean')
              : `${errs ? c('ERROR', errs + ' err') : ''}${errs && warns ? ' ' : ''}${warns ? c('WARN', warns + ' warn') : ''}`;
    console.log(`${u.id.padEnd(22)} ${tag}`);
    for (const i of issues) {
      console.log(`    ${c(i.level, i.level.padEnd(5))} ${c('dim', '[' + i.rule + ']')} ${i.msg}`);
    }
  }
}

// ── Summary table: rule -> how many templates hit it ──────────────────────────
console.log(c('dim', '\n──────── Variance summary (templates affected per rule) ────────'));
const rows = Object.entries(ruleTotals)
  .map(([rule, t]) => ({ rule, n: t.templates.size, level: t.ERROR ? ERROR : t.WARN ? WARN : INFO }))
  .sort((a, b) => b.n - a.n);
for (const r of rows) {
  console.log(`  ${c(r.level, r.level.padEnd(5))} ${r.rule.padEnd(18)} ${String(r.n).padStart(3)} / ${total} templates`);
}
console.log(c('dim', '────────────────────────────────────────────────────────────────'));
console.log(`  ${c('green', cleanCount + ' clean')}  ·  ${c('ERROR', errorTemplates + ' with errors')}  ·  ${total} templates total\n`);

// ── Housekeeping ──────────────────────────────────────────────────────────────
sharedFiles.forEach(s =>
  console.log(c('WARN', `  ⚠ ${s.ids.join(' + ')} share one file (${s.file}) — editing it changes both`)));
if (orphans.length) {
  console.log(c('dim', `\n  ${orphans.length} orphan .html file(s) on disk, NOT registered as templates (tests/clones/dead — cleanup candidates):`));
  orphans.forEach(o => console.log(c('dim', `    · ${o}`)));
  console.log('');
}

process.exit(errorTemplates > 0 ? 1 : 0);
