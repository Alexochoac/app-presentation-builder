#!/usr/bin/env node
/* ============================================================
   check-finish-contrast.js — readability seatbelt for Finish blocks
   ------------------------------------------------------------
   The two-block theme model lets a Finish block (themes/finish/*.css)
   repaint a slide's backgrounds. If it repaints the field but leaves
   the palette's --text untouched, text can land same-on-same and turn
   invisible. This script estimates the contrast between each Finish's
   --text ink and the opaque colours it paints onto .slide / .card, and
   warns when a pairing falls below a readable ratio.

   It is a HEURISTIC, not a proof: gradients, translucency, and blur are
   approximated (worst opaque stop; translucent stops skipped). Treat a
   WARN as "go look at this theme", not "this is definitely broken".

   Usage:  node scripts/check-finish-contrast.js [--strict]
           --strict → exit 1 if any theme WARNs (for a pre-commit gate)
   ============================================================ */

const fs = require('fs');
const path = require('path');

const FINISH_DIR = path.join(__dirname, '..', 'builder', 'themes', 'finish');
const THEMES_DIR = path.join(__dirname, '..', 'builder', 'themes');

// Slides are large text → WCAG AA large-text threshold is 3.0:1.
const THRESHOLD = 3.0;
const strict = process.argv.includes('--strict');

// ── colour parsing ───────────────────────────────────────────
const NAMED = { white: [255,255,255], black: [0,0,0] };

function parseHex(h) {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (h.length === 8) h = h.slice(0, 6);            // drop alpha
  if (h.length !== 6) return null;
  return [0,2,4].map(i => parseInt(h.slice(i, i + 2), 16));
}

// Resolve a palette var like var(--accent-rgb) → "r,g,b" using the palette file.
function resolveVars(str, palette) {
  return str.replace(/var\(\s*(--[\w-]+)\s*\)/g, (m, name) => {
    const re = new RegExp(name + '\\s*:\\s*([^;]+);', 'i');
    const hit = palette.match(re);
    return hit ? hit[1].trim() : m;
  });
}

// Return [r,g,b] for an opaque colour token, or null if translucent/unparseable.
function tokenToRgb(tok, palette) {
  tok = resolveVars(tok.trim(), palette);
  if (NAMED[tok.toLowerCase()]) return NAMED[tok.toLowerCase()];
  if (tok[0] === '#') return parseHex(tok);
  const m = tok.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const parts = m[1].split(',').map(s => s.trim());
    if (parts.length === 4 && parseFloat(parts[3]) < 0.95) return null; // translucent → skip
    const rgb = parts.slice(0, 3).map(Number);
    return rgb.every(n => !isNaN(n)) ? rgb : null;
  }
  return null;
}

// Pull every opaque colour token out of a CSS value (e.g. a gradient).
function extractColors(value, palette) {
  const out = [];
  const re = /#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|\bwhite\b|\bblack\b/g;
  let m;
  while ((m = re.exec(value)) !== null) {
    const rgb = tokenToRgb(m[0], palette);
    if (rgb) out.push({ tok: m[0], rgb });
  }
  return out;
}

// ── WCAG contrast ────────────────────────────────────────────
function luminance([r, g, b]) {
  const a = [r, g, b].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}
