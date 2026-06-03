#!/usr/bin/env node
// scripts/preview-slide.js — wrap a slide cartridge into a standalone, browser-openable preview.
// Usage: node scripts/preview-slide.js builder/features/slides/slide-14-cta.html [theme]
//   theme (optional): a file in builder/themes/ for variable values (default: app-base.css defaults).
// Writes _preview.html at the repo root and prints the path. No server / no login needed.
// NOTE: images served from /slides/... won't load without the server — layout/colors/text still render.

const path = require('path');
const fs   = require('fs');

const ROOT       = path.join(__dirname, '..');
const fileArg    = process.argv[2];
const themeArg   = process.argv[3];
if (!fileArg) { console.error('usage: node scripts/preview-slide.js <slide.html> [theme.css]'); process.exit(1); }

// Use the REAL runtime stylesheet (has the full :root contract + bridges) so the preview matches the app.
// NOT architecture/skill-package/app-base.css — that's a stale standalone copy without the theme bridge.
const slideCss  = fs.readFileSync(path.join(ROOT, 'builder/features/slides/style.css'), 'utf8');
const themeCss  = themeArg ? fs.readFileSync(path.join(ROOT, 'builder/themes', themeArg), 'utf8') : '';
// Finish block (signature effects) — themes/finish/<theme>.css, injected raw after the palette if present.
const finishPath = themeArg ? path.join(ROOT, 'builder/themes/finish', themeArg) : null;
const finishCss  = (finishPath && fs.existsSync(finishPath)) ? fs.readFileSync(finishPath, 'utf8') : '';

// the cartridge fragment — add `active` to the root .slide so it renders visible
let fragment = fs.readFileSync(path.resolve(fileArg), 'utf8')
  .replace(/(<div class="slide)([ "])/, '$1 active$2');

const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Preview — ${path.basename(fileArg)}</title>
<style>${slideCss}</style>
${themeCss ? '<style>:root{' + themeCss.replace(/[^{]*\{/, '').replace(/\}[^}]*$/, '') + '}</style>' : ''}
${finishCss ? '<style>/* finish */' + finishCss + '</style>' : ''}
</head>
<body>
<div class="slides-container">
  <div class="glow-orb a"></div><div class="glow-orb b"></div>
  ${fragment}
</div>
<script>
  window.Track = { slideId:function(el){return el?(el.dataset.slide||'preview'):'preview';},
    click:function(){}, tab:function(){}, carousel:function(){}, expand:function(){}, zoom:function(){}, event:function(){} };
  window.PE = { initSlide:function(){} };
</script>
</body></html>`;

const out = path.join(ROOT, '_preview.html');
fs.writeFileSync(out, html);
console.log('✔ wrote ' + out);
console.log('  Open in your browser (Windows path):');
console.log('  ' + out.replace('/mnt/c/', 'C:\\').replace(/\//g, '\\'));