function contrast(c1, c2) {
  const l1 = luminance(c1), l2 = luminance(c2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// ── per-rule helpers ─────────────────────────────────────────
// Comments can contain literal { } (e.g. ".slide.content { background }") which would
// derail the flat brace matcher below — strip them first.
function stripComments(css) { return css.replace(/\/\*[\s\S]*?\*\//g, ''); }

// Concatenated bodies of every rule whose selector list includes `selector` exactly
// (so `.slide` matches `.slide` and `.slide, .card` but NOT `.slide-title`).
function ruleBody(css, selector) {
  const re = /([^{}]+)\{([^}]*)\}/g;
  let m, bodies = [];
  while ((m = re.exec(css)) !== null) {
    const sels = m[1].split(',').map(s => s.trim());
    if (sels.includes(selector)) bodies.push(m[2]);
  }
  return bodies.length ? bodies.join(';') : null;
}
function decl(body, prop) {
  if (!body) return null;
  const m = body.match(new RegExp('(?<![\\w-])' + prop + '\\s*:\\s*([^;]+)'));
  return m ? m[1].trim() : null;
}

// ── run ──────────────────────────────────────────────────────
const files = fs.readdirSync(FINISH_DIR).filter(f => f.endsWith('.css')).sort();
const rows = [];
let warns = 0;

for (const file of files) {
  const base = file.replace(/\.css$/, '');
  const css = stripComments(fs.readFileSync(path.join(FINISH_DIR, file), 'utf8'));
  const palette = fs.existsSync(path.join(THEMES_DIR, base + '.css'))
    ? stripComments(fs.readFileSync(path.join(THEMES_DIR, base + '.css'), 'utf8')) : '';

  const slideBody = ruleBody(css, '.slide');
  const fieldVal = decl(slideBody, 'background') || '';
  const fieldChanged = !!fieldVal;

  // Inks to check: --text (titles/cards) AND --text-muted (labels + the corner credit,
  // which now draws from var(--text-muted)). Prefer the Finish's declaration, else palette.
  const textRaw  = decl(slideBody, '--text')       || decl(palette, '--text');
  const mutedRaw = decl(slideBody, '--text-muted') || decl(palette, '--text-muted');
  const inks = [
    { name: '--text',       rgb: textRaw  ? tokenToRgb(textRaw,  palette) : null, raw: textRaw },
    { name: '--text-muted', rgb: mutedRaw ? tokenToRgb(mutedRaw, palette) : null, raw: mutedRaw },
  ].filter(i => i.rgb);
  const textRgb = inks.length ? inks[0].rgb : null;
  const textRaw_ = inks.length ? inks[0].raw : textRaw;

  // Surfaces text sits on: the field stops + card background stops.
  const cardBody = ruleBody(css, '.card');
  const surfaces = [
    ...extractColors(fieldVal, palette),
    ...extractColors(decl(cardBody, 'background') || '', palette),
  ];

  const hasShadow = /text-shadow\s*:/.test(css);

  // "Repainted the field but never re-inked the text" — the exact bug class.
  if (fieldChanged && !decl(slideBody, '--text') && !decl(slideBody, 'color')) {
    rows.push({ base, field: '(changed)', text: '(palette)', ratio: '—',
      verdict: 'WARN', note: 'field repainted but --text not re-declared' });
    warns++; continue;
  }
  if (!textRgb || surfaces.length === 0) {
    rows.push({ base, field: surfaces[0] ? surfaces[0].tok : '(none/var)',
      text: textRaw_ || '(unknown)', ratio: '—', verdict: 'SKIP',
      note: 'no opaque colours to compare' });
    continue;
  }

  // Worst-case across every ink × surface pair (the least-contrasting combination).
  let worst = surfaces[0], worstR = Infinity, worstInk = inks[0];
  for (const ink of inks) {
    for (const s of surfaces) {
      const r = contrast(ink.rgb, s.rgb);
      if (r < worstR) { worstR = r; worst = s; worstInk = ink; }
    }
  }

  let verdict = worstR >= THRESHOLD ? 'PASS' : 'WARN';
  let note = '';
  if (verdict === 'WARN' && hasShadow) { verdict = 'NOTE'; note = 'low ratio, but text-shadow mitigates'; }
  if (verdict === 'WARN') { note = worstInk.name + ' may be unreadable on ' + worst.tok; warns++; }

  rows.push({ base, field: worst.tok, text: worstInk.raw, ratio: worstR.toFixed(1), verdict, note });
}

// ── report ───────────────────────────────────────────────────
const pad = (s, n) => String(s).padEnd(n);
console.log('\nFinish-block contrast check  (heuristic · large-text threshold ' + THRESHOLD.toFixed(1) + ':1)\n');
console.log(pad('theme', 20) + pad('worst surface', 18) + pad('--text', 24) + pad('ratio', 7) + 'verdict');
console.log('-'.repeat(80));
for (const r of rows) {
  console.log(pad(r.base, 20) + pad(r.field, 18) + pad(r.text, 24) + pad(r.ratio, 7) +
    r.verdict + (r.note ? '  — ' + r.note : ''));
}
console.log('-'.repeat(80));
console.log(rows.length + ' themes · ' + warns + ' warning(s)\n');

if (strict && warns > 0) process.exit(1);
