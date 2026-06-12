require('dotenv').config();

const express  = require('express');
const path     = require('path');
const fs       = require('fs');
const crypto   = require('crypto');
const https    = require('https');
const http     = require('http');
const cheerio  = require('cheerio');
const session  = require('express-session');
const { requireAuth, registerAuthRoutes } = require('./features/auth/auth');
const { execFile, execSync } = require('child_process');
const { translate } = require('./lib/translator');
const { generateHtml } = require('./lib/template-generator');

// ── Deployment config ─────────────────────────────────────────────────────────
// REPO_ROOT: path to the git repo root — used for git add/commit/push and for
// writing finished-presentations. Defaults to the project root in local dev.
// In Docker, set REPO_ROOT=/repo and mount the git repo there.
const REPO_ROOT       = process.env.REPO_ROOT       || path.join(__dirname, '..');
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL  || 'http://localhost:3000';

// Configure git credentials on startup if GITHUB_TOKEN is provided.
// This lets the Docker container push to GitHub without needing SSH keys.
if (process.env.GITHUB_TOKEN) {
  try {
    execSync('git config user.email "builder@put-a-presentation.app"', { cwd: REPO_ROOT });
    execSync('git config user.name "Put.A.Presentation Builder"',      { cwd: REPO_ROOT });
    var currentRemote = execSync('git remote get-url origin', { cwd: REPO_ROOT }).toString().trim();
    // Strip any existing credentials (greedy .+ catches all accumulated user:pass@ segments)
    var cleanRemote = currentRemote.replace(/https:\/\/.+@/, 'https://');
    var tokenizedRemote = cleanRemote.replace('https://', 'https://Alexochoac:' + process.env.GITHUB_TOKEN + '@');
    execSync('git remote set-url origin ' + tokenizedRemote, { cwd: REPO_ROOT });
    console.log('[git] credentials configured for', cleanRemote);
  } catch (e) {
    console.warn('[git] credential setup warning:', e.message);
  }
}

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: false }));

// ── Sessions ──────────────────────────────────────────────────────────────────
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 8 } // 8 hours
}));

// ── Public assets (no auth required) ─────────────────────────────────────────
app.use('/shared/brand', express.static(path.join(__dirname, 'shared/brand')));

// GET /public/:id/ — customer-facing frozen presentations (no auth required)
app.use('/public', express.static(path.join(__dirname, '..', 'finished-presentations')));

// ── Auth routes (login / logout) ──────────────────────────────────────────────
registerAuthRoutes(app);

// Public config endpoint — must be before requireAuth so the login page can read publicBaseUrl.
app.get('/api/settings', function (_req, res) {
  var data = readSettings();
  data.umamiBaseUrl  = UMAMI_BASE_URL;
  data.publicBaseUrl = PUBLIC_BASE_URL;
  res.json({ success: true, data: data });
});

// Public static assets — must be before requireAuth so shared/readonly presentations can load images
app.use('/slides/uploads', express.static(path.join(__dirname, 'features/slides/uploads')));
app.use('/slides/shared',  express.static(path.join(__dirname, 'shared/assets')));

// ── Protect everything below this line ───────────────────────────────────────
app.use(requireAuth);

// ── Slide preview wrapper ─────────────────────────────────────────────────────
// GET /slides/deck-preview/:id — renders a deck slide and wraps it in the full HTML preview shell
app.get('/slides/deck-preview/:id', function (req, res) {
  var id       = req.params.id;
  var readonly = req.query.readonly === '1';
  if (!/^[a-z0-9-]+$/i.test(id)) {
    return res.status(400).type('text/plain').send('Invalid slide id');
  }
  try {
    var activeDeckId = getActiveDeckId();
    var deck       = readDeckById(activeDeckId);
    var deckConfig = getDeckConfig(activeDeckId);
    var deckSlide  = deck.slides.find(function (s) { return s.id === id; });
    if (!deckSlide || !deckSlide.librarySlideId) {
      return res.status(404).type('text/plain').send('Deck slide not found: ' + id);
    }
    var library  = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'));
    var libSlide = library.slides.find(function (s) { return s.id === deckSlide.librarySlideId; });
    if (!libSlide) return res.status(404).type('text/plain').send('Library slide not found');

    var resolved = resolveTemplate(libSlide.templateId);
    if (!resolved) return res.status(404).type('text/plain').send('Template not found');

    var isCoverSlide = libSlide.templateId === 'ls01-cover' || libSlide.templateId === 'ls26-cover';
    var slideEdits = resolveSlideEdits(libSlide, activeDeckId);
    if (isCoverSlide && !slideEdits['customer-logo'] && deckConfig.logo) {
      slideEdits = Object.assign({}, slideEdits, { 'customer-logo': deckConfig.logo });
    }

    var fragment;
    if (resolved.source === 'canvas') {
      fragment = renderLayoutToHtml(resolved.tpl, id, slideEdits, deckConfig);
      if (readonly) fragment = fragment.replace(/ contenteditable=""/g, '').replace(/ contenteditable=''/g, '');
    } else {
      fragment = renderCartridge(resolved, { galleryEnabled: libSlide.galleryEnabled, rawEdits: slideEdits, deck: deckConfig, editable: !readonly });
    }
    // In deck context, deck is the sole theming authority — never fall back to per-slide CSS
    var effectiveStyleCss = deckConfig.styleCss || null;

    var page = [
      '<!DOCTYPE html>',
      '<html lang="en">',
      '<head>',
      '  <meta charset="UTF-8">',
      '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
      '  <link rel="stylesheet" href="/slides/style.css">',
      effectiveStyleCss ? '  <style>' + effectiveStyleCss + '</style>' : '',
      finishStyleTag(deckConfig.styleRef || null),
      deckAccentCss(deckConfig) ? '  <style>' + deckAccentCss(deckConfig) + '</style>' : '',
      readonly ? '  <script>window.PB_READONLY = true;</script>' : '',
      '  <script src="/slides/components/tracker.js?v=2"></script>',
      '  <script src="/slides/components/lightbox.js?v=2"></script>',
      '  <script src="/slides/components/carousel.js?v=4"></script>',
      '  <script src="/slides/components/tabs.js?v=2"></script>',
      '  <script src="/slides/components/list.js?v=2"></script>',
      '  <script src="/slides/components/table.js?v=2"></script>',
      '  <script src="/slides/components/gallery.js?v=2"></script>',
      '  <script>',
      '    document.addEventListener("DOMContentLoaded", function () {',
      '      if (window.Lightbox) Lightbox.init(document);',
      '      if (window.Carousel) Carousel.init(document);',
      '      if (window.Tabs)     Tabs.init(document);',
      '      if (window.List)     List.init(document);',
      '      if (window.Table)    Table.init(document);',
      '      // Wire missing/broken image placeholders after components have initialized',
      '      (function () {',
      '        function markNoImg(img) {',
      '          var slide = img.closest(".ls-carousel-slide");',
      '          if (slide) slide.classList.add("no-img");',
      '          else img.classList.add("no-img");',
      '        }',
      '        document.querySelectorAll("img").forEach(function (img) {',
      '          var src = img.getAttribute("src");',
      '          if (!src || src.trim() === "") { markNoImg(img); return; }',
      '          if (img.complete && !img.naturalWidth) { markNoImg(img); return; }',
      '          img.addEventListener("error", function () { markNoImg(this); }, { once: true });',
      '        });',
      '      })();',
      '    });',
      '  </script>',
      '  <script src="/slides/components/button.js"></script>',
      '  <script src="/slides/components/tags.js"></script>',
      '  <style>',
      '    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }',
      '    html, body { width: 100%; height: 100%; overflow: hidden; }',
      '    .slides-container { position: relative; width: 100%; height: 100%; }',
      '    .slide { opacity: 1 !important; transform: scale(1) !important; pointer-events: auto !important; }',
      readonly ? '    [data-builder-only],[data-ls-add-row],[data-ls-add],[data-ls-restore]{ display:none !important; }' : '',
      '    .slide-logo-row img { height: 28px !important; }',
      '    .slide-logo-ls { height: 26px !important; }',
      '    .slide-logo-sep { height: 26px !important; }',
      '  </style>',
      '</head>',
      '<body>',
      '  <div class="slides-container">',
      fragment,
      '  </div>',
      // Lightbox DOM — required by lightbox.js (resolves #lightbox, #lb-img, etc.)
      '  <div id="lightbox">',
      '    <div id="lb-inner">',
      '      <button id="lb-close">&#10005;</button>',
      '      <button id="lb-prev" class="lb-nav-btn">&#8249;</button>',
      '      <div id="lb-stage"><img id="lb-img" src="" alt=""><div id="lb-cap"></div></div>',
      '      <button id="lb-next" class="lb-nav-btn">&#8250;</button>',
      '      <div id="lb-thumbs"></div>',
      '    </div>',
      '  </div>',
      '  <script>',
      '    document.addEventListener("DOMContentLoaded", function () {',
      '      var root = document.querySelector(".slides-container");',
      '      if (window.Carousel) Carousel.init(root);',
      '      if (window.Tabs)     Tabs.init(root);',
      '      if (window.Lightbox) Lightbox.init(root);',
      '      if (window.List)     List.init(root);',
      '      if (window.LSTable)  LSTable.init(root);',
      '      if (window.Gallery)  Gallery.init(root);',
      '    });',
      '  </script>',
      !readonly ? [
        '  <script>',
        '  (function () {',
        '    var DECK_SLIDE_ID = "' + id + '";',
        '    document.addEventListener("focusout", function (e) {',
        '      if (!e.target.hasAttribute || !e.target.hasAttribute("data-edit") || !e.target.hasAttribute("contenteditable")) return;',
        '      var edits = {};',
        '      document.querySelectorAll("[data-edit][contenteditable]").forEach(function (el) {',
        '        var clone = el.cloneNode(true);',
        '        clone.querySelectorAll("[data-builder-only]").forEach(function (n) { n.remove(); });',
        '        edits[el.getAttribute("data-edit")] = clone.innerHTML;',
        '      });',
        '      fetch("/api/deck/slides/" + DECK_SLIDE_ID + "/edits", {',
        '        method: "POST", headers: { "Content-Type": "application/json" },',
        '        body: JSON.stringify({ edits: edits })',
        '      });',
        '    });',
        '    document.addEventListener("slide-carousel-save", function (e) {',
        '      var key = e.detail && e.detail.editKey;',
        '      var html = e.detail && e.detail.html;',
        '      if (!key || html == null) return;',
        '      var edits = {}; edits[key] = html;',
        '      fetch("/api/deck/slides/" + DECK_SLIDE_ID + "/edits", {',
        '        method: "POST", headers: { "Content-Type": "application/json" },',
        '        body: JSON.stringify({ edits: edits })',
        '      });',
        '    });',
        '    document.addEventListener("slide-image-change", function (e) {',
        '      if (!e.detail || !e.detail.editKey) return;',
        '      var edits = {}; edits[e.detail.editKey] = e.detail.src || "";',
        '      fetch("/api/deck/slides/" + DECK_SLIDE_ID + "/edits", {',
        '        method: "POST", headers: { "Content-Type": "application/json" },',
        '        body: JSON.stringify({ edits: edits })',
        '      });',
        '      window.parent.postMessage({ type: "slide-image-change", editKey: e.detail.editKey, src: e.detail.src || "" }, "*");',
        '    });',
        '  })();',
        '  </script>',
      ].join('\n') : '',
      '</body>',
      '</html>'
    ].join('\n');
    res.type('text/html').send(page);
  } catch (err) {
    console.error('Deck preview error:', err.message);
    res.status(500).type('text/plain').send('Server error');
  }
});

// GET /slides/preview/:id — wraps a bare slide fragment in a full HTML shell
// Must be registered before the /slides static middleware or it will be intercepted
app.get('/slides/preview/:id', function (req, res) {
  var id = req.params.id;

  // Sanitize: only allow alphanumeric and hyphens — blocks path traversal
  if (!/^[a-z0-9-]+$/i.test(id)) {
    return res.status(400).type('text/plain').send('Invalid slide id');
  }

  var filePath = path.join(__dirname, 'features/slides', id + '.html');

  fs.promises.readFile(filePath, 'utf8')
    .then(function (fragment) {
      var page = [
        '<!DOCTYPE html>',
        '<html lang="en">',
        '<head>',
        '  <meta charset="UTF-8">',
        '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
        '  <link rel="stylesheet" href="/slides/style.css">',
        '  <script>window.PB_READONLY = true;</script>',
        '  <script src="/slides/components/tracker.js"></script>',
        '  <style>',
        '    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }',
        '    html, body { width: 100%; height: 100%; overflow: hidden; }',
        '    .slides-container { position: relative; width: 100%; height: 100%; }',
        '    /* Force slide visible — no JS in preview shell */',
        '    .slide { opacity: 1 !important; pointer-events: none !important; transform: scale(1) !important; }',
        '  </style>',
        '</head>',
        '<body>',
        '  <div class="slides-container">',
        fragment,
        '  </div>',
        '</body>',
        '</html>'
      ].join('\n');

      res.type('text/html').send(page);
    })
    .catch(function (err) {
      if (err.code === 'ENOENT') {
        return res.status(404).type('text/plain').send('Slide not found: ' + id);
      }
      console.error('Preview error:', err.message);
      res.status(500).type('text/plain').send('Server error');
    });
});

// ── Static: customer uploads ──────────────────────────────────────────────────
app.use('/slides/uploads', express.static(path.join(__dirname, 'features/slides/uploads')));

// ── Static: shared brand assets (logos) ──────────────────────────────────────
app.use('/slides/shared', express.static(path.join(__dirname, 'shared/assets')));

// ── Static: shared app styles ─────────────────────────────────────────────────
app.use('/shared', express.static(path.join(__dirname, 'shared')));

// ── Static: style reference previews ─────────────────────────────────────────
app.use('/style-references', express.static(path.join(__dirname, 'style-references')));

// ── Layout slide renderer ─────────────────────────────────────────────────────
// GET /slides/deck-slide-:id.html — generate an HTML fragment on the fly from layout JSON.
// Must be registered BEFORE the static /slides middleware so Express handles it first.

var COL_LAYOUTS = {
  'full':      '1fr',
  'half-half': '1fr 1fr',
  'third-two': '1fr 2fr',
  'two-third': '2fr 1fr',
  'thirds':    '1fr 1fr 1fr'
};

var ROW_HEIGHTS = {
  'auto':  '',
  'tall':  'min-height:280px;',
  'short': 'min-height:120px;'
};

var TYPE_MAP = {
  'title': 'title',           'Title': 'title',
  'subtitle': 'subtitle',     'Subtitle': 'subtitle',
  'text block': 'text',       'Text Block': 'text',       'text': 'text',
  'tabs': 'tabs',             'Tabs': 'tabs',
  'carousel': 'carousel',     'Carousel': 'carousel',
  'table': 'table',           'Table': 'table',
  'list': 'list',             'List': 'list',
  'button': 'button',         'Button': 'button',
  'cards grid': 'cards',      'Cards Grid': 'cards',
  'steps': 'steps',           'Steps': 'steps',
  'stats bar': 'stats',       'Stats Bar': 'stats',
  'tags': 'tags',             'Tags': 'tags',
  'integration cards': 'integrations', 'Integration Cards': 'integrations'
};

var LAYOUT_CSS = [
  '.ls-custom .slide-body { display: flex; flex-direction: column; gap: 16px; }',
  '.ls-custom .slide-row { display: grid; gap: 16px; width: 100%; }',
  '.ls-custom .slide-col { display: flex; flex-direction: column; gap: 12px; min-width: 0; }',
  '.ls-custom .slide-text { font-size: 14px; color: var(--text-muted); line-height: 1.6; }',
  '.ls-custom .slide-btn { display: inline-block; padding: 10px 28px; border-radius: 100px; background: linear-gradient(135deg, var(--accent), var(--accent-mid)); color: #000; font-size: 14px; font-weight: 700; cursor: pointer; text-decoration: none; align-self: flex-start; }',
  '.ls-custom .slide-steps { display: flex; flex-direction: column; gap: 10px; }',
  '.ls-custom .slide-step { display: flex; align-items: flex-start; gap: 12px; }',
  '.ls-custom .step-num { width: 24px; height: 24px; border-radius: 50%; background: var(--accent); color: #000; font-weight: 700; font-size: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }',
  '.ls-custom .step-text { font-size: 13px; color: var(--text-muted); padding-top: 4px; }',
  '.ls-custom .slide-tags { display: flex; flex-wrap: wrap; gap: 8px; }',
  '.ls-custom .slide-tag { padding: 6px 16px; border-radius: 100px; border: 1px solid var(--border); background: transparent; color: var(--text-muted); font-size: 12px; cursor: pointer; transition: all 0.15s; }',
  '.ls-custom .slide-tag.active { background: var(--accent-dim); border-color: var(--border-hov); color: var(--accent); }',
  '.ls-custom .int-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 4px; }',
  '.ls-custom .int-name { font-size: 13px; font-weight: 600; color: var(--text); }',
  '.ls-custom .int-type { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }',
  '@media (max-width: 768px) {',
  '  .ls-custom .slide-row { grid-template-columns: 1fr !important; }',
  '}'
].join('\n');

function renderComponent(type, rowIdx, colIdx, savedEdits) {
  var r  = rowIdx, c = colIdx;
  var k  = TYPE_MAP[type] || TYPE_MAP[(type || '').toLowerCase()] || 'text';
  var e  = savedEdits || {};

  // Helper: restore a container's innerHTML from saved edits, or use the default markup
  function container(tag, cls, key, attrs, defaultInner) {
    var saved = e[key];
    var attrStr = attrs ? ' ' + attrs : '';
    return '<' + tag + ' class="' + cls + '" data-edit="' + key + '"' + attrStr + '>' +
      (saved != null ? saved : defaultInner) +
      '</' + tag + '>';
  }

  switch (k) {
    case 'title':
      return '<h2 class="slide-title" data-edit="title-' + r + '-' + c + '" contenteditable="" spellcheck="false">' +
        applyEdit('title-' + r + '-' + c, 'Section Title', e) + '</h2>';

    case 'subtitle':
      return '<p class="slide-subtitle" data-edit="subtitle-' + r + '-' + c + '" contenteditable="" spellcheck="false">' +
        applyEdit('subtitle-' + r + '-' + c, 'Supporting text goes here', e) + '</p>';

    case 'text':
      return '<p class="slide-text" data-edit="text-' + r + '-' + c + '" contenteditable="" spellcheck="false">' +
        applyEdit('text-' + r + '-' + c, 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore.', e) + '</p>';

    case 'button':
      return '<a class="slide-btn" data-edit="btn-' + r + '-' + c + '" contenteditable="" spellcheck="false">' +
        applyEdit('btn-' + r + '-' + c, 'Get in Touch', e) + '</a>';

    case 'tabs':
      return container('div', 'ls-tabs', 'tabs-' + r + '-' + c, '', [
        '  <div class="ls-tab-list">',
        '    <button class="ls-tab active" data-panel="0">Tab One</button>',
        '    <button class="ls-tab" data-panel="1">Tab Two</button>',
        '  </div>',
        '  <div class="ls-tab-panels">',
        '    <div class="ls-tab-panel active" data-panel="0">',
        '      <p class="slide-text" contenteditable="" spellcheck="false">First tab content goes here.</p>',
        '    </div>',
        '    <div class="ls-tab-panel" data-panel="1">',
        '      <p class="slide-text" contenteditable="" spellcheck="false">Second tab content goes here.</p>',
        '    </div>',
        '  </div>'
      ].join('\n'));

    case 'carousel':
      return container('div', 'ls-carousel', 'carousel-' + r + '-' + c, '', [
        '  <div class="ls-carousel-track">',
        '    <div class="ls-carousel-slide">',
        '      <img src="/slides/shared/placeholder.svg" alt="Image placeholder">',
        '      <div class="ls-carousel-caption" contenteditable="" spellcheck="false">Image caption</div>',
        '    </div>',
        '  </div>'
      ].join('\n'));

    case 'table':
      return [
        '<div class="ls-table-wrap">',
        '  <table class="ls-table" data-ls-table data-edit="table-' + r + '-' + c + '">',
        '    <thead><tr>',
        '      <th><span class="ls-col-label">Feature</span></th>',
        '      <th><span class="ls-col-label">Basic</span></th>',
        '      <th><span class="ls-col-label">Pro</span></th>',
        '    </tr></thead>',
        '    <tbody>',
        e['table-' + r + '-' + c] ||
        [
          '      <tr><td contenteditable="" spellcheck="false">Feature one</td><td><span class="ls-dot ls-dot-on"></span></td><td><span class="ls-dot ls-dot-on"></span></td></tr>',
          '      <tr><td contenteditable="" spellcheck="false">Feature two</td><td><span class="ls-dot ls-dot-off"></span></td><td><span class="ls-dot ls-dot-on"></span></td></tr>'
        ].join('\n'),
        '    </tbody>',
        '  </table>',
        '  <div data-ls-col-restore></div>',
        '  <div data-ls-row-restore></div>',
        '  <button data-ls-add-row>+ Row</button>',
        '</div>'
      ].join('\n');

    case 'list':
      return container('ul', 'slide-list', 'list-' + r + '-' + c, 'data-ls-list', [
        '  <li contenteditable="" spellcheck="false">List item one</li>',
        '  <li contenteditable="" spellcheck="false">List item two</li>',
        '  <li contenteditable="" spellcheck="false">List item three</li>'
      ].join('\n'));

    case 'cards':
      return container('div', 'cards-row', 'cards-' + r + '-' + c, '', [
        '  <div class="card"><div class="kpi-value" contenteditable="" spellcheck="false">100+</div><div class="kpi-label" contenteditable="" spellcheck="false">Installations</div></div>',
        '  <div class="card"><div class="kpi-value" contenteditable="" spellcheck="false">50+</div><div class="kpi-label" contenteditable="" spellcheck="false">Countries</div></div>',
        '  <div class="card"><div class="kpi-value" contenteditable="" spellcheck="false">25</div><div class="kpi-label" contenteditable="" spellcheck="false">Years</div></div>'
      ].join('\n'));

    case 'steps':
      return container('div', 'slide-steps', 'steps-' + r + '-' + c, '', [
        '  <div class="slide-step"><span class="step-num">1</span><span class="step-text" contenteditable="" spellcheck="false">First step description</span></div>',
        '  <div class="slide-step"><span class="step-num">2</span><span class="step-text" contenteditable="" spellcheck="false">Second step description</span></div>',
        '  <div class="slide-step"><span class="step-num">3</span><span class="step-text" contenteditable="" spellcheck="false">Third step description</span></div>'
      ].join('\n'));

    case 'stats':
      return container('div', 'kpi-row', 'stats-' + r + '-' + c, '', [
        '  <div class="kpi-card"><div class="kpi-value" contenteditable="" spellcheck="false">2000</div><div class="kpi-label" contenteditable="" spellcheck="false">Founded</div></div>',
        '  <div class="kpi-card"><div class="kpi-value" contenteditable="" spellcheck="false">500+</div><div class="kpi-label" contenteditable="" spellcheck="false">Clients</div></div>',
        '  <div class="kpi-card"><div class="kpi-value" contenteditable="" spellcheck="false">40+</div><div class="kpi-label" contenteditable="" spellcheck="false">Countries</div></div>'
      ].join('\n'));

    case 'tags':
      return container('div', 'slide-tags', 'tags-' + r + '-' + c, '', [
        '  <button class="slide-tag active" contenteditable="" spellcheck="false">Tag One</button>',
        '  <button class="slide-tag" contenteditable="" spellcheck="false">Tag Two</button>',
        '  <button class="slide-tag" contenteditable="" spellcheck="false">Tag Three</button>'
      ].join('\n'));

    case 'integrations':
      return container('div', 'integration-grid', 'integrations-' + r + '-' + c, '', [
        '  <div class="int-card"><div class="int-name" contenteditable="" spellcheck="false">Partner One</div><div class="int-type" contenteditable="" spellcheck="false">Category</div></div>',
        '  <div class="int-card"><div class="int-name" contenteditable="" spellcheck="false">Partner Two</div><div class="int-type" contenteditable="" spellcheck="false">Category</div></div>',
        '  <div class="int-card"><div class="int-name" contenteditable="" spellcheck="false">Partner Three</div><div class="int-type" contenteditable="" spellcheck="false">Category</div></div>'
      ].join('\n'));

    default:
      return '<p class="slide-text" data-edit="text-' + r + '-' + c + '" contenteditable="" spellcheck="false">' +
        applyEdit('text-' + r + '-' + c, '[' + type + ']', e) + '</p>';
  }
}

function renderHeroLayout(slideId, savedEdits, deck) {
  savedEdits = savedEdits || {};
  // Build a stable prefix from slideId — use a hash of the full string when no digits present
  var digits = slideId.replace(/\D/g, '');
  var suffix = digits.slice(-8) || slideId.replace(/[^a-z]/gi, '').slice(-8) || 'cover';
  var p = 'h' + suffix;
  var settings    = readSettings();
  var heroBg      = (deck && deck.heroBg) || settings.heroBg || '';
  var heroBgFocal = (deck && deck.heroBgFocal) || settings.heroBgFocal || 'center center';
  var heroBgType    = (deck && deck.heroBgType) || 'image';
  var heroBgColor   = (deck && deck.heroBgColor) || '';
  var heroBgOpacity = (deck && deck.heroBgOpacity !== undefined && deck.heroBgOpacity !== null) ? parseInt(deck.heroBgOpacity) : 100;
  var logos       = (deck && deck.logo)
    ? [{ src: deck.logo, alt: deck.name || '' }]
    : (Array.isArray(settings.logos) ? settings.logos : []);

  var logoRowHtml = logos.map(function (logo, i) {
    return [
      i > 0 ? '    <span class="slide-logo-sep"></span>' : '',
      '    <img src="' + logo.src + '" alt="' + (logo.alt || '') + '"' + (i > 0 ? ' class="slide-logo-ls"' : '') + '>'
    ].filter(Boolean).join('\n');
  }).join('\n');
  return [
    '<div class="slide hero" data-slide="' + slideId + '"' + (heroBgType === 'color' && heroBgColor ? ' style="background:' + heroBgColor + ';"' : '') + '>',

    '  <!-- Logo row -->',
    '  <div class="slide-logo-row" style="position:absolute;top:22px;left:36px;z-index:10;">',
    logoRowHtml,
    '  </div>',

    '  <!-- Credit line -->',
    '  <span class="softsolution-credit" data-edit="credit" contenteditable="" spellcheck="false">' + applyEdit('credit', 'by GlassQuality.com', savedEdits) + '</span>',

    '  <!-- Customer logo -->',
    '  <div class="' + p + '-customer-logo" data-edit="customer-logo" onclick="document.getElementById(\'' + p + '-logo-file\').click()" title="Click to change logo">',
    '    <img class="' + p + '-cust-img' + (savedEdits['customer-logo-src'] ? '' : ' ' + p + '-cust-img--missing') + '" src="' + (savedEdits['customer-logo-src'] || '') + '" alt="Customer Logo">',
    '    <label class="' + p + '-cust-placeholder" for="' + p + '-logo-file" title="Click to upload logo">',
    '      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">',
    '        <rect x="3" y="3" width="18" height="18" rx="3"></rect>',
    '        <circle cx="8.5" cy="8.5" r="1.5"></circle>',
    '        <polyline points="21 15 16 10 5 21"></polyline>',
    '      </svg>',
    '      <span>Customer Logo</span><small>Click to upload</small>',
    '    </label>',
    '    <input type="file" id="' + p + '-logo-file" accept="image/*" style="display:none;">',
    '  </div>',

    '  <!-- Hero background -->',
    '  <img class="hero-bg" src="' + heroBg + '" alt="Hero background" data-edit="hero-bg" style="' + (heroBgType === 'color' ? 'display:none;' : '') + 'object-position:' + heroBgFocal + ';' + (heroBgOpacity < 100 ? 'opacity:' + (heroBgOpacity / 100).toFixed(2) + ';' : '') + (deck && deck.heroBgFit === 'contain' ? 'object-fit:contain;' : '') + '">',
    (heroBgType === 'color' ? '' : '  <div class="hero-overlay"></div>'),

    '  <!-- Main content -->',
    '  <div class="hero-content">',
    '    <div class="brand-badge" data-edit="badge" contenteditable="" spellcheck="false">' + applyEdit('badge', 'Brand · Product · Line', savedEdits) + '</div>',
    '    <h1 data-edit="headline" contenteditable="" spellcheck="false">' + applyEdit('headline', 'Your Headline<br>for <span class="blue">Key Theme</span>', savedEdits) + '</h1>',
    '    <h2 data-edit="subheadline" contenteditable="" spellcheck="false">' + applyEdit('subheadline', 'Proposal for [Customer] · [Name], [Title]', savedEdits) + '</h2>',
    '    <div class="click-hint" data-builder-only="" style="color:rgba(255,255,255,.60);">→ Navigate with arrows or swipe</div>',
    '  </div>',

    '  <!-- Gallery button -->',
    '  <button class="' + p + '-gallery-btn" onclick="' + p + 'OpenGallery()" title="Show installation gallery">',
    '    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">',
    '      <rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect>',
    '      <rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect>',
    '    </svg> Gallery',
    '  </button>',

    '  <!-- Gallery overlay -->',
    '  <div class="' + p + '-gallery-overlay" id="' + p + 'GalleryOverlay" style="display:none;">',
    '    <div class="' + p + '-gallery-popup">',
    '      <button class="' + p + '-gallery-close" onclick="' + p + 'CloseGallery()">✕</button>',
    '      <div class="' + p + '-car-wrap" id="' + p + 'CarWrap">',
    '        <div class="' + p + '-car-track" id="' + p + 'CarTrack" data-autoplay="8">',
    (savedEdits['carousel-track-html'] || '').replace(/\bh[a-z][a-zA-Z0-9]*-/g, p + '-').replace(/\bh[a-z][a-z0-9]+(?=[A-Z])/g, p) ||
    [
      '          <div class="' + p + '-car-slide">',
      '            <img src="" alt="Gallery image 1">',
      '            <div class="' + p + '-car-caption" contenteditable="" spellcheck="false">Installation photo</div>',
      '            <div class="' + p + '-car-img-overlay" data-builder-only="" onclick="' + p + 'ChangeCarImage(this)">Change Image</div>',
      '            <button class="' + p + '-car-move ' + p + '-car-move--l" data-builder-only="" onclick="' + p + 'MoveCarSlide(this,-1)">‹</button>',
      '            <button class="' + p + '-car-move ' + p + '-car-move--r" data-builder-only="" onclick="' + p + 'MoveCarSlide(this,1)">›</button>',
      '          </div>',
      '          <div class="' + p + '-car-slide ' + p + '-car-slide--text">',
      '            <div class="' + p + '-stat-block">',
      '              <div class="section-label" contenteditable="" spellcheck="false">Key Metric</div>',
      '              <span class="stat-number" contenteditable="" spellcheck="false">100%</span>',
      '              <div class="stat-label" contenteditable="" spellcheck="false">Brief supporting description</div>',
      '            </div>',
      '            <button class="' + p + '-car-move ' + p + '-car-move--l" data-builder-only="" onclick="' + p + 'MoveCarSlide(this,-1)">‹</button>',
      '            <button class="' + p + '-car-move ' + p + '-car-move--r" data-builder-only="" onclick="' + p + 'MoveCarSlide(this,1)">›</button>',
      '          </div>',
    ].join('\n'),
    '        </div>',
    '        <button class="' + p + '-car-prev" onclick="' + p + 'CarMove(-1)">‹</button>',
    '        <button class="' + p + '-car-next" onclick="' + p + 'CarMove(1)">›</button>',
    '      </div>',
    '      <div class="' + p + '-thumb-strip" id="' + p + 'ThumbStrip"></div>',
    '      <div class="' + p + '-car-footer" data-builder-only="">',
    '        <span class="' + p + '-autoplay-ctrl">Auto <span id="' + p + 'AutoVal" contenteditable="" spellcheck="false">8</span>s</span>',
    '        <div class="' + p + '-add-btns">',
    '          <button class="' + p + '-add-btn" onclick="' + p + 'AddImage()">+ Image</button>',
    '          <button class="' + p + '-add-btn" onclick="' + p + 'AddText()">+ Text</button>',
    '        </div>',
    '      </div>',
    '    </div>',
    '  </div>',
    '  <input type="file" id="' + p + '-carousel-file" accept="image/*" style="display:none;">',

    '  <style>',
    '    .' + p + '-customer-logo { position:static; transform:none; margin:16px auto 0; z-index:10; display:flex; align-items:center; justify-content:center; background:#fff; backdrop-filter:blur(12px); border:1px solid rgba(255,255,255,.18); border-radius:24px; padding:18px; width:160px; height:160px; cursor:pointer; }',
    '    .' + p + '-customer-logo::after { content:"Change Logo"; position:absolute; inset:0; border-radius:24px; background:rgba(0,0,0,.55); color:#fff; font-size:12px; font-weight:700; letter-spacing:.06em; display:flex; align-items:center; justify-content:center; opacity:0; transition:opacity .2s; }',
    '    .' + p + '-customer-logo:hover::after { opacity:1; }',
    '    .' + p + '-cust-img { width:90%; height:90%; object-fit:contain; }',
    '    .' + p + '-cust-img--missing { display:none; }',
    '    .' + p + '-cust-img--missing ~ .' + p + '-cust-placeholder { display:flex; }',
    '    .' + p + '-cust-placeholder { display:none; flex-direction:column; align-items:center; justify-content:center; gap:10px; width:100%; height:100%; border:2px dashed rgba(255,255,255,.25); border-radius:16px; cursor:pointer; color:rgba(255,255,255,.55); text-align:center; }',
    '    .' + p + '-cust-placeholder span { font-size:14px; font-weight:700; letter-spacing:.04em; }',
    '    .' + p + '-cust-placeholder small { font-size:11px; opacity:.65; }',
    '    .' + p + '-gallery-btn { position:absolute; bottom:80px; right:16px; z-index:10; display:flex; align-items:center; gap:6px; padding:7px 14px; background:rgba(0,0,0,.40); border:1px solid rgba(255,255,255,.20); border-radius:20px; color:rgba(255,255,255,.70); font-size:11px; font-weight:600; letter-spacing:.06em; cursor:pointer; backdrop-filter:blur(8px); transition:background .25s,border-color .25s,color .25s; font-family:inherit; }',
    '    .' + p + '-gallery-btn:hover { background:rgba(var(--accent-rgb),.25); border-color:var(--accent); color:#fff; }',
    '    .' + p + '-gallery-overlay { position:fixed; inset:0; z-index:9000; background:rgba(0,0,0,.70); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; }',
    '    .' + p + '-gallery-popup { position:relative; background:rgba(10,10,14,.92); border:1px solid rgba(255,255,255,.14); border-radius:20px; padding:20px; box-shadow:0 32px 96px rgba(0,0,0,.80); }',
    '    .' + p + '-gallery-close { position:absolute; top:-14px; right:-14px; width:30px; height:30px; border-radius:50%; min-width:44px; min-height:44px; background:rgba(40,40,50,.95); border:1px solid rgba(255,255,255,.22); color:rgba(255,255,255,.80); font-size:13px; cursor:pointer; display:flex; align-items:center; justify-content:center; }',
    '    .' + p + '-car-wrap { position:relative; width:100%; height:auto; border-radius:16px; overflow:hidden; border:1px solid rgba(255,255,255,.12); box-shadow:0 24px 80px rgba(0,0,0,.7); }',
    '    .' + p + '-car-track { display:flex; height:auto; transition:transform .55s cubic-bezier(.4,0,.2,1); }',
    '    .' + p + '-car-slide { flex:0 0 100%; width:100%; height:auto; position:relative; background:#111; }',
    '    .' + p + '-car-slide img { position:absolute; inset:0; width:100%; height:100%; object-fit:contain; display:block; user-select:none; pointer-events:none; }',
    '    .' + p + '-car-caption { position:absolute; bottom:0; left:0; right:0; padding:10px 18px; background:linear-gradient(transparent,rgba(0,0,0,.75)); color:rgba(255,255,255,.85); font-size:12px; font-weight:600; letter-spacing:.05em; text-align:center; }',
    '    .' + p + '-car-prev, .' + p + '-car-next { position:absolute; top:50%; transform:translateY(-50%); background:rgba(0,0,0,.50); border:1px solid rgba(255,255,255,.20); color:#fff; font-size:26px; width:40px; height:40px; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center; z-index:5; }',
    '    .' + p + '-car-prev { left:12px; } .' + p + '-car-next { right:12px; }',
    '    .' + p + '-car-img-overlay { position:absolute; inset:0; z-index:15; background:rgba(0,0,0,.55); display:flex; align-items:center; justify-content:center; color:#fff; font-size:12px; font-weight:700; opacity:0; transition:opacity .2s; cursor:pointer; }',
    '    .' + p + '-car-slide:hover .' + p + '-car-img-overlay { opacity:1; }',
    '    .' + p + '-car-move { position:absolute; bottom:10px; z-index:20; width:28px; height:28px; border-radius:50%; background:rgba(0,0,0,.65); border:1px solid rgba(255,255,255,.30); color:#fff; font-size:18px; cursor:pointer; display:flex; align-items:center; justify-content:center; opacity:0; transition:opacity .2s; font-family:inherit; }',
    '    .' + p + '-car-slide:hover .' + p + '-car-move { opacity:1; }',
    '    .' + p + '-car-move--l { right:48px; } .' + p + '-car-move--r { right:12px; }',
    '    .' + p + '-car-delete { position:absolute; top:8px; right:8px; z-index:20; width:26px; height:26px; border-radius:50%; background:rgba(180,40,40,.80); border:1px solid rgba(255,80,80,.40); color:#fff; font-size:13px; cursor:pointer; display:flex; align-items:center; justify-content:center; opacity:0; transition:opacity .2s; font-family:inherit; padding:0; line-height:1; }',
    '    .' + p + '-car-slide:hover .' + p + '-car-delete { opacity:1; }',
    '    .' + p + '-car-slide--text { flex:0 0 100%; background:linear-gradient(135deg,#0d1117 0%,#1a1f2e 100%); display:flex; align-items:center; justify-content:center; }',
    '    .' + p + '-stat-block { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; padding:32px; width:100%; text-align:center; }',
    '    .' + p + '-stat-block .stat-number { font-size:clamp(48px,8vw,88px); font-weight:900; letter-spacing:-.03em; line-height:1; background:linear-gradient(135deg,var(--accent),var(--accent-light)); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; display:block; }',
    '    .' + p + '-stat-block .stat-label { font-size:15px; color:var(--text-muted); margin-top:8px; font-weight:500; }',
    '    .' + p + '-thumb-strip { display:flex; gap:6px; padding:10px 0 4px; overflow-x:auto; }',
    '    .' + p + '-thumb { flex:0 0 72px; height:46px; border-radius:8px; border:2px solid rgba(255,255,255,.12); background:#222; background-size:cover; background-position:center; cursor:pointer; transition:border-color .2s; }',
    '    .' + p + '-thumb--active { border-color:var(--accent) !important; }',
    '    .' + p + '-thumb--text { display:flex; align-items:center; justify-content:center; background:linear-gradient(135deg,#0d1117,#1a1f2e); font-size:9px; font-weight:700; letter-spacing:.06em; color:var(--accent); text-align:center; padding:4px; text-transform:uppercase; }',
    '    .' + p + '-car-footer { display:flex; align-items:center; justify-content:space-between; padding:8px 2px 0; }',
    '    .' + p + '-autoplay-ctrl { font-size:11px; color:rgba(255,255,255,.40); font-weight:600; letter-spacing:.06em; }',
    '    .' + p + '-add-btns { display:flex; gap:6px; }',
    '    .' + p + '-add-btn { font-size:11px; font-weight:700; padding:5px 12px; border-radius:20px; cursor:pointer; background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.15); color:rgba(255,255,255,.6); font-family:inherit; }',
    '    .' + p + '-add-btn:hover { background:rgba(var(--accent-rgb),.15); border-color:var(--accent); color:var(--accent); }',
    '    @media(min-width:769px) {',
    '      .' + p + '-customer-logo { position:absolute; left:75%; top:50%; transform:translate(-50%,-50%); margin:0; width:clamp(150px,15vw,250px); height:clamp(150px,15vw,250px); padding:28px; }',
    '      .' + p + '-gallery-btn { bottom:64px; right:32px; }',
    '      .' + p + '-car-wrap { width:760px; height:460px; }',
    '      .' + p + '-car-track { height:460px; }',
    '      .' + p + '-car-slide { flex:0 0 760px; width:760px; height:460px; }',
    '      .' + p + '-car-slide--text { flex:0 0 760px; }',
    '    }',
    '  </style>',

    '  <script>',
    '  (function () {',
    '    var idx = 0, autoTimer = null, targetSlide = null;',
    '    var P = ' + JSON.stringify(p) + ';',
    '    var SLIDE_ID = ' + JSON.stringify(slideId) + ';',
    '    function saveCarouselTrack() {',
    '      if (!SLIDE_ID) return;',
    '      var track = document.getElementById(P + "CarTrack");',
    '      var clone = track.cloneNode(true);',
    '      clone.querySelectorAll("[data-builder-only]").forEach(function (n) { n.remove(); });',
    '      fetch("/api/deck/slides/" + SLIDE_ID + "/edits", {',
    '        method: "POST", headers: {"Content-Type":"application/json"},',
    '        body: JSON.stringify({ edits: { "carousel-track-html": clone.innerHTML } })',
    '      });',
    '    }',
    '    function getSlides()    { return Array.from(document.querySelectorAll("#" + P + "CarTrack > ." + P + "-car-slide")); }',
    '    function getWrapWidth() { return document.getElementById(P + "CarWrap").offsetWidth; }',
    '    function getAutoSecs()  { return (parseInt(document.getElementById(P + "CarTrack").getAttribute("data-autoplay")) || 8) * 1000; }',
    '    function goTo(i) {',
    '      var slides = getSlides();',
    '      idx = Math.max(0, Math.min(slides.length - 1, i));',
    '      document.getElementById(P + "CarTrack").style.transform = "translateX(" + (idx * -getWrapWidth()) + "px)";',
    '      updateThumbs();',
    '    }',
    '    function startAutoplay() { clearInterval(autoTimer); autoTimer = setInterval(function () { goTo(idx < getSlides().length - 1 ? idx + 1 : 0); }, getAutoSecs()); }',
    '    function stopAutoplay()  { clearInterval(autoTimer); }',
    '    var wrap = document.getElementById(P + "CarWrap");',
    '    wrap.addEventListener("mouseenter", stopAutoplay);',
    '    wrap.addEventListener("mouseleave", function () { if (document.getElementById(P + "GalleryOverlay").style.display !== "none") startAutoplay(); });',
    '    window[P + "DeleteCarSlide"] = function (btn) {',
    '      var slide = btn.closest("." + P + "-car-slide");',
    '      var slides = getSlides();',
    '      if (slides.length <= 1) return;',
    '      var i = slides.indexOf(slide);',
    '      slide.parentNode.removeChild(slide);',
    '      goTo(Math.min(i, getSlides().length - 1));',
    '      buildThumbs();',
    '      saveCarouselTrack();',
    '    };',
    '    function injectBuilderControls() {',
    '      getSlides().forEach(function (slide) {',
    '        if (!slide.querySelector("." + P + "-car-move--l")) {',
    '          var ml = document.createElement("button");',
    '          ml.className = P + "-car-move " + P + "-car-move--l";',
    '          ml.setAttribute("data-builder-only", "");',
    '          ml.onclick = function () { window[P + "MoveCarSlide"](ml, -1); };',
    '          ml.textContent = "\u2039";',
    '          slide.appendChild(ml);',
    '        }',
    '        if (!slide.querySelector("." + P + "-car-move--r")) {',
    '          var mr = document.createElement("button");',
    '          mr.className = P + "-car-move " + P + "-car-move--r";',
    '          mr.setAttribute("data-builder-only", "");',
    '          mr.onclick = function () { window[P + "MoveCarSlide"](mr, 1); };',
    '          mr.textContent = "\u203a";',
    '          slide.appendChild(mr);',
    '        }',
    '        if (!slide.querySelector("." + P + "-car-delete")) {',
    '          var del = document.createElement("button");',
    '          del.className = P + "-car-delete";',
    '          del.setAttribute("data-builder-only", "");',
    '          del.onclick = function () { window[P + "DeleteCarSlide"](del); };',
    '          del.textContent = "\u2715";',
    '          slide.appendChild(del);',
    '        }',
    '      });',
    '    }',
    '    window[P + "OpenGallery"]  = function () { var o = document.getElementById(P + "GalleryOverlay"); document.body.appendChild(o); o.style.display = "flex"; goTo(0); buildThumbs(); if (!window.PB_READONLY) injectBuilderControls(); startAutoplay(); };',
    '    window[P + "CloseGallery"] = function () { document.getElementById(P + "GalleryOverlay").style.display = "none"; stopAutoplay(); };',
    '    window[P + "CarMove"]      = function (dir) { goTo(idx + dir); };',
    '    window[P + "MoveCarSlide"] = function (btn, dir) {',
    '      var track = document.getElementById(P + "CarTrack");',
    '      var slide = btn.closest("." + P + "-car-slide");',
    '      var slides = getSlides();',
    '      var i = slides.indexOf(slide);',
    '      var j = i + dir;',
    '      if (j < 0 || j >= slides.length) return;',
    '      dir < 0 ? track.insertBefore(slide, slides[j]) : track.insertBefore(slides[j], slide);',
    '      buildThumbs();',
    '      saveCarouselTrack();',
    '    };',
    '    window[P + "ChangeCarImage"] = function (overlay) {',
    '      targetSlide = overlay.closest("." + P + "-car-slide");',
    '      document.getElementById(P + "-carousel-file").click();',
    '    };',
    '    window[P + "AddImage"] = function () {',
    '      var track = document.getElementById(P + "CarTrack");',
    '      var n = getSlides().length + 1;',
    '      var slide = document.createElement("div");',
    '      slide.className = P + "-car-slide";',
    '      slide.innerHTML = \'<img src="" alt="Gallery image"><div class="\' + P + \'-car-caption" contenteditable="" spellcheck="false">New image</div><div class="\' + P + \'-car-img-overlay" data-builder-only="" onclick="\' + P + \'ChangeCarImage(this)">Change Image</div><button class="\' + P + \'-car-move \' + P + \'-car-move--l" onclick="\' + P + \'MoveCarSlide(this,-1)">‹</button><button class="\' + P + \'-car-move \' + P + \'-car-move--r" onclick="\' + P + \'MoveCarSlide(this,1)">›</button><button class="\' + P + \'-car-delete" data-builder-only="" onclick="\' + P + \'DeleteCarSlide(this)">\u2715</button>\';',
    '      track.appendChild(slide);',
    '      goTo(getSlides().length - 1);',
    '      buildThumbs();',
    '      saveCarouselTrack();',
    '    };',
    '    window[P + "AddText"] = function () {',
    '      var track = document.getElementById(P + "CarTrack");',
    '      var slide = document.createElement("div");',
    '      slide.className = P + "-car-slide " + P + "-car-slide--text";',
    '      slide.innerHTML = \'<div class="\' + P + \'-stat-block"><div class="section-label" contenteditable="" spellcheck="false">Label</div><span class="stat-number" contenteditable="" spellcheck="false">Value</span><div class="stat-label" contenteditable="" spellcheck="false">Description</div></div><button class="\' + P + \'-car-move \' + P + \'-car-move--l" onclick="\' + P + \'MoveCarSlide(this,-1)">‹</button><button class="\' + P + \'-car-move \' + P + \'-car-move--r" onclick="\' + P + \'MoveCarSlide(this,1)">›</button><button class="\' + P + \'-car-delete" data-builder-only="" onclick="\' + P + \'DeleteCarSlide(this)">\u2715</button>\';',
    '      track.appendChild(slide);',
    '      goTo(getSlides().length - 1);',
    '      buildThumbs();',
    '      saveCarouselTrack();',
    '    };',
    '    if (!window.PB_READONLY) { var _cf = document.getElementById(P + "-carousel-file"); if (_cf) _cf.addEventListener("change", function (e) {',
    '      var file = e.target.files[0];',
    '      if (!file || !targetSlide) return;',
    '      var img = targetSlide.querySelector("img");',
    '      img.src = URL.createObjectURL(file);',
    '      var reader = new FileReader();',
    '      reader.onload = function (ev) {',
    '        fetch("/api/upload-image", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ filename: file.name, data: ev.target.result }) })',
    '        .then(function (r) { return r.json(); })',
    '        .then(function (d) {',
    '          if (!d.path) return;',
    '          img.src = d.path;',
    '          buildThumbs();',
    '          saveCarouselTrack();',
    '        });',
    '      };',
    '      reader.readAsDataURL(file);',
    '      e.target.value = "";',
    '    }); }',
    '    if (!window.PB_READONLY) document.getElementById(P + "-logo-file").addEventListener("change", function (e) {',
    '      var file = e.target.files[0]; if (!file) return;',
    '      var img = document.querySelector("." + P + "-cust-img");',
    '      img.src = URL.createObjectURL(file);',
    '      img.classList.remove(P + "-cust-img--missing");',
    '      var reader = new FileReader();',
    '      reader.onload = function (ev) {',
    '        fetch("/api/upload-image", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ filename: file.name, data: ev.target.result }) })',
    '        .then(function (r) { return r.json(); })',
    '        .then(function (d) {',
    '          if (!d.path) return;',
    '          img.src = d.path;',
    '          img.classList.remove(P + "-cust-img--missing");',
    '          var slideId = document.querySelector(".slide[data-slide]").getAttribute("data-slide");',
    '          fetch("/api/deck/slides/" + slideId + "/edits", {',
    '            method: "POST", headers: {"Content-Type":"application/json"},',
    '            body: JSON.stringify({ edits: { "customer-logo-src": d.path } })',
    '          });',
    '        });',
    '      };',
    '      reader.readAsDataURL(file);',
    '      e.target.value = "";',
    '    });',
    '    function buildThumbs() {',
    '      var strip = document.getElementById(P + "ThumbStrip");',
    '      strip.innerHTML = "";',
    '      getSlides().forEach(function (slide, i) {',
    '        var thumb = document.createElement("div");',
    '        thumb.className = P + "-thumb" + (i === idx ? " " + P + "-thumb--active" : "");',
    '        var img = slide.querySelector("img");',
    '        if (img && img.src) { thumb.style.backgroundImage = "url(" + img.src + ")"; }',
    '        else { thumb.classList.add(P + "-thumb--text"); var lbl = slide.querySelector(".section-label"); thumb.textContent = lbl && lbl.textContent.trim() ? lbl.textContent.trim().substring(0, 14) : "Text"; }',
    '        thumb.addEventListener("click", function () { goTo(i); });',
    '        strip.appendChild(thumb);',
    '      });',
    '    }',
    '    function updateThumbs() {',
    '      document.querySelectorAll("#" + P + "ThumbStrip ." + P + "-thumb").forEach(function (t, i) {',
    '        t.classList.toggle(P + "-thumb--active", i === idx);',
    '      });',
    '    }',
    '    // Save carousel track whenever any text inside it is edited',
    '    document.getElementById(P + "CarTrack").addEventListener("focusout", function (e) {',
    '      if (e.target.matches("[contenteditable]")) saveCarouselTrack();',
    '    });',
    '    var autoValEl = document.getElementById(P + "AutoVal");',
    '    if (autoValEl) autoValEl.addEventListener("input", function () {',
    '      document.getElementById(P + "CarTrack").setAttribute("data-autoplay", parseInt(autoValEl.textContent) || 8);',
    '    });',
    '  })();',
    '  </script>',

    '  <script>',
    '  (function () {',
    '    var s = document.currentScript;',
    '    setTimeout(function () { if (window.PE && s) PE.initSlide(s.closest(".slide")); }, 0);',
    '  })();',
    '  </script>',

    '</div>'
  ].join('\n');
}

function applyEdit(key, defaultHtml, savedEdits) {
  return (savedEdits && savedEdits[key] != null) ? savedEdits[key] : defaultHtml;
}

// Override [data-edit] elements inside a blob with individual saved edits.
// This ensures per-slide edits from Translation Center take precedence over
// shared template blob content (e.g. Osprey vs LineScanner on same template).
function applyEditsToBlob(blobHtml, savedEdits) {
  if (!blobHtml || !savedEdits) return blobHtml;
  var $ = cheerio.load(blobHtml, { decodeEntities: false }, false);
  $('[data-edit]').each(function () {
    var key = $(this).attr('data-edit');
    if (key && savedEdits[key] !== undefined) {
      // Tables managed by table.js always save their state through the tabs blob.
      // Re-applying their individual edit key would overwrite the blob's current
      // column/row collapse state with a stale value.
      if ($(this).attr('data-ls-table') !== undefined) return;
      $(this).html(savedEdits[key]);
    }
    // Blobs are saved with runtime state — tabs.js and other components temporarily
    // set contenteditable="false" on inner elements. Normalize back to "" so edits work.
    if ($(this).is('[contenteditable]')) {
      $(this).attr('contenteditable', '');
    }
  });
  return $.html();
}

function applyEditsToHtml(html, edits, editable) {
  if (!html) return html;
  edits = edits || {};
  var $ = cheerio.load(html, { decodeEntities: false }, false);

  // Apply one [data-edit] element: inject its saved edit (text blob or image src),
  // then normalise contenteditable per `editable`. When a text blob is injected, the
  // blob carries inner [data-edit] nodes the outer .each() can't see — so re-apply
  // their individual edits recursively (inBlob=true). This mirrors applyEditsToBlob so
  // cartridge blobs (tabs, carousels) behave identically to the JS twins in EVERY render
  // path: preview, deck, and published. It is a no-op for slides without nested edits.
  function applyOne(el, inBlob) {
    var $el = $(el);
    var key = $el.attr('data-edit');
    if (!key) return;
    var isImgEdit = $el.attr('data-edit-type') === 'image';
    // Inside a blob, table.js owns its own state (saved through the blob); re-injecting
    // its individual edit would overwrite the live column/row collapse state. Skip it.
    var skipTable = inBlob && $el.attr('data-ls-table') !== undefined;

    if (!isImgEdit && !skipTable && edits[key] !== undefined) {
      $el.html(edits[key]);
      $el.find('[data-edit]').each(function () { applyOne(this, true); });
    } else if (isImgEdit && edits[key] !== undefined) {
      var raw = String(edits[key] || '');
      var src = raw.includes('<') ? (raw.match(/\bsrc="([^"]*)"/) || [])[1] || '' : raw;
      $el.find('img').first().attr('src', src);
    }

    // data-managed = server-injected slot (e.g. logo-row): fillable by withLiveLogos but never
    // hand-editable, so the builder's auto-save can't serialise injected content back into it.
    var isManaged = $el.attr('data-managed') !== undefined;
    if (isManaged) {
      $el.removeAttr('contenteditable').removeAttr('spellcheck');
    } else if (editable && !isImgEdit) {
      $el.attr('contenteditable', '').attr('spellcheck', 'false');
    } else if (!editable) {
      $el.removeAttr('contenteditable').removeAttr('spellcheck');
    }
  }

  $('[data-edit]').each(function () { applyOne(this, false); });
  return $.html();
}

// Returns a copy of edits with logo-row always set from current settings.logos.
// Call this on every non-template serve path so logos stay live.
function withLiveLogos(edits) {
  var settings = readSettings();
  var logos    = Array.isArray(settings.logos) ? settings.logos : [];
  if (!logos.length) return edits;
  var merged = Object.assign({}, edits);
  merged['logo-row'] = logos.map(function (logo, i) {
    return (i > 0 ? '<span class="slide-logo-sep"></span>' : '')
      + '<img src="' + logo.src + '" alt="' + (logo.alt || '') + '"'
      + (i > 0 ? ' class="slide-logo-ls"' : '') + '>';
  }).join('');
  return merged;
}

// Returns a copy of edits with credit always set from deck.brandCredit when configured.
function withBrandCredit(edits, deck) {
  if (!deck || !deck.brandCredit) return edits;
  var merged = Object.assign({}, edits);
  merged['credit'] = 'by ' + deck.brandCredit;
  return merged;
}

// ── Per-template custom renderers ─────────────────────────────────────────────

function renderCompanyLayout(slideId, savedEdits) {
  savedEdits = savedEdits || {};

  var tabsDefault = [
    '<div class="ls-tab-list">',
    '  <button class="ls-tab active" data-panel="1" data-edit="tab-about" contenteditable="" spellcheck="false">About Us</button>',
    '  <button class="ls-tab" data-panel="2" data-edit="tab-technologies" contenteditable="" spellcheck="false">Technologies</button>',
    '  <button class="ls-tab" data-panel="3" data-edit="tab-network" contenteditable="" spellcheck="false">Global Network</button>',
    '  <button class="ls-tab" data-panel="4" data-edit="tab-iqc" contenteditable="" spellcheck="false">IQC Group</button>',
    '</div>',
    '<div class="ls-tab-panels">',
    '<div class="ls-tab-panel" data-panel="0" style="padding-top:12px;">',
    '  <div class="ls-carousel" data-counter="" data-edit="company-carousel" data-track="ls2:carousel:company" style="flex:1;min-height:0;width:100%;"><div class="ls-carousel-track" style="transform:translateX(0px);">',
    '    <div class="ls-carousel-slide"><img src="/slides/uploads/Group-Picture-of-the-Team-members-.png" alt="Group Picture of the Team members" data-zoom="">',
    '      <div class="ls-carousel-caption" data-edit="company-caption" contenteditable="" spellcheck="false">Group Picture of the Team members</div></div></div><div class="ls-carousel-counter"></div></div>',
    '</div>',
    '<div class="ls-tab-panel active" data-panel="1">',
    '  <div class="ls2-pillars">',
    '    <div class="ls2-pillar anim-in">',
    '      <div class="ls2-pillar-num">01</div>',
    '      <div class="ls2-pillar-content">',
    '        <div class="ls2-pillar-title" data-edit="pillar-1-title" contenteditable="" spellcheck="false">One Partner</div>',
    '        <div class="ls2-pillar-desc" data-edit="pillar-1-desc" contenteditable="" spellcheck="false">for all your quality inspection needs \u2014 surface, geometry, dimension, and more</div>',
    '      </div>',
    '    </div>',
    '    <div class="ls2-pillar anim-in">',
    '      <div class="ls2-pillar-num">02</div>',
    '      <div class="ls2-pillar-content">',
    '        <div class="ls2-pillar-title" data-edit="pillar-2-title" contenteditable="" spellcheck="false">Global Presence</div>',
    '        <div class="ls2-pillar-desc" data-edit="pillar-2-desc" contenteditable="" spellcheck="false">global support hubs with local experts in 23 countries across 6 continents</div>',
    '      </div>',
    '    </div>',
    '    <div class="ls2-pillar anim-in">',
    '      <div class="ls2-pillar-num">03</div>',
    '      <div class="ls2-pillar-content">',
    '        <div class="ls2-pillar-title" data-edit="pillar-3-title" contenteditable="" spellcheck="false">Technological Leadership</div>',
    '        <div class="ls2-pillar-desc" data-edit="pillar-3-desc" contenteditable="" spellcheck="false">true scanning \u00b7 bright-field \u00b7 dark-field \u00b7 reflection \u00b7 spectrometer</div>',
    '      </div>',
    '    </div>',
    '  </div>',
    '</div>',
    '<div class="ls-tab-panel" data-panel="2">',
    '  <div class="feature-list" style="margin:12px 0 0;gap:8px;">',
    '    <div class="feature-item anim-in"><div class="feature-num">1</div><div class="feature-text"><strong data-edit="tech-1-name" contenteditable="" spellcheck="false">90\u00b0 Parallel-Light System</strong><span data-edit="tech-1-desc" contenteditable="" spellcheck="false"> \u2014 Sensor-based technology using a 90\u00b0 parallel-light beam to detect surface defects.</span></div></div>',
    '    <div class="feature-item anim-in"><div class="feature-num">2</div><div class="feature-text"><strong data-edit="tech-2-name" contenteditable="" spellcheck="false">Bright-field &amp; Dark-field</strong><span data-edit="tech-2-desc" contenteditable="" spellcheck="false"> \u2014 Camera-based technology combining both illumination modes.</span></div></div>',
    '    <div class="feature-item anim-in"><div class="feature-num">3</div><div class="feature-text"><strong data-edit="tech-3-name" contenteditable="" spellcheck="false">Reflexion Technology</strong><span data-edit="tech-3-desc" contenteditable="" spellcheck="false"> \u2014 Sensor and stray-light technology using reflexion principles.</span></div></div>',
    '    <div class="feature-item anim-in"><div class="feature-num">4</div><div class="feature-text"><strong data-edit="tech-4-name" contenteditable="" spellcheck="false">Spectrometer</strong><span data-edit="tech-4-desc" contenteditable="" spellcheck="false"> \u2014 Polarized filter sensor-technology for spectral analysis.</span></div></div>',
    '  </div>',
    '</div>',
    '<div class="ls-tab-panel" data-panel="3">',
    '  <div class="ls2-map-wrap">',
    '    <img class="ls2-map-img" src="/slides/uploads/World Map of locations .jpeg" alt="World Map" data-zoom="">',
    '    <div class="ls2-pin" style="left:19.5%;top:34%;"><div class="ls2-pin-dot"></div><div class="ls2-pin-ring"></div><div class="ls2-pin-label" data-edit="pin-burnsville" contenteditable="" spellcheck="false">Burnsville MN, USA</div></div>',
    '    <div class="ls2-pin" style="left:51.2%;top:32.5%;"><div class="ls2-pin-dot"></div><div class="ls2-pin-ring"></div><div class="ls2-pin-label" data-edit="pin-waidhofen" contenteditable="" spellcheck="false">Waidhofen, Austria</div></div>',
    '    <div class="ls2-dist" style="left:19.1%;top:24.4%;" title="Canada"></div><div class="ls2-dist" style="left:10.9%;top:42.5%;" title="Mexico"></div>',
    '    <div class="ls2-dist" style="left:24.3%;top:66.5%;" title="Brazil"></div><div class="ls2-dist" style="left:43.5%;top:28.2%;" title="UK"></div>',
    '    <div class="ls2-dist" style="left:42.0%;top:36.1%;" title="Spain"></div><div class="ls2-dist" style="left:47.1%;top:34.6%;" title="Italy"></div>',
    '    <div class="ls2-dist" style="left:55.4%;top:35.8%;" title="Turkey"></div><div class="ls2-dist" style="left:61.3%;top:25.2%;" title="Russia"></div>',
    '    <div class="ls2-dist" style="left:72.1%;top:39.3%;" title="China"></div><div class="ls2-dist" style="left:83.2%;top:73.3%;" title="Australia"></div>',
    '    <div class="ls2-dist" style="left:46.7%;top:23.0%;" title="Norway"></div><div class="ls2-dist" style="left:73.3%;top:48.5%;" title="Thailand"></div>',
    '    <div class="ls2-dist" style="left:52.9%;top:31.5%;" title="Moldova"></div><div class="ls2-dist" style="left:16.8%;top:43.5%;" title="Cuba"></div>',
    '  </div>',
    '  <div class="ls2-map-legend">',
    '    <span class="ls2-leg-item"><span class="ls2-leg-dot" style="background:#E8711A;box-shadow:0 0 6px rgba(232,113,26,.7);"></span>Offices</span>',
    '    <span class="ls2-leg-item"><span class="ls2-leg-dot" style="background:#F5C842;box-shadow:0 0 6px rgba(245,200,66,.6);"></span>Agents &amp; Distributors</span>',
    '    <span class="ls2-leg-count" data-edit="network-count" contenteditable="" spellcheck="false">23 countries \u00b7 6 continents</span>',
    '  </div>',
    '</div>',
    '<div class="ls-tab-panel" data-panel="4">',
    '  <div class="ls2-iqc-grid">',
    '    <div class="ls2-iqc-card"><img src="/slides/shared/LOGO SoftSolution grays.png" alt="Softsolution" class="ls2-iqc-logo"><div class="ls2-iqc-country">Austria</div><ul class="ls2-iqc-products"><li>LineScanner</li><li>BowScanner</li><li>CulletScanner</li><li>VirtualDigitizing</li></ul></div>',
    '    <div class="ls2-iqc-card"><img src="/slides/shared/LOGO LiteSentry Greys.png" alt="LiteSentry" class="ls2-iqc-logo"><div class="ls2-iqc-country">United States</div><ul class="ls2-iqc-products"><li>Osprey\u00ae 25 Distortion Inspection</li><li>Osprey\u00ae 25 Anisotropy Inspection</li><li>Owl \u2013 Furnace Control</li><li>LoadValidator</li><li>TS 4000 Thickness &amp; Coating Sensor</li></ul></div>',
    '    <div class="ls2-iqc-card"><img src="/slides/shared/LOGO StrainOptics.png" alt="Strainoptics" class="ls2-iqc-logo" style="transform:scale(1.3);"><div class="ls2-iqc-country">United States</div><ul class="ls2-iqc-products"><li>GASP</li><li>Polarimeter</li></ul></div>',
    '    <div class="ls2-iqc-card"><img src="/slides/shared/LOGO AVALON.png" alt="Avalon Vision" class="ls2-iqc-logo"><div class="ls2-iqc-country">United States</div><ul class="ls2-iqc-products"><li>MoldWatcher</li><li>ThermalWatch</li><li>NightHawk</li><li>QualityStation</li></ul></div>',
    '  </div>',
    '</div>',
    '</div><!-- /.ls-tab-panels -->'
  ].join('\n');

  return [
    '<div class="slide content ls2" data-slide="' + slideId + '">',
    '  <div class="slide-logo-row">',
    '    <img src="/slides/shared/LOGO SoftSolution grays.png" alt="Softsolution">',
    '    <span class="slide-logo-sep"></span>',
    '    <img src="/slides/shared/LOGO LiteSentry Greys.png" alt="LiteSentry" class="slide-logo-ls">',
    '  </div>',
    '  <div class="slide-layout">',
    '  <span class="softsolution-credit" data-edit="credit" contenteditable="" spellcheck="false">' + applyEdit('credit', 'by GlassQuality.com', savedEdits) + '</span>',
    '  <header class="slide-head">',
    '    <div class="section-label" data-edit="section-label" contenteditable="" spellcheck="false">' + applyEdit('section-label', 'Our Company', savedEdits) + '</div>',
    '    <h1 class="slide-title" data-edit="headline" contenteditable="" spellcheck="false">' + applyEdit('headline', 'Quality inspection <span class="blue">is all we do</span>', savedEdits) + '</h1>',
    '    <p class="slide-subtitle anim-in" data-edit="tagline" contenteditable="" spellcheck="false">' + applyEdit('tagline', 'We inspect every quality aspect of your glass guaranteeing peak performance and the best quality.', savedEdits) + '</p>',
    '  </header>',
    '  <div class="slide-body">',
    '  <div class="ls-tabs ls2-tabs-wrap" data-edit="tabs" data-track="ls2:tabs" style="flex:1;min-height:0;width:100%;max-width:860px;">',
    applyEditsToBlob(savedEdits['tabs'] != null ? savedEdits['tabs'] : tabsDefault, savedEdits),
    '  </div>',
    '  <div class="ls2-stats">',
    '    <div class="kpi-card"><div class="kpi-value" data-edit="stat-founded" contenteditable="" spellcheck="false">' + applyEdit('stat-founded', '1999', savedEdits) + '</div><div class="kpi-label" data-edit="stat-label-founded" contenteditable="" spellcheck="false">' + applyEdit('stat-label-founded', 'Founded', savedEdits) + '</div></div>',
    '    <div class="kpi-card"><div class="kpi-value" data-edit="stat-systems" contenteditable="" spellcheck="false">' + applyEdit('stat-systems', '2050+', savedEdits) + '</div><div class="kpi-label" data-edit="stat-label-systems" contenteditable="" spellcheck="false">' + applyEdit('stat-label-systems', 'Systems installed', savedEdits) + '</div></div>',
    '    <div class="kpi-card"><div class="kpi-value" data-edit="stat-countries" contenteditable="" spellcheck="false">' + applyEdit('stat-countries', '23', savedEdits) + '</div><div class="kpi-label" data-edit="stat-label-countries" contenteditable="" spellcheck="false">' + applyEdit('stat-label-countries', 'Countries \u00b7 6 continents', savedEdits) + '</div></div>',
    '    <div class="kpi-card"><div class="kpi-value" data-edit="stat-employees" contenteditable="" spellcheck="false">' + applyEdit('stat-employees', '60', savedEdits) + '</div><div class="kpi-label" data-edit="stat-label-employees" contenteditable="" spellcheck="false">' + applyEdit('stat-label-employees', 'Specialized employees', savedEdits) + '</div></div>',
    '  </div>',
    '  </div>',
    '  </div>',
    '  <style>',
    '    .ls2-pillars{flex:1;display:flex;flex-direction:column;gap:8px;padding:12px 0 8px;min-height:0;}',
    '    .ls2-pillar{flex:1;position:relative;overflow:hidden;display:flex;align-items:center;background:var(--bg-card);border:1px solid var(--border);border-left:3px solid var(--accent);border-radius:12px;padding:0 28px;transition:background .2s;min-height:60px;}',
    '    .ls2-pillar:hover{background:var(--bg-card-hover);}',
    '    .ls2-pillar-num{position:absolute;left:16px;top:50%;transform:translateY(-50%);font-size:clamp(60px,9vw,120px);font-weight:900;line-height:1;color:rgba(245,166,35,.08);pointer-events:none;user-select:none;letter-spacing:-.03em;}',
    '    .ls2-pillar-content{margin-left:clamp(70px,10vw,140px);z-index:1;}',
    '    .ls2-pillar-title{font-size:clamp(16px,2.2vw,32px);font-weight:800;color:var(--text);line-height:1.1;}',
    '    .ls2-pillar-desc{font-size:clamp(11px,1.1vw,15px);color:var(--text-muted);margin-top:4px;line-height:1.4;}',
    '    .ls2-pillar-title:focus,.ls2-pillar-desc:focus{outline:none;}',
    '    .ls2-map-wrap{position:relative;flex:1;min-height:0;border-radius:14px;overflow:hidden;border:1px solid var(--border);margin-top:12px;}',
    '    .ls2-map-img{width:100%;height:100%;object-fit:cover;display:block;filter:brightness(.55) saturate(.4);}',
    '    .ls2-pin{position:absolute;transform:translate(-50%,-50%);}',
    '    .ls2-pin-dot{width:10px;height:10px;border-radius:50%;background:#E8711A;box-shadow:0 0 8px rgba(232,113,26,.9);position:relative;z-index:2;}',
    '    .ls2-pin-ring{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:22px;height:22px;border-radius:50%;border:2px solid rgba(232,113,26,.5);animation:ls2Pulse 2s ease-in-out infinite;}',
    '    @keyframes ls2Pulse{0%,100%{opacity:.8;transform:translate(-50%,-50%) scale(1)}50%{opacity:0;transform:translate(-50%,-50%) scale(1.8)}}',
    '    .ls2-pin-label{position:absolute;top:-22px;left:50%;transform:translateX(-50%);white-space:nowrap;font-size:9px;font-weight:700;letter-spacing:.05em;color:#fff;background:rgba(0,0,0,.70);padding:2px 6px;border-radius:4px;}',
    '    .ls2-dist{position:absolute;width:6px;height:6px;border-radius:50%;background:#F5C842;box-shadow:0 0 5px rgba(245,200,66,.7);transform:translate(-50%,-50%);}',
    '    .ls2-map-legend{display:flex;align-items:center;gap:16px;padding:6px 0 4px;flex-shrink:0;}',
    '    .ls2-leg-item{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-muted);font-weight:600;}',
    '    .ls2-leg-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}',
    '    .ls2-leg-count{margin-left:auto;font-size:11px;color:var(--text-muted);opacity:.5;}',
    '    .ls2-leg-count:focus{outline:none;}',
    '    .ls2-stats{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;width:100%;max-width:860px;flex-shrink:0;padding:10px 0 16px;}',
    '    .ls2-stats .kpi-card{padding:14px 12px;}',
    '    .ls2-stats .kpi-value{font-size:clamp(18px,2.2vw,32px);}',
    '    .ls2-iqc-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;padding:12px 0 8px;flex:1;min-height:0;}',
    '    .ls2-iqc-card{display:grid;grid-template-rows:80px auto 1fr;justify-items:center;align-content:start;background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px 14px 14px;gap:8px;text-align:center;}',
    '    .ls2-iqc-logo{height:auto;max-height:44px;width:auto;max-width:120px;object-fit:contain;align-self:center;filter:brightness(0) invert(.7);}',
    '    .ls2-iqc-country{font-size:10px;font-weight:700;color:var(--text-muted);letter-spacing:.07em;text-transform:uppercase;}',
    '    .ls2-iqc-products{list-style:none;margin:0;padding:0;font-size:11px;color:var(--text-muted);line-height:1;opacity:.75;text-align:left;width:100%;}',
    '    .ls2-iqc-products li{padding:4px 0;border-bottom:1px solid rgba(255,255,255,.05);}',
    '    .ls2-iqc-products li:last-child{border-bottom:none;}',
    '    .ls2-iqc-products li::before{content:"› ";color:var(--accent);font-weight:700;}',
    '    [contenteditable]:focus{outline:none;}',
    '    .ls2 .slide-body{width:100%;align-items:center;}',
    '    .ls2 .ls-carousel{min-height:260px !important;height:260px !important;}',
    '    .ls2{padding:52px 16px 80px !important;overflow-y:auto;}',
    '    @media(min-width:769px){',
    '      .ls2 .ls-carousel{min-height:0 !important;height:100% !important;}',
    '      .ls2{padding:52px 80px 0 !important;overflow-y:unset;}',
    '      .ls2-iqc-grid{grid-template-columns:repeat(4,1fr);}',
    '      .ls2-stats{grid-template-columns:repeat(4,1fr);gap:12px;}',
    '    }',
    '  </style>',
    '  <script>',
    '  setTimeout(function(){',
    '    var tabList=document.querySelector(".ls2-tabs-wrap .ls-tab-list");',
    '    if(!tabList)return;',
    '    tabList.addEventListener("click",function(e){',
    '      var btn=e.target.closest(".ls-tab");',
    '      if(!btn||!btn.classList.contains("active"))return;',
    '      e.stopImmediatePropagation();',
    '      var tabsEl=btn.closest(".ls-tabs");',
    '      tabsEl.querySelectorAll(".ls-tab").forEach(function(t){t.classList.remove("active");});',
    '      tabsEl.querySelectorAll(".ls-tab-panel").forEach(function(p){p.classList.remove("active");});',
    '      tabsEl.querySelector(".ls-tab-panel[data-panel=\\"0\\"]").classList.add("active");',
    '    },true);',
    '  },0);',
    '  <\/script>',
    '  <script>(function(){var s=document.currentScript;setTimeout(function(){if(window.PE&&s)PE.initSlide(s.closest(".slide"));},0);})()</s' + 'cript>',
    '</div>',
    '</div>'
  ].join('\n');
}

function renderComparisonLayout(slideId, savedEdits) {
  savedEdits = savedEdits || {};

  var defaultProbListHtml = [
    '<div class="why3-tier-label" data-edit="tier-label-1" contenteditable="" spellcheck="false">Human Limitations</div>',
    '<li class="prob-item">Operator fatigue — detection rates drop significantly over long shifts</li>',
    '<li class="prob-item prob-clickable" title="Click to view chart">As line speed increases, operator effectiveness declines — higher throughput means more defects slip through undetected <span class="prob-img-hint">📈</span></li>',
    '<li class="prob-item">100% manual inspection is impossible at production speed</li>',
    '<li class="prob-item" draggable="false">Distortion &amp; anisotropy are <strong>invisible to the naked eye</strong> — no matter how skilled the operator</li>',
    '<div class="why3-tier-label" data-edit="tier-label-2" contenteditable="" spellcheck="false" style="margin-top:8px;">Business Impact</div>',
    '<li class="prob-item">Inconsistent quality &amp; frequent customer complaints</li>',
    '<li class="prob-item prob-clickable" title="Click to view chart">Construction site rejections — glass already delivered &amp; installed means transport, rework &amp; project delays <span class="prob-img-hint">💰</span></li>',
    '<li class="prob-item prob-clickable" title="Click to view chart">Automotive: one defect triggers a full batch return — shipping &amp; material costs on the entire load <span class="prob-img-hint">💰</span></li>',
    '<li class="prob-item" draggable="false">Increased liability risks &amp; reputational damage</li>'
  ].join('\n');

  var defaultBenListHtml = [
    '<li class="ben-item">100% inspection of every glass, every shift — no fatigue, no blind spots</li>',
    '<li class="ben-item">Real-time process control &amp; quality feedback</li>',
    '<li class="ben-item">Prove quality to customers — a documented defense against claims</li>',
    '<li class="ben-item">Database &amp; archive for shift accountability and CpK analysis</li>',
    '<li class="ben-item">Acceptance procedures for new machinery (e.g. furnaces)</li>',
    '<li class="ben-item">Increase throughput &amp; reduce costly downstream rejects</li>',
    '<li class="ben-item" draggable="false">Detects distortion, anisotropy &amp; surface defects <strong>invisible to the human eye</strong></li>',
    '<li class="ben-item">Mandatory as per industry standards</li>'
  ].join('\n');

  return [
    '<div class="slide content why3" data-slide="' + slideId + '">',
    '  <div class="slide-logo-row"><img src="/slides/shared/LOGO SoftSolution grays.png" alt="Softsolution"><span class="slide-logo-sep"></span><img src="/slides/shared/LOGO LiteSentry Greys.png" alt="LiteSentry" class="slide-logo-ls"></div>',
    '',
    '  <div class="slide-layout">',
    '  <header class="slide-head">',
    '    <div class="section-label" data-edit="section-label" contenteditable="" spellcheck="false">' + applyEdit('section-label', 'The Case for Inspection', savedEdits) + '</div>',
    '    <h1 class="slide-title" data-edit="headline" contenteditable="" spellcheck="false" style="margin-bottom:18px;">' + applyEdit('headline', 'Why inspection automation <span class="blue">makes sense</span>', savedEdits) + '</h1>',
    '  </header>',
    '  <div class="slide-body">',
    '  <div class="why3-grid">',
    '',
    '    <div class="why3-col prob-col anim-in" style="" draggable="false">',
    '      <div class="why3-col-header">',
    '        <span class="why3-col-icon">⚠️</span>',
    '        <span class="why3-col-label" data-edit="col-header-prob" contenteditable="" spellcheck="false">' + applyEdit('col-header-prob', 'Without Inspection Automation', savedEdits) + '</span>',
    '      </div>',
    '      <ul class="why3-list" id="why3-prob-list" data-edit="prob-list" data-ls-list="">',
    (savedEdits['prob-list'] != null ? savedEdits['prob-list'] : defaultProbListHtml),
    '      </ul>',
    '      <div class="why3-restore" data-builder-only="" data-ls-restore=""></div>',
    '      <button class="why3-add-btn why3-add-prob" data-builder-only="" data-ls-add="">+ Add item</button>',
    '    </div>',
    '',
    '    <div class="why3-col ben-col anim-in" style="" draggable="false">',
    '      <div class="why3-col-header">',
    '        <span class="why3-col-icon">✓</span>',
    '        <span class="why3-col-label" data-edit="col-header-ben" contenteditable="" spellcheck="false">' + applyEdit('col-header-ben', 'LineScanner &amp; Osprey', savedEdits) + '</span>',
    '      </div>',
    '      <ul class="why3-list" id="why3-ben-list" data-edit="ben-list" data-ls-list="">',
    (savedEdits['ben-list'] != null ? savedEdits['ben-list'] : defaultBenListHtml),
    '      </ul>',
    '      <div class="why3-restore" data-builder-only="" data-ls-restore=""></div>',
    '      <button class="why3-add-btn why3-add-ben" data-builder-only="" data-ls-add="">+ Add item</button>',
    '    </div>',
    '',
    '  </div><!-- why3-grid -->',
    '  </div><!-- slide-body -->',
    '  </div><!-- slide-layout -->',
    '',
    '  <style>',
    '    .why3 {  }',
    '',
    '    .why3-grid {',
    '      display:grid; grid-template-columns:1fr 1fr; gap:20px;',
    '      width:100%; max-width:920px; flex:1; min-height:0;',
    '      padding-bottom:0;',
    '    }',
    '',
    '    .why3-col {',
    '      display:flex; flex-direction:column;',
    '      border-radius:16px; overflow:hidden;',
    '      border:1px solid var(--border);',
    '      background:var(--bg-card);',
    '    }',
    '',
    '    /* Column headers */',
    '    .why3-col-header {',
    '      display:flex; align-items:center; gap:10px;',
    '      padding:14px 20px;',
    '      font-size:13px; font-weight:700; letter-spacing:.06em; text-transform:uppercase;',
    '      flex-shrink:0;',
    '    }',
    '    .prob-col .why3-col-header {',
    '      background:rgba(239,68,68,.12);',
    '      border-bottom:1px solid rgba(239,68,68,.2);',
    '      color:#f87171;',
    '    }',
    '    .ben-col .why3-col-header {',
    '      background:rgba(34,197,94,.10);',
    '      border-bottom:1px solid rgba(34,197,94,.2);',
    '      color:#4ade80;',
    '    }',
    '    .why3-col-icon { font-size:16px; }',
    '    .why3-col-label { flex:1; }',
    '',
    '    /* Tier labels */',
    '    .why3-tier-label {',
    '      font-size:clamp(12px,1.2vw,14px); font-weight:700; letter-spacing:.09em;',
    '      text-transform:uppercase; color:var(--text-muted);',
    '      opacity:.5; padding:8px 0 4px 22px;',
    '    }',
    '',
    '    /* Lists */',
    '    .why3-list {',
    '      list-style:none; margin:0; padding:10px 20px 14px;',
    '      display:flex; flex-direction:column; gap:0;',
    '      overflow-y:auto; flex:1;',
    '    }',
    '',
    '    .prob-item, .ben-item {',
    '      padding:8px 0 8px 22px;',
    '      position:relative;',
    '      font-size:clamp(12px,1.2vw,14px); line-height:1.45;',
    '      border-bottom:1px solid rgba(255,255,255,.04);',
    '      color:var(--text-muted);',
    '    }',
    '    .prob-item:last-child, .ben-item:last-child { border-bottom:none; }',
    '    .prob-item strong, .ben-item strong { color:var(--text); font-weight:700; }',
    '',
    '    .prob-clickable {',
    '      cursor:pointer;',
    '      transition:color .2s, background .2s;',
    '    }',
    '    .prob-clickable:hover {',
    '      color:var(--text);',
    '      background:rgba(239,68,68,.06);',
    '      border-radius:6px;',
    '    }',
    '    .prob-img-hint {',
    '      font-size:11px; margin-left:6px; opacity:.6;',
    '      vertical-align:middle;',
    '    }',
    '    .prob-clickable:hover .prob-img-hint { opacity:1; }',
    '',
    "    .prob-item::before {",
    "      content:'✕';",
    '      position:absolute; left:0; top:8px;',
    '      font-size:11px; font-weight:800;',
    '      color:#f87171;',
    '    }',
    "    .ben-item::before {",
    "      content:'›';",
    '      position:absolute; left:2px; top:8px;',
    '      font-size:14px; font-weight:800;',
    '      color:#4ade80;',
    '    }',
    '',
    '    /* Add button color overrides (item-controls/states are in list.js) */',
    '    .why3-add-prob[data-ls-add]:hover { border-color:rgba(239,68,68,.4); color:#f87171; }',
    '    .why3-add-ben[data-ls-add]:hover  { border-color:rgba(34,197,94,.4);  color:#4ade80; }',
    '',
    '    /* ── Mobile base ── */',
    '    .why3-grid { grid-template-columns:1fr; gap:12px; }',
    '',
    '    .why3 { padding: 52px 16px 80px !important; }',
    '',
    '    /* ── Desktop overrides ── */',
    '    @media(min-width:769px) {',
    '      .why3-grid { grid-template-columns:1fr 1fr; gap:20px; }',
    '      .why3-col  { max-height:none; }',
    '      .why3 { padding: 52px 80px 0 !important; }',
    '    }',
    '  </style>',
    '',
    '  <script>',
    '  function why3InitList(ul) { return; // migrated to list.js component',
    '    if (!ul || ul._init) return;',
    '    ul._init = true;',
    '',
    "    var col = ul.closest('.why3-col');",
    "    var restoreArea = col ? col.querySelector('.why3-restore') : null;",
    "    var addBtn = col ? col.querySelector('.why3-add-btn') : null;",
    "    var isProb = ul.id === 'why3-prob-list';",
    "    var itemClass = isProb ? 'prob-item' : 'ben-item';",
    '    var dragSrc = null;',
    '  }',
    '',
    '  setTimeout(function() {',
    "    why3InitList(document.getElementById('why3-prob-list'));",
    "    why3InitList(document.getElementById('why3-ben-list'));",
    '  }, 0);',
    '  <\/script>',
    '',
    '  <script>',
    '  (function () { var s = document.currentScript;',
    '    setTimeout(function () { if (window.PE && s) PE.initSlide(s.closest(\'.slide\')); }, 0); })();',
    '  <\/script>',
    '</div>'
  ].join('\n');
}

function renderCapabilityLayout(slideId, savedEdits) {
  savedEdits = savedEdits || {};

  var defaultTabsHtml = [
    '<div class="ls-tab-list">',
    '  <button class="ls-tab active" data-panel="0" data-edit="tab-capability" contenteditable="" spellcheck="false">Capability Matrix</button>',
    '  <button class="ls-tab" data-panel="1" data-edit="tab-process" contenteditable="" spellcheck="false">Where in Your Process</button>',
    '</div>',
    '<div class="ls-tab-panels">',

    '<!-- ══ PANEL 0 · Capability Matrix ══ -->',
    '<div class="ls-tab-panel active" data-panel="0">',
    '  <div class="ls4-grid">',
    '    <div class="ls4-table-wrap anim-in">',
    '      <table class="ls4-table" data-ls-table="" data-edit="capability-matrix">',
    '        <colgroup><col><col class=""><col class=""><col class=""><col class=""><col class=""></colgroup>',
    '        <thead><tr>',
    '          <th class="ls4-check-col"></th>',
    '          <th class="ls4-prod-col"><span class="ls-col-label">Osprey-25</span></th>',
    '          <th class="ls4-prod-col ls4-highlight-col"><span class="ls-col-label">LineScanner</span></th>',
    '          <th class="ls4-prod-col ls4-highlight-col"><span class="ls-col-label">White Haze</span></th>',
    '          <th class="ls4-prod-col"><span class="ls-col-label">BowScanner</span></th>',
    '          <th class="ls4-prod-col"><span class="ls-col-label">CulletScanner</span></th>',
    '        </tr></thead>',
    '        <tbody>',
    '          <tr class="ls4-shaded"><td>Quality Check</td><td><span class="ls-dot ls-dot-on">◆</span></td><td><span class="ls-dot ls-dot-on">◆</span></td><td></td><td></td><td></td></tr>',
    '          <tr><td>Edge Chips</td><td><span class="ls-dot ls-dot-on">◆</span></td><td><span class="ls-dot ls-dot-on">◆</span></td><td></td><td></td><td></td></tr>',
    '          <tr class="ls4-shaded"><td>Sight Line Check</td><td></td><td><span class="ls-dot ls-dot-on">◆</span></td><td></td><td></td><td></td></tr>',
    '          <tr><td>Dimension Check</td><td><span class="ls-dot ls-dot-on">◆</span></td><td><span class="ls-dot ls-dot-on">◆</span></td><td></td><td></td><td></td></tr>',
    '          <tr class="ls4-shaded"><td>Logo Position &amp; Quality Check</td><td><span class="ls-dot ls-dot-on">◆</span></td><td><span class="ls-dot ls-dot-on">◆</span></td><td></td><td></td><td></td></tr>',
    '          <tr><td>Distortion Check</td><td><span class="ls-dot ls-dot-on">◆</span></td><td></td><td></td><td></td><td></td></tr>',
    '          <tr class="ls4-shaded"><td>Anisotropy Check</td><td><span class="ls-dot ls-dot-on">◆</span></td><td><span class="ls-dot ls-dot-on">◆</span></td><td></td><td></td><td></td></tr>',
    '          <tr><td>WhiteHaze</td><td><span class="ls-dot ls-dot-on">◆</span></td><td></td><td><span class="ls-dot ls-dot-on">◆</span></td><td></td><td></td></tr>',
    '          <tr class="ls4-shaded"><td>Load Control</td><td></td><td><span class="ls-dot ls-dot-on">◆</span></td><td></td><td></td><td></td></tr>',
    '          <tr><td>Overall Bending Check</td><td></td><td><span class="ls-dot ls-dot-on">◆</span></td><td></td><td><span class="ls-dot ls-dot-on">◆</span></td><td></td></tr>',
    '          <tr class="ls4-shaded"><td>Glass Thickness Check</td><td><span class="ls-dot ls-dot-on">◆</span></td><td><span class="ls-dot ls-dot-on">◆</span></td><td></td><td><span class="ls-dot ls-dot-on">◆</span></td><td></td></tr>',
    '          <tr><td>Glass Type Recognition</td><td><span class="ls-dot ls-dot-on">◆</span></td><td><span class="ls-dot ls-dot-on">◆</span></td><td></td><td></td><td></td></tr>',
    '          <tr class="ls4-shaded"><td>Data Matrix Code Interpretation</td><td></td><td><span class="ls-dot ls-dot-on">◆</span></td><td></td><td></td><td></td></tr>',
    '          <tr><td>Break Pattern Check</td><td></td><td></td><td></td><td></td><td><span class="ls-dot ls-dot-on">◆</span></td></tr>',
    '        </tbody>',
    '      </table>',
    '      <div data-ls-col-restore=""></div>',
    '      <div data-ls-row-restore=""></div>',
    '      <button data-ls-add-row="">+ Add row</button>',
    '      <div class="ls4-legend">',
    '        <span class="ls4-leg-item"><span class="ls-dot ls-dot-on">◆</span> <span data-edit="legend-standard" contenteditable="" spellcheck="false">Standard</span></span>',
    '        <span class="ls4-leg-item"><span class="ls4-dot ls4-dot-off">◇</span> <span data-edit="legend-optional" contenteditable="" spellcheck="false">Optional</span></span>',
    '      </div>',
    '    </div>',
    '    <div class="ls-carousel anim-in" data-counter="" data-edit="capability-carousel" data-zoom-group="" style="padding-bottom:10px;">',
    '      <div class="ls-carousel-track" style="transform:translateX(0px);">',
    '        <div class="ls-carousel-slide" style="flex-direction:column;">',
    '          <img src="/slides/uploads/Vertical LineScanner.png" alt="Vertical LineScanner" data-zoom="" style="flex:1;min-height:0;">',
    '          <div class="ls4-car-label" data-edit="car-label-1" contenteditable="" spellcheck="false">Vertical LineScanner</div>',
    '        </div>',
    '        <div class="ls-carousel-slide" style="flex-direction:column;">',
    '          <img src="/slides/uploads/Horizontal LineScanner.png" alt="Horizontal LineScanner" data-zoom="" style="flex:1;min-height:0;">',
    '          <div class="ls4-car-label" data-edit="car-label-2" contenteditable="" spellcheck="false">Horizontal LineScanner</div>',
    '        </div>',
    '        <div class="ls-carousel-slide" style="flex-direction:column;">',
    '          <img src="/slides/uploads/Osprey Only.png" alt="Osprey" data-zoom="" style="flex:1;min-height:0;">',
    '          <div class="ls4-car-label" data-edit="car-label-3" contenteditable="" spellcheck="false">Osprey</div>',
    '        </div>',
    '      </div>',
    '      <div class="ls-carousel-counter">1 / 3</div>',
    '    </div>',
    '  </div>',
    '</div>',

    '<!-- ══ PANEL 1 · Where in Your Process ══ -->',
    '<div class="ls-tab-panel" data-panel="1">',
    '  <div class="ls4-proc-grid">',
    '    <div class="ls4-proc-table-wrap anim-in">',
    '      <table class="ls4-table ls4-proc-table" data-ls-table="" data-edit="proc-matrix">',
    '        <colgroup><col><col class=""><col class=""><col class=""></colgroup>',
    '        <thead><tr>',
    '          <th class="ls4-check-col"></th>',
    '          <th class="ls4-prod-col ls4-col-orange"><span class="ls-col-label">LSC-V</span></th>',
    '          <th class="ls4-prod-col ls4-col-red"><span class="ls-col-label">LSC-H</span></th>',
    '          <th class="ls4-prod-col ls4-col-blue"><span class="ls-col-label">Osprey-25</span></th>',
    '        </tr></thead>',
    '        <tbody>',
    '          <tr class="ls4-shaded"><td>Quality Check (Scratches, Inclusions, Finger Prints, Dirt, Coating Voids, Automotive)</td><td><span class="ls-dot ls-dot-on">◆</span></td><td><span class="ls-dot ls-dot-red">◆</span></td><td><span class="ls-dot ls-dot-blue">◆</span></td></tr>',
    '          <tr><td>Edge Chips</td><td><span class="ls-dot ls-dot-on">◆</span></td><td><span class="ls-dot ls-dot-red">◆</span></td><td><span class="ls-dot ls-dot-blue">◆</span></td></tr>',
    '          <tr class="ls4-shaded"><td>Sight Line Check for IG Unit, Butyl Defects, Grid Alignement</td><td><span class="ls-dot ls-dot-on">◆</span></td><td></td><td></td></tr>',
    '          <tr><td>Dimension Check (Overall Dimension, Position of Drill Holes, Diameter of Drill Holes, Cut Outs)</td><td><span class="ls-dot ls-dot-on">◆</span></td><td><span class="ls-dot ls-dot-red">◆</span></td><td><span class="ls-dot ls-dot-blue">◆</span></td></tr>',
    '          <tr class="ls4-shaded"><td>Logo Quality Check (Existence and Position of Logo, Quality of Logo)</td><td><span class="ls-dot ls-dot-on">◆</span></td><td><span class="ls-dot ls-dot-red">◆</span></td><td><span class="ls-dot ls-dot-blue">◆</span></td></tr>',
    '          <tr><td>Distortion Check (Rollerwave, EdgeLift, Pocket Distortion, Center Kink, Picture Framing)</td><td></td><td></td><td><span class="ls-dot ls-dot-blue">◆</span></td></tr>',
    '          <tr class="ls4-shaded"><td>Anisotropy Check (Retardation, Isotropy Values)</td><td><span class="ls-dot ls-dot-on">◆</span></td><td><span class="ls-dot ls-dot-red">◆</span></td><td><span class="ls-dot ls-dot-blue">◆</span></td></tr>',
    '          <tr><td>WhiteHaze (Prediction, Real Optical effect)</td><td></td><td><span class="ls-dot ls-dot-red">◆</span></td><td><span class="ls-dot ls-dot-blue">◆</span></td></tr>',
    '          <tr class="ls4-shaded"><td>Load Control (Location of Glasses, Distance, Long and Wide Load, Broken Corners)</td><td></td><td><span class="ls-dot ls-dot-red">◆</span></td><td></td></tr>',
    '          <tr><td>Overall Bending Check (6 Measurement for all Edges)</td><td><span class="ls-dot ls-dot-on">◆</span></td><td></td><td></td></tr>',
    '          <tr class="ls4-shaded"><td>Glass Thickness Check (Thickness, Side of Coating)</td><td><span class="ls-dot ls-dot-on">◆</span></td><td><span class="ls-dot ls-dot-red">◆</span></td><td><span class="ls-dot ls-dot-blue">◆</span></td></tr>',
    '          <tr><td>Glass Type Recognition / Coating Type and Thickness Recognition</td><td><span class="ls-dot ls-dot-on">◆</span></td><td><span class="ls-dot ls-dot-red">◆</span></td><td><span class="ls-dot ls-dot-blue">◆</span></td></tr>',
    '          <tr class="ls4-shaded"><td>Data Matrix Code Interpretation</td><td><span class="ls-dot ls-dot-on">◆</span></td><td><span class="ls-dot ls-dot-red">◆</span></td><td><span class="ls-dot ls-dot-blue">◆</span></td></tr>',
    '        </tbody>',
    '      </table>',
    '      <div data-ls-col-restore=""></div>',
    '      <div data-ls-row-restore=""></div>',
    '      <button data-ls-add-row="">+ Add row</button>',
    '      <div class="ls4-legend">',
    '        <span class="ls4-leg-item"><span class="ls-dot ls-dot-on">◆</span> <span data-edit="proc-legend-1" contenteditable="" spellcheck="false">LineScanner Vertical</span></span>',
    '        <span class="ls4-leg-item"><span class="ls-dot ls-dot-red">◆</span> <span data-edit="proc-legend-2" contenteditable="" spellcheck="false">LineScanner Horizontal</span></span>',
    '        <span class="ls4-leg-item"><span class="ls-dot ls-dot-blue">◆</span> <span data-edit="proc-legend-3" contenteditable="" spellcheck="false">Osprey-25</span></span>',
    '      </div>',
    '    </div>',
    '    <div class="ls4-proc-cards anim-in">',
    '      <div class="ls4-proc-card"><img src="/slides/uploads/Render Tempering Line.png" alt="Tempering Line" data-zoom=""><div class="ls4-proc-card-label" data-edit="proc-label-1" contenteditable="" spellcheck="false">Tempering</div><button class="ls4-card-toggle" onclick="ls4ToggleCard(this,event)" title="Hide">✕</button><div class="ls4-card-move"><button onclick="ls4MoveCard(this,-1,event)" title="Move up">▲</button><button onclick="ls4MoveCard(this,1,event)" title="Move down">▼</button></div></div>',
    '      <div class="ls4-proc-card"><img src="/slides/uploads/Render of a Vertical IG Line with LineScanners on Orange to show the position.png" alt="IG Line" data-zoom=""><div class="ls4-proc-card-label" data-edit="proc-label-2" contenteditable="" spellcheck="false">IG Line</div><button class="ls4-card-toggle" onclick="ls4ToggleCard(this,event)" title="Hide">✕</button><div class="ls4-card-move"><button onclick="ls4MoveCard(this,-1,event)" title="Move up">▲</button><button onclick="ls4MoveCard(this,1,event)" title="Move down">▼</button></div></div>',
    '      <div class="ls4-proc-card"><img src="/slides/uploads/Render Lamination Line.png" alt="Lamination Line" data-zoom=""><div class="ls4-proc-card-label" data-edit="proc-label-3" contenteditable="" spellcheck="false">Lamination</div><button class="ls4-card-toggle" onclick="ls4ToggleCard(this,event)" title="Hide">✕</button><div class="ls4-card-move"><button onclick="ls4MoveCard(this,-1,event)" title="Move up">▲</button><button onclick="ls4MoveCard(this,1,event)" title="Move down">▼</button></div></div>',
    '      <div class="ls4-proc-card"><img src="/slides/uploads/Render Grinding Line.png" alt="Grinding Line" data-zoom=""><div class="ls4-proc-card-label" data-edit="proc-label-4" contenteditable="" spellcheck="false">Grinding</div><button class="ls4-card-toggle" onclick="ls4ToggleCard(this,event)" title="Hide">✕</button><div class="ls4-card-move"><button onclick="ls4MoveCard(this,-1,event)" title="Move up">▲</button><button onclick="ls4MoveCard(this,1,event)" title="Move down">▼</button></div></div>',
    '      <div class="ls4-proc-card"><img src="/slides/uploads/Render Coating line.png" alt="Coating Line" data-zoom=""><div class="ls4-proc-card-label" data-edit="proc-label-5" contenteditable="" spellcheck="false">Coating</div><button class="ls4-card-toggle" onclick="ls4ToggleCard(this,event)" title="Hide">✕</button><div class="ls4-card-move"><button onclick="ls4MoveCard(this,-1,event)" title="Move up">▲</button><button onclick="ls4MoveCard(this,1,event)" title="Move down">▼</button></div></div>',
    '      <div class="ls4-proc-card"><img src="/slides/uploads/Render Automotive Printing Line.png" alt="Automotive Printing Line" data-zoom=""><div class="ls4-proc-card-label" data-edit="proc-label-6" contenteditable="" spellcheck="false">Automotive Printing</div><div class="ls4-table-hint" onclick="ls4OpenAutoModal(event)">⊞ view data</div><button class="ls4-card-toggle" onclick="ls4ToggleCard(this,event)" title="Hide">✕</button><div class="ls4-card-move"><button onclick="ls4MoveCard(this,-1,event)" title="Move up">▲</button><button onclick="ls4MoveCard(this,1,event)" title="Move down">▼</button></div></div>',
    '    </div>',
    '  </div>',
    '</div>',

    '</div><!-- ls-tab-panels -->'
  ].join('\n');

  return [
    '<div class="slide content ls4" data-slide="' + slideId + '">',
    '  <div class="slide-logo-row"><img src="/slides/shared/LOGO SoftSolution grays.png" alt="Softsolution"><span class="slide-logo-sep"></span><img src="/slides/shared/LOGO LiteSentry Greys.png" alt="LiteSentry" class="slide-logo-ls"></div>',
    '',
    '  <div class="slide-layout">',
    '  <header class="slide-head">',
    '    <div class="section-label" data-edit="section-label" contenteditable="" spellcheck="false">' + applyEdit('section-label', 'The Product', savedEdits) + '</div>',
    '    <h1 class="slide-title" data-edit="headline" contenteditable="" spellcheck="false" style="margin-bottom:14px;">' + applyEdit('headline', 'LineScanner <span class="blue">Capability Overview</span>', savedEdits) + '</h1>',
    '  </header>',
    '  <div class="slide-body">',
    '  <div class="ls-tabs" data-edit="tabs" data-track="ls4:tabs" style="flex:1;min-height:0;width:100%;max-width:960px;">',
    applyEditsToBlob(savedEdits['tabs'] != null ? savedEdits['tabs'] : defaultTabsHtml, savedEdits),
    '  </div><!-- ls-tabs -->',
    '  </div><!-- slide-body -->',
    '  </div><!-- slide-layout -->',
    '',
    '  <style>',
    '    .ls4 { }',
    '    .ls4-grid { display:grid; grid-template-columns:1fr; gap:16px; height:auto; }',
    '    .ls4-table-wrap { display:flex; flex-direction:column; gap:6px; min-height:0; overflow:auto; }',
    '    .ls4-table { width:100%; border-collapse:collapse; font-size:clamp(10px,1.05vw,12px); }',
    '    .ls4-table thead tr { border-bottom:2px solid rgba(232,113,26,.4); }',
    '    .ls4-table th { padding:7px 6px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; font-size:10px; color:var(--text-muted); text-align:center; }',
    '    .ls4-check-col { text-align:left !important; width:38%; }',
    '    .ls4-prod-col  { width:12%; }',
    '    .ls4-highlight-col { color:#E8711A !important; background:rgba(232,113,26,.07); border-left:1px solid rgba(232,113,26,.2); border-right:1px solid rgba(232,113,26,.2); }',
    '    .ls4-table tbody tr td { padding:4px 6px; color:var(--text-muted); border-bottom:1px solid rgba(255,255,255,.04); text-align:center; }',
    '    .ls4-table tbody tr td:first-child { text-align:left; color:var(--text); }',
    '    .ls4-shaded td { background:rgba(255,255,255,.02); }',
    '    .ls4-table tbody tr td:nth-child(2) { background:rgba(99,179,237,.03); border-left:1px solid rgba(99,179,237,.1); border-right:1px solid rgba(99,179,237,.1); }',
    '    .ls4-table tbody tr td:nth-child(3) { background:rgba(232,113,26,.04); border-left:1px solid rgba(232,113,26,.15); border-right:1px solid rgba(232,113,26,.15); }',
    '    .ls4-table tbody tr td:nth-child(4) { background:rgba(239,68,68,.03); border-left:1px solid rgba(239,68,68,.1); border-right:1px solid rgba(239,68,68,.1); }',
    '    .ls4-table tbody tr td:nth-child(5) { background:rgba(239,68,68,.03); border-left:1px solid rgba(239,68,68,.1); border-right:1px solid rgba(239,68,68,.1); }',
    '    .ls4-table tbody tr td:nth-child(6) { background:rgba(239,68,68,.03); border-left:1px solid rgba(239,68,68,.1); border-right:1px solid rgba(239,68,68,.1); }',
    '    .ls4-dot { font-size:12px; } .ls4-dot-on { color:#E8711A; } .ls4-dot-red { color:#f87171; } .ls4-dot-blue { color:#63b3ed; } .ls4-dot-off { color:rgba(255,255,255,.25); }',
    '    .ls4-col-orange { color:#E8711A !important; background:rgba(232,113,26,.07); border-left:1px solid rgba(232,113,26,.2); border-right:1px solid rgba(232,113,26,.2); }',
    '    .ls4-col-red    { color:#f87171 !important; background:rgba(239,68,68,.07);  border-left:1px solid rgba(239,68,68,.2);  border-right:1px solid rgba(239,68,68,.2); }',
    '    .ls4-col-blue   { color:#63b3ed !important; background:rgba(99,179,237,.07); border-left:1px solid rgba(99,179,237,.2); border-right:1px solid rgba(99,179,237,.2); }',
    '    .ls4-proc-table tbody tr td:nth-child(2) { background:rgba(232,113,26,.03); border-left:1px solid rgba(232,113,26,.1); border-right:1px solid rgba(232,113,26,.1); }',
    '    .ls4-proc-table tbody tr td:nth-child(3) { background:rgba(239,68,68,.03);  border-left:1px solid rgba(239,68,68,.1);  border-right:1px solid rgba(239,68,68,.1); }',
    '    .ls4-proc-table tbody tr td:nth-child(4) { background:rgba(99,179,237,.03); border-left:1px solid rgba(99,179,237,.1); border-right:1px solid rgba(99,179,237,.1); }',
    '    .ls4-legend { display:flex; gap:20px; padding:5px 0; border-top:1px solid var(--border); flex-shrink:0; }',
    '    .ls4-leg-item { display:flex; align-items:center; gap:6px; font-size:11px; color:var(--text-muted); }',
    '    .ls4-car-label { padding:8px 12px; font-size:11px; font-weight:600; flex-shrink:0; color:var(--text-muted); text-align:center; letter-spacing:.04em; background:var(--bg-card); }',
    '    .ls4-proc-grid { display:grid; grid-template-columns:1fr; gap:16px; height:auto; overflow-y:auto; }',
    '    .ls4-proc-table-wrap { display:flex; flex-direction:column; gap:6px; min-height:0; overflow:hidden; padding-bottom:16px; }',
    '    .ls4-proc-table { font-size:clamp(8.5px,0.82vw,10px); }',
    '    .ls4-proc-table th { padding:4px 5px; }',
    '    .ls4-proc-table tbody tr td { padding:2px 5px; line-height:1.3; }',
    '    .ls4-proc-cards { display:flex; flex-direction:column; gap:6px; min-height:0; overflow-y:auto; padding-bottom:72px; }',
    '    .ls4-proc-card { flex:1; min-height:0; border-radius:10px; overflow:hidden; border:1px solid var(--border); background:var(--bg-card); position:relative; cursor:zoom-in; display:flex; align-items:center; justify-content:center; transition:border-color .2s; }',
    '    .ls4-proc-card:hover { border-color:rgba(232,113,26,.4); }',
    '    .ls4-proc-card img { width:100%; height:100%; object-fit:contain; display:block; transition:transform .3s; }',
    '    .ls4-proc-card:hover img { transform:scale(1.04); }',
    '    .ls4-proc-card-label { position:absolute; bottom:4px; right:8px; font-size:10px; font-weight:600; letter-spacing:.05em; color:rgba(255,255,255,.3); pointer-events:none; text-transform:uppercase; }',
    '    .ls4-col-label { display:block; }',
    '    .ls4-col-toggle { opacity:0; width:14px; height:14px; border-radius:3px; padding:0; background:rgba(0,0,0,.5); border:1px solid rgba(255,255,255,.2); color:rgba(255,255,255,.5); font-size:9px; font-weight:900; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; transition:all .2s; font-family:inherit; line-height:1; margin-top:2px; }',
    '    th:hover .ls4-col-toggle { opacity:1; }',
    '    .ls4-col-toggle:hover { background:rgba(239,68,68,.4); color:#fff; border-color:rgba(239,68,68,.4); }',
    '    .ls4-restore-chip { padding:3px 10px; border-radius:20px; cursor:pointer; background:rgba(34,197,94,.12); border:1px solid rgba(34,197,94,.3); color:#4ade80; font-size:10px; font-weight:700; letter-spacing:.04em; font-family:inherit; transition:all .2s; }',
    '    .ls4-restore-chip:hover { background:rgba(34,197,94,.25); color:#fff; }',
    '    .ls4-add-row-btn { align-self:flex-start; padding:3px 10px; border-radius:20px; cursor:pointer; background:transparent; border:1px dashed rgba(255,255,255,.15); color:rgba(255,255,255,.25); font-size:10px; font-weight:600; letter-spacing:.04em; font-family:inherit; margin-top:2px; transition:all .2s; }',
    '    .ls4-add-row-btn:hover { border-color:rgba(232,113,26,.4); color:#E8711A; }',
    '    .ls4-row-drag { opacity:0; cursor:grab; font-size:11px; color:rgba(255,255,255,.3); margin-right:4px; vertical-align:middle; user-select:none; transition:opacity .2s; }',
    '    tr:hover .ls4-row-drag { opacity:1; }',
    '    .ls4-row-dragging { opacity:.4; background:rgba(232,113,26,.08) !important; }',
    '    .ls4-row-dragover td { border-top:2px solid #E8711A !important; }',
    '    tr.ls4-row-hidden { display:none; }',
    '    .ls4-row-hide-btn { opacity:0; width:13px; height:13px; border-radius:3px; padding:0; background:rgba(0,0,0,.5); border:1px solid rgba(255,255,255,.18); color:rgba(255,255,255,.45); font-size:8px; font-weight:900; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; transition:all .2s; font-family:inherit; line-height:1; margin-right:5px; flex-shrink:0; vertical-align:middle; }',
    '    tr:hover .ls4-row-hide-btn { opacity:1; }',
    '    .ls4-row-hide-btn:hover { background:rgba(239,68,68,.45); color:#fff; border-color:rgba(239,68,68,.4); }',
    '    td[contenteditable="true"] { outline:1px solid rgba(232,113,26,.5); border-radius:3px; background:rgba(232,113,26,.05); padding-left:4px; }',
    '    .ls4-table tbody td:not(:first-child) { cursor:pointer; }',
    '    .ls4-table tbody td:not(:first-child):hover { background:rgba(255,255,255,.05) !important; }',
    '    .ls4-card-move { position:absolute; top:5px; left:5px; z-index:3; display:flex; flex-direction:column; gap:2px; opacity:0; transition:opacity .2s; }',
    '    .ls4-proc-card:hover .ls4-card-move { opacity:1; }',
    '    .ls4-card-move button { width:16px; height:14px; border-radius:3px; padding:0; background:rgba(0,0,0,.45); border:1px solid rgba(255,255,255,.18); color:rgba(255,255,255,.45); font-size:8px; font-weight:900; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all .2s; font-family:inherit; line-height:1; }',
    '    .ls4-card-move button:hover { background:rgba(232,113,26,.5); color:#fff; border-color:rgba(232,113,26,.4); }',
    '    .ls4-proc-card.ls4-collapsed .ls4-card-move { display:none; }',
    '    .ls4-table-hint { position:absolute; top:6px; left:50%; transform:translateX(-50%); background:rgba(99,179,237,.15); border:1px solid rgba(99,179,237,.3); color:#63b3ed; font-size:9px; font-weight:700; letter-spacing:.06em; padding:3px 8px; border-radius:20px; pointer-events:auto; cursor:pointer; text-transform:uppercase; white-space:nowrap; }',
    '    .ls4-table-hint:hover { background:rgba(99,179,237,.3); color:#fff; }',
    '    .ls4-proc-card.ls4-collapsed .ls4-table-hint { display:none; }',
    '    #ls4-auto-modal { display:none; position:fixed; inset:0; z-index:9995; align-items:center; justify-content:center; background:rgba(0,0,0,.6); backdrop-filter:blur(8px); cursor:pointer; }',
    '    #ls4-auto-modal.on { display:flex; }',
    '    .ls4-am-card { background:#111; border:1px solid rgba(255,255,255,.12); border-radius:20px; padding:28px 32px; cursor:default; box-shadow:0 24px 80px rgba(0,0,0,.7); max-width:480px; width:92vw; position:relative; }',
    '    .ls4-am-close { position:absolute; top:12px; right:14px; background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.12); color:rgba(255,255,255,.5); width:28px; height:28px; border-radius:50%; cursor:pointer; font-size:11px; display:flex; align-items:center; justify-content:center; transition:all .2s; }',
    '    .ls4-am-close:hover { background:rgba(239,68,68,.3); color:#fff; }',
    '    .ls4-am-title { font-size:13px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--text-muted); margin-bottom:14px; opacity:.6; }',
    '    .ls4-card-toggle { position:absolute; top:5px; right:5px; z-index:3; width:16px; height:16px; border-radius:50%; padding:0; background:rgba(0,0,0,.45); border:1px solid rgba(255,255,255,.18); color:rgba(255,255,255,.4); font-size:8px; font-weight:900; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all .2s; font-family:inherit; line-height:1; opacity:0; }',
    '    .ls4-proc-card:hover .ls4-card-toggle { opacity:1; }',
    '    .ls4-card-toggle:hover { background:rgba(239,68,68,.5); color:#fff; border-color:rgba(239,68,68,.4); }',
    '    .ls4-proc-card.ls4-collapsed { flex:none; height:26px; cursor:default; }',
    '    .ls4-proc-card.ls4-collapsed img { display:none; }',
    '    .ls4-proc-card.ls4-collapsed .ls4-proc-card-label { bottom:auto; top:50%; right:auto; left:10px; transform:translateY(-50%); color:var(--text-muted); opacity:.5; }',
    '    .ls4-proc-card.ls4-collapsed .ls4-card-toggle { opacity:1; top:50%; transform:translateY(-50%); background:rgba(34,197,94,.15); color:#4ade80; border-color:rgba(34,197,94,.3); font-size:10px; }',
    '    .ls4-proc-card.ls4-collapsed .ls4-card-toggle:hover { background:rgba(34,197,94,.35); color:#fff; }',
    '    .ls4-abbr-note { display:flex; gap:20px; padding:4px 0; border-top:1px solid var(--border); flex-shrink:0; }',
    '    .ls4-abbr-note span { font-size:10px; color:var(--text-muted); opacity:.6; }',
    '    .ls4-abbr-note strong { color:var(--text); font-weight:700; }',
    '    .ls4-badge { padding:3px 8px; border-radius:20px; font-size:10px; font-weight:700; letter-spacing:.04em; }',
    '    .ls4-badge-ls { background:rgba(232,113,26,.15); color:#E8711A; border:1px solid rgba(232,113,26,.3); }',
    '    .ls4-badge-op { background:rgba(99,179,237,.12); color:#63b3ed; border:1px solid rgba(99,179,237,.25); }',
    '    /* ── Mobile base ── */',
    '    .ls4 .slide-body { width:100%; align-items:center; }',
    '    .ls4 { padding: 52px 16px 80px !important; overflow-y:auto; }',
    '    /* Tab 1 — Capability Matrix */',
    '    .ls4-grid { grid-template-columns:1fr; height:auto; display:flex; flex-direction:column; }',
    '    /* Carousel below the table */',
    '    .ls4-grid .ls-carousel { order:1; min-height:260px !important; height:260px !important; flex:none; }',
    '    .ls4-table-wrap { overflow-x:auto; max-height:45vh; order:0; }',
    '    /* Vertical column headers so table fits on mobile */',
    '    .ls4-table th.ls4-prod-col .ls-col-label { writing-mode:vertical-rl; transform:rotate(180deg); white-space:nowrap; padding:4px 2px; display:inline-block; }',
    '    .ls4-table { font-size:11px; }',
    '    .ls4-check-col { width:55%; }',
    '    .ls4-prod-col { width:auto; }',
    '    .ls4-table tbody tr td:first-child { position:sticky; left:0; z-index:1; background:var(--bg); }',
    '    .ls4-shaded td:first-child { background:#0d0d0d; }',
    '    /* Tab 2 — Where in Your Process */',
    '    .ls4-proc-grid { display:grid !important; grid-template-columns:1fr !important; height:auto !important; }',
    '    .ls4-proc-table { font-size:10px; }',
    '    .ls4-proc-table-wrap { overflow-x:auto; max-height:none; }',
    '    /* Vertical headers on proc table too */',
    '    .ls4-proc-table th.ls4-prod-col .ls-col-label { writing-mode:vertical-rl; transform:rotate(180deg); white-space:nowrap; padding:4px 2px; display:inline-block; }',
    '    .ls4-proc-cards { flex-direction:column; overflow-y:visible; padding-bottom:16px; }',
    '    .ls4-proc-card { flex:none; height:220px; }',
    '    /* ── Desktop overrides ── */',
    '    @media(min-width:769px) {',
    '      .ls4 { padding: 52px 80px 0 !important; overflow-y:unset; }',
    '      .ls4-grid { grid-template-columns:1.4fr 1fr; height:100%; display:grid; flex-direction:unset; }',
    '      .ls4-grid .ls-carousel { order:0; min-height:0 !important; height:auto !important; flex:1; }',
    '      .ls4-table-wrap { overflow-x:unset; max-height:none; order:0; }',
    '      .ls4-table { font-size:inherit; }',
    '      .ls4-check-col { width:38%; }',
    '      .ls4-prod-col { width:12%; }',
    '      .ls4-table th.ls4-prod-col .ls-col-label { writing-mode:unset; transform:none; padding:0; }',
    '      .ls4-proc-table th.ls4-prod-col .ls-col-label { writing-mode:unset; transform:none; padding:0; }',
    '      .ls4-table tbody tr td:first-child { position:static; z-index:auto; background:transparent; }',
    '      .ls4-shaded td:first-child { background:transparent; }',
    '      .ls4-proc-grid { display:grid; grid-template-columns:1.4fr 1fr; height:100%; overflow-y:unset; }',
    '      .ls4-proc-table { font-size:inherit; }',
    '      .ls4-proc-table-wrap { overflow-x:unset; overflow-y:auto; max-height:none; }',
    '      .ls4-proc-table { min-width:unset; }',
    '      .ls4-proc-cards { flex-direction:column; overflow-y:auto; padding-bottom:72px; }',
    '      .ls4-proc-card { flex:1; height:auto; }',
    '    }',
    '  </style>',
    '',
    '  <script>',
    '  function ls4InitCards(container) { }',
    '  setTimeout(function() { document.querySelectorAll(\'.ls4-proc-cards\').forEach(ls4InitCards); }, 0);',
    '  window.ls4OpenAutoModal = function(e) { e.stopPropagation(); var modal = document.getElementById(\'ls4-auto-modal\'); if (modal && modal.parentNode !== document.body) document.body.appendChild(modal); if (modal) modal.classList.add(\'on\'); };',
    '  window.ls4CloseAutoModal = function(e, force) { if (force || e.target === document.getElementById(\'ls4-auto-modal\')) { document.getElementById(\'ls4-auto-modal\').classList.remove(\'on\'); } };',
    '  window.ls4MoveCard = function(btn, dir, e) { e.stopPropagation(); var card = btn.closest(\'.ls4-proc-card\'); var list = card.parentElement; var cards = Array.from(list.children); var idx = cards.indexOf(card); var target = cards[idx + dir]; if (!target) return; if (dir === -1) list.insertBefore(card, target); else list.insertBefore(target, card); };',
    '  window.ls4ToggleCard = function(btn, e) { e.stopPropagation(); var card = btn.closest(\'.ls4-proc-card\'); var collapsed = card.classList.toggle(\'ls4-collapsed\'); btn.textContent = collapsed ? \'+\' : \'✕\'; btn.title = collapsed ? \'Show\' : \'Hide\'; };',
    '  <\/script>',
    '',
    '  <script>',
    '  (function () { var s = document.currentScript;',
    '    setTimeout(function () { if (window.PE && s) PE.initSlide(s.closest(\'.slide\')); }, 0); })();',
    '  <\/script>',
    '</div>'
  ].join('\n');
}

function renderTechnologyLayout(slideId, savedEdits) {
  savedEdits = savedEdits || {};

  var defaultBadListHtml = [
    '<li><strong>Snapshot coverage:</strong> Takes periodic frames — gaps between shots mean defects between frames go undetected</li>',
    '<li><strong>Motion blur at speed:</strong> Fast production lines cause image blur, reducing detection accuracy</li>',
    '<li><strong>8-bit depth:</strong> Only 256 grey levels — low-contrast defects are invisible</li>',
    '<li><strong>Position-dependent illumination:</strong> Uneven lighting across the field of view distorts results</li>',
    '<li><strong>False positives &amp; rejects:</strong> Pixel variation by position triggers unnecessary alarms</li>',
    '<li><strong>Recalibration required:</strong> Sensitivity must be re-tuned for every glass type and transmission level</li>'
  ].join('\n');

  var defaultGoodListHtml = [
    '<li><strong>100% line-by-line scanning:</strong> Every millimetre of glass is inspected — zero gaps, zero blind spots</li>',
    '<li><strong>No motion blur:</strong> Linear sensor reads one line at a time, perfectly synchronised with production speed</li>',
    '<li><strong>16-bit depth:</strong> 65,536 grey levels — detects the subtlest inclusions, coating variations and micro-scratches</li>',
    '<li><strong>Telecentric illumination:</strong> Uniform light field independent of glass position — consistent results everywhere</li>',
    '<li><strong>Every pixel is equal:</strong> No positional variation — eliminates false positives and unnecessary rejections</li>',
    '<li><strong>One setup for all glass:</strong> 15% to 99% transmission handled automatically with the same configuration</li>'
  ].join('\n');

  var defaultTabsHtml = [
    '<div class="ls-tab-list">',
    '  <button class="ls-tab" data-panel="0" data-edit="tab-howitworks" contenteditable="" spellcheck="false">How It Works</button>',
    '  <button class="ls-tab active" data-panel="1" data-edit="tab-16bit" contenteditable="" spellcheck="false">16-bit Advantage</button>',
    '  <button class="ls-tab" data-panel="2" data-edit="tab-vs" contenteditable="" spellcheck="false">vs Camera Systems</button>',
    '</div>',
    '<div class="ls-tab-panels">',

    '<!-- ══ PANEL 0 · How It Works ══ -->',
    '<div class="ls-tab-panel" data-panel="0">',
    '  <div class="t5-hiw">',
    '    <div class="t5-components anim-in">',
    '      <div class="t5-comp-card"><span class="t5-num">1</span><span class="t5-comp-text" data-edit="comp-card-1" contenteditable="" spellcheck="false"><strong>Telecentric light</strong> — uniform illumination independent of glass position</span></div>',
    '      <div class="t5-comp-card"><span class="t5-num">2</span><span class="t5-comp-text" data-edit="comp-card-2" contenteditable="" spellcheck="false"><strong>Linear image sensor</strong> — real scanning line-by-line, not a snapshot camera</span></div>',
    '      <div class="t5-comp-card"><span class="t5-num">3</span><span class="t5-comp-text" data-edit="comp-card-3" contenteditable="" spellcheck="false"><strong>Glass</strong> — inspected continuously at full production speed</span></div>',
    '      <div class="t5-comp-card"><span class="t5-num">4</span><span class="t5-comp-text" data-edit="comp-card-4" contenteditable="" spellcheck="false"><strong>Electronic module</strong> — 16-bit processing at extreme speed</span></div>',
    '    </div>',
    '    <div class="t5-diagram t5-diagram-full anim-in">',
    '      <div class="ls-carousel" data-counter="" data-edit="t5-diagram-howitworks" style="width:100%;height:100%;">',
    '        <div class="ls-carousel-track" style="transform:translateX(0px);">',
    '          <div class="ls-carousel-slide">',
    '            <img src="/slides/uploads/Image Explaining the technology 1 Telecentric light 2 linear image sensor 3 glass 4 electronic module.png" alt="Scanner technology diagram" data-zoom="">',
    '          </div>',
    '        </div>',
    '        <div class="ls-carousel-counter"></div>',
    '      </div>',
    '    </div>',
    '  </div>',
    '</div>',

    '<!-- ══ PANEL 1 · 16-bit Advantage ══ -->',
    '<div class="ls-tab-panel active" data-panel="1">',
    '  <div class="t5-hiw">',
    '    <div class="t5-diagram t5-diagram-full anim-in">',
    '      <div class="ls-carousel" data-counter="" data-edit="t5-diagram-16bit" style="width:100%;height:100%;">',
    '        <div class="ls-carousel-track" style="transform:translateX(0px);">',
    '          <div class="ls-carousel-slide">',
    '            <img src="/slides/uploads/16 bit tech.jpg" alt="8-bit vs 16-bit technology comparison" data-zoom="">',
    '          </div>',
    '        </div>',
    '        <div class="ls-carousel-counter"></div>',
    '      </div>',
    '    </div>',
    '    <div class="t5-components anim-in">',
    '      <div class="t5-comp-card"><span class="t5-fnum">1</span><span class="t5-comp-text" data-edit="feat-card-1" contenteditable="" spellcheck="false"><strong>Low-contrast detection:</strong> Identifies defects 8-bit systems cannot see — subtle inclusions, coating variations, micro-scratches.</span></div>',
    '      <div class="t5-comp-card"><span class="t5-fnum">2</span><span class="t5-comp-text" data-edit="feat-card-2" contenteditable="" spellcheck="false"><strong>Transmission homogenization:</strong> Glass from 15% to 99% processed with the same setup — identical results across all types.</span></div>',
    '      <div class="t5-comp-card"><span class="t5-fnum">3</span><span class="t5-comp-text" data-edit="feat-card-3" contenteditable="" spellcheck="false"><strong>Every pixel is equal:</strong> No variation by position — always consistent, eliminating false positives and unnecessary rejections.</span></div>',
    '      <div class="t5-comp-card"><span class="t5-fnum">4</span><span class="t5-comp-text" data-edit="feat-card-4" contenteditable="" spellcheck="false"><strong>Extreme processing speed:</strong> No compromise on throughput. Compatible with automotive and railway production rates.</span></div>',
    '    </div>',
    '  </div>',
    '</div>',

    '<!-- ══ PANEL 2 · vs Camera Systems ══ -->',
    '<div class="ls-tab-panel" data-panel="2">',
    '  <div class="t5-vc-wrap anim-in">',
    '    <div class="t5-cmp-col t5-cmp-bad">',
    '      <div class="t5-cmp-header"><span class="t5-cmp-icon">📷</span><span data-edit="vc-header-bad" contenteditable="" spellcheck="false">Camera-based Systems</span></div>',
    '      <ul class="t5-cmp-list" id="t5-vc-bad-list" data-edit="t5-vc-bad-list" data-ls-list="">',
    defaultBadListHtml,
    '      </ul>',
    '      <div class="t5-vc-list-restore" id="t5-vc-bad-restore" data-ls-restore=""></div>',
    '      <button class="t5-vc-add-bad" data-builder-only="" data-ls-add="">+ Add item</button>',
    '    </div>',
    '    <div class="t5-vc-imgs">',
    '      <div class="t5-vc-card">',
    '        <div class="t5-diagram" style="flex:1;min-height:0;">',
    '          <div class="ls-carousel" data-counter="" data-no-caption="" data-edit="t5-diagram-drillhole" style="width:100%;height:100%;">',
    '            <div class="ls-carousel-track" style="transform:translateX(0px);">',
    '              <div class="ls-carousel-slide"><img src="/slides/uploads/Comparison on image taken by Camera Above and LineScanner below of a drillhole .jpg" alt="Drill hole comparison" data-zoom=""></div>',
    '            </div>',
    '            <div class="ls-carousel-counter"></div>',
    '          </div>',
    '        </div>',
    '        <div class="t5-vc-label" data-edit="vc-label-drillhole" contenteditable="" spellcheck="false">Drill Hole, Camera vs LineScanner</div>',
    '      </div>',
    '      <div class="t5-vc-card">',
    '        <div class="t5-diagram" style="flex:1;min-height:0;">',
    '          <div class="ls-carousel" data-counter="" data-no-caption="" data-edit="t5-diagram-igunit" style="width:100%;height:100%;">',
    '            <div class="ls-carousel-track" style="transform:translateX(0px);">',
    '              <div class="ls-carousel-slide"><img src="/slides/uploads/Comparison on image taken by Camera Above and LineScanner below of a Ig unit .jpg" alt="IG unit comparison" data-zoom=""></div>',
    '            </div>',
    '            <div class="ls-carousel-counter"></div>',
    '          </div>',
    '        </div>',
    '        <div class="t5-vc-label" data-edit="vc-label-igunit" contenteditable="" spellcheck="false">IG Unit — Camera vs LineScanner</div>',
    '      </div>',
    '    </div>',
    '    <div class="t5-cmp-col t5-cmp-good">',
    '      <div class="t5-cmp-header"><span class="t5-cmp-icon">✓</span><span data-edit="vc-header-good" contenteditable="" spellcheck="false">LineScanner</span></div>',
    '      <ul class="t5-cmp-list" id="t5-vc-good-list" data-edit="t5-vc-good-list" data-ls-list="">',
    defaultGoodListHtml,
    '      </ul>',
    '      <div class="t5-vc-list-restore" id="t5-vc-good-restore" data-ls-restore=""></div>',
    '      <button class="t5-vc-add-good" data-builder-only="" data-ls-add="">+ Add item</button>',
    '    </div>',
    '  </div>',
    '</div>',

    '</div><!-- ls-tab-panels -->'
  ].join('\n');

  return [
    '<div class="slide content t5" data-slide="' + slideId + '">',
    '  <div class="slide-logo-row"><img src="/slides/shared/LOGO SoftSolution grays.png" alt="Softsolution"><span class="slide-logo-sep"></span><img src="/slides/shared/LOGO LiteSentry Greys.png" alt="LiteSentry" class="slide-logo-ls"></div>',
    '',
    '  <div class="slide-layout">',
    '  <header class="slide-head">',
    '    <div class="section-label" data-edit="section-label" contenteditable="" spellcheck="false">' + applyEdit('section-label', 'The Technology', savedEdits) + '</div>',
    '    <h1 class="slide-title" data-edit="headline" contenteditable="" spellcheck="false" style="margin-bottom:14px;">' + applyEdit('headline', 'How LineScanner <span class="blue">sees what others miss</span>', savedEdits) + '</h1>',
    '  </header>',
    '  <div class="slide-body">',
    '  <div class="ls-tabs" data-edit="tabs" data-track="t5:tabs" style="flex:1;min-height:0;width:100%;max-width:920px;flex-direction:column-reverse;">',
    applyEditsToBlob(savedEdits['tabs'] != null ? savedEdits['tabs'] : defaultTabsHtml, savedEdits),
    '  </div>',
    '  </div><!-- slide-body -->',
    '  </div><!-- slide-layout -->',
    '',
    '  <style>',
    '    .t5 .slide-body { width: 100%; align-items: center; }',
    '    .t5 .ls-carousel { min-height: 260px !important; height: 260px !important; }',
    '    .t5 { padding: 52px 16px 80px !important; }',
    '    .t5 .ls-tabs { flex-direction: column-reverse; }',
    '    .t5 .ls-tab-list { margin-bottom: 0; margin-top: 10px; }',
    '    .t5-hiw { display:flex; flex-direction:column; gap:12px; height:100%; }',
    '    .t5-components { display:grid; grid-template-columns:1fr; gap:8px; flex-shrink:0; }',
    '    .t5-comp-card { display:flex; align-items:flex-start; gap:10px; padding:8px 12px; border-radius:10px; background:var(--bg-card); border:1px solid var(--border); }',
    '    .t5-diagram-full { flex:1; min-height:180px; }',
    '    .t5-num { width:20px; height:20px; border-radius:50%; flex-shrink:0; background:rgba(232,113,26,.2); border:1px solid rgba(232,113,26,.4); color:#E8711A; font-size:11px; font-weight:800; display:flex; align-items:center; justify-content:center; }',
    '    .t5-fnum { width:24px; height:24px; border-radius:50%; flex-shrink:0; background:rgba(232,113,26,.2); border:1px solid rgba(232,113,26,.4); color:#E8711A; font-size:12px; font-weight:800; display:flex; align-items:center; justify-content:center; }',
    '    .t5-comp-text { font-size:clamp(11px,1.1vw,13px); color:var(--text-muted); line-height:1.4; }',
    '    .t5-comp-text strong { color:var(--text); }',
    '    .t5-diagram { border:1px solid var(--border); border-radius:14px; overflow:hidden; cursor:zoom-in; background:#000; display:flex; align-items:center; justify-content:center; position:relative; min-height:0; transition:border-color .2s; }',
    '    .t5-diagram:hover { border-color:rgba(232,113,26,.4); }',
    '    .t5-diagram img { width:100%; height:100%; object-fit:contain; display:block; transition:transform .3s; }',
    '    .t5-diagram:hover img { transform:scale(1.03); }',
    '    .t5-vc-wrap { display:grid; grid-template-columns:1fr; gap:14px; height:auto; overflow-y:auto; }',
    '    .t5-cmp-col { display:flex; flex-direction:column; border-radius:14px; overflow:hidden; border:1px solid var(--border); }',
    '    .t5-cmp-header { display:flex; align-items:center; gap:10px; padding:12px 16px; flex-shrink:0; font-size:12px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; }',
    '    .t5-cmp-bad .t5-cmp-header { background:rgba(239,68,68,.12); border-bottom:1px solid rgba(239,68,68,.2); color:#f87171; }',
    '    .t5-cmp-good .t5-cmp-header { background:rgba(34,197,94,.10); border-bottom:1px solid rgba(34,197,94,.2); color:#4ade80; }',
    '    .t5-cmp-icon { font-size:15px; }',
    '    .t5-cmp-list { list-style:none; margin:0; padding:10px 16px 12px; display:flex; flex-direction:column; gap:0; overflow-y:auto; flex:1; }',
    '    .t5-cmp-list li { padding:7px 0 7px 20px; position:relative; font-size:clamp(11px,1.05vw,13px); line-height:1.4; color:var(--text-muted); border-bottom:1px solid rgba(255,255,255,.04); }',
    '    .t5-cmp-list li:last-child { border-bottom:none; }',
    '    .t5-cmp-list li strong { color:var(--text); }',
    '    .t5-cmp-bad .t5-cmp-list li::before { content:"✕"; position:absolute; left:0; top:8px; font-size:10px; font-weight:800; color:#f87171; }',
    '    .t5-cmp-good .t5-cmp-list li::before { content:"›"; position:absolute; left:2px; top:7px; font-size:14px; font-weight:800; color:#4ade80; }',
    '    .t5-vc-add-bad[data-ls-add]:hover { border-color:rgba(239,68,68,.4); color:#f87171; }',
    '    .t5-vc-add-good[data-ls-add]:hover { border-color:rgba(34,197,94,.4); color:#4ade80; }',
    '    .t5-vc-imgs { display:flex; flex-direction:column; gap:10px; min-height:0; overflow:hidden; }',
    '    .t5-vc-card { flex:1; min-height:180px; display:flex; flex-direction:column; gap:0; border-radius:12px; border:1px solid var(--border); background:var(--bg-card); overflow:hidden; position:relative; }',
    '    .t5-vc-label { padding:5px 10px; font-size:10px; font-weight:600; letter-spacing:.04em; color:var(--text-muted); text-align:center; flex-shrink:0; border-top:1px solid var(--border); }',
    '    @media(min-width:769px) and (max-width:1024px) {',
    '      .t5 .ls-carousel { min-height: 0 !important; height: 100% !important; }',
    '      .t5 { padding: 52px 80px 0 !important; }',
    '      .t5-vc-wrap { grid-template-columns:1fr 1fr; height:100%; overflow-y:unset; }',
    '    }',
    '    @media(min-width:1025px) {',
    '      .t5 .ls-carousel { min-height: 0 !important; height: 100% !important; }',
    '      .t5 { padding: 52px 80px 0 !important; }',
    '      .t5-components { grid-template-columns:1fr 1fr; }',
    '      .t5-vc-wrap { grid-template-columns:1fr 1fr 1fr; height:100%; overflow-y:unset; }',
    '    }',
    '  </style>',
    '',
    '  <script>',
    '  setTimeout(function() {',
    '    window.t5VcHide = function(key) {',
    '      var card = document.getElementById("t5-vc-" + key);',
    '      if (card) card.style.display = "none";',
    '    };',
    '  }, 0);',
    '  <\/script>',
    '',
    '  <script>',
    '  (function () { var s = document.currentScript;',
    '    setTimeout(function () { if (window.PE && s) PE.initSlide(s.closest(\'.slide\')); }, 0); })();',
    '  <\/script>',
    '</div>'
  ].join('\n');
}

function renderDefectGalleryLayout(slideId, savedEdits) {
  savedEdits = savedEdits || {};

  var defaultCarouselHtml = [
    '<div class="ls-carousel-track" style="transform: translateX(0px);">',
    '  <div class="ls-carousel-slide"><img src="/slides/uploads/Details_Surface-Quality-Control.jpg" alt="Details_Surface Quality Control" data-zoom=""></div>',
    '</div>'
  ].join('\n');

  var defaultScratchesHtml = [
    '<div class="ls-carousel-track">',
    '  <div class="ls-carousel-slide ls-compare" data-compare-mode="split">',
    '    <img class="ls-cmp-left" src="/slides/uploads/Defect of a Coating Camera image 2.png" alt="Camera" data-zoom="">',
    '    <img class="ls-cmp-right" src="/slides/uploads/Defect of a Coating image LineScanner Raw Image.png" alt="LineScanner" data-zoom="">',
    '  </div>',
    '  <div class="ls-carousel-slide ls-compare" data-compare-mode="split">',
    '    <img class="ls-cmp-left" src="/slides/uploads/Defect of a Coating Camera image.png" alt="Camera" data-zoom="">',
    '    <img class="ls-cmp-right" src="/slides/uploads/Defect of a Coating image LineScanner Raw Image.png" alt="LineScanner" data-zoom="">',
    '  </div>',
    '</div>'
  ].join('\n');

  var defaultInclusionsHtml = [
    '<div class="ls-carousel-track" style="transform: translateX(-2880px);">',
    '  <div class="ls-carousel-slide"><img src="/slides/uploads/Defect-Piece-Inclusion.bmp" alt="Defect Piece Inclusion" data-zoom=""></div>',
    '  <div class="ls-carousel-slide"><img src="/slides/uploads/Defect-Piece-Inclusion-Screenshot-2.jpg" alt="Defect Piece Inclusion Screenshot 2" data-zoom=""></div>',
    '  <div class="ls-carousel-slide"><img src="/slides/uploads/Defect-Piece-Inclusion-Screenshot-2.png" alt="Defect Piece Inclusion Screenshot 2" data-zoom=""></div>',
    '  <div class="ls-carousel-slide"><img src="/slides/uploads/Defect-Piece-Inclusion-Screenshot.png" alt="Defect Piece Inclusion Screenshot" data-zoom=""></div>',
    '</div>'
  ].join('\n');

  var defaultDirtHtml = [
    '<div class="ls-carousel-track" style="transform: translateX(-960px);">',
    '  <div class="ls-carousel-slide"><img src="/slides/uploads/Defect-Piece-Dirt-Screenshot.png" alt="Defect Piece Dirt Screenshot" data-zoom=""></div>',
    '  <div class="ls-carousel-slide"><img src="/slides/uploads/CostOfQualityDefects.png" alt="CostOfQualityDefects" data-zoom=""></div>',
    '</div>'
  ].join('\n');

  var defaultDustHtml = [
    '<div class="ls-carousel-track"></div>'
  ].join('\n');

  var defaultWaterHtml = [
    '<div class="ls-carousel-track" style="transform: translateX(0px);">',
    '  <div class="ls-carousel-slide"><img src="/slides/uploads/Defect-Piece-Water-Drops-Screenshot.png" alt="Defect Piece Water Drops Screenshot" data-zoom=""></div>',
    '  <div class="ls-carousel-slide"><img src="/slides/uploads/Defect-Piece-Water-Drops.png" alt="Defect Piece Water Drops" data-zoom=""></div>',
    '</div>'
  ].join('\n');

  var defaultFingerprintsHtml = [
    '<div class="ls-carousel-track" style="transform: translateX(0px);">',
    '  <div class="ls-carousel-slide">',
    '    <img src="/slides/uploads/Defect of a Finger prints LineScanner Raw Image.png" alt="RAW scan — fingerprint defect" data-zoom="">',
    '  </div>',
    '  <div class="ls-carousel-slide"><img src="/slides/uploads/Defect-Piece-Finger-Print.bmp" alt="Defect Piece Finger Print" data-zoom=""></div>',
    '  <div class="ls-carousel-slide"><img src="/slides/uploads/Defect-Piece-Finger-Print-2.bmp" alt="Defect Piece Finger Print 2" data-zoom=""></div>',
    '</div>'
  ].join('\n');

  var defaultIgnoreHtml = [
    '<div class="ls-carousel-track"></div>'
  ].join('\n');

  var defaultEdgeDefectsHtml = [
    '<div class="ls-carousel-track" style="transform: translateX(0px);">',
    '  <div class="ls-carousel-slide">',
    '    <img src="/slides/uploads/Defect of micro edge chips on a cutout detction marks.png" alt="Micro edge chips — cutout detection marks" data-zoom="">',
    '  </div>',
    '  <div class="ls-carousel-slide">',
    '    <img src="/slides/uploads/image52.png" alt="Edge defect" data-zoom="">',
    '  </div>',
    '  <div class="ls-carousel-slide"><img src="/slides/uploads/Defect-Piece-Edge-Chip-3.PNG" alt="Defect Piece Edge Chip 3" data-zoom=""></div>',
    '  <div class="ls-carousel-slide"><img src="/slides/uploads/Defect-Piece-Edge-Chip-2.PNG" alt="Defect Piece Edge Chip 2" data-zoom=""></div>',
    '  <div class="ls-carousel-slide"><img src="/slides/uploads/Defect-Piece-Edge-Chip-4.PNG" alt="Defect Piece Edge Chip 4" data-zoom=""></div>',
    '  <div class="ls-carousel-slide"><img src="/slides/uploads/Defect-Piece-Edge-Chip-Screenshot--1-.jpg" alt="Defect Piece Edge Chip Screenshot (1)" data-zoom=""></div>',
    '  <div class="ls-carousel-slide"><img src="/slides/uploads/Defect-Piece-Edge-Chip-Screenshot--2-.jpg" alt="Defect Piece Edge Chip Screenshot (2)" data-zoom=""></div>',
    '  <div class="ls-carousel-slide"><img src="/slides/uploads/Defect-Piece-Edge-Chip-Screenshot--3-.jpg" alt="Defect Piece Edge Chip Screenshot (3)" data-zoom=""></div>',
    '  <div class="ls-carousel-slide"><img src="/slides/uploads/Defect-Piece-Edge-Chip-Screenshot--4-.jpg" alt="Defect Piece Edge Chip Screenshot (4)" data-zoom=""></div>',
    '  <div class="ls-carousel-slide"><img src="/slides/uploads/Defect-Piece-Edge-Chip-Screenshot--6-.jpg" alt="Defect Piece Edge Chip Screenshot (6)" data-zoom=""></div>',
    '  <div class="ls-carousel-slide"><img src="/slides/uploads/Defect-Piece-Edge-Chip-Screenshot--7-.jpg" alt="Defect Piece Edge Chip Screenshot (7)" data-zoom=""></div>',
    '</div>'
  ].join('\n');

  var defaultFrameBarsHtml = [
    '<div class="ls-carousel-track" style="transform: translateX(0px);">',
    '  <div class="ls-carousel-slide">',
    '    <img src="/slides/uploads/Defect on an IGU Insulated Glass Secondary Seal inside the unit.jpeg" alt="Sightline defect — IGU secondary seal" data-zoom="">',
    '  </div>',
    '  <div class="ls-carousel-slide"><img src="/slides/uploads/Defect-Piece-IG-Frame---Bars.jpg" alt="Defect Piece IG Frame &amp; Bars" data-zoom=""></div>',
    '  <div class="ls-carousel-slide"><img src="/slides/uploads/Defect-Piece-IG-Frame---Bars-2.PNG" alt="Defect Piece IG Frame &amp; Bars 2" data-zoom=""></div>',
    '</div>'
  ].join('\n');

  var defaultUndefinedHtml = [
    '<div class="ls-carousel-track">',
    '  <div class="ls-carousel-slide">',
    '    <img src="/slides/uploads/Defect Arcing on LineScanner Raw Image.png" alt="RAW scan — arcing defect" data-zoom="">',
    '  </div>',
    '</div>'
  ].join('\n');

  var defaultCoatingHtml = [
    '<div class="ls-carousel-track" style="transform: translateX(0px);">',
    '  <div class="ls-carousel-slide ls-compare ls-split" data-compare-mode="split">',
    '    <img class="ls-cmp-left" src="/slides/uploads/Defect of a Coating 2 Camera image.png" alt="Camera" data-zoom="">',
    '    <img class="ls-cmp-right" src="/slides/uploads/Defect of a Coating 2 Camera image LineScanner Raw Image.png" alt="LineScanner" data-zoom="">',
    '  </div>',
    '</div>'
  ].join('\n');

  // Pre-render defect selector buttons with editable label spans.
  // Labels use savedEdits['s6-label-N'] so renames persist across sessions.
  var DEFECT_DEFS = [
    { name: 'Scratches',    row: 0, carId: 's6-car-scratches',    editKey: 's6-defect-scratches'    },
    { name: 'Inclusions',   row: 1, carId: 's6-car-inclusions',   editKey: 's6-defect-inclusions'   },
    { name: 'Dirt',         row: 2, carId: 's6-car-dirt',         editKey: 's6-defect-dirt'         },
    { name: 'Dust',         row: 3, carId: 's6-car-dust',         editKey: 's6-defect-dust'         },
    { name: 'Water',        row: 4, carId: 's6-car-water',        editKey: 's6-defect-water'        },
    { name: 'Fingerprints', row: 5, carId: 's6-car-fingerprints', editKey: 's6-defect-fingerprints' },
    { name: 'Ignore',       row: 6, carId: 's6-car-ignore',       editKey: 's6-defect-ignore'       },
    { name: 'Edge defects', row: 7, carId: 's6-car-edge-defects', editKey: 's6-defect-edge-defects' },
    { name: 'Frame & bars', row: 8, carId: 's6-car-frame-bars',   editKey: 's6-defect-frame-bars'   },
    { name: 'Undefined',    row: 9, carId: 's6-car-undefined',    editKey: 's6-defect-undefined'    },
    { name: 'Coating',   icon: '◈', carId: 's6-car-coating',      editKey: 's6-defect-coating'      }
  ];
  var extraDefs = [];
  try { if (savedEdits['s6-extra-defs']) extraDefs = JSON.parse(savedEdits['s6-extra-defs']); } catch(e) {}
  var allDefs = DEFECT_DEFS.concat(extraDefs.map(function(d, i) {
    return { name: d.name || ('Custom ' + (i + 1)), row: d.row != null ? d.row : null, icon: d.icon || '?',
             carId: 's6-car-custom-' + i, editKey: 's6-defect-custom-' + i };
  }));
  var selectorHtml = allDefs.map(function(d, i) {
    var labelVal = savedEdits['s6-label-' + i] != null ? savedEdits['s6-label-' + i] : d.name;
    var iconHtml = d.icon
      ? '<div class="s6-emoji-icon">' + d.icon + '</div>'
      : (d.row != null ? '<div class="s6-icon" data-defect-row="' + d.row + '"></div>' : '<div class="s6-emoji-icon">?</div>');
    return '  <button class="s6-defect-btn" data-defect-idx="' + i + '">'
      + iconHtml
      + '<span class="s6-defect-label" data-edit="s6-label-' + i + '" contenteditable="" spellcheck="false">' + labelVal + '</span>'
      + '<span class="s6-btn-del" data-builder-only="" title="Remove this type">×</span>'
      + '</button>';
  }).join('\n')
  + '\n  <button class="s6-btn-add" data-builder-only="" title="Add defect type">+ Add type</button>';

  return [
    '<div class="slide content s6" data-slide="' + slideId + '">',
    '  <div class="slide-logo-row"><img src="/slides/shared/LOGO SoftSolution grays.png" alt="Softsolution"><span class="slide-logo-sep"></span><img src="/slides/shared/LOGO LiteSentry Greys.png" alt="LiteSentry" class="slide-logo-ls"></div>',
    '',
    '  <div class="slide-layout">',
    '  <header class="slide-head">',
    '    <div class="section-label" data-edit="section-label" contenteditable="" spellcheck="false">' + applyEdit('section-label', 'Surface Quality', savedEdits) + '</div>',
    '    <h1 class="slide-title" data-edit="headline" contenteditable="" spellcheck="false" style="margin-bottom:8px;">' + applyEdit('headline', 'Defect detection with <span class="blue">Artificial Intelligence</span>', savedEdits) + '</h1>',
    '    <p class="slide-subtitle" data-edit="subtitle" contenteditable="" spellcheck="false" style="margin-bottom:14px;">' + applyEdit('subtitle', 'Neural network trained to automatically classify every defect type.', savedEdits) + '</p>',
    '  </header>',
    '  <div class="slide-body">',
    '',
    '  <!-- ── Defect type selector (acts as tabs) ── -->',
    '  <div class="s6-selector anim-in" id="s6-selector">',
    selectorHtml,
    '  </div>',
    '',
    '  <!-- ── Default carousel (shown when no defect is selected) ── -->',
    '  <div class="ls-carousel s6-car-wrap" id="s6CarWrap" data-counter="" data-edit="s6-default-carousel" data-track="s6:carousel:default" data-autoplay="5000" data-zoom-group="" style="flex:1;min-height:0;width:100%;max-width:960px;margin-top:12px;">',
    (savedEdits['s6-default-carousel'] != null ? savedEdits['s6-default-carousel'] : defaultCarouselHtml),
    '  </div>',
    '',
    '  <!-- ── Scratches ── -->',
    '  <div class="ls-carousel s6-defect-car" data-zoom-group="" id="s6-car-scratches" data-counter="" data-edit="s6-defect-scratches" data-track="s6:carousel:scratches" data-zoom-group="" style="display:none;flex:1;min-height:0;width:100%;max-width:960px;margin-top:12px;">',
    (savedEdits['s6-defect-scratches'] != null ? savedEdits['s6-defect-scratches'] : defaultScratchesHtml),
    '  </div>',
    '',
    '  <!-- ── Inclusions ── -->',
    '  <div class="ls-carousel s6-defect-car" data-zoom-group="" id="s6-car-inclusions" data-counter="" data-edit="s6-defect-inclusions" data-track="s6:carousel:inclusions" style="display:none;flex:1;min-height:0;width:100%;max-width:960px;margin-top:12px;" data-autoplay="15000">',
    (savedEdits['s6-defect-inclusions'] != null ? savedEdits['s6-defect-inclusions'] : defaultInclusionsHtml),
    '  </div>',
    '',
    '  <!-- ── Dirt ── -->',
    '  <div class="ls-carousel s6-defect-car" data-zoom-group="" id="s6-car-dirt" data-counter="" data-edit="s6-defect-dirt" data-track="s6:carousel:dirt" style="display:none;flex:1;min-height:0;width:100%;max-width:960px;margin-top:12px;">',
    (savedEdits['s6-defect-dirt'] != null ? savedEdits['s6-defect-dirt'] : defaultDirtHtml),
    '  </div>',
    '',
    '  <!-- ── Dust ── -->',
    '  <div class="ls-carousel s6-defect-car" data-zoom-group="" id="s6-car-dust" data-counter="" data-edit="s6-defect-dust" data-track="s6:carousel:dust" style="display:none;flex:1;min-height:0;width:100%;max-width:960px;margin-top:12px;">',
    (savedEdits['s6-defect-dust'] != null ? savedEdits['s6-defect-dust'] : defaultDustHtml),
    '  </div>',
    '',
    '  <!-- ── Water ── -->',
    '  <div class="ls-carousel s6-defect-car" data-zoom-group="" id="s6-car-water" data-counter="" data-edit="s6-defect-water" data-track="s6:carousel:water" style="display:none;flex:1;min-height:0;width:100%;max-width:960px;margin-top:12px;">',
    (savedEdits['s6-defect-water'] != null ? savedEdits['s6-defect-water'] : defaultWaterHtml),
    '  </div>',
    '',
    '  <!-- ── Fingerprints ── -->',
    '  <div class="ls-carousel s6-defect-car" data-zoom-group="" id="s6-car-fingerprints" data-counter="" data-edit="s6-defect-fingerprints" data-track="s6:carousel:fingerprints" style="display:none;flex:1;min-height:0;width:100%;max-width:960px;margin-top:12px;">',
    (savedEdits['s6-defect-fingerprints'] != null ? savedEdits['s6-defect-fingerprints'] : defaultFingerprintsHtml),
    '  </div>',
    '',
    '  <!-- ── Ignore ── -->',
    '  <div class="ls-carousel s6-defect-car" data-zoom-group="" id="s6-car-ignore" data-counter="" data-edit="s6-defect-ignore" data-track="s6:carousel:ignore" style="display:none;flex:1;min-height:0;width:100%;max-width:960px;margin-top:12px;">',
    (savedEdits['s6-defect-ignore'] != null ? savedEdits['s6-defect-ignore'] : defaultIgnoreHtml),
    '  </div>',
    '',
    '  <!-- ── Edge defects ── -->',
    '  <div class="ls-carousel s6-defect-car" data-zoom-group="" id="s6-car-edge-defects" data-counter="" data-edit="s6-defect-edge-defects" data-track="s6:carousel:edge-defects" style="display:none;flex:1;min-height:0;width:100%;max-width:960px;margin-top:12px;">',
    (savedEdits['s6-defect-edge-defects'] != null ? savedEdits['s6-defect-edge-defects'] : defaultEdgeDefectsHtml),
    '  </div>',
    '',
    '  <!-- ── Frame & bars ── -->',
    '  <div class="ls-carousel s6-defect-car" data-zoom-group="" id="s6-car-frame-bars" data-counter="" data-edit="s6-defect-frame-bars" data-track="s6:carousel:frame-bars" style="display:none;flex:1;min-height:0;width:100%;max-width:960px;margin-top:12px;">',
    (savedEdits['s6-defect-frame-bars'] != null ? savedEdits['s6-defect-frame-bars'] : defaultFrameBarsHtml),
    '  </div>',
    '',
    '  <!-- ── Undefined ── -->',
    '  <div class="ls-carousel s6-defect-car" data-zoom-group="" id="s6-car-undefined" data-counter="" data-edit="s6-defect-undefined" data-track="s6:carousel:undefined" style="display:none;flex:1;min-height:0;width:100%;max-width:960px;margin-top:12px;">',
    (savedEdits['s6-defect-undefined'] != null ? savedEdits['s6-defect-undefined'] : defaultUndefinedHtml),
    '  </div>',
    '',
    '  <!-- ── Coating ── -->',
    '  <div class="ls-carousel s6-defect-car" data-zoom-group="" id="s6-car-coating" data-counter="" data-edit="s6-defect-coating" data-track="s6:carousel:coating" style="display:none;flex:1;min-height:0;width:100%;max-width:960px;margin-top:12px;">',
    (savedEdits['s6-defect-coating'] != null ? savedEdits['s6-defect-coating'] : defaultCoatingHtml),
    '  </div>',
    '',
  ].concat(extraDefs.map(function(d, i) {
    var carId = 's6-car-custom-' + i;
    var editKey = 's6-defect-custom-' + i;
    return [
      '  <!-- ── Custom ' + (i + 1) + ' ── -->',
      '  <div class="ls-carousel s6-defect-car" data-zoom-group="" id="' + carId + '" data-counter="" data-edit="' + editKey + '" style="display:none;flex:1;min-height:0;width:100%;max-width:960px;margin-top:12px;">',
      (savedEdits[editKey] != null ? savedEdits[editKey] : '<div class="ls-carousel-track"></div>'),
      '  </div>',
    ].join('\n');
  })).concat([
    '  </div><!-- slide-body -->',
    '  </div><!-- slide-layout -->',
    '',
    '  <!-- ── Scoped Styles ── -->',
    '  <style>',
    '    .s6 {  }',
    '',
    '    /* ── Selector strip ── */',
    '    .s6-selector {',
    '      display: flex; gap: 6px; flex-wrap: wrap; justify-content: center;',
    '      width: 100%; max-width: 960px; flex-shrink: 0;',
    '    }',
    '    .s6-defect-btn {',
    '      display: flex; flex-direction: column; align-items: center; gap: 5px;',
    '      padding: 8px 10px; border-radius: 12px; cursor: pointer;',
    '      background: var(--bg-card); border: 1px solid var(--border);',
    '      transition: all .2s; min-width: 76px; font-family: inherit;',
    '    }',
    '    .s6-defect-btn:hover { border-color: rgba(232,113,26,.4); background: var(--bg-card-hover); }',
    '    .s6-defect-btn.active {',
    '      border-color: #E8711A; background: rgba(232,113,26,.12);',
    '      box-shadow: 0 0 0 1px rgba(232,113,26,.25);',
    '    }',
    '    .s6-defect-btn span {',
    '      font-size: 10px; font-weight: 600; letter-spacing: .03em;',
    '      color: var(--text-muted); white-space: nowrap; transition: color .2s;',
    '    }',
    '    .s6-defect-btn.active span { color: #E8711A; }',
    '',
    '    /* ── Sprite icon ── */',
    '    .s6-icon {',
    '      width: 40px; height: 40px; border-radius: 8px; flex-shrink: 0;',
    '      background-image: url(\'/slides/uploads/Defect-Icons-from-top-to-buttom-Scratches-Inclusions-dirt-dust-water-fingerprints-ignore-edge-defects-dirt-on-fram-and-bars-undefined.png\');',
    '      background-size: 200% 1000%; background-repeat: no-repeat;',
    '      transition: background-position .15s;',
    '    }',
    '    .s6-emoji-icon {',
    '      width: 40px; height: 40px; border-radius: 8px; flex-shrink: 0;',
    '      display: flex; align-items: center; justify-content: center;',
    '      font-size: 20px; font-weight: 900; color: #000;',
    '      background: #F5D800; border: none; transition: background .15s;',
    '    }',
    '    .s6-defect-btn.active .s6-emoji-icon { background: #D42B2B; }',
    '',
    '    /* ── Builder add/delete controls ── */',
    '    .s6-btn-del {',
    '      position:absolute; top:-6px; right:-6px;',
    '      width:16px; height:16px; border-radius:50%;',
    '      background:rgba(200,50,50,.8); color:#fff;',
    '      font-size:10px; line-height:16px; text-align:center;',
    '      cursor:pointer; display:none; user-select:none;',
    '    }',
    '    .s6-defect-btn:hover .s6-btn-del { display:block; }',
    '    .s6-defect-btn { position:relative; }',
    '    .s6-btn-add {',
    '      display:flex; flex-direction:column; align-items:center; justify-content:center;',
    '      padding:8px 10px; border-radius:12px; cursor:pointer; min-width:76px;',
    '      background:rgba(var(--accent-rgb),.08); border:1px dashed rgba(var(--accent-rgb),.4);',
    '      color:var(--accent); font-size:11px; font-weight:600; font-family:inherit;',
    '      transition:all .2s;',
    '    }',
    '    .s6-btn-add:hover { background:rgba(var(--accent-rgb),.15); border-color:rgba(var(--accent-rgb),.7); }',
    '',
    '    /* ── Mobile base ── */',
    '    .s6 .slide-body { width: 100%; align-items: center; }',
    '    .s6 .ls-carousel { min-height: 260px !important; height: 260px !important; }',
    '    .s6-defect-btn { min-width:60px; padding:6px; }',
    '    .s6-defect-btn span { font-size:11px; }',
    '    .s6 { padding: 52px 16px 80px !important; }',
    '',
    '    /* ── Desktop overrides ── */',
    '    @media(min-width:769px) {',
    '      .s6 .ls-carousel { min-height: 0 !important; height: 100% !important; }',
    '      .s6-defect-btn { min-width:76px; padding:8px 10px; }',
    '      .s6-defect-btn span { font-size:10px; }',
    '      .s6 { padding: 52px 80px 0 !important; }',
    '    }',
    '  <\/style>',
    '',
    '  <!-- ── Scoped Script ── -->',
    '  <script>',
    '  (function () {',
    '',
    '    var DEFECTS = ' + JSON.stringify(allDefs.map(function(d) {
      return { name: d.name, row: d.row != null ? d.row : -1, icon: d.icon || null, carId: d.carId };
    })) + ';',
    '',
    '    var currentDefect = -1;',
    '    var selector = document.getElementById(\'s6-selector\');',
    '    var carWrap  = document.getElementById(\'s6CarWrap\');',
    '',
    '    function setIconPos(icon, row, active) {',
    '      icon.style.backgroundPosition = (active ? \'100%\' : \'0%\') + \' \' + (row / 9 * 100).toFixed(2) + \'%\';',
    '    }',
    '',
    '    function updateBtns() {',
    '      selector.querySelectorAll(\'.s6-defect-btn\').forEach(function (btn, i) {',
    '        var active = i === currentDefect;',
    '        btn.classList.toggle(\'active\', active);',
    '        var spriteIcon = btn.querySelector(\'.s6-icon\');',
    '        if (spriteIcon) setIconPos(spriteIcon, DEFECTS[i].row, active);',
    '      });',
    '    }',
    '',
    '    function showDefault() {',
    '      if (currentDefect >= 0) document.getElementById(DEFECTS[currentDefect].carId).style.display = \'none\';',
    '      currentDefect = -1;',
    '      carWrap.style.display = \'\';',
    '      if (window.Carousel) Carousel.init(carWrap);',
    '      if (window.Lightbox) Lightbox.init(carWrap);',
    '      updateBtns();',
    '    }',
    '',
    '    function showDefect(idx) {',
    '      if (currentDefect === idx) { showDefault(); return; }',
    '      if (currentDefect >= 0) document.getElementById(DEFECTS[currentDefect].carId).style.display = \'none\';',
    '      currentDefect = idx;',
    '      carWrap.style.display = \'none\';',
    '      var car = document.getElementById(DEFECTS[idx].carId);',
    '      car.style.display = \'\';',
    '      if (car._lsGoTo) car._lsGoTo(0);',
    '      requestAnimationFrame(function() { requestAnimationFrame(function() {',
    '        if (window.Carousel) (Carousel.forceInit || function(el){ Carousel.init(el && el.parentElement); })(car);',
    '        if (window.Lightbox) Lightbox.init(car);',
    '      }); });',
    '      updateBtns();',
    '    }',
    '',
    '    // Attach handlers to pre-rendered buttons (labels are already in the HTML).',
    '    Array.from(selector.querySelectorAll(\'.s6-defect-btn\')).forEach(function (btn, i) {',
    '      var iconEl = btn.querySelector(\'.s6-icon\');',
    '      if (iconEl && DEFECTS[i]) setIconPos(iconEl, DEFECTS[i].row, false);',
    '      btn.addEventListener(\'click\', function () {',
    '        showDefect(i);',
    '        if (window.Track) {',
    '          var lbl = btn.querySelector(\'.s6-defect-label\');',
    '          Track.click(Track.slideId(btn), lbl ? lbl.textContent.trim() : (DEFECTS[i] ? DEFECTS[i].name : \'\'));',
    '        }',
    '      });',
    '    });',
    '',
    '    showDefault();',
    '',
    '    // ── Builder: add/delete defect type buttons ──',
    '    (function() {',
    '      var builderBase = ' + DEFECT_DEFS.length + ';',
    '      var slideEl = selector.closest(\'.slide\');',
    '      var slideId = slideEl ? slideEl.dataset.slide : null;',
    '',
    '      function getExtraDefs() {',
    '        try { return JSON.parse(selector.dataset.extraDefs || \'[]\'); } catch(e) { return []; }',
    '      }',
    '      function saveExtraDefs(list) {',
    '        selector.dataset.extraDefs = JSON.stringify(list);',
    '        document.dispatchEvent(new CustomEvent(\'slide-carousel-save\', {',
    '          detail: { editKey: \'s6-extra-defs\', html: JSON.stringify(list) }',
    '        }));',
    '      }',
    '',
    '      // Seed data attribute from server-rendered extra defs',
    '      selector.dataset.extraDefs = JSON.stringify(' + JSON.stringify(extraDefs) + ');',
    '',
    '      // Delete handler',
    '      selector.addEventListener(\'click\', function(e) {',
    '        var del = e.target.closest(\'.s6-btn-del\');',
    '        if (!del) return;',
    '        e.stopImmediatePropagation();',
    '        var btn = del.closest(\'.s6-defect-btn\');',
    '        var idx = parseInt(btn.dataset.defectIdx);',
    '        if (idx < builderBase) { alert(\'Cannot delete built-in defect types.\'); return; }',
    '        var customIdx = idx - builderBase;',
    '        var car = document.getElementById(\'s6-car-custom-\' + customIdx);',
    '        if (car) car.remove();',
    '        btn.remove();',
    '        // Update indices on remaining custom buttons',
    '        Array.from(selector.querySelectorAll(\'.s6-defect-btn\')).forEach(function(b, ni) {',
    '          b.dataset.defectIdx = ni;',
    '        });',
    '        DEFECTS.splice(idx, 1);',
    '        currentDefect = -1;',
    '        carWrap.style.display = \'\';',
    '        var extras = getExtraDefs();',
    '        extras.splice(customIdx, 1);',
    '        saveExtraDefs(extras);',
    '      });',
    '',
    '      // Add handler',
    '      var addBtn = selector.querySelector(\'.s6-btn-add\');',
    '      if (addBtn) addBtn.addEventListener(\'click\', function() {',
    '        var name = prompt(\'Name for new defect type:\', \'Custom\');',
    '        if (!name) return;',
    '        var extras = getExtraDefs();',
    '        var customIdx = extras.length;',
    '        var carId = \'s6-car-custom-\' + customIdx;',
    '        var editKey = \'s6-defect-custom-\' + customIdx;',
    '        extras.push({ name: name });',
    '        DEFECTS.push({ name: name, row: -1, icon: \'?\', carId: carId });',
    '        // Create button',
    '        var totalIdx = DEFECTS.length - 1;',
    '        var newBtn = document.createElement(\'button\');',
    '        newBtn.className = \'s6-defect-btn\';',
    '        newBtn.dataset.defectIdx = totalIdx;',
    '        newBtn.innerHTML = \'<div class="s6-emoji-icon">?</div><span class="s6-defect-label" contenteditable="" spellcheck="false">\' + name + \'</span><span class="s6-btn-del" data-builder-only="" title="Remove this type">×</span>\';',
    '        newBtn.addEventListener(\'click\', function() { showDefect(totalIdx); });',
    '        selector.insertBefore(newBtn, addBtn);',
    '        // Create carousel',
    '        var newCar = document.createElement(\'div\');',
    '        newCar.className = \'ls-carousel s6-defect-car\';',
    '        newCar.id = carId;',
    '        newCar.dataset.counter = \'\';',
    '        newCar.dataset.edit = editKey;',
    '        newCar.style.cssText = \'display:none;flex:1;min-height:0;width:100%;max-width:960px;margin-top:12px;\';',
    '        newCar.innerHTML = \'<div class="ls-carousel-track"></div>\';',
    '        carWrap.parentNode.insertBefore(newCar, carWrap.nextSibling);',
    '        saveExtraDefs(extras);',
    '      });',
    '    })();',
    '',
    '  })();',
    '  <\/script>',
    '',
    '  <script>',
    '  (function () { var s = document.currentScript;',
    '    setTimeout(function () { if (window.PE && s) PE.initSlide(s.closest(\'.slide\')); }, 0); })();',
    '  <\/script>',
    '</div>'
  ]).join('\n');
}

function renderCarouselCardsLayout(slideId, savedEdits) {
  savedEdits = savedEdits || {};

  function applyEdit(key, defaultText, edits) {
    return edits[key] != null ? edits[key] : defaultText;
  }

  var defaultCarouselHtml = [
    '<div class="ls-carousel-track" style="transform: translateX(0px);">',
    '    <div class="ls-carousel-slide">',
    '      <img src="/slides/uploads/Screenshot Scanned Piece of glass with cutouts and a shape and defects.png" alt="Dimensional control — automotive glass shapes" data-zoom="" data-track="ls7:zoom:dimensional-control">',
    '    </div>',
    '    <div class="ls-carousel-slide">',
    '      <img src="/slides/uploads/Dimension control screenshot drillhole alignment.jpg" alt="Drillhole alignment — dimensional control" data-zoom="" data-track="ls7:zoom:drillhole-alignment">',
    '    </div>',
    '    <div class="ls-carousel-slide">',
    '      <img src="/slides/uploads/Dimension control screenshot shape piece of glass with and scratch and a inclusion.jpg" alt="Dimensional control — scratch and inclusion detected" data-zoom="" data-track="ls7:zoom:scratch-inclusion">',
    '    </div>',
    '    <div class="ls-carousel-slide">',
    '      <img src="/slides/uploads/Dimension control Cutouts Drillholes and a Door.jpg" alt="Dimensional control — cutouts, drillholes and door" data-zoom="" data-track="ls7:zoom:cutouts-drillholes">',
    '    </div>',
    '  </div>'
  ].join('\n');

  return [
    '<div class="slide content ls7" data-slide="' + slideId + '">',
    '  <div class="slide-logo-row"><img src="/slides/shared/LOGO SoftSolution grays.png" alt="Softsolution"><span class="slide-logo-sep"></span><img src="/slides/shared/LOGO LiteSentry Greys.png" alt="LiteSentry" class="slide-logo-ls"></div>',
    '',
    '  <div class="slide-layout">',
    '    <header class="slide-head">',
    '      <div class="section-label" data-edit="section-label" contenteditable="" spellcheck="false">' + applyEdit('section-label', 'Dimensional Control', savedEdits) + '</div>',
    '      <h1 class="slide-title" data-edit="headline" contenteditable="" spellcheck="false" style="margin-bottom:14px;">' + applyEdit('headline', 'Precise measurement of <span class="blue">dimensions and cutouts</span>', savedEdits) + '</h1>',
    '    </header>',
    '',
    '    <div class="slide-body">',
    '      <div class="ls-carousel anim-in" data-edit="carousel" data-counter="" data-track="ls7:carousel" data-zoom-group="" style="flex:1;min-height:0;width:100%;max-width:860px;">',
    (savedEdits['carousel'] != null ? savedEdits['carousel'] : defaultCarouselHtml),
    '      </div>',
    '',
    '      <div class="ls7-cards anim-in">',
    '        <div class="col-card">',
    '          <div class="col-label" data-edit="card-header-1" contenteditable="" spellcheck="false">' + applyEdit('card-header-1', 'What is measured?', savedEdits) + '</div>',
    '          <div class="col-list">',
    '            <div class="col-item" data-edit="dim-item-1" contenteditable="" spellcheck="false">' + applyEdit('dim-item-1', '<strong>Overall dimensions</strong> of the glass', savedEdits) + '</div>',
    '            <div class="col-item" data-edit="dim-item-2" contenteditable="" spellcheck="false">' + applyEdit('dim-item-2', '<strong>Position and size</strong> of drill holes', savedEdits) + '</div>',
    '            <div class="col-item" data-edit="dim-item-3" contenteditable="" spellcheck="false">' + applyEdit('dim-item-3', '<strong>Cutouts and notches</strong>', savedEdits) + '</div>',
    '            <div class="col-item" data-edit="dim-item-4" contenteditable="" spellcheck="false">' + applyEdit('dim-item-4', '<strong>Angles and parallelism</strong> of edges', savedEdits) + '</div>',
    '            <div class="col-item" data-edit="dim-item-5" contenteditable="" spellcheck="false">' + applyEdit('dim-item-5', '<strong>Rotation and position</strong> on line', savedEdits) + '</div>',
    '          </div>',
    '        </div>',
    '        <div class="col-card">',
    '          <div class="col-label" data-edit="card-header-2" contenteditable="" spellcheck="false">' + applyEdit('card-header-2', 'Setup &amp; tolerances', savedEdits) + '</div>',
    '          <div class="col-list">',
    '            <div class="col-item" data-edit="dim-item-6" contenteditable="" spellcheck="false">' + applyEdit('dim-item-6', 'Compatible with <strong class="ls7-trigger" onclick="ls7OpenTolerances()">individual tolerances per measurement \u2197</strong>', savedEdits) + '</div>',
    '            <div class="col-item" data-edit="dim-item-7" contenteditable="" spellcheck="false">' + applyEdit('dim-item-7', '<strong>DXF</strong> model import', savedEdits) + '</div>',
    '            <div class="col-item" data-edit="dim-item-8" contenteditable="" spellcheck="false">' + applyEdit('dim-item-8', '<strong>2-step</strong> verification: global + detail', savedEdits) + '</div>',
    '            <div class="col-item" data-edit="dim-item-9" contenteditable="" spellcheck="false">' + applyEdit('dim-item-9', 'Compatible with <strong class="ls7-trigger" onclick="ls7OpenConveyor()" data-umami-event="conveyor-gallery-open">belt conveyors \u2197</strong>', savedEdits) + '</div>',
    '            <div class="col-item" data-edit="dim-item-10" contenteditable="" spellcheck="false">' + applyEdit('dim-item-10', 'Parallel light for <strong>maximum precision</strong>', savedEdits) + '</div>',
    '          </div>',
    '        </div>',
    '      </div>',
    '    </div>',
    '  </div>',
    '',
    '  <style>',
    '    .ls7 { }',
    '    .ls7 .slide-body { width: 100%; align-items: center; }',
    '',
    '    /* Mobile: carousel needs explicit height */',
    '    .ls7 .ls-carousel { min-height: 260px !important; height: 260px !important; }',
    '    .ls7 { padding: 52px 16px 80px !important; }',
    '',
    '    /* ── Info cards ── */',
    '    .ls7-cards {',
    '      flex-shrink: 0;',
    '      display: grid; grid-template-columns: 1fr; gap: 14px;',
    '      width: 100%; max-width: 860px;',
    '      margin-top: 12px;',
    '    }',
    '',
    '    /* ── Desktop overrides ── */',
    '    @media(min-width:769px) {',
    '      .ls7 .ls-carousel { min-height: 0 !important; height: 100% !important; }',
    '      .ls7-cards { grid-template-columns: 1fr 1fr; }',
    '      .ls7 { padding: 52px 80px 0 !important; }',
    '    }',
    '',
    '    /* ── Clickable text trigger ── */',
    '    .ls7-trigger {',
    '      cursor: pointer; color: #E8711A;',
    '      border-bottom: 1px dashed rgba(232,113,26,.4);',
    '      transition: border-color .2s;',
    '    }',
    '    .ls7-trigger:hover { border-bottom-color: #E8711A; }',
    '  </style>',
    '',
    '  <script>',
    '  window.ls7OpenTolerances = function () { return; // migrated',
    '  };',
    '  window.ls7OpenConveyor = function () { return; // migrated',
    '  };',
    '  <\/script>',
    '',
    '  <script>',
    '  (function () { var s = document.currentScript;',
    '    setTimeout(function () { if (window.PE && s) PE.initSlide(s.closest(\'.slide\')); }, 0); })();',
    '  <\/script>',
    '</div>'
  ].join('\n');
}

function renderChecklistCarouselLayout(slideId, savedEdits) {
  savedEdits = savedEdits || {};

  var defaultCarouselHtml = [
    '<div class="ls-carousel-track" style="transform: translateX(0px);">',
    '    <div class="ls-carousel-slide">',
    '      <img src="/slides/uploads/Slide35.jpg" alt="Slide35" data-zoom="">',
    '    </div><div class="ls-carousel-slide">',
    '      <img src="/slides/uploads/image82.png" alt="Pinhole detection on printed glass" data-zoom="" data-track="ls8:zoom:pinhole-detection">',
    '    </div>',
    '    <div class="ls-carousel-slide">',
    '      <img src="/slides/uploads/image83.png" alt="Logo position check" data-zoom="" data-track="ls8:zoom:logo-position-check">',
    '    </div>',
    '  </div>'
  ].join('\n');

  return [
    '<div class="slide content ls8" data-slide="' + slideId + '">',
    '  <div class="slide-logo-row"><img src="/slides/shared/LOGO SoftSolution grays.png" alt="Softsolution"><span class="slide-logo-sep"></span><img src="/slides/shared/LOGO LiteSentry Greys.png" alt="LiteSentry" class="slide-logo-ls"></div>',
    '',
    '  <div class="slide-layout">',
    '  <header class="slide-head">',
    '    <div class="section-label" data-edit="section-label" contenteditable="" spellcheck="false">' + applyEdit('section-label', 'Screen Printing', savedEdits) + '</div>',
    '    <h1 class="slide-title" data-edit="headline" contenteditable="" spellcheck="false" style="margin-bottom:8px;">' + applyEdit('headline', 'Automatic quality control for <span class="blue">screen-printed glass</span>', savedEdits) + '</h1>',
    '    <p class="slide-subtitle" data-edit="subtitle" contenteditable="" spellcheck="false" style="margin-bottom:16px;">' + applyEdit('subtitle', 'The quality inspection of logos and screen printing is now standard \u2014 fully automated, 100% of the time.', savedEdits) + '</p>',
    '  </header>',
    '  <div class="slide-body">',
    '  <div class="ls8-layout">',
    '',
    '    <div class="col-card">',
    '      <div class="col-label" data-edit="col-label" contenteditable="" spellcheck="false">' + applyEdit('col-label', 'What LineScanner checks', savedEdits) + '</div>',
    '      <div class="col-list">',
    '        <div class="col-item" data-edit="col-item-1" contenteditable="" spellcheck="false">' + applyEdit('col-item-1', '<strong>Correct position</strong> of screen printing', savedEdits) + '</div>',
    '        <div class="col-item" data-edit="col-item-2" contenteditable="" spellcheck="false">' + applyEdit('col-item-2', '<strong>Missing parts</strong> within a logo', savedEdits) + '</div>',
    '        <div class="col-item" data-edit="col-item-3" contenteditable="" spellcheck="false">' + applyEdit('col-item-3', '<strong>Print thickness</strong> consistency', savedEdits) + '</div>',
    '        <div class="col-item" data-edit="col-item-4" contenteditable="" spellcheck="false">' + applyEdit('col-item-4', '<strong>Detail errors</strong> in graphics', savedEdits) + '</div>',
    '        <div class="col-item" data-edit="col-item-5" contenteditable="" spellcheck="false">' + applyEdit('col-item-5', '<strong>Screen printing errors</strong> &amp; defects', savedEdits) + '</div>',
    '        <div class="col-item" data-edit="col-item-6" contenteditable="" spellcheck="false">' + applyEdit('col-item-6', '<strong>Logo position &amp; rotation</strong>', savedEdits) + '</div>',
    '      </div>',
    '    </div>',
    '',
    '    <div class="ls-carousel anim-in" data-edit="carousel" data-counter="" data-track="ls8:carousel" data-zoom-group="" style="width:100%;flex:1;min-height:0;">',
    (savedEdits['carousel'] != null ? savedEdits['carousel'] : defaultCarouselHtml),
    '    </div>',
    '',
    '  </div>',
    '  </div><!-- slide-body -->',
    '  </div><!-- slide-layout -->',
    '',
    '  <style>',
    '    .ls8 { }',
    '    .ls8 .slide-body { width: 100%; align-items: center; }',
    '',
    '    /* Mobile: stack vertically, carousel gets a fixed height */',
    '    .ls8-layout {',
    '      display: flex; flex-direction: column;',
    '      gap: 20px;',
    '      width: 100%; max-width: 960px;',
    '      margin-top: 4px;',
    '    }',
    '    .ls8-layout .col-card { flex-shrink: 0; }',
    '    .ls8-layout .col-item { white-space: normal; }',
    '    .ls8 { padding: 52px 16px 80px !important; }',
    '    .ls8-layout .ls-carousel { min-height: 260px !important; height: 260px !important; }',
    '',
    '    /* Desktop: side by side, carousel fills remaining space */',
    '    @media (min-width: 769px) {',
    '      .ls8-layout { flex-direction: row; flex: 1; min-height: 0; align-items: stretch; }',
    '      .ls8-layout .col-item { white-space: nowrap; }',
    '      .ls8 { padding: 52px 80px 0 !important; }',
    '      .ls8-layout .ls-carousel { flex: 1 !important; width: auto !important; min-height: 0; height: 100% !important; }',
    '    }',
    '  <\/style>',
    '',
    '  <script>',
    '  (function () { var s = document.currentScript;',
    '    setTimeout(function () { if (window.PE && s) PE.initSlide(s.closest(\'.slide\')); }, 0); })();',
    '  <\/script>',
    '</div>'
  ].join('\n');
}

function renderCarouselTagsLayout(slideId, savedEdits) {
  savedEdits = savedEdits || {};

  function applyEdit(key, defaultVal, edits) {
    return edits[key] != null ? edits[key] : defaultVal;
  }

  var defaultCarouselHtml = [
    '<div class="ls-carousel-track" style="transform: translateX(0px);">',
    '    <div class="ls-carousel-slide">',
    '      <img src="/slides/uploads/image89.png" alt="Screen printing overview" data-zoom="">',
    '    </div>',
    '    <div class="ls-carousel-slide">',
    '      <img src="/slides/uploads/image90.png" alt="Distortion" data-zoom="">',
    '    </div>',
    '    <div class="ls-carousel-slide">',
    '      <img src="/slides/uploads/image91.png" alt="Rotation" data-zoom="">',
    '    </div>',
    '    <div class="ls-carousel-slide">',
    '      <img src="/slides/uploads/image92.png" alt="Out of position" data-zoom="">',
    '    </div>',
    '    <div class="ls-carousel-slide">',
    '      <img src="/slides/uploads/image96.png" alt="Filled items" data-zoom="">',
    '    </div>',
    '  </div>'
  ].join('\n');

  var TAG_DEFS = [
    { key: 'tag-1', cls: 'tag error', defaultVal: '&#10060; Missing print'           },
    { key: 'tag-2', cls: 'tag error', defaultVal: '&#128208; Distortion'              },
    { key: 'tag-3', cls: 'tag warn',  defaultVal: '&#128161; Shiny ink'               },
    { key: 'tag-4', cls: 'tag warn',  defaultVal: '&#128260; Rotation'                },
    { key: 'tag-5', cls: 'tag error', defaultVal: '&#128205; Out of position'         },
    { key: 'tag-6', cls: 'tag',       defaultVal: '&#11035; &quot;Filled&quot; items' },
  ];

  var tagButtons = TAG_DEFS.map(function(t, i) {
    var n = i + 1;
    var val = applyEdit(t.key, t.defaultVal, savedEdits);
    return '          <span class="' + t.cls + ' ls9-tag" data-tag-idx="' + n + '" data-edit="' + t.key + '" contenteditable="" spellcheck="false">' + val + '</span>';
  }).join('\n');

  var tagCarousels = TAG_DEFS.map(function(t, i) {
    var n = i + 1;
    var editKey = 'tag-img-' + n;
    var saved = savedEdits[editKey];
    var hasSlides = saved && /src="\/slides\/[^"]+\.(jpg|jpeg|png|gif|webp|svg|avif)"/i.test(saved);
    var trackHtml = saved != null ? saved : '<div class="ls-carousel-track"></div>';
    var hasAttr = hasSlides ? ' data-has-slides=""' : '';
    return [
      '  <!-- Tag ' + n + ' image -->',
      '  <div class="ls-carousel ls9-tag-car" id="ls9-tag-car-' + n + '" data-counter="" data-edit="' + editKey + '" data-zoom-group=""' + hasAttr + ' style="display:none;flex:1;min-height:0;width:100%;max-width:860px;">',
      trackHtml,
      '  <div class="ls9-empty" data-builder-only="">&#43; Add images via the button below</div>',
      '  </div>',
    ].join('\n');
  }).join('\n');

  return [
    '<div class="slide content ls9" data-slide="' + slideId + '">',
    '  <div class="slide-logo-row"><img src="/slides/shared/LOGO SoftSolution grays.png" alt="Softsolution"><span class="slide-logo-sep"></span><img src="/slides/shared/LOGO LiteSentry Greys.png" alt="LiteSentry" class="slide-logo-ls"></div>',
    '  <div class="slide-layout">',
    '    <header class="slide-head">',
    '      <div class="section-label" data-edit="section-label" contenteditable="" spellcheck="false">' + applyEdit('section-label', 'Screen Printing &amp; Logo', savedEdits) + '</div>',
    '      <h1 class="slide-title" data-edit="headline" contenteditable="" spellcheck="false" style="margin-bottom:14px;">' + applyEdit('headline', 'Position and <span class=\"blue\">print quality control</span>', savedEdits) + '</h1>',
    '    </header>',
    '    <div class="slide-body">',
    '      <div class="ls-carousel anim-in" id="ls9-carousel" data-edit="carousel" data-counter="" data-zoom-group="" style="flex:1;min-height:0;width:100%;max-width:860px;">',
    (savedEdits['carousel'] != null ? savedEdits['carousel'] : defaultCarouselHtml),
    '      </div>',
    tagCarousels,
    '      <div class="ls9-info anim-in" style="">',
    '        <div class="tag-grid" style="justify-content:center;">',
    tagButtons,
    '        </div>',
    '      </div>',
    '    </div>',
    '  </div>',
    '  <style>',
    '    .ls9 .slide-body { width: 100%; align-items: center; }',
    '    .ls9 .ls-carousel { min-height: 260px !important; height: 260px !important; }',
    '    .ls9 { padding: 52px 16px 80px !important; }',
    '    @media (min-width: 769px) {',
    '      .ls9 .ls-carousel { min-height: 0 !important; height: 100% !important; }',
    '      .ls9 { padding: 52px 80px 0 !important; }',
    '    }',
    '    .ls9-info { flex-shrink: 0; width: 100%; max-width: 860px; margin-top: 10px; }',
    '    .ls9-tag { cursor: pointer; transition: all .2s; }',
    '    .ls9-tag:hover { outline: 1px solid rgba(232,113,26,.5); }',
    '    .ls9-tag.active { outline: 2px solid #E8711A; opacity: 1 !important; }',
    '    .ls9-tag-car { position: relative; }',
    '    .ls9-tag-car:not([data-has-slides]) {',
    '      display: flex !important; flex-direction: column;',
    '      align-items: center; justify-content: center; min-height: 300px !important; }',
    '    .ls9-tag-car:not([data-has-slides]) .ls-carousel-track { display: none !important; }',
    '    .ls9-empty {',
    '      display: none; padding: 28px 32px; border: 1.5px dashed rgba(232,113,26,.45);',
    '      border-radius: 13px; color: rgba(232,113,26,.7); font-size: 15px;',
    '      font-weight: 600; pointer-events: none; text-align: center; }',
    '    .ls9-tag-car:not([data-has-slides]) .ls9-empty { display: block !important; }',
    '    .ls9-tag-car:not([data-has-slides]) .ls-carousel-prev,',
    '    .ls9-tag-car:not([data-has-slides]) .ls-carousel-next,',
    '    .ls9-tag-car:not([data-has-slides]) .ls-carousel-counter { display: none !important; }',
    '  <\/style>',
    '  <script>',
    '  (function () {',
    '    var mainCar = document.getElementById(\'ls9-carousel\');',
    '    var currentTag = -1;',
    '    function showMain() {',
    '      if (currentTag > 0) {',
    '        var prev = document.getElementById(\'ls9-tag-car-\' + currentTag);',
    '        if (prev) prev.style.display = \'none\';',
    '      }',
    '      currentTag = -1;',
    '      mainCar.style.display = \'\';',
    '      if (window.Carousel) (Carousel.forceInit || function(el){ Carousel.init(el && el.parentElement); })(mainCar);',
    '      document.querySelectorAll(\'.ls9-tag\').forEach(function(t) { t.classList.remove(\'active\'); });',
    '    }',
    '    function showTag(n) {',
    '      if (currentTag === n) { showMain(); return; }',
    '      if (currentTag > 0) {',
    '        var prev = document.getElementById(\'ls9-tag-car-\' + currentTag);',
    '        if (prev) prev.style.display = \'none\';',
    '      }',
    '      currentTag = n;',
    '      mainCar.style.display = \'none\';',
    '      var car = document.getElementById(\'ls9-tag-car-\' + n);',
    '      if (car) {',
    '        car.style.display = \'block\';',
    '        requestAnimationFrame(function() { requestAnimationFrame(function() {',
    '          if (window.Carousel) (Carousel.forceInit || function(el){ Carousel.init(el && el.parentElement); })(car);',
    '          if (window.Lightbox) Lightbox.init(car);',
    '        }); });',
    '      }',
    '      document.querySelectorAll(\'.ls9-tag\').forEach(function(t) {',
    '        t.classList.toggle(\'active\', parseInt(t.dataset.tagIdx) === n);',
    '      });',
    '    }',
    '    document.addEventListener(\'slide-carousel-save\', function(e) {',
    '      var key = e.detail && e.detail.editKey;',
    '      if (!key || !key.startsWith(\'tag-img-\')) return;',
    '      var n = parseInt(key.replace(\'tag-img-\', \'\'), 10);',
    '      var car = document.getElementById(\'ls9-tag-car-\' + n);',
    '      if (!car) return;',
    '      var hasSlides = Array.from(car.querySelectorAll(\'.ls-carousel-slide img\')).some(function(img){',
    '        return img.src && img.src.indexOf(\'/slides/\') !== -1 && !/\\.(bmp|tiff?|ico)$/i.test(img.src);',
    '      });',
    '      if (hasSlides) car.setAttribute(\'data-has-slides\', \'\');',
    '      else car.removeAttribute(\'data-has-slides\');',
    '    });',
    '    setTimeout(function () {',
    '      document.querySelectorAll(\'.ls9-tag\').forEach(function (tag) {',
    '        tag.addEventListener(\'click\', function (e) {',
    '          e.stopPropagation();',
    '          showTag(parseInt(tag.dataset.tagIdx));',
    '          if (window.Track) Track.click(\'ls9\', tag.textContent.trim().toLowerCase().replace(/\\s+/g,\'-\'));',
    '        });',
    '      });',
    '      if (window.Carousel) (Carousel.forceInit || function(el){ Carousel.init(el && el.parentElement); })(mainCar);',
    '    }, 100);',
    '  })();',
    '  <\/script>',
    '  <script>',
    '  (function () { var s = document.currentScript;',
    '    setTimeout(function () { if (window.PE && s) PE.initSlide(s.closest(\'.slide\')); }, 0); })();',
    '  <\/script>',
    '</div>'
  ].join('\n');
}

function renderTabsCarouselLayout(slideId, savedEdits) {
  savedEdits = savedEdits || {};

  var defaultTabsHtml = [
    '    <div class="ls-tab-list">',
    '      <button class="ls-tab active" data-panel="0" data-edit="tab-archive" contenteditable="">Archive</button>',
    '      <button class="ls-tab" data-panel="1" data-edit="tab-console" contenteditable="">Management Console</button>',
    '    </div>',
    '    <div class="ls-tab-panels">',
    '',
    '      <!-- Panel 0: Archive -->',
    '      <div class="ls-tab-panel active" data-panel="0">',
    '        <div class="ls-carousel anim-in" data-counter="" data-edit="archive-carousel" data-track="ls10:carousel:archive" data-zoom-group="" style="flex: 1 1 0%; min-height: 0px; width: 100%;">',
    '          <div class="ls-carousel-track" style="transform: translateX(0px);">',
    '            <div class="ls-carousel-slide">',
    '              <img src="" alt="Archive — placeholder" data-zoom="" data-track="ls10:zoom:archive-1">',
    '              <div class="ls-carousel-caption">Archive — placeholder</div>',
    '            </div>',
    '          </div>',
    '        <div class="ls-carousel-counter"></div></div>',
    '        <div class="ls10-cards" data-ls-list="archive-cards">',
    '          <div class="col-card">',
    '            <div class="col-list">',
    '              <div class="col-item" data-edit="archive-item-1" contenteditable="" spellcheck="false"><strong>Full history</strong> — every inspected piece stored and searchable</div>',
    '              <div class="col-item" data-edit="archive-item-2" contenteditable="" spellcheck="false"><strong>Filter by date, line, or defect type</strong> — instant results</div>',
    '            </div>',
    '          </div>',
    '          <div class="col-card">',
    '            <div class="col-list">',
    '              <div class="col-item" data-edit="archive-item-3" contenteditable="" spellcheck="false"><strong>Export reports</strong> — PDF or CSV for quality audits</div>',
    '              <div class="col-item" data-edit="archive-item-4" contenteditable="" spellcheck="false"><strong>Image playback</strong> — review original scan images at any time</div>',
    '            </div>',
    '          </div>',
    '        </div>',
    '      </div>',
    '',
    '      <!-- Panel 1: Management Console -->',
    '      <div class="ls-tab-panel" data-panel="1">',
    '        <div class="ls-carousel anim-in" data-counter="" data-edit="carousel-console" data-track="ls10:carousel:console" data-zoom-group="" style="flex: 1 1 0%; min-height: 0px; width: 100%;">',
    '          <div class="ls-carousel-track" style="transform: translateX(0px);">',
    '            <div class="ls-carousel-slide">',
    '              <img src="/slides/uploads/image108.png" alt="Management Console — production dashboard" data-zoom="" data-track="ls10:zoom:console-dashboard" data-zoom-init="1">',
    '            <div class="ls-carousel-caption">Management Console — production dashboard</div></div>',
    '            <div class="ls-carousel-slide"><img src="/slides/uploads/CostOfQualityDefects.png" alt="CostOfQualityDefects" data-zoom=""><div class="ls-carousel-caption">CostOfQualityDefects</div></div>',
    '          </div>',
    '        <div class="ls-carousel-counter">1 / 2</div></div>',
    '        <div class="ls10-cards">',
    '          <div class="col-card">',
    '            <div class="col-list">',
    '              <div class="col-item" data-edit="console-item-1" contenteditable="" spellcheck="false"><strong>Live View</strong> — real-time production monitoring</div>',
    '              <div class="col-item" data-edit="console-item-2" contenteditable="" spellcheck="false"><strong>Alerts</strong> — by quantity, good/bad ratio, flexible periods</div>',
    '            </div>',
    '          </div>',
    '          <div class="col-card">',
    '            <div class="col-list">',
    '              <div class="col-item" data-edit="console-item-3" contenteditable="" spellcheck="false"><strong>Multiple recipients</strong> per alert rule</div>',
    '              <div class="col-item" data-edit="console-item-4" contenteditable="" spellcheck="false"><strong>Central settings</strong> — manage all LineScanner units from one place</div>',
    '            </div>',
    '          </div>',
    '        </div>',
    '      </div>',
    '',
    '    </div>'
  ].join('\n');

  return [
    '<div class="slide content ls10" data-slide="' + slideId + '">',
    '  <div class="slide-logo-row"><img src="/slides/shared/LOGO SoftSolution grays.png" alt="Softsolution"><span class="slide-logo-sep"></span><img src="/slides/shared/LOGO LiteSentry Greys.png" alt="LiteSentry" class="slide-logo-ls"></div>',
    '',
    '  <div class="slide-layout">',
    '  <header class="slide-head">',
    '  <div class="section-label" data-edit="section-label" contenteditable="" spellcheck="false">' + applyEdit('section-label', 'Traceability &amp; Management', savedEdits) + '</div>',
    '  <h1 class="slide-title" data-edit="headline" contenteditable="" spellcheck="false" style="margin-bottom:10px;">' + applyEdit('headline', 'Decisions based on <span class="blue">real data.</span>', savedEdits) + '</h1>',
    '  </header>',
    '',
    '  <div class="slide-body">',
    '',
    '  <div class="ls-tabs" data-edit="tabs" data-track="ls10:tabs" style="flex:1;min-height:0;width:100%;max-width:860px;">',
    applyEditsToBlob(savedEdits['tabs'] != null ? savedEdits['tabs'] : defaultTabsHtml, savedEdits),
    '  </div>',
    '',
    '  </div><!-- /.slide-body -->',
    '  </div><!-- /.slide-layout -->',
    '',
    '  <!-- Scoped Styles -->',
    '  <style>',
    '    .ls10 { }',
    '    .ls10 .slide-body { width: 100%; align-items: center; }',
    '    .ls10 .ls-carousel { min-height: 260px !important; height: 260px !important; }',
    '',
    '    /* Feature cards — mobile base (single column) */',
    '    .ls10 { padding: 52px 16px 80px !important; }',
    '    .ls10-cards {',
    '      flex-shrink: 0;',
    '      display: grid; grid-template-columns: 1fr; gap: 14px;',
    '      width: 100%; max-width: 860px;',
    '      margin-top: 12px;',
    '    }',
    '',
    '    /* Desktop overrides */',
    '    @media (min-width: 769px) {',
    '      .ls10 .ls-carousel { min-height: 0 !important; height: 100% !important; }',
    '      .ls10 { padding: 52px 80px 0 !important; }',
    '      .ls10-cards { grid-template-columns: 1fr 1fr; }',
    '    }',
    '  </style>',
    '',
    '  <script>',
    '  (function () { var s = document.currentScript;',
    '    setTimeout(function () { if (window.PE && s) PE.initSlide(s.closest(\'.slide\')); }, 0); })();',
    '  <\/script>',
    '</div>'
  ].join('\n');
}

function renderCarouselStepsLayout(slideId, savedEdits) {
  savedEdits = savedEdits || {};

  function applyEdit(key, defaultVal, edits) {
    return edits[key] != null ? edits[key] : defaultVal;
  }

  var defaultCarouselHtml = [
    '<div class="ls-carousel-track" style="transform: translateX(0px);">',
    '  <div class="ls-carousel-slide">',
    '    <img src="/slides/uploads/Slide62.jpg" alt="Quality &amp; Sensitivity Selection Options — auto recipe" data-zoom="" data-track="ls11:zoom:auto-recipe">',
    '  </div>',
    '  <div class="ls-carousel-slide">',
    '    <img src="/slides/uploads/Slide63.jpg" alt="Sensitivity zones — Border, Outer, Main, Special (DXF)" data-zoom="" data-track="ls11:zoom:sensitivity-zones">',
    '  </div>',
    '  <div class="ls-carousel-slide">',
    '    <img src="/slides/uploads/Slide64.jpg" alt="Fully automatic sensitivity adjustment — AI categorization" data-zoom="" data-track="ls11:zoom:ai-categorization">',
    '  </div>',
    '  <div class="ls-carousel-slide">',
    '    <img src="/slides/uploads/Slide65.jpg" alt="Sensitivity Control UI — as easy as a smart-phone" data-zoom="" data-track="ls11:zoom:control-ui">',
    '  </div>',
    '  <div class="ls-carousel-slide"><img src="/slides/uploads/CostOfQualityDefects.png" alt="CostOfQualityDefects" data-zoom=""></div>',
    '</div>'
  ].join('\n');

  var lines = [
    '<div class="slide content ls11" data-slide="' + slideId + '">',
    '  <div class="slide-logo-row"><img src="/slides/shared/LOGO SoftSolution grays.png" alt="Softsolution"><span class="slide-logo-sep"></span><img src="/slides/shared/LOGO LiteSentry Greys.png" alt="LiteSentry" class="slide-logo-ls"></div>',
    '',
    '  <div class="slide-layout">',
    '    <header class="slide-head">',
    '      <div class="section-label" data-edit="section-label" contenteditable="" spellcheck="false">' + applyEdit('section-label', 'Sensitivity Adjustment', savedEdits) + '</div>',
    '      <h1 class="slide-title" data-edit="headline" contenteditable="" spellcheck="false" style="margin-bottom:14px;">' + applyEdit('headline', 'Fully automatic <span class="blue">sensitivity adjustment</span>', savedEdits) + '</h1>',
    '    </header>',
    '',
    '    <div class="slide-body">',
    '      <div class="ls-carousel anim-in" data-edit="carousel" data-counter="" data-track="ls11:carousel" data-zoom-group="" style="flex:1;min-height:0;width:100%;max-width:860px;">',
    (savedEdits['carousel'] != null ? savedEdits['carousel'] : defaultCarouselHtml),
    '      </div>',
    '',
    '      <div class="ls11-steps-wrap anim-in">',
    '        <div class="ls11-steps-label" data-edit="steps-label" contenteditable="" spellcheck="false">' + applyEdit('steps-label', 'Automatic Quality Recipe Selection', savedEdits) + '</div>',
    '        <div class="ls11-steps">',
    '          <div class="ls11-step">',
    '            <div class="ls11-num">1</div>',
    '            <div data-edit="step-1" contenteditable="" spellcheck="false">' + applyEdit('step-1', 'Receives glass info via interface <span class="ls11-muted">(transfer file, PLC…)</span>', savedEdits) + '</div>',
    '          </div>',
    '          <div class="ls11-step">',
    '            <div class="ls11-num">2</div>',
    '            <div data-edit="step-2" contenteditable="" spellcheck="false">' + applyEdit('step-2', 'Logo detected → selects <strong>Tempered Glass</strong> sensitivity', savedEdits) + '</div>',
    '          </div>',
    '          <div class="ls11-step">',
    '            <div class="ls11-num">3</div>',
    '            <div data-edit="step-3" contenteditable="" spellcheck="false">' + applyEdit('step-3', 'GSS sensor detects laminated lite → <strong>Laminated Glass</strong> settings', savedEdits) + '</div>',
    '          </div>',
    '          <div class="ls11-step">',
    '            <div class="ls11-num">4</div>',
    '            <div data-edit="step-4" contenteditable="" spellcheck="false">' + applyEdit('step-4', 'Coating detected → <strong>Coated Glass</strong> sensitivity setting', savedEdits) + '</div>',
    '          </div>',
    '          <div class="ls11-step">',
    '            <div class="ls11-num">5</div>',
    '            <div data-edit="step-5" contenteditable="" spellcheck="false">' + applyEdit('step-5', 'Any other case → <strong>Default</strong> quality &amp; sensitivity settings', savedEdits) + '</div>',
    '          </div>',
    '        </div>',
    '        <div class="ls11-tagline" data-edit="tagline" contenteditable="" spellcheck="false">' + applyEdit('tagline', 'LineScanner — as easy as a smart-phone', savedEdits) + '</div>',
    '      </div>',
    '    </div>',
    '  </div>',
    '',
    '  <style>',
    '    .ls11 { }',
    '',
    '    /* ── Steps ── */',
    '    .ls11-steps-wrap {',
    '      flex-shrink: 0;',
    '      width: 100%; max-width: 860px;',
    '      margin-top: 10px;',
    '    }',
    '    .ls11-steps-label {',
    '      font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;',
    '      color: var(--text-muted); padding-left: 2px;',
    '    }',
    '    .ls11-steps { display: flex; flex-direction: column; gap: 5px; }',
    '    .ls11-step {',
    '      display: flex; align-items: center; gap: 10px;',
    '      padding: 7px 12px; border-radius: 8px;',
    '      background: var(--bg-card); border: 1px solid var(--border);',
    '      font-size: 12px; color: var(--text); line-height: 1.4;',
    '    }',
    '    .ls11-num {',
    '      width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0;',
    '      border: 1px solid rgba(232,113,26,.5); color: #E8711A;',
    '      font-size: 10px; font-weight: 700;',
    '      display: flex; align-items: center; justify-content: center;',
    '    }',
    '    .ls11-muted { color: var(--text-muted); }',
    '    .ls11-tagline {',
    '      font-size: 12px; font-style: italic; color: var(--text-muted);',
    '      letter-spacing: .03em; padding-left: 2px; margin-top: 4px;',
    '    }',
    '    /* ── Mobile base ── */',
    '    .ls11 .slide-body { width: 100%; align-items: center; }',
    '    .ls11 .ls-carousel { min-height: 260px !important; height: 260px !important; }',
    '    .ls11 { padding: 52px 16px 80px !important; }',
    '',
    '    /* ── Desktop overrides ── */',
    '    @media(min-width:769px) {',
    '      .ls11 .ls-carousel { min-height: 0 !important; height: 100% !important; }',
    '      .ls11 { padding: 52px 80px 0 !important; }',
    '    }',
    '  </style>',
    '',
    '  <script>',
    '  (function () { var s = document.currentScript;',
    '    setTimeout(function () { if (window.PE && s) PE.initSlide(s.closest(\'.slide\')); }, 0); })();',
    '  <\/script>',
    '</div>'
  ];

  return lines.join('\n');
}

function renderFullCarouselLayout(slideId, savedEdits) {
  savedEdits = savedEdits || {};

  var defaultFootprintDiagramHtml = [
    '<div class="ls-carousel-track" style="transform: translateX(0px);">',
    '    <div class="ls-carousel-slide">',
    '      <img src="/slides/uploads/Slide66.jpg" alt="LineScanner footprint diagram" data-zoom="" data-track="ls12:zoom:footprint-diagram">',
    '      <div class="ls12-badge ls12-badge-h">',
    '        <div class="ls12-badge-title" data-edit="badge-h-title" contenteditable="" spellcheck="false">' + applyEdit('badge-h-title', 'Horizontal', savedEdits) + '</div>',
    '        <div class="ls12-badge-spec" data-edit="badge-h-spec1" contenteditable="" spellcheck="false">' + applyEdit('badge-h-spec1', 'Depth ~475 mm', savedEdits) + '</div>',
    '        <div class="ls12-badge-spec" data-edit="badge-h-spec2" contenteditable="" spellcheck="false">' + applyEdit('badge-h-spec2', 'Individual width as required', savedEdits) + '</div>',
    '      </div>',
    '      <div class="ls12-badge ls12-badge-v">',
    '        <div class="ls12-badge-title" data-edit="badge-v-title" contenteditable="" spellcheck="false">' + applyEdit('badge-v-title', 'Vertical', savedEdits) + '</div>',
    '        <div class="ls12-badge-spec" data-edit="badge-v-spec1" contenteditable="" spellcheck="false">' + applyEdit('badge-v-spec1', 'Width ~700 mm', savedEdits) + '</div>',
    '        <div class="ls12-badge-spec" data-edit="badge-v-spec2" contenteditable="" spellcheck="false">' + applyEdit('badge-v-spec2', 'Depth only 420 mm', savedEdits) + '</div>',
    '      </div>',
    '    </div>',
    '  <div class="ls-carousel-slide"><img src="/slides/uploads/CostOfQualityDefects.png" alt="CostOfQualityDefects" data-zoom=""></div>',
    '</div>'
  ].join('\n');

  return [
    '<div class="slide content ls12" data-slide="' + slideId + '">',

    '  <div class="slide-logo-row"><img src="/slides/shared/LOGO SoftSolution grays.png" alt="Softsolution"><span class="slide-logo-sep"></span><img src="/slides/shared/LOGO LiteSentry Greys.png" alt="LiteSentry" class="slide-logo-ls"></div>',

    '  <div class="slide-layout">',
    '    <header class="slide-head">',
    '      <div class="section-label" data-edit="section-label" contenteditable="" spellcheck="false">' + applyEdit('section-label', 'Installation', savedEdits) + '</div>',
    '      <h1 class="slide-title" data-edit="headline" contenteditable="" spellcheck="false">Modular based \u2014 <span class="blue">' + applyEdit('headline-emphasis', 'minimum footprint', savedEdits) + '</span></h1>',
    '      <p class="slide-subtitle" data-edit="subtitle" contenteditable="" spellcheck="false" style="margin-bottom:12px; margin-top:-6px;">' + applyEdit('subtitle', 'unique \u00b7 worldwide', savedEdits) + '</p>',
    '    </header>',

    '    <div class="slide-body">',

    '      <div class="ls12-diagram-wrap anim-in">',

    '        <div class="ls-carousel" data-counter="" data-edit="footprint-diagram" data-track="ls12:carousel:footprint" style="width:100%;flex:1;min-height:0;">',
    (savedEdits['footprint-diagram'] != null ? savedEdits['footprint-diagram'] : defaultFootprintDiagramHtml),
    '        </div>',

    '      </div>',
    '    </div>',
    '  </div>',

    '  <style>',
    '    .ls12 { }',
    '    .ls12 .slide-body { width: 100%; align-items: center; }',
    '',
    '    .ls12-diagram-wrap {',
    '      display: flex; flex-direction: column;',
    '      width: 100%; max-width: 860px;',
    '      position: relative;',
    '      min-height: 300px;',
    '    }',
    '    @media (min-width: 769px) {',
    '      .ls12-diagram-wrap { flex: 1; min-height: 0; }',
    '      .ls12-diagram-wrap .ls-carousel { flex: 1; width: 100% !important; min-height: 0; height: 100% !important; }',
    '    }',
    '',
    '    /* Spec badges */',
    '    .ls12-badge {',
    '      position: absolute;',
    '      background: #E8711A; color: #fff;',
    '      border-radius: 20px; padding: 10px 18px;',
    '      display: flex; flex-direction: column; gap: 2px;',
    '      box-shadow: 0 4px 16px rgba(0,0,0,.3);',
    '      pointer-events: none;',
    '    }',
    '    .ls12-badge-title { font-size: 13px; font-weight: 800; letter-spacing: .02em; }',
    '    .ls12-badge-spec  { font-size: 11px; opacity: .9; }',
    '',
    '    .ls12-badge-h { top: 12%; right: 4%; }',
    '    .ls12-badge-v { bottom: 12%; left: 26%; }',
    '',
    '    /* \u2500\u2500 Mobile base \u2500\u2500 */',
    '    .ls12 { padding: 52px 16px 80px !important; }',
    '    .ls12-badge-h, .ls12-badge-v { display: none; }',
    '',
    '    /* \u2500\u2500 Desktop overrides \u2500\u2500 */',
    '    @media(min-width:769px) {',
    '      .ls12 { padding: 52px 80px 0 !important; }',
    '      .ls12-badge-h, .ls12-badge-v { display: flex; }',
    '    }',
    '  <\/style>',

    '  <script>',
    '  (function () { var s = document.currentScript;',
    '    setTimeout(function () { if (window.PE && s) PE.initSlide(s.closest(\'.slide\')); }, 0); })();',
    '  <\/script>',

    '</div>'
  ].join('\n');
}

function renderCardsGridLayout(slideId, savedEdits) {
  savedEdits = savedEdits || {};

  var DEFAULT_CARDS = [
    { nameDefault: 'LiSEC',        typeDefault: 'Processing lines'     },
    { nameDefault: 'FOREL',        typeDefault: 'Architectural glass'   },
    { nameDefault: 'Benteler',     typeDefault: 'Automotive glass'      },
    { nameDefault: 'CMS Tecglass', typeDefault: 'Digital printing'      },
    { nameDefault: 'Bystronic',    typeDefault: 'Cutting and processing' },
    { nameDefault: 'Hegla',        typeDefault: 'Cutting and storage'   },
    { nameDefault: 'Glaston',      typeDefault: 'Tempering and bending' },
    { nameDefault: 'TecoFerrari',  typeDefault: 'Insulating glass'      },
    { nameDefault: 'Erdman',       typeDefault: 'Automated lines'       },
  ];

  var totalCards = savedEdits['int-card-count'] != null
    ? Math.min(20, Math.max(1, parseInt(savedEdits['int-card-count'], 10)))
    : DEFAULT_CARDS.length;

  var cardLines = [];
  for (var i = 1; i <= totalCards; i++) {
    var def = DEFAULT_CARDS[i - 1] || { nameDefault: 'Partner ' + i, typeDefault: 'Category' };
    var nameKey  = 'int-name-' + i;
    var typeKey  = 'int-type-' + i;
    var logoKey  = 'int-logo-' + i;
    var nameVal  = savedEdits[nameKey] != null ? savedEdits[nameKey] : def.nameDefault;
    var typeVal  = savedEdits[typeKey] != null ? savedEdits[typeKey] : def.typeDefault;
    var logoSaved = savedEdits[logoKey] != null ? savedEdits[logoKey] : '';
    var logoUrl = (logoSaved && (logoSaved.startsWith('/') || logoSaved.startsWith('http'))) ? logoSaved : '';
    var hasLogo = logoUrl ? '' : ' empty';
    var imgEl = logoUrl ? '<img src="' + logoUrl + '" class="int-logo-img" alt="">' : '';
    cardLines.push([
      '    <div class="int-card anim-in">',
      '      <div class="int-logo-wrap' + hasLogo + '" id="int-logo-car-' + i + '" data-edit="' + logoKey + '">',
      imgEl,
      '        <button class="int-logo-btn" data-builder-only="" data-logo-idx="' + i + '">' + (logoUrl ? 'Change' : '+ Logo') + '</button>',
      '      </div>',
      '      <div class="int-name" data-edit="' + nameKey + '" contenteditable="" spellcheck="false">' + nameVal + '</div>',
      '      <div class="int-type" data-edit="' + typeKey + '" contenteditable="" spellcheck="false">' + typeVal + '</div>',
      '      <button class="int-del-btn" data-builder-only="" title="Remove card">&#215;</button>',
      '    </div>',
    ].join('\n'));
  }

  return [
    '<div class="slide content ls13" data-slide="' + slideId + '">',
    '  <div class="slide-logo-row"><img src="/slides/shared/LOGO SoftSolution grays.png" alt="Softsolution"><span class="slide-logo-sep"></span><img src="/slides/shared/LOGO LiteSentry Greys.png" alt="LiteSentry" class="slide-logo-ls"></div>',
    '  <div class="slide-layout">',
    '    <header class="slide-head">',
    '      <div class="section-label" data-edit="section-label" contenteditable="" spellcheck="false">' + applyEdit('section-label', 'Integrations', savedEdits) + '</div>',
    '      <h1 class="slide-title" data-edit="headline" contenteditable="" spellcheck="false">' + applyEdit('headline', 'Compatible with<br><span class=\"blue\">your current machinery</span>', savedEdits) + '</h1>',
    '      <div class="divider"></div>',
    '      <p class="slide-subtitle" data-edit="subtitle" contenteditable="" spellcheck="false" style="margin-bottom:4px;">' + applyEdit('subtitle', 'LineScanner is already integrated with the leading glass machinery manufacturers — if you already run any of these lines, integration is direct.', savedEdits) + '</p>',
    '    </header>',
    '    <div class="slide-body">',
    '  <div class="integration-grid">',
  ].concat(cardLines).concat([
    '  <button class="int-add-btn" data-builder-only="" title="Add a new integration card">+ Add card</button>',
    '  </div>',
    '    </div>',
    '  </div>',
    '  <style>',
    '    .ls13 { padding: 70px 16px 80px !important; }',
    '    @media (min-width: 769px) { .ls13 { padding: 52px 80px 0 !important; } }',
    '    .int-logo-wrap { height:54px; border-radius:6px; margin-bottom:6px; position:relative; display:flex; align-items:center; justify-content:center; overflow:hidden; }',
    '    .int-logo-wrap.empty { background:rgba(255,255,255,.04); border:1px dashed rgba(255,255,255,.18); }',
    '    .int-logo-img { max-height:46px; max-width:100%; object-fit:contain; }',
    '    .int-logo-btn { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,.55); border:none; border-radius:6px; color:#fff; font-size:11px; font-weight:600; font-family:inherit; cursor:pointer; opacity:0; transition:opacity .15s; padding:0; }',
    '    .int-logo-wrap:hover .int-logo-btn, .int-logo-wrap.empty .int-logo-btn { opacity:1; }',
    '    .int-del-btn { position:absolute; top:6px; right:6px; width:20px; height:20px; border-radius:50%; background:rgba(180,30,30,.8); border:1px solid rgba(255,100,100,.3); color:#fff; font-size:13px; line-height:1; cursor:pointer; display:flex; align-items:center; justify-content:center; opacity:0; transition:opacity .2s,background .2s; font-family:inherit; padding:0; }',
    '    .int-card:hover .int-del-btn { opacity:1; }',
    '    .int-del-btn:hover { background:rgba(220,40,40,1); }',
    '    .int-add-btn {',
    '      display:flex; align-items:center; justify-content:center; padding:14px;',
    '      border-radius:12px; cursor:pointer; grid-column:1/-1; width:100%;',
    '      background:rgba(var(--accent-rgb),.06); border:1px dashed rgba(var(--accent-rgb),.3);',
    '      color:var(--accent); font-size:13px; font-weight:600; font-family:inherit; transition:all .2s;',
    '    }',
    '    .int-add-btn:hover { background:rgba(var(--accent-rgb),.15); border-color:rgba(var(--accent-rgb),.6); }',
    '  <\/style>',
    '  <script>',
    '  (function () {',
    '    var slide = document.querySelector(\'.ls13\');',
    '    if (!slide) return;',
    '',
    '    function attachLogoBtn(wrap) {',
    '      var btn = wrap.querySelector(\'.int-logo-btn\');',
    '      if (!btn) return;',
    '      btn.addEventListener(\'click\', function(e) {',
    '        e.stopPropagation();',
    '        var inp = document.createElement(\'input\');',
    '        inp.type = \'file\'; inp.accept = \'image/*\';',
    '        inp.onchange = function() {',
    '          var file = inp.files[0]; if (!file) return;',
    '          var preview = URL.createObjectURL(file);',
    '          var img = wrap.querySelector(\'.int-logo-img\');',
    '          if (!img) { img = document.createElement(\'img\'); img.className = \'int-logo-img\'; img.alt = \'\'; wrap.prepend(img); }',
    '          img.src = preview;',
    '          wrap.classList.remove(\'empty\');',
    '          btn.textContent = \'Change\';',
    '          var reader = new FileReader();',
    '          reader.onload = function(ev) {',
    '            fetch(\'/api/upload-image\', {',
    '              method: \'POST\', headers: { \'Content-Type\': \'application/json\' },',
    '              body: JSON.stringify({ filename: file.name, data: ev.target.result })',
    '            })',
    '            .then(function(r) { return r.json(); })',
    '            .then(function(j) {',
    '              var url = j.path; if (!url) return;',
    '              img.src = url;',
    '              document.dispatchEvent(new CustomEvent(\'slide-carousel-save\', {',
    '                detail: { editKey: wrap.getAttribute(\'data-edit\'), html: url }',
    '              }));',
    '            });',
    '          };',
    '          reader.readAsDataURL(file);',
    '        };',
    '        inp.click();',
    '      });',
    '    }',
    '',
    '    function deleteCard(card) {',
    '      var grid = card.closest(\'.integration-grid\');',
    '      var cards = Array.from(grid.querySelectorAll(\'.int-card\'));',
    '      if (cards.length <= 1) return;',
    '      var idx = cards.indexOf(card);',
    '      card.remove();',
    '      var remaining = cards.filter(function(c, i) { return i !== idx; });',
    '      remaining.forEach(function(c, i) {',
    '        var num = i + 1;',
    '        var nameEl = c.querySelector(\'.int-name\');',
    '        var typeEl = c.querySelector(\'.int-type\');',
    '        var logoWrap = c.querySelector(\'.int-logo-wrap\');',
    '        if (nameEl) {',
    '          nameEl.setAttribute(\'data-edit\', \'int-name-\' + num);',
    '          document.dispatchEvent(new CustomEvent(\'slide-carousel-save\', { detail: { editKey: \'int-name-\' + num, html: nameEl.innerHTML } }));',
    '        }',
    '        if (typeEl) {',
    '          typeEl.setAttribute(\'data-edit\', \'int-type-\' + num);',
    '          document.dispatchEvent(new CustomEvent(\'slide-carousel-save\', { detail: { editKey: \'int-type-\' + num, html: typeEl.innerHTML } }));',
    '        }',
    '        if (logoWrap) {',
    '          logoWrap.setAttribute(\'data-edit\', \'int-logo-\' + num);',
    '          var logoImg = logoWrap.querySelector(\'.int-logo-img\');',
    '          if (logoImg && logoImg.src) document.dispatchEvent(new CustomEvent(\'slide-carousel-save\', { detail: { editKey: \'int-logo-\' + num, html: logoImg.src } }));',
    '        }',
    '      });',
    '      document.dispatchEvent(new CustomEvent(\'slide-carousel-save\', { detail: { editKey: \'int-card-count\', html: String(remaining.length) } }));',
    '    }',
    '',
    '    function attachDelBtn(card) {',
    '      var btn = card.querySelector(\'.int-del-btn\');',
    '      if (btn) btn.addEventListener(\'click\', function(e) { e.stopPropagation(); deleteCard(card); });',
    '    }',
    '',
    '    slide.querySelectorAll(\'.int-logo-wrap\').forEach(attachLogoBtn);',
    '    slide.querySelectorAll(\'.int-card\').forEach(attachDelBtn);',
    '',
    '    var addBtn = slide.querySelector(\'.int-add-btn\');',
    '    if (addBtn) addBtn.addEventListener(\'click\', function() {',
    '      var grid = addBtn.closest(\'.integration-grid\');',
    '      var n = grid.querySelectorAll(\'.int-card\').length + 1;',
    '      var card = document.createElement(\'div\');',
    '      card.className = \'int-card anim-in\';',
    '      card.innerHTML =',
    '        \'<div class="int-logo-wrap empty" data-edit="int-logo-\' + n + \'">\' +',
    '        \'<button class="int-logo-btn" data-builder-only="">+ Logo</button></div>\' +',
    '        \'<div class="int-name" data-edit="int-name-\' + n + \'" contenteditable="" spellcheck="false">New Partner</div>\' +',
    '        \'<div class="int-type" data-edit="int-type-\' + n + \'" contenteditable="" spellcheck="false">Category</div>\' +',
    '        \'<button class="int-del-btn" data-builder-only="" title="Remove card">&#215;</button>\';',
    '      grid.insertBefore(card, addBtn);',
    '      attachLogoBtn(card.querySelector(\'.int-logo-wrap\'));',
    '      attachDelBtn(card);',
    '      document.dispatchEvent(new CustomEvent(\'slide-carousel-save\', {',
    '        detail: { editKey: \'int-card-count\', html: String(n) }',
    '      }));',
    '    });',
    '  })();',
    '  <\/script>',
    '  <script>',
    '  (function () { var s = document.currentScript;',
    '    setTimeout(function () { if (window.PE && s) PE.initSlide(s.closest(\'.slide\')); }, 0); })();',
    '  <\/script>',
    '</div>',
  ]).join('\n');
}

function renderLayoutToHtml(layout, slideId, savedEdits, deck) {
  savedEdits = savedEdits || {};

  // Merge template defaultContent — savedEdits (user changes) take priority
  // layout.fromTemplate is set on layout objects; layout.id is the template id when called directly
  var tplId = layout.fromTemplate || layout.id;
  var templates = JSON.parse(fs.readFileSync(TEMPLATES_PATH, 'utf8'));
  var tpl = templates.find(function(t) { return t.id === tplId; });
  var defaultContent = (tpl && tpl.defaultContent) || {};
  savedEdits = Object.assign({}, defaultContent, savedEdits);

  if (tplId === 'tpl-new-cover')    return renderHeroLayout(slideId, savedEdits, deck);
  if (tplId === 'tpl-new-company')     return renderCompanyLayout(slideId, savedEdits);
  if (tplId === 'tpl-new-comparison')       return renderComparisonLayout(slideId, savedEdits);
  if (tplId === 'tpl-new-capability-matrix') return renderCapabilityLayout(slideId, savedEdits);
  if (tplId === 'tpl-new-technology')        return renderTechnologyLayout(slideId, savedEdits);
  if (tplId === 'tpl-new-defect-gallery')       return renderDefectGalleryLayout(slideId, savedEdits);
  if (tplId === 'tpl-new-carousel-cards')       return renderCarouselCardsLayout(slideId, savedEdits);
  if (tplId === 'tpl-new-checklist-carousel')   return renderChecklistCarouselLayout(slideId, savedEdits);
  if (tplId === 'tpl-new-carousel-tags')        return renderCarouselTagsLayout(slideId, savedEdits);
  if (tplId === 'tpl-new-tabs-carousel')        return renderTabsCarouselLayout(slideId, savedEdits);
  if (tplId === 'tpl-new-carousel-steps')       return renderCarouselStepsLayout(slideId, savedEdits);
  if (tplId === 'tpl-new-full-carousel')        return renderFullCarouselLayout(slideId, savedEdits);
  if (tplId === 'tpl-new-cards-grid')           return renderCardsGridLayout(slideId, savedEdits);

  var rows = Array.isArray(layout.rows) ? layout.rows : [];

  var rowsHtml = rows.map(function (row, rowIdx) {
    var cols     = Array.isArray(row.cols) ? row.cols : [];
    var gridCols = COL_LAYOUTS[row.layout] || '1fr';
    var minH     = ROW_HEIGHTS[row.height] || '';
    var rowStyle = 'display:grid; grid-template-columns:' + gridCols + '; gap:16px;' + (minH ? ' ' + minH : '');

    var colsHtml = cols.map(function (col, colIdx) {
      var components = Array.isArray(col.components) ? col.components : [];
      var innerHtml  = components.map(function (c) {
        return renderComponent(c.type || c, rowIdx, colIdx, savedEdits);
      }).join('\n      ');
      return '    <div class="slide-col">\n      ' + innerHtml + '\n    </div>';
    }).join('\n');

    return '  <div class="slide-row" style="' + rowStyle + '">\n' + colsHtml + '\n  </div>';
  }).join('\n');

  return [
    '<div class="slide content ls-custom" data-slide="' + slideId + '">',
    '  <style>' + LAYOUT_CSS + '</style>',
    '  <div class="slide-logo-row">',
    '    <img src="/slides/shared/softsolution-logo.svg" alt="Softsolution">',
    '    <span class="slide-logo-sep"></span>',
    '    <img src="/slides/shared/litesentry-logo.svg" alt="LiteSentry" class="slide-logo-ls">',
    '  </div>',
    '  <div class="slide-layout">',
    '    <header class="slide-head">',
    '      <div class="section-label" data-edit="section-label" contenteditable="" spellcheck="false">' + applyEdit('section-label', 'Section', savedEdits) + '</div>',
    '      <h1 class="slide-title" data-edit="title" contenteditable="" spellcheck="false">' + applyEdit('title', 'Slide Title', savedEdits) + '</h1>',
    '      <p class="slide-subtitle" data-edit="subtitle" contenteditable="" spellcheck="false">' + applyEdit('subtitle', 'Supporting subtitle goes here', savedEdits) + '</p>',
    '    </header>',
    '    <div class="slide-body">',
    rowsHtml,
    '    </div>',
    '  </div>',
    '</div>',
    '<script>',
    '(function () {',
    '  var s = document.currentScript;',
    '  setTimeout(function () {',
    '    if (window.PE && s) PE.initSlide(s.closest(\'.slide\'));',
    '  }, 0);',
    '})();',
    '</script>'
  ].join('\n');
}

app.get('/slides/:deckSlideId.html', function (req, res, next) {
  var deckSlideId = req.params.deckSlideId;
  if (!deckSlideId.startsWith('deck-')) return next();

  try {
    var activeDeckId = getActiveDeckId();
    var deck      = readDeckById(activeDeckId);
    var deckSlide = deck.slides.find(function (s) { return s.id === deckSlideId; });
    if (!deckSlide || !deckSlide.librarySlideId) return next();

    var library  = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'));
    var libSlide = library.slides.find(function (s) { return s.id === deckSlide.librarySlideId; });
    if (!libSlide) return next();

    var resolved = resolveTemplate(libSlide.templateId);
    if (!resolved) return next();

    var deckConfig = getDeckConfig(activeDeckId);
    var savedEdits = resolveSlideEdits(libSlide, activeDeckId);
    var html;
    if (resolved.source === 'canvas') {
      html = renderLayoutToHtml(resolved.tpl, deckSlideId, savedEdits, deckConfig);
    } else {
      html = renderCartridge(resolved, { galleryEnabled: libSlide.galleryEnabled, rawEdits: savedEdits, deck: deckConfig, editable: true });
    }
    res.type('text/html').send(html);
  } catch (err) {
    console.error('Deck slide render error:', err.message);
    next();
  }
});

// ── Static: slide files ───────────────────────────────────────────────────────
app.use('/slides', express.static(path.join(__dirname, 'features/slides')));

// ── Static: dashboard ─────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'features/dashboard')));

// ── Page: settings ────────────────────────────────────────────────────────────
app.get('/settings', function (_req, res) {
  res.sendFile(path.join(__dirname, 'features/settings/index.html'));
});

// ── Static: builder UI ────────────────────────────────────────────────────────
app.use('/builder', express.static(path.join(__dirname, 'features/builder-ui')));

// ── API: settings ─────────────────────────────────────────────────────────────
app.get('/api/settings', function (_req, res) {
  var data = readSettings();
  data.umamiBaseUrl   = UMAMI_BASE_URL;
  data.publicBaseUrl  = PUBLIC_BASE_URL;
  res.json({ success: true, data: data });
});

app.put('/api/settings', function (req, res) {
  try {
    var current  = readSettings();
    var updated  = Object.assign({}, current, req.body);
    writeSettings(updated);
    res.json({ success: true, data: updated });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/settings/logos — upload a logo, append to logos array
app.post('/api/settings/logos', function (req, res) {
  try {
    var filename = req.body.filename;
    var data     = req.body.data; // base64 data URL
    if (!filename || !data) return res.status(400).json({ success: false, error: 'filename and data required' });

    var matches = data.match(/^data:([A-Za-z0-9+/]+);base64,(.+)$/);
    if (!matches) return res.status(400).json({ success: false, error: 'invalid data URL' });
    var buffer   = Buffer.from(matches[2], 'base64');
    var src      = dedupUpload(path.basename(filename), buffer);
    var safeName = src.split('/').pop();
    var settings = readSettings();
    settings.logos.push({ src: src, alt: safeName.replace(/\.[^.]+$/, '') });
    writeSettings(settings);
    res.json({ success: true, data: settings });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// DELETE /api/settings/logos/:index — remove a logo by index
app.delete('/api/settings/logos/:index', function (req, res) {
  try {
    var idx      = parseInt(req.params.index);
    var settings = readSettings();
    if (isNaN(idx) || idx < 0 || idx >= settings.logos.length) {
      return res.status(400).json({ success: false, error: 'invalid index' });
    }
    settings.logos.splice(idx, 1);
    writeSettings(settings);
    res.json({ success: true, data: settings });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/settings/hero-bg — upload hero background image
app.post('/api/settings/hero-bg', function (req, res) {
  try {
    var filename = req.body.filename;
    var data     = req.body.data;
    if (!filename || !data) return res.status(400).json({ success: false, error: 'filename and data required' });

    var matches = data.match(/^data:([A-Za-z0-9+/]+);base64,(.+)$/);
    if (!matches) return res.status(400).json({ success: false, error: 'invalid data URL' });
    var buffer   = Buffer.from(matches[2], 'base64');
    var src      = dedupUpload(path.basename(filename), buffer);
    var settings = readSettings();
    settings.heroBg = src;
    writeSettings(settings);
    res.json({ success: true, data: settings });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── API: style references ─────────────────────────────────────────────────────
var STYLE_REFS_DIR = path.join(__dirname, 'style-references');

function slugToName(slug) {
  return slug.replace(/\.html$/, '').replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, function (c) { return c.toUpperCase(); });
}

function extractStyleBlock(html) {
  var m = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  return m ? m[1] : '';
}

function getBodyProp(css, prop) {
  var b = css.match(/body\s*\{([^}]+)\}/);
  if (!b) return null;
  var m = b[1].match(new RegExp(prop + '\\s*:\\s*([^;\\n]+)'));
  return m ? m[1].trim() : null;
}

function resolveCssVar(css, value, depth) {
  if (!value || (depth || 0) > 4) return value;
  var m = value.match(/var\((--[^),\s]+)\)/);
  if (!m) return value;
  var re = new RegExp(m[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:\\s*([^;\\n}]+)');
  var found = css.match(re);
  if (!found) return value;
  return resolveCssVar(css, found[1].trim(), (depth || 0) + 1);
}

function hexLuminance(hex) {
  var h = hex.replace('#', '');
  if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  if (h.length !== 6) return 0;
  var r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
  return (0.299*r + 0.587*g + 0.114*b) / 255;
}

function isLight(color) {
  if (!color) return false;
  color = color.trim();
  if (color.startsWith('#')) return hexLuminance(color) > 0.5;
  if (/^rgb/.test(color)) {
    var nums = color.match(/[\d.]+/g);
    if (nums && nums.length >= 3) return (0.299*+nums[0] + 0.587*+nums[1] + 0.114*+nums[2]) / 255 > 0.5;
  }
  return /^white|^#fff/i.test(color);
}

function hexToRgbStr(hex) {
  var h = hex.replace('#','');
  if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  if (h.length !== 6) return null;
  return parseInt(h.slice(0,2),16)+','+parseInt(h.slice(2,4),16)+','+parseInt(h.slice(4,6),16);
}
function hexToLight(hex) {
  var h = hex.replace('#','');
  if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  if (h.length !== 6) return hex;
  var r=parseInt(h.slice(0,2),16), g=parseInt(h.slice(2,4),16), b=parseInt(h.slice(4,6),16);
  r=Math.round(r+(255-r)*0.45); g=Math.round(g+(255-g)*0.45); b=Math.round(b+(255-b)*0.45);
  return '#'+[r,g,b].map(function(v){return ('0'+v.toString(16)).slice(-2);}).join('');
}

function buildThemeOverride(html, deckTheme) {
  var css = extractStyleBlock(html);

  // ── Extract Google Fonts imports ──
  var imports = [];
  var importRe = /@import\s+url\([^)]+\)[^;]*;/g;
  var im;
  while ((im = importRe.exec(css)) !== null) imports.push(im[0]);

  // ── Extract body tokens ──
  var rawBg   = resolveCssVar(css, getBodyProp(css, 'background(?:-color)?') || '#0a0a0f');
  var rawText = resolveCssVar(css, getBodyProp(css, '(?<![\\w-])color'));
  var rawFont = getBodyProp(css, 'font-family') || null;

  // Grab first solid background value (ignore gradients for bg variable)
  var bgColor = rawBg.trim().split(/\s+/)[0];
  if (bgColor.startsWith('linear') || bgColor.startsWith('radial') || bgColor.startsWith('var(')) {
    var fallback = rawBg.match(/#[0-9a-f]{3,8}|rgba?\([^)]+\)/i);
    bgColor = fallback ? fallback[0] : '#0a0a0f';
  }

  // Respect deck theme: if it conflicts with extracted bg, use sensible default
  var light;
  if (deckTheme === 'light') {
    light = true;
    if (!isLight(bgColor)) bgColor = '#f5f5f7';
  } else if (deckTheme === 'dark') {
    light = false;
    if (isLight(bgColor)) bgColor = '#0a0a0f';
  } else {
    light = isLight(bgColor);
  }
  var textColor = (rawText && !rawText.startsWith('var(')) ? rawText : (light ? '#1d1d1f' : '#ffffff');

  // ── Derive semantic tokens from bg darkness ──
  var textMuted    = light ? 'rgba(0,0,0,.50)'       : 'rgba(255,255,255,.55)';
  var bgCard       = light ? 'rgba(0,0,0,.04)'        : 'rgba(255,255,255,.05)';
  var bgCardHover  = light ? 'rgba(0,0,0,.08)'        : 'rgba(255,255,255,.09)';
  var border       = light ? 'rgba(0,0,0,.10)'        : 'rgba(255,255,255,.10)';
  var borderHover  = light ? 'rgba(0,0,0,.28)'        : 'rgba(255,255,255,.28)';
  var navBg        = light ? 'rgba(255,255,255,.80)'  : 'rgba(0,0,0,.65)';
  var navBorder    = light ? 'rgba(0,0,0,.10)'        : 'rgba(255,255,255,.08)';
  var dotInactive  = light ? 'rgba(0,0,0,.22)'        : 'rgba(255,255,255,.18)';
  var counter      = light ? '#888'                   : '#555';

  // Try to extract card bg from a card-like rule in the reference
  var cardRule = css.match(/\.(?:card|feature-card|gradient-card|glass-card|panel|surface)\s*\{([^}]+)\}/i);
  if (cardRule) {
    var cardBgMatch = cardRule[1].match(/background(?:-color)?\s*:\s*([^;]+)/);
    if (cardBgMatch) {
      var resolved = resolveCssVar(css, cardBgMatch[1].trim());
      if (resolved && !resolved.startsWith('var(')) bgCard = resolved;
    }
  }

  // hero-rgb: use bgColor if hex, otherwise keep default
  var heroRgb = bgColor.startsWith('#') ? hexToRgbStr(bgColor) : null;

  // ── Best-effort accent extraction from :root ──
  var accentColor = null;
  var rootMatch = css.match(/:root\s*\{([^}]+)\}/);
  if (rootMatch) {
    var rootCss = rootMatch[1];
    var accentKeys = ['--accent:', '--accent-primary:', '--primary-color:', '--primary:', '--brand-color:', '--color-primary:'];
    for (var ak = 0; ak < accentKeys.length; ak++) {
      var re = new RegExp(accentKeys[ak].replace(/[-]/g, '\\-') + '\\s*([^;\\n]+)');
      var am = rootCss.match(re);
      if (am) {
        var candidate = resolveCssVar(css, am[1].trim());
        if (candidate && (candidate.startsWith('#') || candidate.startsWith('rgb'))) {
          accentColor = candidate; break;
        }
      }
    }
    // Fallback: first --neon-* or --glow-* value
    if (!accentColor) {
      var neonMatch = rootCss.match(/--(?:neon|glow)-\w+\s*:\s*(#[0-9a-f]{3,8}|rgba?\([^)]+\))/i);
      if (neonMatch) accentColor = neonMatch[1];
    }
  }

  var out = '';
  if (imports.length) out += imports.join('\n') + '\n';
  out += ':root {\n';
  out += '  --bg: '           + bgColor      + ';\n';
  out += '  --slide-hero-bg: '+ bgColor      + ';\n';
  if (heroRgb) out += '  --slide-hero-rgb: ' + heroRgb + ';\n';
  out += '  --text: '         + textColor    + ';\n';
  out += '  --text-muted: '   + textMuted    + ';\n';
  out += '  --bg-card: '      + bgCard       + ';\n';
  out += '  --bg-card-hover: '+ bgCardHover  + ';\n';
  out += '  --border: '       + border       + ';\n';
  out += '  --border-hover: ' + borderHover  + ';\n';
  out += '  --nav-bg: '       + navBg        + ';\n';
  out += '  --nav-border: '   + navBorder    + ';\n';
  out += '  --dot-inactive: ' + dotInactive  + ';\n';
  out += '  --counter: '      + counter      + ';\n';
  if (accentColor) {
    out += '  --accent: '     + accentColor  + ';\n';
    out += '  --accent-mid: ' + accentColor  + ';\n';
    out += '  --accent-light: '+ accentColor + ';\n';
    var accentRgb = accentColor.startsWith('#') ? hexToRgbStr(accentColor) : null;
    if (accentRgb) out += '  --accent-rgb: ' + accentRgb + ';\n';
  }
  out += '}\n';
  if (rawFont) out += 'body { font-family: ' + rawFont + '; }\n';
  return out;
}

function extractBgColor(css) {
  var bodyBlock = css.match(/body\s*\{([^}]*)\}/);
  if (!bodyBlock) return null;
  var bg = bodyBlock[1].match(/background(?:-color)?\s*:\s*([^;]+)/);
  if (!bg) return null;
  var val = bg[1].trim().split(/\s+/)[0];
  return val || null;
}

function extractStyleCss(html, theme) {
  return buildThemeOverride(html, theme);
}

// ── Theme system ──────────────────────────────────────────────────────────────
var THEMES_DIR = path.join(__dirname, 'themes');
if (!fs.existsSync(THEMES_DIR)) fs.mkdirSync(THEMES_DIR);
app.use('/themes', express.static(THEMES_DIR));

// ── Theme Finish blocks (the "signature" half of the two-block model) ──────────
// Palette (CSS vars) is extracted into styleCss; the Finish block adds effects a
// variable can't express (backdrop blur, signature background, glow). Finish files
// live in themes/finish/<name>.css, keyed by the style-reference basename, and are
// injected as an extra <style> right after the palette. Returns '' if none exists.
var FINISH_DIR = path.join(THEMES_DIR, 'finish');
function finishStyleTag(ref) {
  if (!ref) return '';
  var base = path.basename(String(ref)).replace(/\.(html|css)$/i, '');
  if (!base) return '';
  try {
    var fp = path.join(FINISH_DIR, base + '.css');
    return fs.existsSync(fp) ? '  <style data-finish="' + base + '">' + fs.readFileSync(fp, 'utf8') + '</style>' : '';
  } catch (e) { return ''; }
}

function getCssRule(css, selector) {
  var re = new RegExp(selector + '\\s*\\{([^}]+)\\}', 'i');
  var m = css.match(re);
  return m ? m[1] : null;
}
function getRuleProp(ruleBody, prop) {
  if (!ruleBody) return null;
  var m = ruleBody.match(new RegExp('(?<![\\w-])' + prop + '\\s*:\\s*([^;\\n]+)'));
  return m ? m[1].trim() : null;
}

function generateThemeCss(html) {
  var css = extractStyleBlock(html);

  // ── imports ──
  var imports = [];
  var importRe = /@import\s+url\([^)]+\)[^;]*;/g;
  var im;
  while ((im = importRe.exec(css)) !== null) imports.push(im[0]);

  // ── background ──
  var rawBg = resolveCssVar(css, getBodyProp(css, 'background(?:-color)?') || '#0a0a0f');
  var bgColor = rawBg.trim().split(/\s+/)[0];
  if (bgColor.startsWith('linear') || bgColor.startsWith('radial') || bgColor.startsWith('var(')) {
    var fbm = rawBg.match(/#[0-9a-f]{3,8}|rgba?\([^)]+\)/i);
    bgColor = fbm ? fbm[0] : '#0a0a0f';
  }
  var light = isLight(bgColor);
  var heroRgb = bgColor.startsWith('#') ? hexToRgbStr(bgColor) : null;

  // ── text ──
  var rawText = resolveCssVar(css, getBodyProp(css, '(?<![\\w-])color'));
  var textColor = (rawText && !rawText.startsWith('var(')) ? rawText : (light ? '#1d1d1f' : '#ffffff');
  var textMuted  = light ? 'rgba(0,0,0,.50)' : 'rgba(255,255,255,.55)';

  // ── accent ──
  var accentColor = null;
  var rootMatch = css.match(/:root\s*\{([^}]+)\}/);
  if (rootMatch) {
    var rootCss = rootMatch[1];
    var accentKeys = ['--accent:', '--accent-primary:', '--primary-color:', '--primary:', '--brand-color:', '--color-primary:', '--highlight:'];
    for (var ak = 0; ak < accentKeys.length; ak++) {
      var are = new RegExp(accentKeys[ak].replace(/[-]/g, '\\-') + '\\s*([^;\\n]+)');
      var am2 = rootCss.match(are);
      if (am2) {
        var cand = resolveCssVar(css, am2[1].trim());
        if (cand && (cand.startsWith('#') || cand.startsWith('rgb'))) { accentColor = cand; break; }
      }
    }
    if (!accentColor) {
      var neonM = rootCss.match(/--(?:neon|glow)-\w+\s*:\s*(#[0-9a-f]{3,8})/i);
      if (neonM) accentColor = neonM[1];
    }
  }
  if (!accentColor) accentColor = light ? '#0066cc' : '#F5A623';
  var accentRgbStr2 = accentColor.startsWith('#') ? hexToRgbStr(accentColor) : null;

  // ── font ──
  var rawFont = getBodyProp(css, 'font-family') || null;
  var headingFont = null;
  var hRule = getCssRule(css, 'h[123]');
  if (hRule) { var hfm = hRule.match(/font-family\s*:\s*([^;]+)/); if (hfm) headingFont = hfm[1].trim(); }

  // ── hero overlay ──
  var overlayStart = light ? '.25' : '.72';
  var overlayEnd   = light ? '.10' : '.38';
  var gradAngle    = '135deg';
  var gradM = css.match(/linear-gradient\(\s*(\d+deg)/);
  if (gradM) gradAngle = gradM[1];

  // ── card ──
  var cardBg = null, cardBorder = null, cardRadius = null, cardShadow = null;
  var cardSelectors = '\\.(?:card|feature-card|glass-card|panel|surface|gradient-card|content-card|info-card|stat-card|metric-card)';
  var crule = getCssRule(css, cardSelectors);
  if (crule) {
    var cbgm = crule.match(/background(?:-color)?\s*:\s*([^;]+)/);
    if (cbgm) { var r = resolveCssVar(css, cbgm[1].trim()); if (r && !r.startsWith('var(')) cardBg = r; }
    var cborm = crule.match(/border(?!\s*-radius)[^:]*:\s*([^;]+)/);
    if (cborm) { var rb = resolveCssVar(css, cborm[1].trim()); if (rb && !rb.startsWith('var(')) cardBorder = rb; }
    var cradm = crule.match(/border-radius\s*:\s*([^;]+)/);
    if (cradm) cardRadius = cradm[1].trim();
    var cshadm = crule.match(/box-shadow\s*:\s*([^;]+)/);
    if (cshadm) cardShadow = cshadm[1].trim();
  }
  if (!cardBg)     cardBg     = light ? 'rgba(0,0,0,.04)'              : 'rgba(255,255,255,.05)';
  if (!cardBorder) cardBorder = light ? 'rgba(0,0,0,.10)'              : 'rgba(255,255,255,.10)';
  if (!cardRadius) cardRadius = '12px';
  if (!cardShadow) cardShadow = light ? '0 2px 12px rgba(0,0,0,.08)' : '0 4px 20px rgba(0,0,0,.35)';

  // ── badge ──
  var badgeBg = null, badgeBorder = null, badgeRadius = null, badgeColor2 = null;
  var bRule = getCssRule(css, '\\.(?:badge|chip|tag|label|pill|category-badge|category|keyword)');
  if (bRule) {
    var bbgm = bRule.match(/background(?:-color)?\s*:\s*([^;]+)/);
    if (bbgm) { var rb2 = resolveCssVar(css, bbgm[1].trim()); if (rb2 && !rb2.startsWith('var(')) badgeBg = rb2; }
    var bborm = bRule.match(/border(?!\s*-radius)[^:]*:\s*([^;]+)/);
    if (bborm) { var rb3 = resolveCssVar(css, bborm[1].trim()); if (rb3 && !rb3.startsWith('var(')) badgeBorder = rb3; }
    var bradm = bRule.match(/border-radius\s*:\s*([^;]+)/);
    if (bradm) badgeRadius = bradm[1].trim();
    var bcolm = bRule.match(/(?<![\\w-])color\s*:\s*([^;]+)/);
    if (bcolm) { var rb4 = resolveCssVar(css, bcolm[1].trim()); if (rb4 && !rb4.startsWith('var(')) badgeColor2 = rb4; }
  }
  var aAlpha  = accentRgbStr2 ? 'rgba(' + accentRgbStr2 + ',.15)' : (light ? 'rgba(0,0,0,.06)' : 'rgba(255,255,255,.08)');
  var aBorder = accentRgbStr2 ? 'rgba(' + accentRgbStr2 + ',.35)' : (light ? 'rgba(0,0,0,.20)' : 'rgba(255,255,255,.20)');
  if (!badgeBg)     badgeBg     = aAlpha;
  if (!badgeBorder) badgeBorder = aBorder;
  if (!badgeRadius) badgeRadius = '6px';
  if (!badgeColor2) badgeColor2 = accentColor;

  // ── logo container (inherits card values) ──
  var logoBg     = light ? 'rgba(0,0,0,.04)'   : 'rgba(255,255,255,.05)';
  var logoBorder = cardBorder;
  var logoRadius = '20px';

  // ── build CSS ──
  var out = '/* auto-generated */\n';
  if (imports.length) out += imports.join('\n') + '\n\n';
  out += ':root {\n';
  out += '  /* Identity */\n';
  out += '  --bg:                 ' + bgColor     + ';\n';
  out += '  --slide-hero-bg:      ' + bgColor     + ';\n';
  if (heroRgb) out += '  --slide-hero-rgb:     ' + heroRgb     + ';\n';
  out += '  --text:               ' + textColor   + ';\n';
  out += '  --text-muted:         ' + textMuted   + ';\n';
  var accentLightColor = accentColor.startsWith('#') ? hexToLight(accentColor) : accentColor;
  out += '  --accent:             ' + accentColor      + ';\n';
  if (accentRgbStr2) out += '  --accent-rgb:         ' + accentRgbStr2 + ';\n';
  out += '  --accent-mid:         ' + accentColor      + ';\n';
  out += '  --accent-light:       ' + accentLightColor + ';\n';
  if (rawFont) {
    out += '  --font-body:          ' + rawFont              + ';\n';
    out += '  --font-heading:       ' + (headingFont || rawFont) + ';\n';
  }
  out += '\n  /* Hero overlay */\n';
  out += '  --hero-overlay-angle: ' + gradAngle    + ';\n';
  out += '  --hero-overlay-start: ' + overlayStart + ';\n';
  out += '  --hero-overlay-end:   ' + overlayEnd   + ';\n';
  out += '\n  /* Cards */\n';
  out += '  --card-bg:            ' + cardBg     + ';\n';
  out += '  --card-border:        ' + cardBorder + ';\n';
  out += '  --card-radius:        ' + cardRadius + ';\n';
  out += '  --card-shadow:        ' + cardShadow + ';\n';
  out += '\n  /* Badge */\n';
  out += '  --badge-bg:           ' + badgeBg     + ';\n';
  out += '  --badge-border:       ' + badgeBorder + ';\n';
  out += '  --badge-radius:       ' + badgeRadius + ';\n';
  out += '  --badge-color:        ' + badgeColor2 + ';\n';
  out += '\n  /* Logo container */\n';
  out += '  --logo-bg:            ' + logoBg     + ';\n';
  out += '  --logo-border:        ' + logoBorder + ';\n';
  out += '  --logo-radius:        ' + logoRadius + ';\n';
  out += '}\n';
  if (rawFont) out += 'body, .slide { font-family: var(--font-body); }\n';
  if (headingFont && headingFont !== rawFont) out += 'h1, h2, h3 { font-family: var(--font-heading); }\n';
  return out;
}

app.get('/api/themes', function (req, res) {
  try {
    var styleFiles = fs.existsSync(THEMES_DIR)
      ? fs.readdirSync(THEMES_DIR).filter(function (f) { return f.endsWith('.css'); }).sort()
      : [];
    var list = styleFiles.map(function (file) {
      var css = fs.readFileSync(path.join(THEMES_DIR, file), 'utf8');
      var bgMatch  = css.match(/--bg:\s*([^;]+);/);
      var accMatch = css.match(/--accent:\s*([^;]+);/);
      var bgColor  = bgMatch  ? bgMatch[1].trim()  : '#0a0a0f';
      var accColor = accMatch ? accMatch[1].trim() : '#F5A623';
      return { id: file.replace(/\.css$/, ''), name: slugToName(file), file: file, bgColor: bgColor, accentColor: accColor };
    });
    res.json({ success: true, data: list });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/themes/regenerate', function (req, res) {
  try {
    if (!fs.existsSync(THEMES_DIR)) fs.mkdirSync(THEMES_DIR);
    var refFiles = fs.readdirSync(STYLE_REFS_DIR).filter(function (f) { return f.endsWith('.html'); });
    var generated = [];
    refFiles.forEach(function (file) {
      var html  = fs.readFileSync(path.join(STYLE_REFS_DIR, file), 'utf8');
      var css   = generateThemeCss(html);
      var outFile = file.replace(/\.html$/, '.css');
      fs.writeFileSync(path.join(THEMES_DIR, outFile), css, 'utf8');
      generated.push(outFile);
    });
    res.json({ success: true, generated: generated });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/style-references', function (req, res) {
  try {
    var files = fs.readdirSync(STYLE_REFS_DIR).filter(function (f) { return f.endsWith('.html'); }).sort();
    var list = files.map(function (file) {
      var html = fs.readFileSync(path.join(STYLE_REFS_DIR, file), 'utf8');
      var css = extractStyleCss(html);
      var bgColor = extractBgColor(css) || '#1a1a2e';
      var id = file.replace(/\.html$/, '');
      return { id: id, name: slugToName(file), file: file, bgColor: bgColor };
    });
    res.json({ success: true, data: list });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── API: deck config ──────────────────────────────────────────────────────────
var DECKS_PATH         = path.join(__dirname, 'data', 'decks.json');
var DECK_PATH          = path.join(__dirname, 'data', 'deck.json');
var DECKS_DIR_PATH     = path.join(__dirname, 'data', 'decks');
var LIBRARY_PATH       = path.join(__dirname, 'data', 'slide-library.json');
var PRESENTATIONS_PATH = path.join(__dirname, 'data', 'presentations.json');
var LAYOUTS_PATH              = path.join(__dirname, 'data', 'layouts.json');
var TEMPLATES_PATH            = path.join(__dirname, 'data', 'slide-templates.json');
var TEMPLATE_CATALOG_PATH  = path.join(__dirname, 'data', 'templates.json');
var SETTINGS_PATH          = path.join(__dirname, 'data', 'settings.json');
var LANGUAGES_PATH     = path.join(__dirname, 'data', 'languages.json');
function getTranslationsPath(deckId) {
  return path.join(__dirname, 'data', 'decks', deckId || 'default', 'translations.json');
}

// Resolve a template by id from either the canvas builder store or the HTML catalog.
// Returns { source: 'canvas'|'html', tpl, filePath? } or null.
function resolveTemplate(templateId) {
  var canvasList = JSON.parse(fs.readFileSync(TEMPLATES_PATH, 'utf8'));
  var canvasTpl  = canvasList.find(function (t) { return t.id === templateId; });
  if (canvasTpl) return { source: 'canvas', tpl: canvasTpl };

  var catalog  = JSON.parse(fs.readFileSync(TEMPLATE_CATALOG_PATH, 'utf8'));
  var htmlTpl  = catalog.find(function (t) { return t.id === templateId; });
  if (htmlTpl) {
    return {
      source:   'html',
      tpl:      htmlTpl,
      filePath: path.join(__dirname, htmlTpl.file)
    };
  }
  return null;
}

// ── Umami DB (direct Postgres — Umami API ignores URL filters in this version) ──
const { Pool } = require('pg');
var _umamiDb = null;
function getUmamiDb() {
  if (!_umamiDb && process.env.UMAMI_DB_URL) {
    _umamiDb = new Pool({ connectionString: process.env.UMAMI_DB_URL });
    _umamiDb.on('error', function () {});
  }
  return _umamiDb;
}

// Returns per-URL pageview + visitor counts for an array of url_paths.
// Result: { '/finished/00000001/': { pageviews: 5, visitors: 2 }, ... }
function dbPresStats(urlPaths, startMs, endMs, cb) {
  var db = getUmamiDb();
  if (!db || !urlPaths.length) return cb(null, {});
  var siteId = null;
  try { siteId = UMAMI_WEBSITE_ID || JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')).umamiWebsiteId; } catch (e) {}
  if (!siteId) return cb(null, {});
  db.query(
    'SELECT url_path, COUNT(*) AS pageviews, COUNT(DISTINCT session_id) AS visitors ' +
    'FROM website_event ' +
    'WHERE website_id = $1 AND url_path = ANY($2) AND event_type = 1 ' +
    '  AND created_at >= to_timestamp($3::bigint / 1000.0) ' +
    '  AND created_at <  to_timestamp($4::bigint / 1000.0) ' +
    'GROUP BY url_path',
    [siteId, urlPaths, startMs, endMs],
    function (err, result) {
      if (err) return cb(err);
      var out = {};
      (result.rows || []).forEach(function (r) {
        out[r.url_path] = { pageviews: parseInt(r.pageviews, 10), visitors: parseInt(r.visitors, 10) };
      });
      cb(null, out);
    }
  );
}

// Returns a day-by-day time series aggregated across multiple url_paths.
// Result: { pageviews: [{x, y}], sessions: [{x, y}] } — zero-filled for days with no data.
function dbPresTimeSeries(urlPaths, startMs, endMs, cb) {
  var db = getUmamiDb();
  if (!db || !urlPaths.length) return cb(null, { pageviews: [], sessions: [] });
  var siteId = null;
  try { siteId = UMAMI_WEBSITE_ID || JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')).umamiWebsiteId; } catch (e) {}
  if (!siteId) return cb(null, { pageviews: [], sessions: [] });
  db.query(
    "SELECT TO_CHAR(created_at AT TIME ZONE '" + localTzString() + "', 'YYYY-MM-DD') AS day, " +
    '       COUNT(*) AS pageviews, COUNT(DISTINCT session_id) AS visitors ' +
    'FROM website_event ' +
    'WHERE website_id = $1 AND url_path = ANY($2) AND event_type = 1 ' +
    '  AND created_at >= to_timestamp($3::bigint / 1000.0) ' +
    '  AND created_at <  to_timestamp($4::bigint / 1000.0) ' +
    'GROUP BY 1 ORDER BY 1',
    [siteId, urlPaths, startMs, endMs],
    function (err, result) {
      if (err) return cb(err);
      var DAY = 86400000;
      var days = [];
      var cur = new Date(startMs); cur.setHours(0, 0, 0, 0);
      while (cur.getTime() < endMs) { days.push(localDate(cur)); cur = new Date(cur.getTime() + DAY); }
      var byDay = {};
      (result.rows || []).forEach(function (r) { byDay[r.day] = r; });
      var pageviews = days.map(function (d) { return { x: d, y: byDay[d] ? parseInt(byDay[d].pageviews, 10) : 0 }; });
      var sessions  = days.map(function (d) { return { x: d, y: byDay[d] ? parseInt(byDay[d].visitors,  10) : 0 }; });
      cb(null, { pageviews: pageviews, sessions: sessions });
    }
  );
}

// Slug to title case (e.g. "company-intro" → "Company Intro").
function slugToTitle(slug) {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
}

// Returns slide event counts grouped by event_name for a set of url_paths.
// Pass eventNames array to restrict to specific events (null = all slide-* events).
// Result: [{ event, label, count }] sorted by count desc.
function dbSlideEvents(urlPaths, startMs, endMs, eventNames, cb) {
  var db = getUmamiDb();
  if (!db || !urlPaths.length) return cb(null, []);
  var siteId = null;
  try { siteId = UMAMI_WEBSITE_ID || JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')).umamiWebsiteId; } catch (e) {}
  if (!siteId) return cb(null, []);
  var params = [siteId, urlPaths, startMs, endMs];
  var extra = '';
  if (eventNames && eventNames.length) { params.push(eventNames); extra = ' AND event_name = ANY($5)'; }
  db.query(
    'SELECT event_name, COUNT(*) AS cnt ' +
    'FROM website_event ' +
    "WHERE website_id = $1 AND url_path = ANY($2) AND event_type = 2 AND event_name LIKE 'slide-%'" + extra +
    '  AND created_at >= to_timestamp($3::bigint / 1000.0) ' +
    '  AND created_at <  to_timestamp($4::bigint / 1000.0) ' +
    'GROUP BY event_name ORDER BY cnt DESC',
    params,
    function (err, result) {
      if (err) return cb(err);
      var out = (result.rows || []).map(function (r) {
        return { event: r.event_name, label: slugToTitle(r.event_name.replace(/^slide-/, '')), count: parseInt(r.cnt, 10) };
      });
      cb(null, out);
    }
  );
}

// Returns day-by-day event counts per event_name.
// Result: { days: ['2026-05-01', ...], series: [{ event, label, values: [N, ...] }] }
function dbSlideEventSeries(urlPaths, startMs, endMs, eventNames, cb) {
  var db = getUmamiDb();
  if (!db || !urlPaths.length) return cb(null, { days: [], series: [] });
  var siteId = null;
  try { siteId = UMAMI_WEBSITE_ID || JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')).umamiWebsiteId; } catch (e) {}
  if (!siteId) return cb(null, { days: [], series: [] });
  var params = [siteId, urlPaths, startMs, endMs];
  var extra = '';
  if (eventNames && eventNames.length) { params.push(eventNames); extra = ' AND event_name = ANY($5)'; }
  db.query(
    "SELECT TO_CHAR(created_at AT TIME ZONE '" + localTzString() + "', 'YYYY-MM-DD') AS day, event_name, COUNT(*) AS cnt " +
    'FROM website_event ' +
    "WHERE website_id = $1 AND url_path = ANY($2) AND event_type = 2 AND event_name LIKE 'slide-%'" + extra +
    '  AND created_at >= to_timestamp($3::bigint / 1000.0) ' +
    '  AND created_at <  to_timestamp($4::bigint / 1000.0) ' +
    'GROUP BY 1, 2 ORDER BY 1, 2',
    params,
    function (err, result) {
      if (err) return cb(err);
      var DAY = 86400000;
      var days = [];
      var cur = new Date(startMs); cur.setHours(0, 0, 0, 0);
      while (cur.getTime() < endMs) { days.push(localDate(cur)); cur = new Date(cur.getTime() + DAY); }
      var byEvent = {};
      (result.rows || []).forEach(function (r) {
        if (!byEvent[r.event_name]) byEvent[r.event_name] = {};
        byEvent[r.event_name][r.day] = parseInt(r.cnt, 10);
      });
      var evNames = Object.keys(byEvent).sort();
      var series = evNames.map(function (ev) {
        return { event: ev, label: slugToTitle(ev.replace(/^slide-/, '')), values: days.map(function (d) { return byEvent[ev][d] || 0; }) };
      });
      cb(null, { days: days, series: series });
    }
  );
}

// Returns per-presentation event counts for a specific slide event (drill-down).
// Result: [{ label, count }] sorted by count desc.
function dbSlideEventByPres(urlPaths, presMap, startMs, endMs, eventName, cb) {
  var db = getUmamiDb();
  if (!db || !urlPaths.length) return cb(null, []);
  var siteId = null;
  try { siteId = UMAMI_WEBSITE_ID || JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')).umamiWebsiteId; } catch (e) {}
  if (!siteId) return cb(null, []);
  db.query(
    'SELECT url_path, COUNT(*) AS cnt ' +
    'FROM website_event ' +
    'WHERE website_id = $1 AND url_path = ANY($2) AND event_type = 2 AND event_name = $5 ' +
    '  AND created_at >= to_timestamp($3::bigint / 1000.0) ' +
    '  AND created_at <  to_timestamp($4::bigint / 1000.0) ' +
    'GROUP BY url_path ORDER BY cnt DESC',
    [siteId, urlPaths, startMs, endMs, eventName],
    function (err, result) {
      if (err) return cb(err);
      var out = (result.rows || []).map(function (r) {
        var presId = r.url_path.replace(/^\/public\//, '').replace(/\/$/, '');
        return { label: presMap[presId] || presId, count: parseInt(r.cnt, 10) };
      });
      cb(null, out);
    }
  );
}

// ── Umami analytics proxy ─────────────────────────────────────────────────────
// UMAMI_BASE_URL:    public URL injected into published presentations as the tracking script src.
// UMAMI_API_URL:     internal URL the server uses for Umami API calls (login, stats).
//                    In Docker this is http://umami:3000 (container-to-container).
//                    Defaults to UMAMI_BASE_URL if not set.
// UMAMI_WEBSITE_ID:  overrides umamiWebsiteId in settings.json — set per environment in .env.
var UMAMI_BASE_URL   = process.env.UMAMI_BASE_URL   || 'https://umami.wbtm.io';
var UMAMI_API_URL    = process.env.UMAMI_API_URL    || UMAMI_BASE_URL;
var UMAMI_USER       = process.env.UMAMI_USERNAME   || '';
var UMAMI_PASS       = process.env.UMAMI_PASSWORD   || '';
var UMAMI_WEBSITE_ID = process.env.UMAMI_WEBSITE_ID || '';

var _umamiToken    = null;   // cached JWT
var _umamiTokenExp = 0;      // expiry timestamp (ms)
var _analyticsCache = {};    // path → { data, expiresAt }

// Build Umami v2 URL filter query string for a finished presentation.
// Umami v2 ignores the legacy &url= param; the correct form is &filters=[...].
function umamiPresFilter(presId) {
  if (!presId) return '';
  var f = JSON.stringify([{ column: 'url_path', filter: '=', value: '/public/' + presId + '/' }]);
  return '&filters=' + encodeURIComponent(f);
}

// Safely extract a numeric value from Umami v2 stats fields.
// Umami v2 returns plain numbers; older instances returned { value: N }.
function umamiVal(field) {
  if (field == null) return 0;
  if (typeof field === 'object') return field.value || 0;
  return field || 0;
}
var ANALYTICS_TTL  = 15 * 60 * 1000; // 15 min

function getUmamiToken(cb) {
  if (_umamiToken && Date.now() < _umamiTokenExp) return cb(null, _umamiToken);
  var body   = JSON.stringify({ username: UMAMI_USER, password: UMAMI_PASS });
  var url    = new URL('/api/auth/login', UMAMI_API_URL);
  var mod    = url.protocol === 'https:' ? https : http;
  var opts   = {
    hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80), path: url.pathname,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
  };
  var req = mod.request(opts, function (res) {
    var raw = '';
    res.on('data', function (c) { raw += c; });
    res.on('end', function () {
      try {
        var d = JSON.parse(raw);
        if (!d.token) return cb(new Error('Umami auth failed: ' + raw));
        _umamiToken    = d.token;
        _umamiTokenExp = Date.now() + 23 * 3600 * 1000; // 23h
        cb(null, _umamiToken);
      } catch (e) { cb(e); }
    });
  });
  req.on('error', cb);
  req.write(body);
  req.end();
}

function umamiGet(apiPath, cb) {
  var cached = _analyticsCache[apiPath];
  if (cached && Date.now() < cached.expiresAt) return cb(null, cached.data);
  getUmamiToken(function (err, token) {
    if (err) return cb(err);
    var url   = new URL(apiPath, UMAMI_API_URL);
    var mod   = url.protocol === 'https:' ? https : http;
    var opts  = {
      hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + (url.search || ''),
      method: 'GET',
      headers: { Authorization: 'Bearer ' + token }
    };
    var req = mod.request(opts, function (res) {
      var raw = '';
      res.on('data', function (c) { raw += c; });
      res.on('end', function () {
        try {
          var data = JSON.parse(raw);
          _analyticsCache[apiPath] = { data: data, expiresAt: Date.now() + ANALYTICS_TTL };
          cb(null, data);
        } catch (e) { cb(e); }
      });
    });
    req.on('error', cb);
    req.end();
  });
}

// Auto-setup: creates the Umami website entry on first start if umamiWebsiteId is missing.
// Retries for up to ~2 minutes to give Umami time to boot.
function setupUmamiWebsite() {
  if (!UMAMI_USER) return;
  function trySetup(attemptsLeft) {
    if (attemptsLeft <= 0) { console.warn('[umami] setup gave up — set umamiWebsiteId manually in settings.json'); return; }
    getUmamiToken(function (err, token) {
      if (err) {
        console.log('[umami] not ready yet, retrying in 10s… (' + attemptsLeft + ' attempts left)');
        return setTimeout(function () { trySetup(attemptsLeft - 1); }, 10000);
      }
      var settings = readSettings();
      if (UMAMI_WEBSITE_ID || settings.umamiWebsiteId) { console.log('[umami] website already configured:', UMAMI_WEBSITE_ID || settings.umamiWebsiteId); return; }
      var domain = (PUBLIC_BASE_URL).replace(/^https?:\/\//, '');
      var body   = JSON.stringify({ name: 'Put.A.Presentation', domain: domain });
      var url    = new URL('/api/websites', UMAMI_API_URL);
      var mod    = url.protocol === 'https:' ? https : http;
      var opts   = {
        hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'Authorization': 'Bearer ' + token }
      };
      var req = mod.request(opts, function (res) {
        var raw = '';
        res.on('data', function (c) { raw += c; });
        res.on('end', function () {
          try {
            var d = JSON.parse(raw);
            if (!d.id) throw new Error('unexpected response: ' + raw);
            var s = readSettings();
            s.umamiWebsiteId = d.id;
            fs.writeFileSync(SETTINGS_PATH, JSON.stringify(s, null, 2), 'utf8');
            console.log('[umami] website created and saved, id:', d.id);
          } catch (e) { console.warn('[umami] setup error:', e.message); }
        });
      });
      req.on('error', function () { setTimeout(function () { trySetup(attemptsLeft - 1); }, 10000); });
      req.write(body);
      req.end();
    });
  }
  setTimeout(function () { trySetup(12); }, 15000); // wait 15s for Umami to boot, then try up to 12× every 10s
}

function readSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')); }
  catch (e) { return { logos: [], logosOnAllSlides: true, heroBg: '', heroBgFocal: '50% 50%', heroBgFocalGrid: 3 }; }
}
function writeSettings(data) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(data, null, 2), 'utf8');
}
function hexToRgb(hex) {
  var m = (hex || '').replace('#', '').match(/^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return null;
  return parseInt(m[1], 16) + ',' + parseInt(m[2], 16) + ',' + parseInt(m[3], 16);
}
function deckAccentCss(deck) {
  var out = [];
  var color = deck && deck.colors && deck.colors.primary;
  if (color) {
    var rgb = hexToRgb(color);
    if (!rgb) {
      out.push(':root{--accent:' + color + ';}');
    } else {
      var parts = rgb.split(',').map(Number);
      var r = parts[0], g = parts[1], b = parts[2];
      var mid   = '#' + [Math.max(0,Math.round(r*.88)), Math.max(0,Math.round(g*.88)), Math.max(0,Math.round(b*.88))].map(function(c){return c.toString(16).padStart(2,'0');}).join('');
      var light = '#' + [Math.min(255,Math.round(r+(255-r)*.42)), Math.min(255,Math.round(g+(255-g)*.42)), Math.min(255,Math.round(b+(255-b)*.42))].map(function(c){return c.toString(16).padStart(2,'0');}).join('');
      out.push(':root{--accent:' + color + ';--accent-mid:' + mid + ';--accent-light:' + light + ';--accent-rgb:' + rgb + ';}');
    }
  }
  if (deck && deck.heroBgType === 'color') {
    var hColor = deck.heroBgColor || '#070B1A';
    var hRgb = hexToRgb(hColor);
    out.push(':root{--slide-hero-bg:' + hColor + (hRgb ? ';--slide-hero-rgb:' + hRgb : '') + ';}');
    out.push('img.hero-bg{display:none!important}.hero-overlay{display:none!important}');
  }
  return out.join('\n');
}
function injectDeckBranding(html, deck) {
  if (!deck) return html;
  var $ = cheerio.load(html, { xmlMode: false });
  var img = $('img.hero-bg');
  if (!img.length) return html;
  if (deck.heroBg) img.attr('src', deck.heroBg);
  var s = (img.attr('style') || '')
    .replace(/object-position\s*:[^;]+;?/g, '')
    .replace(/object-fit\s*:[^;]+;?/g, '')
    .replace(/opacity\s*:[^;]+;?/g, '');
  if (deck.heroBgFocal) s += ';object-position:' + deck.heroBgFocal + ';';
  if (deck.heroBgFit === 'contain') s += 'object-fit:contain;';
  var opacity = (deck.heroBgOpacity !== undefined && deck.heroBgOpacity !== null) ? parseInt(deck.heroBgOpacity) : 100;
  if (opacity < 100) s += ';opacity:' + (opacity / 100).toFixed(2) + ';';
  img.attr('style', s.replace(/^;+/, '').trim());
  return $.html('body > *') || $.html();
}

// ── Universal gallery feature ──────────────────────────────────────────────
// Slide-level, opt-in via libSlide.galleryEnabled. Injects the same grid-icon
// "Gallery" button + a starter data-store the gallery.js component expects, into
// any slide. Content then persists through the normal gallery-track edit pipeline.
var GALLERY_FEATURE_HTML = [
  '<button class="pb-gallery-btn" data-ls-gallery-open data-builder-feature="gallery" title="Open gallery" contenteditable="false">',
  '  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>',
  '  Gallery',
  '</button>',
  '<div data-ls-gallery data-edit="gallery-track" data-autoplay="8" style="display:none;">',
  '  <div class="ls-gallery-slide ls-gallery-slide--text"><div class="ls-gallery-stat">',
  '    <span class="ls-gallery-label" contenteditable spellcheck="false">Section Title</span>',
  '    <span class="ls-gallery-number" contenteditable spellcheck="false">Key Fact</span>',
  '    <span class="ls-gallery-body-text" contenteditable spellcheck="false">Description text here</span>',
  '  </div></div>',
  '</div>'
].join('\n');

function injectGallery(html, enabled) {
  if (!enabled) return html;
  var $ = cheerio.load(html, { xmlMode: false });
  if ($('[data-ls-gallery]').length) return html;       // already present (legacy cartridge)
  var root = $('.slide').first();
  if (!root.length) root = $('body').children().first();
  if (!root.length) return html;
  root.append(GALLERY_FEATURE_HTML);
  return $.html('body > *') || $.html();
}

// ── Single cartridge render path ──────────────────────────────────────────────
// THE one place a cartridge (HTML-file slide) becomes rendered HTML. Every surface
// (deck preview, Builder Preview, library preview/edit, publish) calls this so a
// per-slide feature (gallery, hero-bg, logo-row…) is wired ONCE and can't drift.
// Builder Preview is the source of truth; all others are reflections of this output.
//
// opts:
//   galleryEnabled  bool   — inject the universal gallery feature
//   rawEdits        object — slide edits BEFORE deck wrapping (resolveSlideEdits result)
//   deck            object — deck config; when present, edits are brand-wrapped and
//                            deck branding is injected. Pass null/undefined for standalone.
//   editable        bool   — render data-edit slots as contenteditable (builder) vs static
function renderCartridge(resolved, opts) {
  var edits = opts.deck
    ? withBrandCredit(withLiveLogos(opts.rawEdits), opts.deck)
    : opts.rawEdits;
  var html = injectGallery(fs.readFileSync(resolved.filePath, 'utf8'), opts.galleryEnabled);
  html = applyEditsToHtml(html, edits, opts.editable);
  if (opts.deck) html = injectDeckBranding(html, opts.deck);
  return html;
}

// GET /api/deck — return the current deck config, with library slide names merged in
app.get('/api/deck', function (req, res) {
  try {
    var activeDeckId = getActiveDeckId();
    var deck    = readDeckById(activeDeckId);
    var library = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'));
    var catalog = JSON.parse(fs.readFileSync(TEMPLATE_CATALOG_PATH, 'utf8'));

    deck.slides = deck.slides.map(function (slide) {
      if (!slide.librarySlideId) return slide;
      var libSlide = library.slides.find(function (s) { return s.id === slide.librarySlideId; });
      if (!libSlide) return slide;
      var tpl = catalog.find(function (t) { return t.id === libSlide.templateId; });
      return Object.assign({}, slide, {
        name: libSlide.name,
        templateId: libSlide.templateId || null,
        templateName: tpl ? tpl.name : null
      });
    });

    // Resolve cover slide's customer logo for the active deck
    var coverLogoSrc = '';
    var coverDeckSlide = deck.slides.find(function (s) {
      if (!s.librarySlideId) return false;
      var lib = library.slides.find(function (l) { return l.id === s.librarySlideId; });
      return lib && (lib.templateId === 'ls01-cover' || lib.templateId === 'ls26-cover');
    });
    if (coverDeckSlide) {
      var coverLib = library.slides.find(function (l) { return l.id === coverDeckSlide.librarySlideId; });
      if (coverLib) {
        var raw = String(resolveSlideEdits(coverLib, activeDeckId)['customer-logo'] || '');
        if (raw) coverLogoSrc = raw.includes('<') ? (raw.match(/\bsrc="([^"]*)"/) || [])[1] || '' : raw;
      }
    }

    var deckCfg = getDeckConfig(activeDeckId);
    var finishCss = (function () {
      var ref = deckCfg.styleRef;
      if (!ref) return null;
      var base = path.basename(String(ref)).replace(/\.(html|css)$/i, '');
      if (!base) return null;
      try {
        var fp = path.join(FINISH_DIR, base + '.css');
        return fs.existsSync(fp) ? fs.readFileSync(fp, 'utf8') : null;
      } catch (e) { return null; }
    })();
    res.json({ success: true, data: deck, accentCss: deckAccentCss(deckCfg), styleCss: deckCfg.styleCss || null, finishCss: finishCss, coverLogoSrc: coverLogoSrc });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/deck — merge fields into the deck config
// Body can be partial: { title } or full: { title, slides: [{ id, visible }] }
app.put('/api/deck', function (req, res) {
  var body = req.body;
  if (!body) return res.status(400).json({ success: false, error: 'No body provided' });

  if (body.slides !== undefined && !Array.isArray(body.slides)) {
    return res.status(400).json({ success: false, error: 'slides must be an array' });
  }

  if (Array.isArray(body.slides)) {
    for (var i = 0; i < body.slides.length; i++) {
      var s = body.slides[i];
      if (typeof s.id !== 'string' || typeof s.visible !== 'boolean') {
        return res.status(400).json({
          success: false,
          error: 'Each slide must have id (string) and visible (boolean). Failed at index ' + i
        });
      }
    }
  }

  try {
    var activeDeckId = getActiveDeckId();
    var existing = readDeckById(activeDeckId);
    var merged = Object.assign({}, existing, body);
    if (Array.isArray(merged.slides)) {
      // Merge incoming slides with existing data so librarySlideId is never lost
      var existingMap = {};
      (existing.slides || []).forEach(function(s) { existingMap[s.id] = s; });
      merged.slides = merged.slides.map(function (s) {
        var base = existingMap[s.id] || {};
        var clean = { id: s.id, visible: s.visible };
        var libId = s.librarySlideId || base.librarySlideId;
        if (libId) clean.librarySlideId = libId;
        return clean;
      });
    }
    writeDeckById(activeDeckId, merged);
    res.json({ success: true, data: merged });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/deck/slides — add a library-backed slide to the deck
// Body: { librarySlideId: "lib-..." }
app.post('/api/deck/slides', function (req, res) {
  var librarySlideId = req.body && req.body.librarySlideId;
  if (!librarySlideId) return res.status(400).json({ success: false, error: 'librarySlideId is required' });

  try {
    var library  = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'));
    var libSlide = library.slides.find(function (s) { return s.id === librarySlideId; });
    if (!libSlide) return res.status(404).json({ success: false, error: 'Library slide not found' });

    var activeDeckId = getActiveDeckId();
    var deck       = readDeckById(activeDeckId);
    var deckConfig = getDeckConfig(activeDeckId);
    var existing = deck.slides.find(function (s) { return s.librarySlideId === librarySlideId; });
    if (existing) return res.json({ success: true, data: existing });

    // Enforce 1-slide-per-deck: block if already assigned to a different deck
    if (Array.isArray(libSlide.decks) && libSlide.decks.length > 0 && libSlide.decks[0].id !== activeDeckId) {
      var takenBy = libSlide.decks[0].name || libSlide.decks[0].id;
      return res.status(409).json({
        success: false,
        error: 'SLIDE_IN_OTHER_DECK',
        message: '"' + (libSlide.name || 'This slide') + '" is already in "' + takenBy + '". Duplicate it first to add a copy to this deck.',
        deckName: takenBy
      });
    }
    var newSlide = { id: 'deck-' + librarySlideId + '-' + Date.now(), librarySlideId: librarySlideId, visible: true };
    if (librarySlideId === 'lib-cover') {
      deck.slides.unshift(newSlide);
    } else if (librarySlideId === 'lib-cta') {
      deck.slides.push(newSlide);
    } else {
      deck.slides.push(newSlide);
    }
    writeDeckById(activeDeckId, deck);

    // Track which decks include this library slide so library-preview can use deck context
    if (!Array.isArray(libSlide.decks)) libSlide.decks = [];
    if (!libSlide.decks.some(function (d) { return d.id === activeDeckId; })) {
      libSlide.decks.push({ id: activeDeckId, name: deckConfig.name || activeDeckId });
      fs.writeFileSync(LIBRARY_PATH, JSON.stringify(library, null, 2), 'utf8');
    }

    // If deck has no style and this slide brings a legacy .html styleRef, promote it to the deck
    // (.css theme files are per-slide; don't promote them to deck level)
    if (!deckConfig.styleRef && libSlide.styleRef && libSlide.styleCss && libSlide.styleRef.endsWith('.html')) {
      var decksStore = JSON.parse(fs.readFileSync(DECKS_PATH, 'utf8'));
      var deckIdx = decksStore.decks.findIndex(function (d) { return d.id === activeDeckId; });
      if (deckIdx !== -1) {
        decksStore.decks[deckIdx].styleRef = libSlide.styleRef;
        decksStore.decks[deckIdx].styleCss = libSlide.styleCss;
        fs.writeFileSync(DECKS_PATH, JSON.stringify(decksStore, null, 2), 'utf8');
      }
    }

    res.json({ success: true, data: newSlide });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/deck/slides/:id — remove a slide from the deck (does not touch layouts.json)
app.delete('/api/deck/slides/:id', function (req, res) {
  try {
    var activeDeckId = getActiveDeckId();
    var deck      = readDeckById(activeDeckId);
    var removing  = deck.slides.find(function (s) { return s.id === req.params.id; });
    var filtered  = deck.slides.filter(function (s) { return s.id !== req.params.id; });
    deck.slides   = filtered;
    writeDeckById(activeDeckId, deck);

    // Remove this deck from the library slide's decks[] so thumbnail reverts to no-deck render
    if (removing && removing.librarySlideId) {
      var library  = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'));
      var libSlide = library.slides.find(function (s) { return s.id === removing.librarySlideId; });
      if (libSlide && Array.isArray(libSlide.decks)) {
        libSlide.decks = libSlide.decks.filter(function (d) { return d.id !== activeDeckId; });
        fs.writeFileSync(LIBRARY_PATH, JSON.stringify(library, null, 2), 'utf8');
      }
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/deck/slides/:id/edits — save edits for a deck slide (synced to library slide)
app.post('/api/deck/slides/:id/edits', function (req, res) {
  try {
    var id    = req.params.id;
    var edits = req.body.edits;
    if (!id || !edits) return res.status(400).json({ success: false, error: 'Missing id or edits' });

    var activeDeckId = getActiveDeckId();
    var deck      = readDeckById(activeDeckId);
    var deckSlide = deck.slides.find(function (s) { return s.id === id; });
    if (!deckSlide) return res.status(404).json({ success: false, error: 'Deck slide not found' });

    var library  = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'));
    var libSlide = library.slides.find(function (s) { return s.id === deckSlide.librarySlideId; });
    if (!libSlide) return res.status(404).json({ success: false, error: 'Library slide not found' });

    if (!libSlide.deckEdits) libSlide.deckEdits = {};
    if (!libSlide.deckEdits[activeDeckId]) libSlide.deckEdits[activeDeckId] = {};
    libSlide.deckEdits[activeDeckId] = Object.assign({}, libSlide.deckEdits[activeDeckId], edits);
    fs.writeFileSync(LIBRARY_PATH, JSON.stringify(library, null, 2), 'utf8');
    markSlideTranslationsDirty(deckSlide.librarySlideId, edits, activeDeckId);

    // Propagate cover logo change to all presentations in this deck
    var isCoverEdit = edits.hasOwnProperty('customer-logo')
      && (libSlide.templateId === 'ls01-cover' || libSlide.templateId === 'ls26-cover');
    if (isCoverEdit) {
      var raw = String(edits['customer-logo'] || '');
      var newLogoSrc = raw.includes('<') ? (raw.match(/\bsrc="([^"]*)"/) || [])[1] || '' : raw;
      var presData = JSON.parse(fs.readFileSync(PRESENTATIONS_PATH, 'utf8'));
      var changed = false;
      (presData.presentations || []).forEach(function (p) {
        if (p.deckId === activeDeckId) { p.customerLogoSrc = newLogoSrc; changed = true; }
      });
      if (changed) fs.writeFileSync(PRESENTATIONS_PATH, JSON.stringify(presData, null, 2), 'utf8');
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── API: decks (named deck management) ────────────────────────────────────────

function readDecks() {
  try { return JSON.parse(fs.readFileSync(DECKS_PATH, 'utf8')); }
  catch (e) { return { activeDeckId: 'default', decks: [] }; }
}
function writeDecks(data) {
  fs.writeFileSync(DECKS_PATH, JSON.stringify(data, null, 2), 'utf8');
}
function makeDeckId() {
  return 'deck-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
}
function localDate(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}
function localDateString() {
  return localDate(new Date());
}
function localTzString() {
  var off = new Date().getTimezoneOffset(); // minutes behind UTC (+300 = UTC-5, -300 = UTC+5)
  var h = Math.floor(Math.abs(off) / 60);
  var m = Math.abs(off) % 60;
  return (off <= 0 ? '+' : '-') + String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}
function getDeckConfig(deckId) {
  var store = readDecks();
  return store.decks.find(function (d) { return d.id === deckId; }) || {};
}
function getDeckPath(deckId) {
  return path.join(DECKS_DIR_PATH, deckId, 'deck.json');
}
function readDeckById(deckId) {
  var p = getDeckPath(deckId);
  if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  if (deckId === 'default' && fs.existsSync(DECK_PATH)) {
    return JSON.parse(fs.readFileSync(DECK_PATH, 'utf8'));
  }
  return { title: '', slides: [] };
}
function writeDeckById(deckId, data) {
  var dir = path.join(DECKS_DIR_PATH, deckId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(getDeckPath(deckId), JSON.stringify(data, null, 2), 'utf8');
}
function getActiveDeckId() {
  return readDecks().activeDeckId || 'default';
}
function resolveSlideEdits(libSlide, deckId) {
  if (libSlide.deckEdits) {
    return Object.assign({}, libSlide.deckEdits[deckId] || {});
  }
  return libSlide.edits || {};
}

// Returns default field values for a slide by rendering it with no saved edits.
// This lets the translation system see fields that were never explicitly edited by the user.
function extractSlideDefaultFields(libSlide, deckId) {
  var defaults = {};
  var resolved = resolveTemplate(libSlide.templateId);
  if (!resolved) return defaults;
  try {
    var html;
    if (resolved.source === 'canvas') {
      var deckConfig = getDeckConfig(deckId);
      html = renderLayoutToHtml(resolved.tpl, libSlide.id, {}, deckConfig);
    } else if (resolved.source === 'html' && resolved.filePath && fs.existsSync(resolved.filePath)) {
      html = fs.readFileSync(resolved.filePath, 'utf8');
    }
    if (!html) return defaults;
    var $d = cheerio.load(html, { decodeEntities: false }, false);
    $d('[data-edit]').each(function () {
      var key = $d(this).attr('data-edit');
      if (key && $d(this).attr('data-edit-type') !== 'image') defaults[key] = $d(this).html() || '';
    });
  } catch (e) { /* ignore — fall back to saved edits only */ }
  return defaults;
}

// GET /api/decks — list all decks + active deck id
app.get('/api/decks', function (_req, res) {
  try {
    res.json({ success: true, data: readDecks() });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/decks/active — return the full active deck object
app.get('/api/decks/active', function (_req, res) {
  try {
    var store = readDecks();
    var active = store.decks.find(function (d) { return d.id === store.activeDeckId; }) || store.decks[0];
    res.json({ success: true, data: active || null });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/decks/active — set active deck by id
app.post('/api/decks/active', function (req, res) {
  var id = req.body && req.body.id;
  if (!id) return res.status(400).json({ success: false, error: 'id required' });
  try {
    var store = readDecks();
    if (!store.decks.find(function (d) { return d.id === id; })) {
      return res.status(404).json({ success: false, error: 'Deck not found' });
    }
    store.activeDeckId = id;
    writeDecks(store);
    res.json({ success: true, data: { activeDeckId: id } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/decks — create a new named deck (premium-gated in UI; server creates freely)
app.post('/api/decks', function (req, res) {
  var name = (req.body && req.body.name) ? String(req.body.name).trim() : '';
  if (!name) return res.status(400).json({ success: false, error: 'name required' });
  try {
    var logo = null;
    var logoFilename = (req.body && req.body.logoFilename) ? String(req.body.logoFilename).trim() : '';
    var logoData     = (req.body && req.body.logoData)     ? String(req.body.logoData).trim()     : '';
    if (logoFilename && logoData) {
      var logoMatches = logoData.match(/^data:([A-Za-z0-9+/]+);base64,(.+)$/);
      if (logoMatches) {
        var logoBuffer = Buffer.from(logoMatches[2], 'base64');
        var logoSafe   = dedupUpload(path.basename(logoFilename), logoBuffer).split('/').pop();
        logo = '/slides/uploads/' + logoSafe;
      }
    }
    var store = readDecks();
    var now = new Date().toISOString();
    var deck = {
      id: makeDeckId(),
      name: name,
      theme: (req.body && req.body.theme) || 'dark',
      createdAt: now,
      updatedAt: now,
      logo: logo,
      heroBg: null,
      heroBgFocal: '50% 50%',
      colors: { primary: '#F5A623' }
    };
    store.decks.push(deck);
    writeDecks(store);
    writeDeckById(deck.id, { title: '', slides: [] });
    res.json({ success: true, data: deck });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// PUT /api/decks/:id — update deck name / branding / theme
app.put('/api/decks/:id', function (req, res) {
  var id = req.params.id;
  try {
    var store = readDecks();
    var idx = store.decks.findIndex(function (d) { return d.id === id; });
    if (idx === -1) return res.status(404).json({ success: false, error: 'Deck not found' });
    var allowed = ['name', 'theme', 'logo', 'heroBg', 'heroBgFocal', 'heroBgFocalGrid', 'heroBgFit', 'heroBgOpacity', 'heroBgType', 'heroBgColor', 'colors', 'brandCredit'];
    var body = req.body || {};
    allowed.forEach(function (key) {
      if (body[key] !== undefined) store.decks[idx][key] = body[key];
    });
    if (body.styleRef !== undefined) {
      if (!body.styleRef) {
        store.decks[idx].styleRef = null;
        store.decks[idx].styleCss = null;
      } else {
        var safeFile = path.basename(body.styleRef);
        var refPath = path.join(STYLE_REFS_DIR, safeFile);
        if (fs.existsSync(refPath) && safeFile.endsWith('.html')) {
          var refHtml = fs.readFileSync(refPath, 'utf8');
          store.decks[idx].styleRef = safeFile;
          store.decks[idx].styleCss = extractStyleCss(refHtml, store.decks[idx].theme);
        }
      }
    }
    // Re-extract styleCss when theme changes so dark/light mode is updated
    if (body.theme !== undefined && store.decks[idx].styleRef) {
      var tRefPath = path.join(STYLE_REFS_DIR, store.decks[idx].styleRef);
      if (fs.existsSync(tRefPath)) {
        store.decks[idx].styleCss = extractStyleCss(fs.readFileSync(tRefPath, 'utf8'), body.theme);
      }
    }
    store.decks[idx].updatedAt = new Date().toISOString();
    writeDecks(store);
    res.json({ success: true, data: store.decks[idx] });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// DELETE /api/decks/:id — delete a deck (cannot delete the last one)
app.delete('/api/decks/:id', function (req, res) {
  var id = req.params.id;
  try {
    var store = readDecks();
    if (store.decks.length <= 1) {
      return res.status(400).json({ success: false, error: 'Cannot delete the last deck' });
    }
    store.decks = store.decks.filter(function (d) { return d.id !== id; });
    if (store.activeDeckId === id) store.activeDeckId = store.decks[0].id;
    writeDecks(store);
    var deckDir = path.join(DECKS_DIR_PATH, id);
    if (fs.existsSync(deckDir)) fs.rmSync(deckDir, { recursive: true, force: true });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/decks/:id/duplicate — copy a deck with a new name
app.post('/api/decks/:id/duplicate', function (req, res) {
  var id = req.params.id;
  try {
    var store = readDecks();
    var src = store.decks.find(function (d) { return d.id === id; });
    if (!src) return res.status(404).json({ success: false, error: 'Deck not found' });
    var now = new Date().toISOString();
    var copy = Object.assign({}, JSON.parse(JSON.stringify(src)), {
      id: makeDeckId(),
      name: src.name + ' (Copy)',
      createdAt: now,
      updatedAt: now
    });
    store.decks.push(copy);
    writeDecks(store);

    // Deep-clone: create a new library slide for each slide in the source deck
    var srcDeck  = readDeckById(id);
    var newDeck  = JSON.parse(JSON.stringify(srcDeck));
    var library  = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'));
    var libChanged = false;
    var counter  = 0;

    newDeck.slides = newDeck.slides.map(function (deckSlide) {
      if (!deckSlide.librarySlideId) return deckSlide;
      var libSrc = library.slides.find(function (s) { return s.id === deckSlide.librarySlideId; });
      if (!libSrc) return deckSlide;

      var cloneId = 'lib-' + Date.now() + '-' + (++counter);
      var clone   = JSON.parse(JSON.stringify(libSrc));
      clone.id    = cloneId;
      clone.name  = (libSrc.name || 'Untitled Slide') + ' (Copy)';
      // Carry the source deck's effective edits into the new deck context; clear all other edits
      var srcEdits     = resolveSlideEdits(libSrc, id);
      clone.deckEdits  = {};
      clone.deckEdits[copy.id] = srcEdits;
      clone.decks      = [{ id: copy.id, name: copy.name }];
      library.slides.push(clone);
      libChanged = true;

      return Object.assign({}, deckSlide, {
        id: 'deck-' + cloneId + '-' + Date.now(),
        librarySlideId: cloneId
      });
    });

    writeDeckById(copy.id, newDeck);
    if (libChanged) fs.writeFileSync(LIBRARY_PATH, JSON.stringify(library, null, 2), 'utf8');
    res.json({ success: true, data: copy });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/decks/:id/upload-logo — upload a logo image to deck branding
app.post('/api/decks/:id/upload-logo', function (req, res) {
  var id = req.params.id;
  var filename = req.body && req.body.filename;
  var data     = req.body && req.body.data;
  if (!filename || !data) return res.status(400).json({ success: false, error: 'filename and data required' });
  try {
    var store = readDecks();
    var idx = store.decks.findIndex(function (d) { return d.id === id; });
    if (idx === -1) return res.status(404).json({ success: false, error: 'Deck not found' });
    var matches = data.match(/^data:([A-Za-z0-9+/]+);base64,(.+)$/);
    if (!matches) return res.status(400).json({ success: false, error: 'invalid data URL' });
    var buffer   = Buffer.from(matches[2], 'base64');
    var src = dedupUpload(path.basename(filename), buffer);
    store.decks[idx].logo = src;
    store.decks[idx].updatedAt = new Date().toISOString();
    writeDecks(store);
    res.json({ success: true, data: store.decks[idx] });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/decks/:id/upload-hero-bg — upload hero background image to deck branding
app.post('/api/decks/:id/upload-hero-bg', function (req, res) {
  var id       = req.params.id;
  var filename = req.body && req.body.filename;
  var data     = req.body && req.body.data;
  if (!filename || !data) return res.status(400).json({ success: false, error: 'filename and data required' });
  try {
    var store = readDecks();
    var idx = store.decks.findIndex(function (d) { return d.id === id; });
    if (idx === -1) return res.status(404).json({ success: false, error: 'Deck not found' });
    var matches = data.match(/^data:([A-Za-z0-9+/]+);base64,(.+)$/);
    if (!matches) return res.status(400).json({ success: false, error: 'invalid data URL' });
    var buffer   = Buffer.from(matches[2], 'base64');
    var src = dedupUpload(path.basename(filename), buffer);
    store.decks[idx].heroBg = src;
    store.decks[idx].updatedAt = new Date().toISOString();
    writeDecks(store);
    res.json({ success: true, data: store.decks[idx] });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/library/:id/edits — save edits directly to a library slide
app.post('/api/library/:id/edits', function (req, res) {
  try {
    var id    = req.params.id;
    var edits = req.body.edits;
    if (!id || !edits) return res.status(400).json({ success: false, error: 'Missing id or edits' });

    var library  = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'));
    var libSlide = library.slides.find(function (s) { return s.id === id; });
    if (!libSlide) return res.status(404).json({ success: false, error: 'Library slide not found' });

    libSlide.edits = Object.assign({}, libSlide.edits || {}, edits);
    fs.writeFileSync(LIBRARY_PATH, JSON.stringify(library, null, 2), 'utf8');
    markSlideTranslationsDirty(id, edits);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/library/:id/features — read a library slide's slide-level feature flags
app.get('/api/library/:id/features', function (req, res) {
  try {
    var library  = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'));
    var libSlide = library.slides.find(function (s) { return s.id === req.params.id; });
    if (!libSlide) return res.status(404).json({ success: false, error: 'Library slide not found' });
    res.json({ success: true, data: { galleryEnabled: !!libSlide.galleryEnabled } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/library/:id/features — set a slide-level feature flag (e.g. { galleryEnabled: true })
app.post('/api/library/:id/features', function (req, res) {
  try {
    var library  = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'));
    var libSlide = library.slides.find(function (s) { return s.id === req.params.id; });
    if (!libSlide) return res.status(404).json({ success: false, error: 'Library slide not found' });
    if (typeof req.body.galleryEnabled === 'boolean') libSlide.galleryEnabled = req.body.galleryEnabled;
    fs.writeFileSync(LIBRARY_PATH, JSON.stringify(library, null, 2), 'utf8');
    res.json({ success: true, data: { galleryEnabled: !!libSlide.galleryEnabled } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Frozen presentation builder ───────────────────────────────────────────────
// Renders a presentation snapshot to finished-presentations/[presId]/index.html
// All images are copied to finished-presentations/shared/ (shared across all
// presentations) so assets are never duplicated. Each HTML file references them
// via the relative path ../shared/filename.
// Returns the translated text for a field+language from translations.json data.
// English values are plain strings; other languages are {current, previous, dirty} objects.
// Strips builder-only attributes (contenteditable, spellcheck, data-edit) from the returned HTML.
function getTranslationValue(slideId, fieldKey, lang, translationsData) {
  var slideStore = (translationsData && translationsData.slides) || {};
  var field = slideId && slideStore[slideId] && slideStore[slideId][fieldKey];
  if (!field) return null;
  var raw;
  if (lang === 'en') {
    raw = typeof field.en === 'string' ? field.en : null;
  } else {
    var entry = field[lang];
    if (!entry) return null;
    raw = (typeof entry === 'object' ? entry.current : entry) || null;
  }
  if (!raw) return null;
  var $ = cheerio.load(raw, { xmlMode: false });
  $('[contenteditable]').removeAttr('contenteditable');
  $('[spellcheck]').removeAttr('spellcheck');
  return $.html('body > *') || $.html() || raw;
}

function buildFrozenPresentation(presentation) {
  var presId   = presentation.id;
  var outDir   = path.join(REPO_ROOT, 'finished-presentations', presId);
  var assetDir = path.join(REPO_ROOT, 'finished-presentations', 'shared');
  fs.mkdirSync(outDir,    { recursive: true });
  fs.mkdirSync(assetDir,  { recursive: true });

  var library   = JSON.parse(fs.readFileSync(LIBRARY_PATH,  'utf8'));
  var appSettings = readSettings();
  var presDeck  = getDeckConfig(presentation.deckId || 'default');
  var accentCss = deckAccentCss(presDeck);

  // Language baking setup
  var presLanguages    = Array.isArray(presentation.languages) ? presentation.languages : [];
  var presDefaultLang  = presentation.defaultLanguage || 'en';
  var isMultiLang      = presLanguages.some(function (l) { return l !== presDefaultLang; });
  var allLangs         = isMultiLang ? [presDefaultLang].concat(presLanguages.filter(function (l) { return l !== presDefaultLang; })) : [];
  var translationsData  = isMultiLang ? readTranslations(presentation.deckId || 'default') : null;
  var langSwitcherCode  = isMultiLang ? fs.readFileSync(path.join(__dirname, 'features', 'slides', 'components', 'language-switcher.js'), 'utf8') : '';

  // Wraps all [data-edit] text elements in a cheerio-loaded slide with <span data-lang> per language.
  // ul/ol/table containers cannot use <span> wrappers (invalid HTML), so they are duplicated per
  // language instead. Detection is by tag name — no hardcoded field name list needed.
  // librarySlideId is used for per-slide lookup. <img> elements are always skipped.
  function bakeContainerElement($el, editKey, slideStore, outerHtml) {
    var englishHtml = $el.html();
    if (!englishHtml || !englishHtml.trim()) return null;
    // Detect outer element tag to handle table inner content correctly
    var elTag = ((outerHtml.match(/^<(\w+)/i) || [])[1] || '').toLowerCase();
    return allLangs.map(function (lang) {
      var translatedHtml;
      if (lang === 'en') {
        translatedHtml = englishHtml;
      } else {
        var sField = slideStore[editKey] && slideStore[editKey][lang];
        var sRaw   = sField && (typeof sField === 'object' ? sField.current : sField);
        if (sRaw) {
          // Table inner content (colgroup/thead/tbody) is invalid outside a <table> context —
          // HTML5 foster-parenting discards the structure and $t('body').html() returns only
          // text. Wrap in a temporary <table> so structure is preserved after parsing.
          if (elTag === 'table' && !sRaw.trimStart().startsWith('<table')) {
            var $t = cheerio.load('<table>' + sRaw + '</table>', { xmlMode: false });
            $t('[contenteditable]').removeAttr('contenteditable');
            $t('[spellcheck]').removeAttr('spellcheck');
            sRaw = $t('body table').html() || sRaw;
          } else {
            var $t = cheerio.load(sRaw, { xmlMode: false });
            $t('[contenteditable]').removeAttr('contenteditable');
            $t('[spellcheck]').removeAttr('spellcheck');
            sRaw = $t('body').html() || sRaw;
          }
        }
        translatedHtml = sRaw || englishHtml;
      }
      var $$ = cheerio.load(outerHtml, { xmlMode: false });
      var $clone = $$('body > *').first();
      $clone.attr('data-lang', lang);
      if (lang !== presDefaultLang) $clone.attr('hidden', '');
      $clone.removeAttr('data-edit').removeAttr('contenteditable').removeAttr('spellcheck');
      $clone.html(translatedHtml);
      return $$('body').html();
    }).join('');
  }

  function bakeLanguageSpans($, librarySlideId) {
    if (!isMultiLang || !translationsData) return;
    var slideStore = (translationsData.slides && translationsData.slides[librarySlideId]) || {};

    $('[data-edit]').each(function () {
      var el      = $(this);
      var editKey = el.attr('data-edit');
      if (!editKey) return;
      if (this.tagName === 'img') return;
      if (el.attr('data-edit-type') === 'image') return;

      // ul/ol/table: duplicate element per language (span wrappers are invalid inside these)
      if (/^(ul|ol|table)$/i.test(this.tagName)) {
        if (!slideStore[editKey]) return;
        var replaced = bakeContainerElement(el, editKey, slideStore, $.html(el));
        if (replaced) el.replaceWith(replaced);
        return;
      }
      if (el.children('div, ul, ol, li, table, label, input').length) return;
      // Library always stores English — this is the authoritative English source
      var englishText = el.html();
      if (!englishText || !englishText.trim()) return;

      var wrappers = allLangs.map(function (lang) {
        var text;
        if (lang === 'en') {
          text = englishText;
        } else {
          // Look up translation; fall back to English if missing
          var sField = slideStore[editKey] && slideStore[editKey][lang];
          var sRaw   = sField && (typeof sField === 'object' ? sField.current : sField);
          if (sRaw) {
            var $t = cheerio.load(sRaw, { xmlMode: false });
            $t('[contenteditable]').removeAttr('contenteditable');
            $t('[spellcheck]').removeAttr('spellcheck');
            $t('[data-builder-only]').remove();
            sRaw = $t('body').html() || sRaw;
          }
          text = sRaw || englishText;
        }
        var hidden = lang !== presDefaultLang ? ' hidden' : '';
        return '<span data-lang="' + lang + '"' + hidden + '>' + text + '</span>';
      });
      el.html(wrappers.join(''));
    });
  }
  var umamiWebsiteId = UMAMI_WEBSITE_ID || appSettings.umamiWebsiteId || '';

  // Image path mappings: URL prefix → filesystem dir
  var imgRoots = [
    { prefix: '/slides/uploads/', dir: path.join(__dirname, 'features', 'slides', 'uploads') },
    { prefix: '/slides/shared/',  dir: path.join(__dirname, 'shared', 'assets') },
    { prefix: '/slides/assets/',  dir: path.join(__dirname, 'features', 'slides', 'assets') },
    { prefix: '/shared/assets/',  dir: path.join(__dirname, 'shared', 'assets') },
    { prefix: '/shared/brand/',   dir: path.join(__dirname, 'shared', 'brand') }   // brand-neutral logo-row default (rulebook §8/§9)
  ];

  var copiedAssets = {}; // src url → relative path used in output

  function resolveAndCopyAsset(src) {
    if (!src || src.startsWith('data:')) return src;
    // Strip localhost origin so saved builder URLs are treated as local paths
    src = src.replace(/^https?:\/\/localhost(:\d+)?/, '');
    if (copiedAssets[src]) return copiedAssets[src];
    for (var i = 0; i < imgRoots.length; i++) {
      var root = imgRoots[i];
      if (src.startsWith(root.prefix)) {
        var filename = decodeURIComponent(src.slice(root.prefix.length));
        var srcPath  = path.join(root.dir, filename);
        if (fs.existsSync(srcPath)) {
          var safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
          var destPath = path.join(assetDir, safeName);
          if (!fs.existsSync(destPath)) fs.copyFileSync(srcPath, destPath);
          copiedAssets[src] = '../shared/' + safeName;
          return '../shared/' + safeName;
        }
      }
    }
    console.warn('[build] Asset not found, src left unresolved:', src);
    return src; // leave unchanged if not found
  }

  function rewriteImagePaths(html) {
    return html
      .replace(/\bsrc="([^"]+)"/g, function (_, s) { return 'src="' + resolveAndCopyAsset(s) + '"'; })
      .replace(/\bsrc='([^']+)'/g, function (_, s) { return "src='" + resolveAndCopyAsset(s) + "'"; })
      .replace(/url\((['"]?)([^'")]+)\1\)/g, function (_, q, s) {
        var rewritten = resolveAndCopyAsset(s);
        return 'url(' + q + rewritten + q + ')';
      });
  }

  // Read and inline CSS + JS
  var slidesCss = fs.readFileSync(path.join(__dirname, 'features', 'slides', 'style.css'), 'utf8');
  var componentsDir = path.join(__dirname, 'features', 'slides', 'components');
  var inlineJs = fs.readdirSync(componentsDir)
    .filter(function (f) { return f.endsWith('.js'); })
    .map(function (f) { return fs.readFileSync(path.join(componentsDir, f), 'utf8'); })
    .join('\n');
  // tracker.js only — it defines window.Track and is DOM-safe, so it can load in <head>
  // ahead of the slide fragments (whose inline scripts call Track.slideId() at parse time).
  var trackerJs = fs.readFileSync(path.join(componentsDir, 'tracker.js'), 'utf8');

  // Per-presentation cover overrides (never written back to library)
  var coverEdits = {};
  if (presentation.customerName) {
    var sub = 'Proposal for ' + presentation.customerName;
    if (presentation.contactName)  sub += ' \u00b7 ' + presentation.contactName;
    if (presentation.contactTitle) sub += ', ' + presentation.contactTitle;
    coverEdits.subheadline = sub;
  }
  if (presentation.customerLogoSrc) {
    coverEdits['customer-logo']     = presentation.customerLogoSrc; // HTML cover slides (ls01, ls26)
    coverEdits['customer-logo-src'] = presentation.customerLogoSrc; // canvas cover slides
  }

  // Render each visible slide
  var slideFragments = [];
  var slideNames = [];
  (presentation.slides || []).forEach(function (s, idx) {
    if (!s.visible) return;
    var libSlide = (library.slides || []).find(function (l) { return l.id === s.librarySlideId; });
    if (!libSlide) return;
    var resolved = resolveTemplate(libSlide.templateId);
    if (!resolved) return;

    var edits = resolveSlideEdits(libSlide, presentation.deckId || 'default');
    var isCoverSlide = s.librarySlideId === 'lib-cover' ||
      (resolved.tpl && resolved.tpl.category === 'Cover');
    if (isCoverSlide) Object.assign(edits, coverEdits);

    // For cover slides in multi-lang presentations, replace subheadline placeholders
    // ([Cliente], [Nombre], etc.) in each translation with actual customer data.
    if (isCoverSlide && isMultiLang && translationsData && translationsData.slides && presentation.customerName) {
      var coverSlideStore = translationsData.slides[s.librarySlideId];
      if (coverSlideStore && coverSlideStore.subheadline) {
        var coverTokens = [presentation.customerName, presentation.contactName, presentation.contactTitle].filter(Boolean);
        allLangs.forEach(function (lang) {
          if (lang === 'en') return;
          var field = coverSlideStore.subheadline[lang];
          if (!field) return;
          var template = typeof field === 'object' ? field.current : field;
          if (!template) return;
          var ti = 0;
          var filled = template.replace(/\[[^\]]+\]/g, function () {
            return ti < coverTokens.length ? coverTokens[ti++] : '';
          }).replace(/\s*[·,]\s*$/, '').trim();
          coverSlideStore.subheadline[lang] = typeof field === 'object'
            ? Object.assign({}, field, { current: filled })
            : filled;
        });
      }
    }

    var fragment = resolved.source === 'canvas'
      ? renderLayoutToHtml(resolved.tpl, s.id, edits, presDeck)
      : renderCartridge(resolved, { galleryEnabled: libSlide.galleryEnabled, rawEdits: edits, deck: presDeck, editable: false });

    // Strip builder-only elements + contenteditable + logo change interactivity
    var $ = cheerio.load(fragment, { xmlMode: false });
    $('[data-builder-only],[data-ls-add-row],[data-ls-add],[data-ls-restore]').remove();
    $('[contenteditable]').removeAttr('contenteditable');
    $('[spellcheck]').removeAttr('spellcheck');
    $('[data-edit="customer-logo"]').removeAttr('onclick').removeAttr('title');
    $('input[type="file"]').remove();
    bakeLanguageSpans($, s.librarySlideId);
    // Set data-slide to human-readable slug so Track events use consistent names
    var slideSlug = (s.name || s.id).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    $('[data-slide]').first().attr('data-slide', slideSlug);
    fragment = $.html('body > *') || $.html();

    // Rewrite image paths
    fragment = rewriteImagePaths(fragment);

    slideFragments.push('<div class="fp-slide" data-slide-index="' + slideFragments.length + '" style="' + (slideFragments.length === 0 ? '' : 'display:none;') + '">\n' + fragment + '\n</div>');
    slideNames.push(s.name || s.id);
  });

  // Render hidden slides as optional extras
  var hiddenFragments = [];
  var hiddenNames = [];
  (presentation.slides || []).forEach(function (s) {
    if (s.visible !== false) return;
    var libSlide = (library.slides || []).find(function (l) { return l.id === s.librarySlideId; });
    if (!libSlide) return;
    var resolved = resolveTemplate(libSlide.templateId);
    if (!resolved) return;

    var edits = resolveSlideEdits(libSlide, presentation.deckId || 'default');
    var isCoverSlide = s.librarySlideId === 'lib-cover' ||
      (resolved.tpl && resolved.tpl.category === 'Cover');
    if (isCoverSlide) Object.assign(edits, coverEdits);

    var fragment = resolved.source === 'canvas'
      ? renderLayoutToHtml(resolved.tpl, s.id, edits, presDeck)
      : renderCartridge(resolved, { galleryEnabled: libSlide.galleryEnabled, rawEdits: edits, deck: presDeck, editable: false });
    var $ = cheerio.load(fragment, { xmlMode: false });
    $('[data-builder-only],[data-ls-add-row],[data-ls-add],[data-ls-restore]').remove();
    $('[contenteditable]').removeAttr('contenteditable');
    $('[spellcheck]').removeAttr('spellcheck');
    $('[data-edit="customer-logo"]').removeAttr('onclick').removeAttr('title');
    $('input[type="file"]').remove();
    bakeLanguageSpans($, s.librarySlideId);
    var slideSlug = (s.name || s.id).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    $('[data-slide]').first().attr('data-slide', slideSlug);
    fragment = $.html('body > *') || $.html();
    fragment = rewriteImagePaths(fragment);

    hiddenFragments.push('<div class="fp-slide fp-optional" data-optional-index="' + hiddenFragments.length + '" style="display:none;">\n' + fragment + '\n</div>');
    hiddenNames.push(s.name || s.id);
  });

  var totalSlides = slideFragments.length;
  var hasExtras   = hiddenFragments.length > 0;

  var html = [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="UTF-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '  <title>' + (presentation.customerName || 'Presentation') + '</title>',
    '  <style>',
    slidesCss,
    presDeck.styleCss || '',
    accentCss || '',
  '  </style>',
  finishStyleTag(presDeck.styleRef),
  '  <style>',
    '    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }',
    '    html, body { width: 100%; height: 100%; overflow: hidden; background: #0a0a0a; }',
    '    #fp-shell { display: flex; flex-direction: column; height: 100vh; }',
    '    #fp-header { height: 44px; min-height: 44px; background: #111; border-bottom: 1px solid #2a2a2a; display: flex; align-items: center; padding: 0 16px; gap: 12px; }',
    '    #fp-title { font-size: 13px; font-weight: 600; color: #e5e5e5; font-family: system-ui, sans-serif; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 260px; }',
    '    #fp-header-spacer { flex: 1; }',
    '    #fp-counter { font-size: 12px; color: #888; font-family: system-ui, sans-serif; white-space: nowrap; }',
    '    #fp-viewer { flex: 1; position: relative; overflow: hidden; }',
    '    #fp-viewer .slides-container { height: 100% !important; width: 100% !important; }',
    '    .fp-slide { position: absolute; inset: 0; }',
    '    .fp-slide .slide { opacity: 1 !important; transform: scale(1) !important; pointer-events: auto !important; height: 100% !important; }',
    '    [data-edit="customer-logo"] { cursor: default !important; pointer-events: none !important; }',
    '    #fp-dash-btn { background: none; border: none; color: #888; font-size: 12px; font-family: system-ui, sans-serif; padding: 4px 8px; border-radius: 4px; cursor: pointer; white-space: nowrap; text-decoration: none; display: flex; align-items: center; gap: 4px; }',
    '    #fp-dash-btn:hover { color: #ccc; background: rgba(255,255,255,0.08); }',
    '    .fp-nav-btn { background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15); color: #e5e5e5; font-size: 18px; font-family: system-ui, sans-serif; width: 30px; height: 30px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; }',
    '    .fp-nav-btn:hover { background: rgba(255,255,255,0.18); }',
    '    .fp-nav-btn:disabled { opacity: 0.25; cursor: default; }',
    '    #fp-footer { height: 32px; min-height: 32px; background: #0a0a0a; border-top: 1px solid #2a2a2a; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 0 12px; position: relative; z-index: 10; }',
    '    #fp-slide-name { font-size: 11px; color: #888; font-family: system-ui, sans-serif; }',
    '    /* Share button */',
    '    .fp-share-btn { background: none; border: none; color: #666; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 4px; border-radius: 4px; flex-shrink: 0; }',
    '    .fp-share-btn:hover { color: #ccc; background: rgba(255,255,255,0.08); }',
    '    /* Side nav arrows — desktop only */',
    '    .fp-side-arrow { display: none; position: fixed; top: 50%; transform: translateY(-50%); width: 48px; height: 48px; border-radius: 50%; background: rgba(0,0,0,0.55); border: 1px solid rgba(255,255,255,0.12); color: rgba(255,255,255,0.7); font-size: 22px; cursor: pointer; z-index: 50; align-items: center; justify-content: center; backdrop-filter: blur(8px); transition: background .2s, border-color .2s, color .2s; }',
    '    .fp-side-arrow:hover { background: rgba(255,255,255,0.12); border-color: rgba(255,255,255,0.3); color: #fff; }',
    '    .fp-side-arrow:disabled { opacity: 0.2; cursor: default; }',
    '    #fp-arrow-prev { left: 16px; }',
    '    #fp-arrow-next { right: 16px; }',
    '    @media (min-width: 768px) { .fp-side-arrow { display: flex; } }',
    '    /* Share modal */',
    '    #fp-share-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 200; align-items: center; justify-content: center; backdrop-filter: blur(4px); }',
    '    #fp-share-overlay.open { display: flex; }',
    '    #fp-share-modal { background: #1a1a1a; border: 1px solid #333; border-radius: 12px; padding: 28px 24px 24px; width: 340px; max-width: calc(100vw - 32px); font-family: system-ui, sans-serif; position: relative; }',
    '    #fp-share-modal h3 { font-size: 15px; font-weight: 600; color: #e5e5e5; margin-bottom: 18px; }',
    '    .fp-share-field { display: flex; flex-direction: column; gap: 5px; margin-bottom: 14px; }',
    '    .fp-share-field label { font-size: 11px; font-weight: 500; color: #888; text-transform: uppercase; letter-spacing: 0.05em; }',
    '    .fp-share-field input, .fp-share-field textarea { background: #111; border: 1px solid #333; border-radius: 6px; color: #e5e5e5; font-size: 13px; font-family: system-ui, sans-serif; padding: 8px 10px; outline: none; resize: none; }',
    '    .fp-share-field input:focus, .fp-share-field textarea:focus { border-color: #555; }',
    '    .fp-share-channels { display: flex; gap: 10px; margin-bottom: 14px; }',
    '    .fp-ch-btn { flex: 1; display: flex; align-items: center; justify-content: center; gap: 7px; padding: 9px 12px; border-radius: 8px; border: 1px solid #333; background: #111; color: #ccc; font-size: 13px; font-family: system-ui, sans-serif; cursor: pointer; transition: background .15s, border-color .15s; }',
    '    .fp-ch-btn:hover { background: #222; }',
    '    .fp-ch-btn.active { border-color: #555; background: #222; color: #fff; }',
    '    #fp-ch-wa.active { border-color: #25D366; color: #25D366; }',
    '    #fp-ch-email.active { border-color: #60a5fa; color: #60a5fa; }',
    '    .fp-share-channel-input { display: none; margin-bottom: 14px; }',
    '    .fp-share-channel-input.visible { display: block; }',
    '    .fp-share-actions { display: flex; gap: 10px; justify-content: flex-end; }',
    '    #fp-share-cancel { background: none; border: 1px solid #333; border-radius: 6px; color: #888; font-size: 13px; font-family: system-ui, sans-serif; padding: 8px 16px; cursor: pointer; }',
    '    #fp-share-cancel:hover { color: #ccc; border-color: #555; }',
    '    #fp-share-send { background: #e5e5e5; border: none; border-radius: 6px; color: #111; font-size: 13px; font-weight: 600; font-family: system-ui, sans-serif; padding: 8px 18px; cursor: pointer; }',
    '    #fp-share-send:hover { background: #fff; }',
    '    #fp-share-send:disabled { opacity: 0.4; cursor: default; }',
    '    /* Footer nav menu */',
    '    #fp-nav-menu-btn { background: none; border: none; color: #666; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 4px; border-radius: 4px; flex-shrink: 0; }',
    '    #fp-nav-menu-btn:hover { color: #ccc; background: rgba(255,255,255,0.08); }',
    '    #fp-nav-menu-wrap { position: relative; display: flex; align-items: center; }',
    '    #fp-nav-menu { position: absolute; bottom: calc(100% + 6px); left: 0; background: #1a1a1a; border: 1px solid #333; border-radius: 8px; padding: 8px 0; min-width: 220px; z-index: 100; box-shadow: 0 -8px 24px rgba(0,0,0,0.6); display: none; }',
    '    .fp-nm-section { font-size: 10px; font-weight: 600; color: #555; text-transform: uppercase; letter-spacing: 0.07em; padding: 8px 16px 4px; }',
    '    .fp-nm-section:first-child { padding-top: 4px; }',
    '    .fp-nm-divider { height: 1px; background: #2a2a2a; margin: 6px 0; }',
    '    .fp-nm-item { display: block; width: 100%; text-align: left; background: none; border: none; color: #ccc; font-size: 13px; font-family: system-ui, sans-serif; padding: 7px 16px; cursor: pointer; }',
    '    .fp-nm-item:hover { background: rgba(255,255,255,0.08); color: #fff; }',
    '    .fp-nm-item.fp-nm-active { color: #fff; font-weight: 600; }',
    '    .fp-nm-item.fp-nm-active::before { content: "›"; margin-right: 6px; color: #888; }',
    '    /* Ensure [hidden] works even if slide CSS sets display on an element */',
    '    [hidden] { display: none !important; }',
    '    /* Language dropdown */',
    '    #fp-lang-drop { position: relative; margin-left: 8px; }',
    '    #fp-lang-btn { display: flex; align-items: center; gap: 5px; background: none; border: 1px solid #333; border-radius: 4px; color: #888; font-size: 11px; font-family: system-ui, sans-serif; padding: 3px 8px; cursor: pointer; letter-spacing: 0.04em; text-transform: uppercase; transition: border-color .15s, color .15s; line-height: 1; }',
    '    #fp-lang-btn:hover { border-color: #555; color: #ccc; }',
    '    #fp-lang-menu { display: none; position: absolute; top: calc(100% + 6px); right: 0; background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 6px; overflow: hidden; min-width: 130px; z-index: 200; box-shadow: 0 4px 16px rgba(0,0,0,.5); }',
    '    #fp-lang-menu.open { display: block; }',
    '    #fp-lang-menu button { display: block; width: 100%; text-align: left; background: none; border: none; color: #aaa; font-size: 12px; font-family: system-ui, sans-serif; padding: 9px 14px; cursor: pointer; letter-spacing: .02em; transition: background .15s, color .15s; }',
    '    #fp-lang-menu button:hover { background: rgba(255,255,255,.07); color: #fff; }',
    '    #fp-lang-menu button.active { color: #E8711A; font-weight: 600; }',
    '  </style>',
    (umamiWebsiteId ? '  <script defer src="' + UMAMI_BASE_URL + '/script.js" data-website-id="' + umamiWebsiteId + '"></script>' : ''),
    // Define PB_READONLY + Track in <head>, before the slide fragments — their inline
    // scripts call Track.slideId() at parse time. The rest of the components stay at the
    // bottom (some touch the DOM at load and aren't safe to run before <body>).
    '<script>window.PB_READONLY = true;</script>',
    '<script>' + trackerJs + '</script>',
    '</head>',
    (isMultiLang ? '<body data-default-lang="' + presDefaultLang + '" data-pres-id="' + presId + '">' : '<body>'),
    '<div id="fp-shell">',
    '  <div id="fp-header">',
    '    <a href="' + (appSettings.homepageUrl || '/') + '" id="fp-dash-btn">' + (appSettings.homepageLabel ? appSettings.homepageLabel : '&#8592; Dashboard') + '</a>',
    '    <div style="width:1px;height:20px;background:#333;flex-shrink:0;"></div>',
    '    <button class="fp-nav-btn" id="fp-prev" disabled>&#8249;</button>',
    '    <div id="fp-counter">1 / ' + totalSlides + '</div>',
    '    <button class="fp-nav-btn" id="fp-next"' + (totalSlides <= 1 ? ' disabled' : '') + '>&#8250;</button>',
    (isMultiLang ? (function () {
      var langNames = { en: 'English', es: 'Español', de: 'Deutsch', fr: 'Français', pt: 'Português', it: 'Italiano', zh: '中文', ja: '日本語', ar: 'العربية', ru: 'Русский' };
      var chevron = '<svg width="8" height="8" viewBox="0 0 10 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 1 5 5 9 1"/></svg>';
      var items = allLangs.map(function (l) {
        return '<button data-lang="' + l + '" onclick="fpLangSelect(\'' + l + '\')">' + l.toUpperCase() + ' — ' + (langNames[l] || l) + '</button>';
      }).join('');
      return '    <div id="fp-lang-drop"><button id="fp-lang-btn" onclick="fpLangToggle()"><span id="fp-lang-label">' + presDefaultLang.toUpperCase() + '</span>' + chevron + '</button><div id="fp-lang-menu">' + items + '</div></div>';
    })() : ''),
    '    <div id="fp-header-spacer"></div>',
    '    <div id="fp-title">' + (presentation.customerName || '') + '</div>',
    '    <button class="fp-share-btn" id="fp-share-btn-hdr" title="Share presentation"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg></button>',
    '  </div>',
    '  <div id="fp-viewer">',
    '    <div class="slides-container">',
    slideFragments.join('\n'),
    hiddenFragments.join('\n'),
    '    </div>',
    '  </div>',
    '  <div id="fp-footer">',
    '    <div id="fp-nav-menu-wrap">',
    '      <div id="fp-nav-menu">',
    '        <div class="fp-nm-section">Slides</div>',
    slideNames.map(function (n, i) { return '        <button class="fp-nm-item' + (i === 0 ? ' fp-nm-active' : '') + '" data-main="' + i + '">' + n + '</button>'; }).join('\n'),
    hasExtras ? ('        <div class="fp-nm-divider"></div><div class="fp-nm-section fp-nm-hidden-section">Hidden Slides</div>' + hiddenNames.map(function (n, i) { return '        <button class="fp-nm-item" data-opt="' + i + '">' + n + '</button>'; }).join('\n')) : '',
    '      </div>',
    '      <button id="fp-nav-menu-btn" title="Slide navigation"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg></button>',
    '    </div>',
    '    <div id="fp-slide-name">' + (slideNames[0] || '') + '</div>',
    '    <button class="fp-share-btn" id="fp-share-btn-ftr" title="Share presentation"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg></button>',
    '  </div>',
    '</div>',
    '<button class="fp-side-arrow" id="fp-arrow-prev" disabled>&#8249;</button>',
    '<button class="fp-side-arrow" id="fp-arrow-next"' + (totalSlides <= 1 ? ' disabled' : '') + '>&#8250;</button>',
    '<div id="fp-share-overlay">',
    '  <div id="fp-share-modal">',
    '    <h3>Share this presentation</h3>',
    '    <div class="fp-share-field"><label>Your name</label><input id="fp-share-name" type="text" placeholder="e.g. Alex"></div>',
    '    <div class="fp-share-field"><label>Your role</label><input id="fp-share-role" type="text" placeholder="e.g. Sales Manager"></div>',
    '    <div class="fp-share-field"><label>Message <span style="color:#555;font-weight:400;text-transform:none;">(optional)</span></label><textarea id="fp-share-msg" rows="2" placeholder="Add a personal note…"></textarea></div>',
    '    <div class="fp-share-channels">',
    '      <button class="fp-ch-btn" id="fp-ch-wa"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.374 0 0 5.373 0 12c0 2.127.558 4.121 1.528 5.849L.057 23.983l6.305-1.647A11.936 11.936 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.805 9.805 0 01-5.031-1.388l-.361-.214-3.741.981.998-3.648-.235-.374A9.817 9.817 0 012.182 12c0-5.42 4.398-9.818 9.818-9.818 5.42 0 9.818 4.398 9.818 9.818 0 5.42-4.398 9.818-9.818 9.818z"/></svg> WhatsApp</button>',
    '      <button class="fp-ch-btn" id="fp-ch-email"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="2,4 12,13 22,4"/></svg> Email</button>',
    '    </div>',
    '    <div class="fp-share-channel-input fp-share-field" id="fp-wa-input"><label>Phone number (with country code)</label><input id="fp-share-phone" type="tel" placeholder="e.g. +1 555 000 1234"></div>',
    '    <div class="fp-share-channel-input fp-share-field" id="fp-email-input"><label>Email address</label><input id="fp-share-email" type="email" placeholder="e.g. contact@company.com"></div>',
    '    <div class="fp-share-actions">',
    '      <button id="fp-share-cancel">Cancel</button>',
    '      <button id="fp-share-send" disabled>Send</button>',
    '    </div>',
    '  </div>',
    '</div>',
    '  <div id="lightbox">',
    '    <div id="lb-inner">',
    '      <button id="lb-close">&#10005;</button>',
    '      <button id="lb-prev" class="lb-nav-btn">&#8249;</button>',
    '      <div id="lb-stage"><img id="lb-img" src="" alt=""><div id="lb-cap"></div></div>',
    '      <button id="lb-next" class="lb-nav-btn">&#8250;</button>',
    '      <div id="lb-thumbs"></div>',
    '    </div>',
    '  </div>',
    '<script>',
    '(function(){var h=window.location.hostname;if(h==="localhost"||h==="127.0.0.1"){var b=document.getElementById("fp-dash-btn");if(b){b.href="/";b.textContent="← Dashboard";b.target="_top";}}})();',
    inlineJs,
    // language-switcher runs after <body> exists (it reads document.body at load)
    (isMultiLang ? langSwitcherCode : ''),
    '(function () {',
    '  var mainSlides = document.querySelectorAll(".fp-slide:not(.fp-optional)");',
    '  var optSlides  = document.querySelectorAll(".fp-slide.fp-optional");',
    '  var mainNames  = ' + JSON.stringify(slideNames) + ';',
    '  var optNames   = ' + JSON.stringify(hiddenNames) + ';',
    '  var total      = mainSlides.length;',
    '  var idx        = 0;',
    '  var inOptional = false;',
    '  var counter    = document.getElementById("fp-counter");',
    '  var slideName  = document.getElementById("fp-slide-name");',
    '  var prevBtn    = document.getElementById("fp-prev");',
    '  var nextBtn    = document.getElementById("fp-next");',
    '  var arrowPrev  = document.getElementById("fp-arrow-prev");',
    '  var arrowNext  = document.getElementById("fp-arrow-next");',
    '  var navMenuBtn = document.getElementById("fp-nav-menu-btn");',
    '  var navMenu    = document.getElementById("fp-nav-menu");',
    '  var hiddenSection = navMenu ? navMenu.querySelector(".fp-nm-hidden-section") : null;',
    '',
    '  function initSlide(el) {',
    '    var root = el.querySelector(".slides-container,.slide");',
    '    if (!root) root = el;',
    '    if (window.Carousel) Carousel.init(root);',
    '    if (window.Tabs)     Tabs.init(root);',
    '    if (window.Lightbox) Lightbox.init(root);',
    '    if (window.List)     List.init(root);',
    '    if (window.LSTable)  LSTable.init(root);',
    '    if (window.Gallery)  Gallery.init(root);',
    '  }',
    '',
    '  var optIdx = 0;',
    '',
    '  function updateNavMenu() {',
    '    if (!navMenu) return;',
    '    navMenu.querySelectorAll(".fp-nm-item[data-main]").forEach(function (btn) {',
    '      btn.classList.toggle("fp-nm-active", !inOptional && parseInt(btn.dataset.main, 10) === idx);',
    '    });',
    '    navMenu.querySelectorAll(".fp-nm-item[data-opt]").forEach(function (btn) {',
    '      btn.classList.toggle("fp-nm-active", inOptional && parseInt(btn.dataset.opt, 10) === optIdx);',
    '    });',
    '    if (hiddenSection) {',
    '      var showHidden = (inOptional || idx === total - 1) && optSlides.length > 0;',
    '      var divider = hiddenSection.previousElementSibling;',
    '      hiddenSection.style.display = showHidden ? "" : "none";',
    '      if (divider && divider.classList.contains("fp-nm-divider")) divider.style.display = showHidden ? "" : "none";',
    '      navMenu.querySelectorAll(".fp-nm-item[data-opt]").forEach(function (btn) { btn.style.display = showHidden ? "" : "none"; });',
    '    }',
    '  }',
    '',
    '  function goTo(n) {',
    '    if (n < 0 || n >= total) return;',
    '    if (inOptional) optSlides.forEach(function (s) { s.style.display = "none"; });',
    '    else mainSlides[idx].style.display = "none";',
    '    idx = n;',
    '    inOptional = false;',
    '    mainSlides[idx].style.display = "";',
    '    counter.textContent = (idx + 1) + " / " + total;',
    '    slideName.textContent = mainNames[idx] || "";',
    '    prevBtn.disabled = idx === 0;',
    '    nextBtn.disabled = idx === total - 1;',
    '    arrowPrev.disabled = idx === 0;',
    '    arrowNext.disabled = idx === total - 1;',
    '    if (navMenu) navMenu.style.display = "none";',
    '    updateNavMenu();',
    '    initSlide(mainSlides[idx]);',
    '    var dsEl = mainSlides[idx].querySelector("[data-slide]");',
    '    if (window.Track && dsEl) Track.event("slide-" + dsEl.getAttribute("data-slide"), { label: mainNames[idx] + "-view" });',
    '  }',
    '',
    '  function goToOptional(n) {',
    '    if (n < 0 || n >= optSlides.length) return;',
    '    if (inOptional) optSlides[optIdx].style.display = "none";',
    '    else mainSlides[idx].style.display = "none";',
    '    optIdx = n;',
    '    inOptional = true;',
    '    optSlides[optIdx].style.display = "";',
    '    counter.textContent = (optIdx + 1) + " / " + optSlides.length;',
    '    slideName.textContent = optNames[optIdx] || "";',
    '    prevBtn.disabled = optIdx === 0;',
    '    nextBtn.disabled = optIdx === optSlides.length - 1;',
    '    arrowPrev.disabled = optIdx === 0;',
    '    arrowNext.disabled = optIdx === optSlides.length - 1;',
    '    if (navMenu) navMenu.style.display = "none";',
    '    updateNavMenu();',
    '    initSlide(optSlides[optIdx]);',
    '    var dsEl = optSlides[optIdx].querySelector("[data-slide]");',
    '    if (window.Track && dsEl) Track.event("slide-" + dsEl.getAttribute("data-slide"), { label: optNames[optIdx] + "-view" });',
    '  }',
    '',
    '  prevBtn.addEventListener("click", function () {',
    '    if (inOptional) goToOptional(optIdx - 1); else goTo(idx - 1);',
    '  });',
    '  nextBtn.addEventListener("click", function () {',
    '    if (inOptional) goToOptional(optIdx + 1); else goTo(idx + 1);',
    '  });',
    '  document.addEventListener("keydown", function (e) {',
    '    if (e.key === "ArrowRight") { if (inOptional) goToOptional(optIdx + 1); else goTo(idx + 1); }',
    '    if (e.key === "ArrowLeft")  { if (inOptional) goToOptional(optIdx - 1); else goTo(idx - 1); }',
    '  });',
    '',
    '  if (navMenuBtn && navMenu) {',
    '    navMenuBtn.addEventListener("click", function (e) {',
    '      e.stopPropagation();',
    '      navMenu.style.display = navMenu.style.display === "none" ? "block" : "none";',
    '    });',
    '  }',
    '  document.querySelectorAll(".fp-nm-item[data-main]").forEach(function (btn) {',
    '    btn.addEventListener("click", function () { goTo(parseInt(btn.dataset.main, 10)); });',
    '  });',
    '  document.querySelectorAll(".fp-nm-item[data-opt]").forEach(function (btn) {',
    '    btn.addEventListener("click", function () { goToOptional(parseInt(btn.dataset.opt, 10)); });',
    '  });',
    '  document.addEventListener("click", function (e) {',
    '    if (navMenu && !navMenu.contains(e.target) && e.target !== navMenuBtn) {',
    '      navMenu.style.display = "none";',
    '    }',
    '  });',
    '',
    '  arrowPrev.addEventListener("click", function () { if (inOptional) goToOptional(optIdx - 1); else goTo(idx - 1); });',
    '  arrowNext.addEventListener("click", function () { if (inOptional) goToOptional(optIdx + 1); else goTo(idx + 1); });',
    '',
    '  /* ── Share modal ── */',
    '  var presId    = ' + JSON.stringify(presentation.id) + ';',
    '  var baseUrl   = "' + PUBLIC_BASE_URL + '/public/" + presId + "/";',
    '  var overlay   = document.getElementById("fp-share-overlay");',
    '  var shareBtns = [document.getElementById("fp-share-btn-hdr"), document.getElementById("fp-share-btn-ftr")];',
    '  var nameIn    = document.getElementById("fp-share-name");',
    '  var roleIn    = document.getElementById("fp-share-role");',
    '  var msgIn     = document.getElementById("fp-share-msg");',
    '  var chWa      = document.getElementById("fp-ch-wa");',
    '  var chEmail   = document.getElementById("fp-ch-email");',
    '  var waInput   = document.getElementById("fp-wa-input");',
    '  var emailInput= document.getElementById("fp-email-input");',
    '  var phoneIn   = document.getElementById("fp-share-phone");',
    '  var emailIn   = document.getElementById("fp-share-email");',
    '  var sendBtn   = document.getElementById("fp-share-send");',
    '  var cancelBtn = document.getElementById("fp-share-cancel");',
    '  var channel   = null;',
    '',
    '  function openModal() { overlay.classList.add("open"); nameIn.focus(); }',
    '  function closeModal() {',
    '    overlay.classList.remove("open");',
    '    channel = null;',
    '    [chWa, chEmail].forEach(function(b){ b.classList.remove("active"); });',
    '    [waInput, emailInput].forEach(function(d){ d.classList.remove("visible"); });',
    '    sendBtn.disabled = true;',
    '  }',
    '',
    '  shareBtns.forEach(function(b){ if(b) b.addEventListener("click", openModal); });',
    '  cancelBtn.addEventListener("click", closeModal);',
    '  overlay.addEventListener("click", function(e){ if(e.target === overlay) closeModal(); });',
    '',
    '  function setChannel(ch) {',
    '    channel = ch;',
    '    chWa.classList.toggle("active", ch === "wa");',
    '    chEmail.classList.toggle("active", ch === "email");',
    '    waInput.classList.toggle("visible", ch === "wa");',
    '    emailInput.classList.toggle("visible", ch === "email");',
    '    updateSend();',
    '  }',
    '  chWa.addEventListener("click", function(){ setChannel("wa"); });',
    '  chEmail.addEventListener("click", function(){ setChannel("email"); });',
    '',
    '  function updateSend() {',
    '    var hasContact = channel === "wa" ? phoneIn.value.trim() : (channel === "email" ? emailIn.value.trim() : "");',
    '    sendBtn.disabled = !(nameIn.value.trim() && roleIn.value.trim() && channel && hasContact);',
    '  }',
    '  [nameIn, roleIn, msgIn, phoneIn, emailIn].forEach(function(el){ el.addEventListener("input", updateSend); });',
    '',
    '  sendBtn.addEventListener("click", function() {',
    '    var name = encodeURIComponent(nameIn.value.trim());',
    '    var role = encodeURIComponent(roleIn.value.trim());',
    '    var msg  = msgIn.value.trim();',
    '    var utmUrl = baseUrl + "?utm_source=share&utm_medium=" + channel + "&utm_content=" + name + "&utm_term=" + role;',
    '    if (channel === "wa") {',
    '      var phone = phoneIn.value.trim().replace(/[^+\\d]/g, "");',
    '      var text  = (msg ? msg + "\\n\\n" : "") + "Hi, I wanted to share this presentation with you: " + utmUrl;',
    '      window.open("https://wa.me/" + phone + "?text=" + encodeURIComponent(text), "_blank");',
    '    } else {',
    '      var subject = encodeURIComponent("Presentation for you");',
    '      var body    = encodeURIComponent((msg ? msg + "\\n\\n" : "") + "Hi, I wanted to share this presentation with you:\\n" + utmUrl);',
    '      window.open("mailto:" + emailIn.value.trim() + "?subject=" + subject + "&body=" + body, "_blank");',
    '    }',
    '    if (window.umami) umami.track("share-send", { medium: channel, name: nameIn.value.trim(), role: roleIn.value.trim() });',
    '    closeModal();',
    '  });',
    '',
    '  document.addEventListener("DOMContentLoaded", function () {',
    '    if (navMenu) navMenu.style.display = "none";',
    '    goTo(0);',
    '    prevBtn.disabled = true;',
    '    arrowPrev.disabled = true;',
    '  });',
    '})();',
    '</script>',
    '<div id="_pb-nav-bar" style="position:fixed;top:0;left:0;right:0;z-index:9999;background:rgba(0,0,0,0.72);backdrop-filter:blur(6px);display:flex;align-items:center;padding:0 16px;height:40px;font-family:sans-serif;font-size:13px;">',
    '  <a id="_pb-back-btn" href="#" style="color:#fff;text-decoration:none;opacity:0.85;display:flex;align-items:center;gap:6px;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.85">',
    '    <span style="font-size:16px;">&#8592;</span><span id="_pb-back-label">Back</span>',
    '  </a>',
    '</div>',
    '<script>',
    '(function () {',
    '  var btn   = document.getElementById("_pb-back-btn");',
    '  var label = document.getElementById("_pb-back-label");',
    '  var websiteUrl = ' + JSON.stringify(presDeck.websiteUrl || '') + ';',
    '  if (window.location.pathname.indexOf("/finished/") === 0) {',
    '    label.textContent = "Back to Dashboard";',
    '    btn.href = "/";',
    '  } else if (websiteUrl) {',
    '    label.textContent = "Company Webpage";',
    '    btn.href = websiteUrl;',
    '    btn.target = "_blank";',
    '    btn.rel = "noopener noreferrer";',
    '  } else {',
    '    document.getElementById("_pb-nav-bar").style.display = "none";',
    '  }',
    '})();',
    '</script>',
    '</body>',
    '</html>'
  ].join('\n');

  fs.writeFileSync(path.join(outDir, 'index.html'), html, 'utf8');
  return outDir;
}

function makePresId() {
  var data = JSON.parse(fs.readFileSync(PRESENTATIONS_PATH, 'utf8'));
  var ids = (data.presentations || []).map(function (p) {
    var n = parseInt(p.id, 10);
    return isNaN(n) ? 0 : n;
  });
  var max = ids.length > 0 ? Math.max.apply(null, ids) : 0;
  return String(max + 1).padStart(8, '0');
}

// POST /api/presentations/rebuild-all — regenerate all frozen HTML files
app.post('/api/presentations/rebuild-all', function (req, res) {
  try {
    var data = JSON.parse(fs.readFileSync(PRESENTATIONS_PATH, 'utf8'));
    var presentations = data.presentations || [];
    var rebuilt = 0;
    var errors = [];
    presentations.forEach(function (p) {
      try {
        buildFrozenPresentation(p);
        rebuilt++;
      } catch (e) {
        errors.push({ id: p.id, error: e.message });
      }
    });
    res.json({ success: true, rebuilt: rebuilt, errors: errors });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/presentations — list all finished presentations
app.get('/api/presentations', function (req, res) {
  try {
    var data = JSON.parse(fs.readFileSync(PRESENTATIONS_PATH, 'utf8'));
    res.json({ success: true, data: data.presentations || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/analytics/presentation/:id?startAt=<ms>&endAt=<ms>
app.get('/api/analytics/presentation/:id', function (req, res) {
  if (!UMAMI_USER) return res.json({ success: false, error: 'Umami not configured' });
  try {
    var settings  = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    var websiteId = UMAMI_WEBSITE_ID || settings.umamiWebsiteId;
    if (!websiteId) return res.json({ success: false, error: 'umamiWebsiteId not set' });
    var startAt = req.query.startAt || String(Date.now() - 30 * 86400000);
    var endAt   = req.query.endAt   || String(Date.now());
    var url     = encodeURIComponent('/public/' + req.params.id + '/');
    var apiPath = '/api/websites/' + websiteId + '/stats?startAt=' + startAt + '&endAt=' + endAt + '&url=' + url;
    umamiGet(apiPath, function (err, data) {
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.json({ success: true, data: data });
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/analytics/batch?startAt=<ms>&endAt=<ms>
// Uses direct Postgres query — Umami API ignores URL filters in this version.
app.get('/api/analytics/batch', function (req, res) {
  try {
    var pdata   = JSON.parse(fs.readFileSync(PRESENTATIONS_PATH, 'utf8'));
    var ids     = (pdata.presentations || []).map(function (p) { return p.id; });
    if (ids.length === 0) return res.json({ success: true, data: {} });
    var startMs = parseInt(req.query.startAt) || (Date.now() - 30 * 86400000);
    var endMs   = parseInt(req.query.endAt)   || Date.now();
    var urlPaths = ids.map(function (id) { return '/public/' + id + '/'; });
    dbPresStats(urlPaths, startMs, endMs, function (err, statsMap) {
      if (err) return res.status(500).json({ success: false, error: err.message });
      var result = {};
      ids.forEach(function (id) {
        var s = statsMap['/public/' + id + '/'] || { pageviews: 0, visitors: 0 };
        result[id] = { pageviews: s.pageviews, visitors: s.visitors };
      });
      res.json({ success: true, data: result });
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/analytics/pageviews?startAt=<ms>&endAt=<ms>&presId=<id>
app.get('/api/analytics/pageviews', function (req, res) {
  if (!UMAMI_USER) return res.json({ success: false, error: 'Umami not configured' });
  try {
    var settings  = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    var websiteId = UMAMI_WEBSITE_ID || settings.umamiWebsiteId;
    var startAt   = req.query.startAt || String(Date.now() - 30 * 86400000);
    var endAt     = req.query.endAt   || String(Date.now());
    var apiPath   = '/api/websites/' + websiteId + '/pageviews?startAt=' + startAt + '&endAt=' + endAt + '&unit=day&timezone=UTC';
    if (req.query.presId) apiPath += '&url=' + encodeURIComponent('/public/' + req.query.presId + '/');
    umamiGet(apiPath, function (err, data) {
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.json({ success: true, data: data });
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/analytics/pageviews-by-pres?startAt=<ms>&endAt=<ms>&presId=<id>
// Reconstructs a day-by-day time series using /stats per day (supports URL filtering)
app.get('/api/analytics/pageviews-by-pres', function (req, res) {
  if (!UMAMI_USER) return res.json({ success: false, error: 'Umami not configured' });
  try {
    var settings  = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    var websiteId = UMAMI_WEBSITE_ID || settings.umamiWebsiteId;
    var startAt   = parseInt(req.query.startAt) || (Date.now() - 30 * 86400000);
    var endAt     = parseInt(req.query.endAt)   || Date.now();
    var presId    = req.query.presId;
    var presFilter = umamiPresFilter(presId);

    var DAY  = 86400000;
    var days = [];
    var cur  = new Date(startAt);
    cur.setHours(0, 0, 0, 0);
    while (cur.getTime() < endAt) {
      var dayStart = cur.getTime();
      days.push({ t: dayStart, start: dayStart, end: Math.min(dayStart + DAY, endAt) });
      cur = new Date(dayStart + DAY);
    }

    if (days.length === 0) return res.json({ success: true, data: { pageviews: [], sessions: [] } });

    var results = new Array(days.length);
    var pending = days.length;

    days.forEach(function (day, i) {
      var apiPath = '/api/websites/' + websiteId + '/stats?startAt=' + day.start + '&endAt=' + day.end + presFilter;
      umamiGet(apiPath, function (err, data) {
        results[i] = err ? null : data;
        if (--pending === 0) {
          var pageviews = results.map(function (d, j) {
            return { x: days[j].t, y: umamiVal(d && d.pageviews) };
          });
          var sessions = results.map(function (d, j) {
            return { x: days[j].t, y: umamiVal(d && d.visitors) };
          });
          res.json({ success: true, data: { pageviews: pageviews, sessions: sessions } });
        }
      });
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Returns aggregated time series AND per-presentation breakdown in one query.
// Result: { pageviews: [{x,y}], sessions: [{x,y}], breakdown: [{ id, name, pageviews, sessions }] }
function dbPresTimeSeriesWithBreakdown(urlPaths, presMap, startMs, endMs, cb) {
  var db = getUmamiDb();
  if (!db || !urlPaths.length) return cb(null, { pageviews: [], sessions: [], breakdown: [] });
  var siteId = null;
  try { siteId = UMAMI_WEBSITE_ID || JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')).umamiWebsiteId; } catch (e) {}
  if (!siteId) return cb(null, { pageviews: [], sessions: [], breakdown: [] });
  db.query(
    "SELECT url_path, TO_CHAR(created_at AT TIME ZONE '" + localTzString() + "', 'YYYY-MM-DD') AS day, " +
    '       COUNT(*) AS pageviews, COUNT(DISTINCT session_id) AS visitors ' +
    'FROM website_event ' +
    'WHERE website_id = $1 AND url_path = ANY($2) AND event_type = 1 ' +
    '  AND created_at >= to_timestamp($3::bigint / 1000.0) ' +
    '  AND created_at <  to_timestamp($4::bigint / 1000.0) ' +
    'GROUP BY 1, 2 ORDER BY 2, 1',
    [siteId, urlPaths, startMs, endMs],
    function (err, result) {
      if (err) return cb(err);
      var DAY  = 86400000;
      var days = [];
      var cur  = new Date(startMs); cur.setHours(0, 0, 0, 0);
      while (cur.getTime() < endMs) { days.push(localDate(cur)); cur = new Date(cur.getTime() + DAY); }
      var byDay    = {};
      var byUrlDay = {};
      (result.rows || []).forEach(function (r) {
        var pv = parseInt(r.pageviews, 10);
        var vs = parseInt(r.visitors,  10);
        if (!byDay[r.day]) byDay[r.day] = { pv: 0, vs: 0 };
        byDay[r.day].pv += pv;
        byDay[r.day].vs += vs;
        if (!byUrlDay[r.url_path]) byUrlDay[r.url_path] = {};
        byUrlDay[r.url_path][r.day] = { pv: pv, vs: vs };
      });
      var pageviews = days.map(function (d) { return { x: d, y: byDay[d] ? byDay[d].pv : 0 }; });
      var sessions  = days.map(function (d) { return { x: d, y: byDay[d] ? byDay[d].vs : 0 }; });
      var breakdown = urlPaths.map(function (url) {
        var presId = url.replace(/^\/public\//, '').replace(/\/$/, '');
        return {
          id: presId,
          name: presMap[presId] || presId,
          pageviews: days.map(function (d) { return { x: d, y: byUrlDay[url] && byUrlDay[url][d] ? byUrlDay[url][d].pv : 0 }; }),
          sessions:  days.map(function (d) { return { x: d, y: byUrlDay[url] && byUrlDay[url][d] ? byUrlDay[url][d].vs : 0 }; })
        };
      });
      cb(null, { pageviews: pageviews, sessions: sessions, breakdown: breakdown });
    }
  );
}

// GET /api/analytics/pageviews-multi?startAt=<ms>&endAt=<ms>&presIds=<id1,id2,...>
// Uses direct Postgres — Umami API ignores URL filters in this version.
app.get('/api/analytics/pageviews-multi', function (req, res) {
  try {
    var pdata   = JSON.parse(fs.readFileSync(PRESENTATIONS_PATH, 'utf8'));
    var startAt = parseInt(req.query.startAt) || (Date.now() - 30 * 86400000);
    var endAt   = parseInt(req.query.endAt)   || Date.now();

    var livePres  = (pdata.presentations || []).filter(function (p) { return p.publishedAt && !p.archivedAt; });
    var requested = req.query.presIds ? req.query.presIds.split(',').map(function (s) { return s.trim(); }) : null;
    var targets   = requested ? livePres.filter(function (p) { return requested.indexOf(p.id) !== -1; }) : livePres;

    if (targets.length === 0) return res.json({ success: true, data: { pageviews: [], sessions: [], breakdown: [] } });

    var urlPaths = targets.map(function (p) { return '/public/' + p.id + '/'; });
    var presMap  = {};
    targets.forEach(function (p) {
      presMap[p.id] = p.presentationName
        ? ((p.customerName || '') + (p.customerName ? ' — ' : '') + p.presentationName)
        : (p.customerName || p.id);
    });
    dbPresTimeSeriesWithBreakdown(urlPaths, presMap, startAt, endAt, function (err, data) {
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.json({ success: true, data: data });
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/analytics/events?startAt=<ms>&endAt=<ms>&presIds=<id1,id2,...>
// Returns slide event counts per event_name, aggregated across selected Live presentations.
app.get('/api/analytics/events', function (req, res) {
  try {
    var pdata   = JSON.parse(fs.readFileSync(PRESENTATIONS_PATH, 'utf8'));
    var startAt = parseInt(req.query.startAt) || (Date.now() - 30 * 86400000);
    var endAt   = parseInt(req.query.endAt)   || Date.now();
    var livePres  = (pdata.presentations || []).filter(function (p) { return p.publishedAt && !p.archivedAt; });
    var requested = req.query.presIds ? req.query.presIds.split(',').map(function (s) { return s.trim(); }) : null;
    var targets   = requested ? livePres.filter(function (p) { return requested.indexOf(p.id) !== -1; }) : livePres;
    if (targets.length === 0) return res.json({ success: true, data: [] });
    var urlPaths = targets.map(function (p) { return '/public/' + p.id + '/'; });
    dbSlideEvents(urlPaths, startAt, endAt, null, function (err, data) {
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.json({ success: true, data: data });
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/analytics/event-series?startAt=<ms>&endAt=<ms>&presIds=&eventNames=
// Returns day-by-day event counts per event_name for time-series view.
app.get('/api/analytics/event-series', function (req, res) {
  try {
    var pdata   = JSON.parse(fs.readFileSync(PRESENTATIONS_PATH, 'utf8'));
    var startAt = parseInt(req.query.startAt) || (Date.now() - 30 * 86400000);
    var endAt   = parseInt(req.query.endAt)   || Date.now();
    var livePres  = (pdata.presentations || []).filter(function (p) { return p.publishedAt && !p.archivedAt; });
    var requested = req.query.presIds ? req.query.presIds.split(',').map(function (s) { return s.trim(); }) : null;
    var targets   = requested ? livePres.filter(function (p) { return requested.indexOf(p.id) !== -1; }) : livePres;
    if (targets.length === 0) return res.json({ success: true, data: { days: [], series: [] } });
    var urlPaths = targets.map(function (p) { return '/public/' + p.id + '/'; });
    var evNames  = req.query.eventNames ? req.query.eventNames.split(',').map(function (s) { return s.trim(); }) : null;
    dbSlideEventSeries(urlPaths, startAt, endAt, evNames, function (err, data) {
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.json({ success: true, data: data });
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/analytics/slide-events?startAt=<ms>&endAt=<ms>&presIds=&eventName=<event>
// Drill-down: returns per-presentation event counts for a specific slide event.
app.get('/api/analytics/slide-events', function (req, res) {
  try {
    var pdata     = JSON.parse(fs.readFileSync(PRESENTATIONS_PATH, 'utf8'));
    var startAt   = parseInt(req.query.startAt) || (Date.now() - 30 * 86400000);
    var endAt     = parseInt(req.query.endAt)   || Date.now();
    var eventName = (req.query.eventName || '').trim();
    if (!eventName) return res.json({ success: true, data: [] });
    var livePres  = (pdata.presentations || []).filter(function (p) { return p.publishedAt && !p.archivedAt; });
    var requested = req.query.presIds ? req.query.presIds.split(',').map(function (s) { return s.trim(); }) : null;
    var targets   = requested ? livePres.filter(function (p) { return requested.indexOf(p.id) !== -1; }) : livePres;
    if (targets.length === 0) return res.json({ success: true, data: [] });
    var urlPaths = targets.map(function (p) { return '/public/' + p.id + '/'; });
    var presMap  = {};
    targets.forEach(function (p) {
      presMap[p.id] = p.presentationName
        ? ((p.customerName || '') + (p.customerName ? ' — ' : '') + p.presentationName)
        : (p.customerName || p.id);
    });
    dbSlideEventByPres(urlPaths, presMap, startAt, endAt, eventName, function (err, data) {
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.json({ success: true, data: data });
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// POST /api/presentations — save a new finished presentation (snapshot of current deck + customer info)
app.post('/api/presentations', function (req, res) {
  var body = req.body || {};
  var replaceId = (body.replaceId || '').trim();

  if (replaceId && !/^[a-zA-Z0-9-]+$/.test(replaceId)) {
    return res.status(400).json({ success: false, error: 'Invalid replaceId' });
  }

  var customerName = (body.customerName || '').trim();
  if (!customerName) {
    return res.status(400).json({ success: false, error: 'customerName is required' });
  }
  try {
    var activeDeckId = getActiveDeckId();
    var deck    = readDeckById(activeDeckId);
    var deckMeta = (readDecks().decks || []).find(function (d) { return d.id === activeDeckId; }) || {};
    var library = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'));

    var presentationName = (body.presentationName || '').trim();
    var contactName  = (body.contactName  || '').trim();
    var contactTitle = (body.contactTitle || '').trim();

    // Save logo file if provided — store path in presentation record only, never in library
    var customerLogoSrc = '';
    var logoFilename = (body.logoFilename || '').trim();
    var logoData     = (body.logoData     || '').trim();
    if (logoFilename && logoData) {
      var logoMatches = logoData.match(/^data:([A-Za-z0-9+/]+);base64,(.+)$/);
      if (logoMatches) {
        var logoBuffer = Buffer.from(logoMatches[2], 'base64');
        var logoSafe   = dedupUpload(path.basename(logoFilename), logoBuffer).split('/').pop();
        customerLogoSrc = '/slides/uploads/' + logoSafe;
      }
    }
    // Fall back to cover slide logo, then deck logo
    if (!customerLogoSrc && body.coverLogoSrc) customerLogoSrc = (body.coverLogoSrc || '').trim();
    if (!customerLogoSrc && deckMeta.logo) customerLogoSrc = deckMeta.logo;

    // Build a snapshot: deck slide order + names
    var slides = (deck.slides || []).map(function (s) {
      var lib = library.slides.find(function (l) { return l.id === s.librarySlideId; });
      return {
        id:             s.id,
        librarySlideId: s.librarySlideId,
        name:           (lib && lib.name) || s.id,
        visible:        s.visible !== false
      };
    });

    var data = JSON.parse(fs.readFileSync(PRESENTATIONS_PATH, 'utf8'));

    if (replaceId) {
      var idx = data.presentations.findIndex(function (p) { return p.id === replaceId; });
      if (idx === -1) {
        return res.status(404).json({ success: false, error: 'Presentation not found' });
      }
      if (data.presentations[idx].archivedAt) {
        return res.status(400).json({ success: false, error: 'Cannot replace an archived presentation' });
      }
      var existing = data.presentations[idx];
      var repDefaultLang = (body.defaultLanguage || 'en').trim();
      var repLanguages   = Array.isArray(body.languages) ? body.languages.filter(Boolean) : [];
      existing.presentationName = presentationName;
      existing.contactName      = contactName;
      existing.contactTitle     = contactTitle;
      if (customerLogoSrc) existing.customerLogoSrc = customerLogoSrc;
      existing.slideCount     = slides.filter(function (s) { return s.visible; }).length;
      existing.slides         = slides;
      existing.defaultLanguage = repDefaultLang;
      existing.languages       = repLanguages;
      existing.replacedAt     = new Date().toISOString();
      fs.writeFileSync(PRESENTATIONS_PATH, JSON.stringify(data, null, 2), 'utf8');
      try {
        buildFrozenPresentation(existing);
      } catch (buildErr) {
        console.error('Frozen build failed:', buildErr.message);
      }
      return res.json({ success: true, data: existing });
    }

    var defaultLanguage = (body.defaultLanguage || 'en').trim();
    var languages = Array.isArray(body.languages) ? body.languages.filter(Boolean) : [];

    var presentation = {
      id:              makePresId(),
      createdAt:       localDateString(),
      deckId:          (body.deckId || '').trim(),
      presentationName: presentationName,
      customerName:    customerName,
      contactName:     contactName,
      contactTitle:    contactTitle,
      customerLogoSrc: customerLogoSrc,
      slideCount:      slides.filter(function (s) { return s.visible; }).length,
      slides:          slides,
      defaultLanguage: defaultLanguage,
      languages:       languages
    };

    data.presentations.unshift(presentation);
    fs.writeFileSync(PRESENTATIONS_PATH, JSON.stringify(data, null, 2), 'utf8');

    try {
      buildFrozenPresentation(presentation);
    } catch (buildErr) {
      console.error('Frozen build failed:', buildErr.message);
    }

    res.json({ success: true, data: presentation });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/presentations/:id — return a single finished presentation
app.get('/api/presentations/:id', function (req, res) {
  try {
    var data = JSON.parse(fs.readFileSync(PRESENTATIONS_PATH, 'utf8'));
    var pres = (data.presentations || []).find(function (p) { return p.id === req.params.id; });
    if (!pres) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: pres });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/presentations/:id — update metadata + logo, rebuild frozen HTML
app.put('/api/presentations/:id', function (req, res) {
  try {
    var body = req.body || {};
    var data = JSON.parse(fs.readFileSync(PRESENTATIONS_PATH, 'utf8'));
    var pres = (data.presentations || []).find(function (p) { return p.id === req.params.id; });
    if (!pres) return res.status(404).json({ success: false, error: 'Not found' });

    if (body.presentationName !== undefined) pres.presentationName = (body.presentationName || '').trim();
    if (body.customerName !== undefined) pres.customerName = (body.customerName || '').trim();
    if (body.contactName  !== undefined) pres.contactName  = (body.contactName  || '').trim();
    if (body.contactTitle !== undefined) pres.contactTitle = (body.contactTitle || '').trim();

    // Save logo file if provided — store path in presentation record only, never in library
    var logoFilename = (body.logoFilename || '').trim();
    var logoData     = (body.logoData     || '').trim();
    if (logoFilename && logoData) {
      var logoMatches = logoData.match(/^data:([A-Za-z0-9+/]+);base64,(.+)$/);
      if (logoMatches) {
        var logoBuffer = Buffer.from(logoMatches[2], 'base64');
        var logoSafe   = dedupUpload(path.basename(logoFilename), logoBuffer).split('/').pop();
        pres.customerLogoSrc = '/slides/uploads/' + logoSafe;
      }
    }

    fs.writeFileSync(PRESENTATIONS_PATH, JSON.stringify(data, null, 2), 'utf8');

    try { buildFrozenPresentation(pres); } catch (e) { console.error('Rebuild failed:', e.message); }

    res.json({ success: true, data: pres });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/presentations/:id — hard delete (only permitted on archived presentations)
app.delete('/api/presentations/:id', function (req, res) {
  try {
    var data = JSON.parse(fs.readFileSync(PRESENTATIONS_PATH, 'utf8'));
    var idx  = (data.presentations || []).findIndex(function (p) { return p.id === req.params.id; });
    if (idx === -1) return res.status(404).json({ success: false, error: 'Not found' });
    var pres = data.presentations[idx];
    if (!pres.archivedAt) {
      return res.status(400).json({ success: false, error: 'Presentation must be archived before it can be deleted.' });
    }
    data.presentations.splice(idx, 1);
    fs.writeFileSync(PRESENTATIONS_PATH, JSON.stringify(data, null, 2));
    var frozenDir = path.join(__dirname, '..', 'finished-presentations', req.params.id);
    if (fs.existsSync(frozenDir)) {
      fs.rmSync(frozenDir, { recursive: true, force: true });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/presentations/:id/archive — soft-delete (sets archivedAt, hides from main list)
app.post('/api/presentations/:id/archive', function (req, res) {
  try {
    var data = JSON.parse(fs.readFileSync(PRESENTATIONS_PATH, 'utf8'));
    var pres = (data.presentations || []).find(function (p) { return p.id === req.params.id; });
    if (!pres) return res.status(404).json({ success: false, error: 'Not found' });
    pres.archivedAt = new Date().toISOString();
    fs.writeFileSync(PRESENTATIONS_PATH, JSON.stringify(data, null, 2), 'utf8');
    res.json({ success: true, data: pres });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/presentations/:id/unarchive — restore from archive
app.post('/api/presentations/:id/unarchive', function (req, res) {
  try {
    var data = JSON.parse(fs.readFileSync(PRESENTATIONS_PATH, 'utf8'));
    var pres = (data.presentations || []).find(function (p) { return p.id === req.params.id; });
    if (!pres) return res.status(404).json({ success: false, error: 'Not found' });
    delete pres.archivedAt;
    fs.writeFileSync(PRESENTATIONS_PATH, JSON.stringify(data, null, 2), 'utf8');
    res.json({ success: true, data: pres });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/presentations/:id/duplicate — copy a presentation with new customer info
app.post('/api/presentations/:id/duplicate', function (req, res) {
  var body = req.body || {};
  var customerName = (body.customerName || '').trim();
  if (!customerName) {
    return res.status(400).json({ success: false, error: 'customerName is required' });
  }
  try {
    var data = JSON.parse(fs.readFileSync(PRESENTATIONS_PATH, 'utf8'));
    var src  = (data.presentations || []).find(function (p) { return p.id === req.params.id; });
    if (!src) return res.status(404).json({ success: false, error: 'Not found' });

    var contactName  = (body.contactName  || '').trim();
    var contactTitle = (body.contactTitle || '').trim();

    // Save logo file if provided — inherit source logo otherwise
    var logoSrc = src.customerLogoSrc || '';
    var logoFilename = (body.logoFilename || '').trim();
    var logoData     = (body.logoData     || '').trim();
    if (logoFilename && logoData) {
      var logoMatches = logoData.match(/^data:([A-Za-z0-9+/]+);base64,(.+)$/);
      if (logoMatches) {
        var logoBuffer = Buffer.from(logoMatches[2], 'base64');
        var logoSafe   = dedupUpload(path.basename(logoFilename), logoBuffer).split('/').pop();
        logoSrc = '/slides/uploads/' + logoSafe;
      }
    }

    var slides = (src.slides || []).map(function (s) {
      return { id: s.id, librarySlideId: s.librarySlideId, name: s.name, visible: s.visible };
    });

    var presentation = {
      id:              makePresId(),
      createdAt:       localDateString(),
      deckId:          src.deckId || '',
      presentationName: src.presentationName || '',
      customerName:    customerName,
      contactName:     contactName,
      contactTitle:    contactTitle,
      customerLogoSrc: logoSrc,
      slideCount:      slides.filter(function (s) { return s.visible; }).length,
      slides:          slides,
      defaultLanguage: src.defaultLanguage || 'en',
      languages:       src.languages || []
    };

    data = JSON.parse(fs.readFileSync(PRESENTATIONS_PATH, 'utf8'));
    data.presentations.unshift(presentation);
    fs.writeFileSync(PRESENTATIONS_PATH, JSON.stringify(data, null, 2), 'utf8');

    try {
      buildFrozenPresentation(presentation);
    } catch (buildErr) {
      console.error('Frozen build failed:', buildErr.message);
    }

    res.json({ success: true, data: presentation });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/presentations/:id/publish', function (req, res) {
  var id = req.params.id;
  if (!/^[a-z0-9-]+$/i.test(id)) {
    return res.status(400).json({ success: false, error: 'Invalid presentation id' });
  }

  var data = JSON.parse(fs.readFileSync(PRESENTATIONS_PATH, 'utf8'));
  var pres = (data.presentations || []).find(function (p) { return p.id === id; });
  if (!pres) return res.status(404).json({ success: false, error: 'Presentation not found' });

  var repoRoot  = REPO_ROOT;
  var folderArg = 'finished-presentations/' + id;
  var commitMsg = 'publish: ' + (pres.customerName || id) + (pres.presentationName ? ' — ' + pres.presentationName : '') + ' (' + id + ')';
  var publicUrl = PUBLIC_BASE_URL + '/public/' + id;

  function run(cmd, args, cwd, cb) {
    execFile(cmd, args, { cwd: cwd }, function (err, stdout, stderr) {
      cb(err, stdout, stderr);
    });
  }

  // Rebuild the frozen HTML with current code/settings before committing
  try {
    buildFrozenPresentation(pres);
  } catch (buildErr) {
    return res.status(500).json({ success: false, error: 'Build failed: ' + buildErr.message });
  }

  run('git', ['add', folderArg, 'finished-presentations/shared'], repoRoot, function (err) {
    if (err) return res.status(500).json({ success: false, error: 'git add failed: ' + err.message });
    run('git', ['commit', '-m', commitMsg], repoRoot, function (err, stdout, stderr) {
      var combined = (stdout || '') + (stderr || '');
      var nothingToCommit = combined.includes('nothing to commit') || combined.includes('nothing added to commit') || combined.includes('no changes added to commit');
      if (err && !nothingToCommit) return res.status(500).json({ success: false, error: 'git commit failed: ' + err.message });
      run('git', ['push'], repoRoot, function (err) {
        var pushWarning = err ? 'Not pushed to GitHub (' + (err.message || '').split('\n')[0] + '). Local link works for preview only.' : null;
        // Record publishedAt on first publish (keep existing value on republish)
        try {
          var pdata = JSON.parse(fs.readFileSync(PRESENTATIONS_PATH, 'utf8'));
          var prec  = (pdata.presentations || []).find(function (p) { return p.id === id; });
          if (prec && !prec.publishedAt) {
            prec.publishedAt = new Date().toISOString();
            fs.writeFileSync(PRESENTATIONS_PATH, JSON.stringify(pdata, null, 2), 'utf8');
          }
        } catch (e) { /* non-fatal */ }
        var result = { success: true, url: publicUrl, alreadyPublished: !!nothingToCommit };
        if (pushWarning) result.warning = pushWarning;
        res.json(result);
      });
    });
  });
});

// GET /finished/:id/ — internal preview (protected by global requireAuth middleware)
app.use('/finished', express.static(path.join(__dirname, '..', 'finished-presentations')));

// GET /view/:id — redirect to frozen file if it exists; fall back to live viewer
app.get('/view/:id', function (req, res) {
  var id = req.params.id;
  if (!/^[a-z0-9-]+$/i.test(id)) {
    return res.status(400).type('text/plain').send('Invalid presentation id');
  }
  var frozenFile = path.join(__dirname, '..', 'finished-presentations', id, 'index.html');
  if (fs.existsSync(frozenFile)) {
    return res.redirect('/finished/' + id + '/');
  }
  res.sendFile(path.join(__dirname, 'features/presentation-view/index.html'));
});

// GET /api/slide-library — return the slide library catalog with deck membership
app.get('/api/slide-library', function (req, res) {
  try {
    var library   = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'));
    var templates = JSON.parse(fs.readFileSync(TEMPLATES_PATH, 'utf8'));
    var tplMap    = {};
    templates.forEach(function (t) { tplMap[t.id] = t; });

    // Build deck membership map: librarySlideId -> [{ id, name }]
    var deckMembershipMap = {};
    var deckList = [];
    try {
      var decksData = readDecks();
      var allDecks  = decksData.decks || [];
      allDecks.forEach(function (deckMeta) {
        try {
          var deck = readDeckById(deckMeta.id);
          var deckEntry = { id: deckMeta.id, name: deckMeta.name || deckMeta.id };
          deckList.push(deckEntry);
          var deckSlides = deck.slides || [];
          deckSlides.forEach(function (ds) {
            if (ds.librarySlideId) {
              if (!deckMembershipMap[ds.librarySlideId]) {
                deckMembershipMap[ds.librarySlideId] = [];
              }
              deckMembershipMap[ds.librarySlideId].push(deckEntry);
            }
          });
        } catch (e) { /* skip missing/corrupt deck files */ }
      });
    } catch (e) { /* non-fatal — proceed without membership data */ }

    var slides = library.slides.map(function (s) {
      var tpl = s.templateId ? tplMap[s.templateId] : null;
      var tplVersion = tpl ? (tpl.version || 1) : 1;
      var libVersion = s.templateVersion || 1;
      var hasUpdate  = !!(tpl && libVersion < tplVersion);
      var ignored    = !!(s.templateUpdateIgnoredAt && hasUpdate);
      return Object.assign({}, s, {
        hasTemplateUpdate: hasUpdate && !ignored,
        templateUpdateIgnored: ignored,
        decks: deckMembershipMap[s.id] || []
      });
    });

    res.json({ success: true, data: { slides: slides, decks: deckList } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/slide-templates — return the built-in generic slide template catalog
app.get('/api/slide-templates', function (req, res) {
  try {
    var templates = JSON.parse(fs.readFileSync(TEMPLATES_PATH, 'utf8'));
    res.json({ success: true, data: templates });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/templates — return the HTML slide template catalog; ?category=CTA to filter
app.get('/api/templates', function (req, res) {
  try {
    var catalog = JSON.parse(fs.readFileSync(TEMPLATE_CATALOG_PATH, 'utf8'));
    var category = req.query.category;
    if (category) {
      catalog = catalog.filter(function (t) {
        return t.category.toLowerCase() === category.toLowerCase();
      });
    }
    res.json({ success: true, data: catalog });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/templates — register a new HTML slide template
// Generator mode (preferred): { id, name, category, slideMode, layout, blocks }
// Direct mode (backward compat): { id, name, category, slideMode, components, html }
// Writes the HTML to features/slides/slide-[NN]-[slug].html, appends entry to templates.json
app.post('/api/templates', function (req, res) {
  try {
    var body = req.body || {};
    var id        = (body.id       || '').trim();
    var name      = (body.name     || '').trim();
    var category  = (body.category || '').trim();
    var slideMode = (body.slideMode || 'sequence').trim();

    if (!id || !name || !category) {
      return res.status(400).json({ success: false, error: 'id, name, and category are required' });
    }

    // Generator mode: layout + blocks → server builds HTML
    var html, components;
    if (body.layout) {
      var blocks = Array.isArray(body.blocks) ? body.blocks : [];
      try {
        html = generateHtml({ id: id, slideMode: slideMode, layout: body.layout, blocks: blocks });
      } catch (genErr) {
        return res.status(400).json({ success: false, error: 'Generator error: ' + genErr.message });
      }
      components = blocks.map(function (b) { return b.type; }).filter(Boolean);
    } else {
      // Direct mode: caller supplies html
      html = (body.html || '').trim();
      components = Array.isArray(body.components) ? body.components : [];
      if (!html) {
        return res.status(400).json({ success: false, error: 'Either layout+blocks or html is required' });
      }
    }

    var validCategories = ['Cover', 'Content', 'Stats', 'Visual', 'CTA', 'Data'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({ success: false, error: 'category must be one of: ' + validCategories.join(', ') });
    }

    var catalog = JSON.parse(fs.readFileSync(TEMPLATE_CATALOG_PATH, 'utf8'));
    if (catalog.find(function (t) { return t.id === id; })) {
      return res.status(409).json({ success: false, error: 'Template id already exists: ' + id });
    }

    // Derive next slide number from existing files
    var slidesDir = path.join(__dirname, 'features', 'slides');
    var existing  = fs.readdirSync(slidesDir).filter(function (f) { return /^slide-\d+-.+\.html$/.test(f); });
    var maxNum    = existing.reduce(function (max, f) {
      var m = f.match(/^slide-(\d+)-/);
      return m ? Math.max(max, parseInt(m[1], 10)) : max;
    }, 0);
    var nextNum  = String(maxNum + 1).padStart(2, '0');
    var slug     = id.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    var filename = 'slide-' + nextNum + '-' + slug + '.html';
    var filePath = path.join(slidesDir, filename);
    var fileRef  = 'features/slides/' + filename;

    fs.writeFileSync(filePath, html, 'utf8');

    var entry = {
      id:         id,
      name:       name,
      category:   category,
      slideMode:  slideMode,
      components: components,
      file:       fileRef,
      createdAt:  new Date().toISOString()
    };
    catalog.push(entry);
    fs.writeFileSync(TEMPLATE_CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf8');

    res.status(201).json({ success: true, data: entry });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/templates/:id — deregister a template (keeps the HTML file)
app.delete('/api/templates/:id', function (req, res) {
  try {
    var catalog = JSON.parse(fs.readFileSync(TEMPLATE_CATALOG_PATH, 'utf8'));
    var idx     = catalog.findIndex(function (t) { return t.id === req.params.id; });
    if (idx === -1) return res.status(404).json({ success: false, error: 'Template not found: ' + req.params.id });
    catalog.splice(idx, 1);
    fs.writeFileSync(TEMPLATE_CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf8');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/templates/:id — update name and/or category of a template entry
app.patch('/api/templates/:id', function (req, res) {
  try {
    var catalog = JSON.parse(fs.readFileSync(TEMPLATE_CATALOG_PATH, 'utf8'));
    var idx     = catalog.findIndex(function (t) { return t.id === req.params.id; });
    if (idx === -1) return res.status(404).json({ success: false, error: 'Template not found: ' + req.params.id });
    var body = req.body || {};
    if (body.name       !== undefined) catalog[idx].name       = String(body.name).trim();
    if (body.category   !== undefined) catalog[idx].category   = String(body.category).trim();
    if (body.tags       !== undefined) catalog[idx].tags       = Array.isArray(body.tags) ? body.tags : [];
    if (body.components !== undefined) catalog[idx].components = Array.isArray(body.components) ? body.components : [];
    fs.writeFileSync(TEMPLATE_CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf8');
    res.json({ success: true, data: catalog[idx] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/templates/:id/duplicate — clone a template entry (shares the same HTML file)
app.post('/api/templates/:id/duplicate', function (req, res) {
  try {
    var catalog = JSON.parse(fs.readFileSync(TEMPLATE_CATALOG_PATH, 'utf8'));
    var src = catalog.find(function (t) { return t.id === req.params.id; });
    if (!src) return res.status(404).json({ success: false, error: 'Template not found: ' + req.params.id });
    var baseId = src.id + '-copy';
    var newId  = baseId;
    var n = 1;
    while (catalog.find(function (t) { return t.id === newId; })) { newId = baseId + '-' + (++n); }
    var copy = Object.assign({}, src, { id: newId, name: src.name + ' (copy)', createdAt: new Date().toISOString() });
    catalog.push(copy);
    fs.writeFileSync(TEMPLATE_CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf8');
    res.status(201).json({ success: true, data: copy });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/slide-library/:id — update name (and/or other top-level fields) of a library slide
app.patch('/api/slide-library/:id', function (req, res) {
  try {
    var library = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'));
    var slide = library.slides.find(function (s) { return s.id === req.params.id; });
    if (!slide) return res.status(404).json({ success: false, error: 'Slide not found' });
    var allowed = ['name'];
    var body = req.body || {};
    allowed.forEach(function (key) {
      if (body[key] !== undefined) slide[key] = String(body[key]).trim() || slide[key];
    });
    fs.writeFileSync(LIBRARY_PATH, JSON.stringify(library, null, 2), 'utf8');
    res.json({ success: true, data: slide });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/slide-library/:id/duplicate — duplicate a library slide
app.post('/api/slide-library/:id/duplicate', function (req, res) {
  try {
    var library = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'));
    var src = library.slides.find(function (s) { return s.id === req.params.id; });
    if (!src) return res.status(404).json({ success: false, error: 'Slide not found' });
    var copy = Object.assign({}, JSON.parse(JSON.stringify(src)), {
      id: 'lib-' + Date.now(),
      name: (src.name || 'Untitled Slide') + ' (Copy)',
      decks: [],
      deckEdits: {}
    });
    library.slides.push(copy);
    fs.writeFileSync(LIBRARY_PATH, JSON.stringify(library, null, 2), 'utf8');
    res.json({ success: true, data: copy });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/slide-library/:id/accept-update — apply new template structure, bump templateVersion
app.post('/api/slide-library/:id/accept-update', function (req, res) {
  try {
    var library   = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'));
    var templates = JSON.parse(fs.readFileSync(TEMPLATES_PATH, 'utf8'));
    var slide     = library.slides.find(function (s) { return s.id === req.params.id; });
    if (!slide) return res.status(404).json({ success: false, error: 'Slide not found' });
    var tpl = templates.find(function (t) { return t.id === slide.templateId; });
    if (!tpl) return res.status(404).json({ success: false, error: 'Template not found' });

    // Apply new template structure; existing edits are preserved (they live in slide.edits)
    slide.templateVersion = tpl.version || 1;
    delete slide.templateUpdateIgnoredAt;
    fs.writeFileSync(LIBRARY_PATH, JSON.stringify(library, null, 2), 'utf8');
    res.json({ success: true, data: slide });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/slide-library/:id/ignore-update — mark template update as ignored
app.post('/api/slide-library/:id/ignore-update', function (req, res) {
  try {
    var library = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'));
    var slide   = library.slides.find(function (s) { return s.id === req.params.id; });
    if (!slide) return res.status(404).json({ success: false, error: 'Slide not found' });
    slide.templateUpdateIgnoredAt = new Date().toISOString();
    fs.writeFileSync(LIBRARY_PATH, JSON.stringify(library, null, 2), 'utf8');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/slide-library/:id — remove an entry from the slide library by id
app.delete('/api/slide-library/:id', function (req, res) {
  try {
    var library = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'));
    library.slides = library.slides.filter(function (e) { return e.id !== req.params.id; });
    fs.writeFileSync(LIBRARY_PATH, JSON.stringify(library, null, 2), 'utf8');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/library — create a new library slide from a template
app.post('/api/library', function (req, res) {
  try {
    var body       = req.body || {};
    var templateId = body.templateId;
    var name       = body.name || 'Untitled Slide';
    if (!templateId) return res.status(400).json({ success: false, error: 'templateId is required' });

    // Resolve optional theme (new system) or legacy style ref
    var slideStyleRef = null;
    var slideStyleCss = null;
    var rawThemeId  = (body.themeId  || '').replace(/[^a-z0-9._-]/gi, '');
    var rawStyleRef = (body.styleRef || '').replace(/[^a-z0-9._-]/gi, '');
    if (rawThemeId && rawThemeId.endsWith('.css')) {
      var tPath = path.join(THEMES_DIR, path.basename(rawThemeId));
      if (fs.existsSync(tPath)) {
        slideStyleRef = rawThemeId;
        slideStyleCss = fs.readFileSync(tPath, 'utf8');
      }
    } else if (rawStyleRef && rawStyleRef.endsWith('.html')) {
      var sPath = path.join(STYLE_REFS_DIR, path.basename(rawStyleRef));
      if (fs.existsSync(sPath)) {
        slideStyleRef = rawStyleRef;
        slideStyleCss = extractStyleCss(fs.readFileSync(sPath, 'utf8'), 'dark');
      }
    }

    var resolved = resolveTemplate(templateId);
    var catalog  = JSON.parse(fs.readFileSync(TEMPLATE_CATALOG_PATH, 'utf8'));
    var tplEntry = catalog.find(function (t) { return t.id === templateId; });
    var library  = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'));

    var edits = (tplEntry && tplEntry.defaultEdits) ? JSON.parse(JSON.stringify(tplEntry.defaultEdits)) : {};

    var newSlide = {
      id: 'lib-' + Date.now(),
      name: name,
      templateId: templateId,
      templateVersion: (resolved && resolved.source === 'canvas' && resolved.tpl.version) ? resolved.tpl.version : 1,
      edits: edits
    };
    if (slideStyleRef) { newSlide.styleRef = slideStyleRef; newSlide.styleCss = slideStyleCss; }
    if (rawThemeId && rawThemeId.endsWith('.css')) newSlide.themeId = rawThemeId;
    library.slides.push(newSlide);
    fs.writeFileSync(LIBRARY_PATH, JSON.stringify(library, null, 2), 'utf8');
    res.json({ success: true, data: newSlide });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/templates/:id/defaultEdits — save default edit values for a template
app.post('/api/templates/:id/defaultEdits', function (req, res) {
  var id = req.params.id;
  if (!/^[a-z0-9-]+$/i.test(id)) {
    return res.status(400).json({ success: false, error: 'Invalid id' });
  }
  try {
    var edits = (req.body || {}).edits;
    if (!edits || typeof edits !== 'object') {
      return res.status(400).json({ success: false, error: 'edits object is required' });
    }
    var catalog = JSON.parse(fs.readFileSync(TEMPLATE_CATALOG_PATH, 'utf8'));
    var tpl = catalog.find(function (t) { return t.id === id; });
    if (!tpl) return res.status(404).json({ success: false, error: 'Template not found' });
    tpl.defaultEdits = edits;
    fs.writeFileSync(TEMPLATE_CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf8');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /slides/template-preview/:id — renders a raw template file by template id (full component shell)
app.get('/slides/template-preview/:id', function (req, res) {
  var id = req.params.id;
  if (!/^[a-z0-9-]+$/i.test(id)) {
    return res.status(400).type('text/plain').send('Invalid id');
  }
  var editMode   = req.query.edit === '1';
  var styleQuery = (req.query.style || '').replace(/[^a-z0-9._-]/gi, '');
  var themeQuery = (req.query.theme || '').replace(/[^a-z0-9._-]/gi, '');
  try {
    var catalog = JSON.parse(fs.readFileSync(TEMPLATE_CATALOG_PATH, 'utf8'));
    var tpl = catalog.find(function (t) { return t.id === id; });
    if (!tpl) return res.status(404).type('text/plain').send('Template not found: ' + id);

    var tplStyleCss = null;
    // Theme takes priority over legacy ?style=
    if (themeQuery && themeQuery.endsWith('.css')) {
      var tPath = path.join(THEMES_DIR, path.basename(themeQuery));
      if (fs.existsSync(tPath)) tplStyleCss = fs.readFileSync(tPath, 'utf8');
    } else if (styleQuery && styleQuery.endsWith('.html')) {
      var sRefPath = path.join(STYLE_REFS_DIR, path.basename(styleQuery));
      if (fs.existsSync(sRefPath)) tplStyleCss = extractStyleCss(fs.readFileSync(sRefPath, 'utf8'), null);
    } else if (tpl.defaultTheme && tpl.defaultTheme.endsWith('.css')) {
      var dtPath = path.join(THEMES_DIR, path.basename(tpl.defaultTheme));
      if (fs.existsSync(dtPath)) tplStyleCss = fs.readFileSync(dtPath, 'utf8');
    }

    var filePath = path.join(__dirname, tpl.file);
    if (!fs.existsSync(filePath)) {
      return res.status(404).type('text/plain').send('Template file not found: ' + tpl.file);
    }
    var rawFragment = fs.readFileSync(filePath, 'utf8');
    var fragment;
    if (editMode) {
      fragment = applyEditsToHtml(rawFragment, tpl.defaultEdits || {}, true);
    } else {
      fragment = applyEditsToHtml(rawFragment, tpl.defaultEdits || {}, false);
    }
    var modeScript = editMode
      ? [
          '  <script>window.PB_TEMPLATE_ID = "' + id + '";</script>',
          '  <script src="/slides/components/tracker.js"></script>'
        ].join('\n')
      : [
          '  <script>window.PB_READONLY = true;</script>',
          '  <script src="/slides/components/tracker.js"></script>'
        ].join('\n');
    var saveScript = editMode ? [
      '  <script>',
      '  (function () {',
      '    var TPL_ID = "' + id + '";',
      '    var saveTimer = null;',
      '    var toast = null;',
      '    function showSaved() {',
      '      if (!toast) return;',
      '      toast.textContent = "Saved";',
      '      toast.style.opacity = "1";',
      '      clearTimeout(toast._hide);',
      '      toast._hide = setTimeout(function () { toast.style.opacity = "0"; }, 1800);',
      '    }',
      '    function doSave() {',
      '      var edits = {};',
      '      document.querySelectorAll("[data-edit][contenteditable]").forEach(function (el) {',
      '        var clone = el.cloneNode(true);',
      '        clone.querySelectorAll("[data-builder-only]").forEach(function (n) { n.remove(); });',
      '        edits[el.getAttribute("data-edit")] = clone.innerHTML;',
      '      });',
      '      fetch("/api/templates/" + TPL_ID + "/defaultEdits", {',
      '        method: "POST",',
      '        headers: { "Content-Type": "application/json" },',
      '        body: JSON.stringify({ edits: edits })',
      '      }).then(function (r) {',
      '        if (r.ok) {',
      '          showSaved();',
      '          try { parent.postMessage({ type: "tpl-saved", id: TPL_ID }, "*"); } catch (e) {}',
      '        }',
      '      });',
      '    }',
      '    document.addEventListener("focusout", function (e) {',
      '      if (!e.target.hasAttribute || !e.target.hasAttribute("data-edit") || !e.target.hasAttribute("contenteditable")) return;',
      '      clearTimeout(saveTimer);',
      '      saveTimer = setTimeout(doSave, 400);',
      '    });',
      '    document.addEventListener("slide-carousel-save", doSave);',
      '    document.addEventListener("slide-list-save", doSave);',
      '    document.addEventListener("slide-table-save", doSave);',
      '    document.addEventListener("DOMContentLoaded", function () {',
      '      toast = document.getElementById("tpl-edit-toast");',
      '    });',
      '  })();',
      '  </script>'
    ].join('\n') : '';
    var toastHtml = editMode ? [
      '<div id="tpl-edit-toast" style="',
      '  position:fixed;bottom:16px;right:16px;z-index:9999;',
      '  background:rgba(30,30,30,.92);color:#fff;font-size:12px;font-weight:600;',
      '  letter-spacing:.06em;padding:7px 16px;border-radius:6px;',
      '  opacity:0;transition:opacity .25s;pointer-events:none;',
      '">Saved</div>'
    ].join('') : '';
    var editBanner = editMode ? [
      '<div style="',
      '  position:fixed;top:0;left:0;right:0;z-index:9998;',
      '  background:rgba(20,20,30,.82);backdrop-filter:blur(4px);',
      '  padding:6px 14px;font-size:11px;font-weight:600;letter-spacing:.07em;',
      '  color:rgba(255,255,255,.55);text-transform:uppercase;text-align:center;',
      '  border-bottom:1px solid rgba(255,255,255,.08);pointer-events:none;',
      '">Editing template defaults — changes apply to new slides only</div>'
    ].join('') : '';
    var page = [
      '<!DOCTYPE html>',
      '<html lang="en">',
      '<head>',
      '  <meta charset="UTF-8">',
      '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
      '  <link rel="stylesheet" href="/slides/style.css">',
      tplStyleCss ? '  <style>' + tplStyleCss + '</style>' : '',
      finishStyleTag(themeQuery || styleQuery || tpl.defaultTheme),
      modeScript,
      '  <script src="/slides/components/lightbox.js"></script>',
      '  <script src="/slides/components/carousel.js"></script>',
      '  <script src="/slides/components/tabs.js"></script>',
      '  <script src="/slides/components/list.js"></script>',
      '  <script src="/slides/components/table.js"></script>',
      '  <script src="/slides/components/gallery.js"></script>',
      '  <script src="/slides/components/button.js"></script>',
      '  <script src="/slides/components/tags.js"></script>',
      '  <script>',
      '    document.addEventListener("DOMContentLoaded", function () {',
      '      if (window.Lightbox) Lightbox.init(document);',
      '      if (window.Carousel) Carousel.init(document);',
      '      if (window.Tabs)     Tabs.init(document);',
      '      if (window.List)     List.init(document);',
      '      if (window.Table)    Table.init(document);',
      '      (function () {',
      '        function markNoImg(img) {',
      '          var slide = img.closest(".ls-carousel-slide");',
      '          if (slide) slide.classList.add("no-img");',
      '          else img.classList.add("no-img");',
      '        }',
      '        document.querySelectorAll("img").forEach(function (img) {',
      '          var src = img.getAttribute("src");',
      '          if (!src || src.trim() === "") { markNoImg(img); return; }',
      '          if (img.complete && !img.naturalWidth) { markNoImg(img); return; }',
      '          img.addEventListener("error", function () { markNoImg(this); }, { once: true });',
      '        });',
      '      })();',
      '    });',
      '  </script>',
      saveScript,
      '  <style>',
      '    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }',
      '    html, body { width: 100%; height: 100%; overflow: hidden; }',
      '    .slides-container { position: relative; width: 100%; height: 100%; }',
      '    .slide { opacity: 1 !important; transform: scale(1) !important; pointer-events: auto !important; }',
      '    .slide-layout { height: 100% !important; }',
      '    .slide-body { flex: 1 !important; min-height: 0 !important; overflow: hidden; }',
      '    .ls-carousel { min-height: 200px !important; }',
      editMode ? '' : '    [data-ls-add-row],[data-ls-add],[data-ls-restore]{ display:none !important; }',
      /* Only force light theme when no style is selected — a selected style brings its own colours */
      tplStyleCss ? '' : '    :root { --bg:#fff; --text:#111; --text-muted:#555; --card-bg:rgba(0,0,0,.04); --card-border:rgba(0,0,0,.10); --card-radius:12px; --card-shadow:0 2px 12px rgba(0,0,0,.08); --bg-card:rgba(0,0,0,.04); --bg-card-hover:rgba(0,0,0,.07); --border:rgba(0,0,0,.10); --border-hover:rgba(0,0,0,.25); --nav-bg:rgba(255,255,255,.85); --slide-hero-rgb:255,255,255; --hero-overlay-start:.25; --hero-overlay-end:.10; --badge-bg:rgba(0,0,0,.06); --badge-border:rgba(0,0,0,.15); --badge-color:var(--accent); --logo-bg:rgba(0,0,0,.04); --logo-border:rgba(0,0,0,.12); }',
      tplStyleCss ? '' : '    html, body { background:#fff !important; }',
      /* Invert placeholder logo only for light (no-style) previews */
      tplStyleCss ? '' : '    .slide-logo-row img { filter: invert(1); }',
      /* No-image placeholders */
      tplStyleCss
        ? '    .ls-carousel-slide.no-img{background:rgba(255,255,255,.04);border:1.5px dashed rgba(255,255,255,.18);border-radius:8px;}'
        : '    .ls-carousel-slide.no-img{background:rgba(0,0,0,.04);border:1.5px dashed rgba(0,0,0,.18);border-radius:8px;}',
      '    .ls-carousel-slide.no-img>img{visibility:hidden;}',
      '    .ls-carousel-slide.no-img::after{content:"No image";position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:rgba(128,128,128,.6);font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;pointer-events:none;white-space:nowrap;}',
      tplStyleCss
        ? '    img.no-img{min-height:60px;min-width:60px;background:rgba(255,255,255,.04);border:1.5px dashed rgba(255,255,255,.18);border-radius:8px;}'
        : '    img.no-img{min-height:60px;min-width:60px;background:rgba(0,0,0,.04);border:1.5px dashed rgba(0,0,0,.18);border-radius:8px;}',
      '  </style>',
      '</head>',
      '<body>',
      editBanner,
      '<div class="slides-container">',
      fragment,
      '</div>',
      toastHtml,
      '<div id="lightbox">',
      '  <div id="lb-inner">',
      '    <button id="lb-close">&#10005;</button>',
      '    <button id="lb-prev" class="lb-nav-btn">&#8249;</button>',
      '    <div id="lb-stage"><img id="lb-img" src="" alt=""><div id="lb-cap"></div></div>',
      '    <button id="lb-next" class="lb-nav-btn">&#8250;</button>',
      '    <div id="lb-thumbs"></div>',
      '  </div>',
      '</div>',
      '</body>',
      '</html>'
    ].join('\n');
    res.type('text/html').send(page);
  } catch (err) {
    res.status(500).type('text/plain').send('Error: ' + err.message);
  }
});

// GET /slides/library-preview/:id — renders a library slide
// If the slide is on a deck, renders with that deck's context (logos, hero, theme).
// If not on any deck, renders with the slide's own theme and template-default logo.
app.get('/slides/library-preview/:id', function (req, res) {
  var id = req.params.id;
  if (!/^[a-z0-9-]+$/i.test(id)) {
    return res.status(400).type('text/plain').send('Invalid id');
  }
  try {
    var library   = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'));
    var libSlide  = library.slides.find(function (s) { return s.id === id; });
    if (!libSlide) return res.status(404).type('text/plain').send('Library slide not found');

    // Use the first associated deck's context when available
    var deckId     = (Array.isArray(libSlide.decks) && libSlide.decks.length > 0) ? libSlide.decks[0].id : null;
    var deckConfig = deckId ? getDeckConfig(deckId) : null;

    var fragment;

    // Zone-builder slides are stored as complete HTML files — resolve directly
    if (libSlide.builtWith === 'zone-builder' && libSlide.file) {
      var zbPath = path.join(__dirname, libSlide.file);
      if (!fs.existsSync(zbPath)) {
        return res.status(404).type('text/plain').send('Zone-builder slide file not found');
      }
      fragment = fs.readFileSync(zbPath, 'utf8');
      fragment = fragment.replace(/ contenteditable(?:="")?/g, '');
    } else {
      var resolved = resolveTemplate(libSlide.templateId);
      if (!resolved) return res.status(404).type('text/plain').send('Template not found');
      var slideEdits = deckId ? resolveSlideEdits(libSlide, deckId) : (libSlide.edits || {});
      if (resolved.source === 'canvas') {
        fragment = renderLayoutToHtml(resolved.tpl, id, slideEdits, deckConfig || {});
        fragment = fragment.replace(/ contenteditable=""/g, '').replace(/ contenteditable=''/g, '');
      } else {
        // no-deck (deck=null): shows slide's own content with template's default logo, no branding
        fragment = renderCartridge(resolved, { galleryEnabled: libSlide.galleryEnabled, rawEdits: slideEdits, deck: deckConfig, editable: false });
      }
    }

    // If on a deck: deck is sole theme authority. If standalone: use slide's own theme.
    var effectiveStyleCss = deckConfig ? (deckConfig.styleCss || null) : (libSlide.styleCss || null);

    var page = [
      '<!DOCTYPE html>',
      '<html lang="en">',
      '<head>',
      '  <meta charset="UTF-8">',
      '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
      '  <link rel="stylesheet" href="/slides/style.css">',
      effectiveStyleCss ? '  <style>' + effectiveStyleCss + '</style>' : '',
      finishStyleTag(deckConfig ? (deckConfig.styleRef || null) : (libSlide.styleRef || null)),
      deckConfig && deckAccentCss(deckConfig) ? '  <style>' + deckAccentCss(deckConfig) + '</style>' : '',
      '  <script>window.PB_READONLY = true;</script>',
      '  <script src="/slides/components/tracker.js"></script>',
      '  <script src="/slides/components/lightbox.js"></script>',
      '  <script src="/slides/components/carousel.js"></script>',
      '  <script src="/slides/components/tabs.js"></script>',
      '  <script src="/slides/components/list.js"></script>',
      '  <script src="/slides/components/table.js"></script>',
      '  <script>',
      '    document.addEventListener("DOMContentLoaded", function () {',
      '      if (window.Lightbox) Lightbox.init(document);',
      '      if (window.Carousel) Carousel.init(document);',
      '      if (window.Tabs)     Tabs.init(document);',
      '      if (window.List)     List.init(document);',
      '      if (window.Table)    Table.init(document);',
      '      // Wire missing/broken image placeholders after components have initialized',
      '      (function () {',
      '        function markNoImg(img) {',
      '          var slide = img.closest(".ls-carousel-slide");',
      '          if (slide) slide.classList.add("no-img");',
      '          else img.classList.add("no-img");',
      '        }',
      '        document.querySelectorAll("img").forEach(function (img) {',
      '          var src = img.getAttribute("src");',
      '          if (!src || src.trim() === "") { markNoImg(img); return; }',
      '          if (img.complete && !img.naturalWidth) { markNoImg(img); return; }',
      '          img.addEventListener("error", function () { markNoImg(this); }, { once: true });',
      '        });',
      '      })();',
      '    });',
      '  </script>',
      '  <style>',
      '    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }',
      '    html, body { width: 100%; height: 100%; overflow: hidden; }',
      '    .slides-container { position: relative; width: 100%; height: 100%; }',
      '    .slide { opacity: 1 !important; transform: scale(1) !important; pointer-events: auto !important; }',
      '    /* Force full-height layout chain so carousel height:100% always resolves */',
      '    .slide-layout { height: 100% !important; }',
      '    .slide-body { flex: 1 !important; min-height: 0 !important; overflow: hidden; }',
      '    .ls-carousel { min-height: 200px !important; }',
      '    /* PB_READONLY=true prevents editing buttons from being created; nav controls (carousel, tabs) use data-builder-only and must stay visible */',
      '    [data-ls-add-row],[data-ls-add],[data-ls-restore]{ display:none !important; }',
      '    .ls-carousel-slide.no-img{background:rgba(255,255,255,.04);border:1.5px dashed rgba(255,255,255,.18);border-radius:8px;}',
      '    .ls-carousel-slide.no-img>img{visibility:hidden;}',
      '    .ls-carousel-slide.no-img::after{content:"No image";position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:rgba(255,255,255,.28);font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;pointer-events:none;white-space:nowrap;}',
      '    img.no-img{min-height:60px;min-width:60px;background:rgba(255,255,255,.04);border:1.5px dashed rgba(255,255,255,.18);border-radius:8px;}',
      '    .slide-logo-row img { height: 28px !important; }',
      '    .slide-logo-ls { height: 26px !important; }',
      '    .slide-logo-sep { height: 26px !important; }',
      '  </style>',
      '</head>',
      '<body>',
      '<div class="slides-container">',
      fragment,
      '</div>',
      '<div id="lightbox">',
      '  <div id="lb-inner">',
      '    <button id="lb-close">&#10005;</button>',
      '    <button id="lb-prev" class="lb-nav-btn">&#8249;</button>',
      '    <div id="lb-stage"><img id="lb-img" src="" alt=""><div id="lb-cap"></div></div>',
      '    <button id="lb-next" class="lb-nav-btn">&#8250;</button>',
      '    <div id="lb-thumbs"></div>',
      '  </div>',
      '</div>',
      '</body>',
      '</html>'
    ].join('\n');
    res.type('text/html').send(page);
  } catch (err) {
    res.status(500).type('text/plain').send('Error: ' + err.message);
  }
});

// GET /slides/library-edit/:id — editable view of a library slide
// ?deckId= selects which deck's edits + branding + theme to use for the edit session.
// Saves go back to that same deckId bucket via POST /api/slide-library/:id/edits.
app.get('/slides/library-edit/:id', function (req, res) {
  var id = req.params.id;
  if (!/^[a-z0-9-]+$/i.test(id)) {
    return res.status(400).type('text/plain').send('Invalid id');
  }
  try {
    var library  = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'));
    var libSlide = library.slides.find(function (s) { return s.id === id; });
    if (!libSlide) return res.status(404).type('text/plain').send('Library slide not found');

    var editDeckId = (req.query.deckId && req.query.deckId !== 'default') ? req.query.deckId : 'default';
    var deckConfig = (editDeckId !== 'default') ? getDeckConfig(editDeckId) : null;

    var fragment;

    // Zone-builder slides are complete HTML files — serve as-is (readonly for edit view)
    if (libSlide.builtWith === 'zone-builder' && libSlide.file) {
      var zbEditPath = path.join(__dirname, libSlide.file);
      if (!fs.existsSync(zbEditPath)) {
        return res.status(404).type('text/plain').send('Zone-builder slide file not found');
      }
      fragment = fs.readFileSync(zbEditPath, 'utf8');
    } else {
      var resolved = resolveTemplate(libSlide.templateId);
      if (!resolved) return res.status(404).type('text/plain').send('Template not found');

      var baseEdits = resolveSlideEdits(libSlide, editDeckId);
      if (resolved.source === 'canvas') {
        fragment = renderLayoutToHtml(resolved.tpl, id, baseEdits, deckConfig || {});
      } else {
        fragment = renderCartridge(resolved, { galleryEnabled: libSlide.galleryEnabled, rawEdits: baseEdits, deck: deckConfig, editable: true });
      }
    }

    // If editing in deck context: deck is sole theme authority. Standalone: use slide's own theme.
    var effectiveStyleCss = deckConfig ? (deckConfig.styleCss || null) : (libSlide.styleCss || null);

    var page = [
      '<!DOCTYPE html>',
      '<html lang="en">',
      '<head>',
      '  <meta charset="UTF-8">',
      '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
      '  <link rel="stylesheet" href="/slides/style.css">',
      effectiveStyleCss ? '  <style>' + effectiveStyleCss + '</style>' : '',
      finishStyleTag(deckConfig ? (deckConfig.styleRef || null) : (libSlide.styleRef || null)),
      deckConfig && deckAccentCss(deckConfig) ? '  <style>' + deckAccentCss(deckConfig) + '</style>' : '',
      '  <script src="/slides/components/tracker.js"></script>',
      '  <script src="/slides/components/lightbox.js"></script>',
      '  <script src="/slides/components/carousel.js"></script>',
      '  <script src="/slides/components/tabs.js"></script>',
      '  <script src="/slides/components/list.js"></script>',
      '  <script src="/slides/components/table.js"></script>',
      '  <script src="/slides/components/gallery.js"></script>',
      '  <script>',
      '    document.addEventListener("DOMContentLoaded", function () {',
      '      if (window.Lightbox) Lightbox.init(document);',
      '      if (window.Carousel) Carousel.init(document);',
      '      if (window.Tabs)     Tabs.init(document);',
      '      if (window.List)     List.init(document);',
      '      if (window.Table)    Table.init(document);',
      '      if (window.Gallery)  Gallery.init(document);',
      '      // Wire missing/broken image placeholders after components have initialized',
      '      (function () {',
      '        function markNoImg(img) {',
      '          var slide = img.closest(".ls-carousel-slide");',
      '          if (slide) slide.classList.add("no-img");',
      '          else img.classList.add("no-img");',
      '        }',
      '        document.querySelectorAll("img").forEach(function (img) {',
      '          var src = img.getAttribute("src");',
      '          if (!src || src.trim() === "") { markNoImg(img); return; }',
      '          if (img.complete && !img.naturalWidth) { markNoImg(img); return; }',
      '          img.addEventListener("error", function () { markNoImg(this); }, { once: true });',
      '        });',
      '      })();',
      '    });',
      '  </script>',
      '  <script src="/slides/components/button.js"></script>',
      '  <script src="/slides/components/tags.js"></script>',
      '  <style>',
      '    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }',
      '    html, body { width: 100%; height: 100%; overflow: hidden; }',
      '    .slides-container { position: relative; width: 100%; height: 100%; }',
      '    .slide { opacity: 1 !important; transform: scale(1) !important; pointer-events: auto !important; }',
      '  </style>',
      '</head>',
      '<body>',
      '  <div class="slides-container">',
      fragment,
      '  </div>',
      '  <div id="lightbox">',
      '    <div id="lb-inner">',
      '      <button id="lb-close">&#10005;</button>',
      '      <button id="lb-prev" class="lb-nav-btn">&#8249;</button>',
      '      <div id="lb-stage"><img id="lb-img" src="" alt=""><div id="lb-cap"></div></div>',
      '      <button id="lb-next" class="lb-nav-btn">&#8250;</button>',
      '      <div id="lb-thumbs"></div>',
      '    </div>',
      '  </div>',
      '  <script>',
      '    document.addEventListener("DOMContentLoaded", function () {',
      '      var root = document.querySelector(".slides-container");',
      '      if (window.Carousel) Carousel.init(root);',
      '      if (window.Tabs)     Tabs.init(root);',
      '      if (window.Lightbox) Lightbox.init(root);',
      '      if (window.List)     List.init(root);',
      '      if (window.LSTable)  LSTable.init(root);',
      '    });',
      '  </script>',
      '  <script>',
      '  (function () {',
      '    var LIB_SLIDE_ID = "' + id + '";',
      '    var EDIT_DECK_ID = "' + editDeckId + '";',
      '    document.addEventListener("focusout", function (e) {',
      '      if (!e.target.hasAttribute || !e.target.hasAttribute("data-edit") || !e.target.hasAttribute("contenteditable")) return;',
      '      var edits = {};',
      '      document.querySelectorAll("[data-edit][contenteditable]").forEach(function (el) {',
      '        var clone = el.cloneNode(true);',
      '        clone.querySelectorAll("[data-builder-only]").forEach(function (n) { n.remove(); });',
      '        edits[el.getAttribute("data-edit")] = clone.innerHTML;',
      '      });',
      '      fetch("/api/slide-library/" + LIB_SLIDE_ID + "/edits", {',
      '        method: "POST", headers: { "Content-Type": "application/json" },',
      '        body: JSON.stringify({ edits: edits, deckId: EDIT_DECK_ID })',
      '      });',
      '    });',
      '    document.addEventListener("slide-carousel-save", function (e) {',
      '      var key = e.detail && e.detail.editKey;',
      '      var html = e.detail && e.detail.html;',
      '      if (!key || html == null) return;',
      '      var edits = {}; edits[key] = html;',
      '      fetch("/api/slide-library/" + LIB_SLIDE_ID + "/edits", {',
      '        method: "POST", headers: { "Content-Type": "application/json" },',
      '        body: JSON.stringify({ edits: edits, deckId: EDIT_DECK_ID })',
      '      });',
      '    });',
      '  })();',
      '  </script>',
      '</body>',
      '</html>'
    ].join('\n');
    res.type('text/html').send(page);
  } catch (err) {
    res.status(500).type('text/plain').send('Error: ' + err.message);
  }
});

// POST /api/slide-library/:id/edits — save edits for a library slide
// Body: { edits: {...}, deckId?: "deck-rebuild" }  — defaults to "default" bucket
app.post('/api/slide-library/:id/edits', function (req, res) {
  try {
    var id     = req.params.id;
    var edits  = req.body.edits;
    var bucket = req.body.deckId || 'default';
    if (!id || !edits) return res.status(400).json({ success: false, error: 'Missing id or edits' });

    var library  = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'));
    var libSlide = library.slides.find(function (s) { return s.id === id; });
    if (!libSlide) return res.status(404).json({ success: false, error: 'Library slide not found' });

    if (!libSlide.deckEdits) libSlide.deckEdits = {};
    if (!libSlide.deckEdits[bucket]) libSlide.deckEdits[bucket] = {};
    libSlide.deckEdits[bucket] = Object.assign({}, libSlide.deckEdits[bucket], edits);
    fs.writeFileSync(LIBRARY_PATH, JSON.stringify(library, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Page: slides ──────────────────────────────────────────────────────────────
app.get('/layouts', function (_req, res) {
  res.redirect('/slides');
});

app.get('/slides',           function (_req, res) { res.sendFile(path.join(__dirname, 'features/slides/index.html')); });
app.get('/slides/library',   function (_req, res) { res.sendFile(path.join(__dirname, 'features/slides/index.html')); });
app.get('/slides/templates', function (_req, res) { res.sendFile(path.join(__dirname, 'features/slides/index.html')); });
app.get('/slides/builder',   function (_req, res) { res.sendFile(path.join(__dirname, 'features/slides/index.html')); });

// ── API: languages ────────────────────────────────────────────────────────────
app.get('/api/languages', function (_req, res) {
  try {
    var data = JSON.parse(fs.readFileSync(LANGUAGES_PATH, 'utf8'));
    res.json({ success: true, data: data.languages });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── API: translations ─────────────────────────────────────────────────────────
function readTranslations(deckId) {
  try { return JSON.parse(fs.readFileSync(getTranslationsPath(deckId), 'utf8')); }
  catch (e) {
    return { languages: ['en'], defaultLanguage: 'en', slides: {} };
  }
}

function writeTranslations(data, deckId) {
  fs.writeFileSync(getTranslationsPath(deckId), JSON.stringify(data, null, 2), 'utf8');
}

// Mark per-slide translation entries dirty when English edits are saved.
// Called non-fatally — a failure here must never block the main save response.
function markSlideTranslationsDirty(librarySlideId, edits, deckId) {
  try {
    var t = readTranslations(deckId || getActiveDeckId());
    var changed = false;
    var slideStore = t.slides && t.slides[librarySlideId];
    if (!slideStore) return;
    Object.keys(edits).forEach(function (key) {
      if (!slideStore[key]) return;
      // Keep English source in sync so TC shows current text
      if (typeof edits[key] === 'string' && edits[key] !== slideStore[key].en) {
        slideStore[key].en = edits[key];
        changed = true;
      }
      Object.keys(slideStore[key]).forEach(function (lang) {
        if (lang === 'en') return;
        var entry = slideStore[key][lang];
        if (entry && entry.current) {
          entry.dirty = true;
          changed = true;
        }
      });
    });
    if (changed) writeTranslations(t, deckId || getActiveDeckId());
  } catch (err) {
    console.warn('markSlideTranslationsDirty failed:', err.message);
  }
}

app.get('/api/translations', function (_req, res) {
  res.json({ success: true, data: readTranslations(getActiveDeckId()) });
});

const TRANSLATE_CHUNK_SIZE = 20;

app.post('/api/translations/translate', async function (req, res) {
  try {
    const deckId = getActiveDeckId();
    const t = readTranslations(deckId);
    const targetLanguages = (req.body && req.body.languages) || t.languages.filter(l => l !== 'en');
    const langList = JSON.parse(fs.readFileSync(LANGUAGES_PATH, 'utf8')).languages;

    // Per-slide mode: slideId + sourceFields: { fieldKey: englishText }
    const slideId      = req.body && req.body.slideId;
    const sourceFields = req.body && req.body.sourceFields; // { fieldKey: englishText }
    const force        = !!(req.body && req.body.force);    // true = re-translate even clean fields

    if (slideId && sourceFields && Object.keys(sourceFields).length > 0) {
      if (!t.slides) t.slides = {};
      if (!t.slides[slideId]) t.slides[slideId] = {};
      const slideStore = t.slides[slideId];

      let translatedCount = 0, failedChunks = 0;
      const errors = [];

      for (const lang of targetLanguages) {
        const dirty = {};
        for (const [key, englishText] of Object.entries(sourceFields)) {
          if (!englishText) continue;
          const existing = slideStore[key] && slideStore[key][lang];
          if (force || !existing || !existing.current || existing.dirty) {
            dirty[key] = englishText;
          }
        }
        if (Object.keys(dirty).length === 0) continue;

        const langName = (langList.find(l => l.code === lang) || {}).name || lang;
        const entries = Object.entries(dirty);
        for (let i = 0; i < entries.length; i += TRANSLATE_CHUNK_SIZE) {
          const chunk = Object.fromEntries(entries.slice(i, i + TRANSLATE_CHUNK_SIZE));
          const result = await translate(chunk, langName);
          if (!result.ok) {
            failedChunks++;
            errors.push(result.error || 'Translation failed');
            continue;
          }

          for (const [key, translated] of Object.entries(result.fields)) {
            if (!slideStore[key]) slideStore[key] = {};
            slideStore[key].en = sourceFields[key];
            const prev = slideStore[key][lang];
            slideStore[key][lang] = {
              current: translated,
              previous: prev && prev.current ? prev.current : null,
              dirty: false
            };
            translatedCount++;
          }
          writeTranslations(t, deckId);
        }
      }
      return res.json({ success: true, data: t, translated: translatedCount, failed: failedChunks, errors });
    }

    res.json({ success: true, data: t });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/translations/field', function (req, res) {
  try {
    const { fieldKey, language, value, slideId } = req.body || {};
    if (!fieldKey || !language || value === undefined) {
      return res.status(400).json({ success: false, error: 'fieldKey, language, value required' });
    }
    if (!slideId) {
      return res.status(400).json({ success: false, error: 'slideId required' });
    }
    const deckId = getActiveDeckId();
    const t = readTranslations(deckId);
    if (!t.slides) t.slides = {};
    if (!t.slides[slideId]) t.slides[slideId] = {};
    if (!t.slides[slideId][fieldKey]) t.slides[slideId][fieldKey] = {};
    if (!t.slides[slideId][fieldKey][language]) {
      t.slides[slideId][fieldKey][language] = { current: value, previous: null, dirty: false };
    } else {
      t.slides[slideId][fieldKey][language].current = value;
    }
    var entry = t.slides[slideId][fieldKey][language];
    writeTranslations(t, deckId);
    res.json({ success: true, data: entry });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/translations/restore', function (req, res) {
  try {
    const { fieldKey, language, slideId } = req.body || {};
    if (!fieldKey || !language || !slideId) {
      return res.status(400).json({ success: false, error: 'fieldKey, language, slideId required' });
    }
    const deckId = getActiveDeckId();
    const t = readTranslations(deckId);
    var entry = t.slides && t.slides[slideId] && t.slides[slideId][fieldKey] && t.slides[slideId][fieldKey][language];
    if (!entry || !entry.previous) {
      return res.status(400).json({ success: false, error: 'No previous version to restore' });
    }
    entry.current = entry.previous;
    entry.previous = null;
    entry.dirty = false;
    writeTranslations(t, deckId);
    res.json({ success: true, data: entry });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/translations/fields-summary', function (req, res) {
  try {
    var activeDeckId = getActiveDeckId();
    var deck    = readDeckById(activeDeckId);
    var library = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'));
    var t       = readTranslations(activeDeckId);
    var rows    = [];

    // Hard exclusions: complex JS components that cannot be translated as a unit
    var blobKeys = ['tabs', 'company-carousel', 'carousel-track-html', 'carousel-track'];

    deck.slides
      .filter(function (ds) { return ds.visible && ds.librarySlideId; })
      .forEach(function (deckSlide) {
        var libSlide = library.slides.find(function (s) { return s.id === deckSlide.librarySlideId; });
        if (!libSlide) return;

        var edits = resolveSlideEdits(libSlide, activeDeckId);
        var defaults = extractSlideDefaultFields(libSlide, activeDeckId);
        // Merge: template defaults first, then saved edits override them
        var allFields = Object.assign({}, defaults, edits);
        // Extract inner [data-edit] values from blob fields so the TC shows
        // current tab/carousel label content, not stale template defaults.
        blobKeys.forEach(function (bk) {
          var bv = allFields[bk];
          if (!bv || typeof bv !== 'string') return;
          var $b = cheerio.load(bv, { decodeEntities: false }, false);
          $b('[data-builder-only]').remove();
          $b('[data-edit]').each(function () {
            var bKey = $b(this).attr('data-edit');
            var bType = $b(this).attr('data-edit-type');
            if (!bKey || bType === 'image') return;
            allFields[bKey] = $b(this).html() || '';
          });
        });
        var slideTranslations = (t.slides && t.slides[deckSlide.librarySlideId]) || {};

        Object.keys(allFields).forEach(function (fieldKey) {
          var val = allFields[fieldKey];
          if (!val || typeof val !== 'string') return;

          if (fieldKey.endsWith('-src') || fieldKey === 'customer-logo-src') return;
          if (fieldKey.startsWith('__attr:')) return;
          if (blobKeys.includes(fieldKey)) return;
          if (val.includes('<img')) return;
          if (/\.(jpe?g|png|gif|webp|svg|bmp)(\?.*)?$/i.test(val.trim())) return;

          var stripped = val.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
          if (stripped.length < 3) return;
          if (/^\d+[\d,+%°\.]*$/.test(stripped)) return;

          var fieldTranslations = slideTranslations[fieldKey] || {};
          var langs = {};
          Object.keys(fieldTranslations).forEach(function (lang) {
            if (lang !== 'en') langs[lang] = fieldTranslations[lang];
          });

          rows.push({
            slideId:    deckSlide.librarySlideId,
            slideTitle: libSlide.name || libSlide.id,
            fieldKey:   fieldKey,
            en:         val,
            langs:      langs
          });
        });
      });

    res.json({ success: true, rows: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/translations/translate-all', async function (req, res) {
  try {
    var targetLanguages = req.body.languages;
    if (!Array.isArray(targetLanguages) || targetLanguages.length === 0) {
      return res.status(400).json({ success: false, error: 'No languages specified' });
    }

    var deckId = getActiveDeckId();
    var library = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'));
    var langList = JSON.parse(fs.readFileSync(LANGUAGES_PATH, 'utf8')).languages;
    var t = readTranslations(deckId);
    if (!t.slides) t.slides = {};

    var translatedCount = 0, failedChunks = 0;
    var errors = [];

    for (var si = 0; si < library.slides.length; si++) {
      var slide = library.slides[si];
      var edits = resolveSlideEdits(slide, deckId);
      var defaults = extractSlideDefaultFields(slide, deckId);
      var allFields = Object.assign({}, defaults, edits);
      var slideId = slide.id;
      if (!t.slides[slideId]) t.slides[slideId] = {};

      // Extract inner [data-edit] values from blob fields (tabs, carousels)
      // so translate-all uses the current label content, not stale template defaults.
      var blobKeys = ['tabs', 'company-carousel', 'carousel-track-html', 'carousel-track'];
      blobKeys.forEach(function (bk) {
        var bv = allFields[bk];
        if (!bv || typeof bv !== 'string') return;
        var $b = cheerio.load(bv, { decodeEntities: false }, false);
        $b('[data-builder-only]').remove();
        $b('[data-edit]').each(function () {
          var bKey = $b(this).attr('data-edit');
          var bType = $b(this).attr('data-edit-type');
          if (!bKey || bType === 'image') return;
          allFields[bKey] = $b(this).html() || '';
        });
      });

      for (var li = 0; li < targetLanguages.length; li++) {
        var lang = targetLanguages[li];
        if (lang === 'en') continue;

        var langName = (langList.find(function(l){ return l.code === lang; }) || {}).name || lang;

        // Collect fields that need translation (missing or dirty)
        var blobKeys = ['tabs', 'company-carousel', 'carousel-track-html', 'carousel-track'];
        var toTranslate = {};
        Object.keys(allFields).forEach(function (fieldKey) {
          var val = allFields[fieldKey];
          if (!val || typeof val !== 'string') return;

          if (fieldKey.endsWith('-src') || fieldKey === 'customer-logo-src') return;
          if (fieldKey.startsWith('__attr:')) return;
          if (blobKeys.includes(fieldKey)) return;
          if (val.includes('<img')) return;
          if (/\.(jpe?g|png|gif|webp|svg|bmp)(\?.*)?$/i.test(val.trim())) return;

          var stripped = val.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
          if (stripped.length < 3) return;
          if (/^\d+[\d,+%°\.]*$/.test(stripped)) return;

          var existing = t.slides[slideId][fieldKey] && t.slides[slideId][fieldKey][lang];
          if (!existing || !existing.current || existing.dirty) {
            toTranslate[fieldKey] = val;
          }
        });

        if (Object.keys(toTranslate).length === 0) continue;

        // Translate in chunks
        var keys = Object.keys(toTranslate);
        for (var ci = 0; ci < keys.length; ci += TRANSLATE_CHUNK_SIZE) {
          var chunkKeys = keys.slice(ci, ci + TRANSLATE_CHUNK_SIZE);
          var chunkTexts = {};
          chunkKeys.forEach(function(k){ chunkTexts[k] = toTranslate[k]; });

          try {
            var result = await translate(chunkTexts, langName);
            if (!result.ok) {
              failedChunks++;
              errors.push(slideId + '/' + lang + ': ' + (result.error || 'Translation failed'));
              continue;
            }
            chunkKeys.forEach(function (key) {
              if (!result.fields[key]) return;
              if (!t.slides[slideId][key]) t.slides[slideId][key] = {};
              // Store en source if not already tracked (enables dirty detection for default-value fields)
              if (!t.slides[slideId][key].en) t.slides[slideId][key].en = toTranslate[key];
              var prev = t.slides[slideId][key][lang];
              t.slides[slideId][key][lang] = {
                current: result.fields[key],
                previous: prev && prev.current || null,
                dirty: false
              };
              translatedCount++;
            });
          } catch (chunkErr) {
            failedChunks++;
            errors.push(slideId + '/' + lang + ': ' + chunkErr.message);
          }
        }
      }
    }

    writeTranslations(t, deckId);
    res.json({ success: true, data: t, translated: translatedCount, failed: failedChunks, errors: errors });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/translations/settings', function (req, res) {
  try {
    const { languages, favorites, defaultLanguage } = req.body || {};
    const deckId = getActiveDeckId();
    const t = readTranslations(deckId);
    if (Array.isArray(languages)) t.languages = languages;
    if (Array.isArray(favorites)) t.favorites = favorites;
    if (defaultLanguage) t.defaultLanguage = defaultLanguage;
    writeTranslations(t, deckId);
    res.json({ success: true, data: t });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── API: layouts ──────────────────────────────────────────────────────────────
app.get('/api/layouts', function (_req, res) {
  try {
    var layouts = JSON.parse(fs.readFileSync(LAYOUTS_PATH, 'utf8'));
    res.json({ success: true, data: layouts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/layouts', function (req, res) {
  try {
    var layouts = JSON.parse(fs.readFileSync(LAYOUTS_PATH, 'utf8'));
    var body = req.body || {};
    var layout = Object.assign({
      name: 'Untitled Layout',
      components: [],
      rows: []
    }, body, {
      id: 'layout-' + Date.now(),
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    layouts.push(layout);
    fs.writeFileSync(LAYOUTS_PATH, JSON.stringify(layouts, null, 2), 'utf8');
    res.json({ success: true, data: layout });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/layouts/:id', function (req, res) {
  try {
    var id = req.params.id;
    var layouts = JSON.parse(fs.readFileSync(LAYOUTS_PATH, 'utf8'));
    var idx = layouts.findIndex(function (l) { return l.id === id; });

    if (idx !== -1) {
      // Found in layouts.json — update and increment version
      var oldVersion = layouts[idx].version || 1;
      layouts[idx] = Object.assign({}, layouts[idx], req.body, {
        id: id,
        version: oldVersion + 1,
        updatedAt: new Date().toISOString()
      });
      fs.writeFileSync(LAYOUTS_PATH, JSON.stringify(layouts, null, 2), 'utf8');
      return res.json({ success: true, data: layouts[idx] });
    }

    // Not in layouts — try slide-templates.json
    var templates = JSON.parse(fs.readFileSync(TEMPLATES_PATH, 'utf8'));
    var tidx = templates.findIndex(function (t) { return t.id === id; });
    if (tidx !== -1) {
      var oldTplVersion = templates[tidx].version || 1;
      templates[tidx] = Object.assign({}, templates[tidx], req.body, {
        id: id,
        version: oldTplVersion + 1,
        updatedAt: new Date().toISOString()
      });
      fs.writeFileSync(TEMPLATES_PATH, JSON.stringify(templates, null, 2), 'utf8');
      return res.json({ success: true, data: templates[tidx] });
    }

    return res.status(404).json({ success: false, error: 'Layout not found' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/layouts/:id', function (req, res) {
  try {
    var layouts = JSON.parse(fs.readFileSync(LAYOUTS_PATH, 'utf8'));
    var filtered = layouts.filter(function (l) { return l.id !== req.params.id; });
    fs.writeFileSync(LAYOUTS_PATH, JSON.stringify(filtered, null, 2), 'utf8');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/layouts/:id/deck — toggle a layout slide in or out of the deck
// Body: { inDeck: true } or { inDeck: false }
app.patch('/api/layouts/:id/deck', function (req, res) {
  var id     = req.params.id;
  var inDeck = req.body && req.body.inDeck;

  if (typeof inDeck !== 'boolean') {
    return res.status(400).json({ success: false, error: 'inDeck must be a boolean' });
  }

  try {
    var layouts = JSON.parse(fs.readFileSync(LAYOUTS_PATH, 'utf8'));
    var layout  = layouts.find(function (l) { return l.id === id; });
    if (!layout) return res.status(404).json({ success: false, error: 'Layout not found: ' + id });

    var activeDeckId2 = getActiveDeckId();
    var deck = readDeckById(activeDeckId2);

    if (inDeck) {
      var existing = deck.slides.find(function (s) { return s.layoutId === id; });
      if (existing) {
        return res.json({ success: true, alreadyInDeck: true });
      }
      deck.slides.push({ id: 'deck-slide-' + Date.now(), layoutId: id, visible: true });
      writeDeckById(activeDeckId2, deck);
      return res.json({ success: true, inDeck: true });
    }

    // inDeck: false — remove any deck slide backed by this layout
    deck.slides = deck.slides.filter(function (s) { return s.layoutId !== id; });
    writeDeckById(activeDeckId2, deck);
    res.json({ success: true, inDeck: false });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── API: save slide edits back to disk ────────────────────────────────────────
// POST /api/save  { slide: 'slide-01-cover', edits: { badge: '...', headline: '...' } }
app.post('/api/save', function (req, res) {
  var slide = req.body.slide;
  var edits = req.body.edits;

  if (!slide || !edits) {
    return res.status(400).json({ error: 'Missing slide or edits' });
  }

  // Safety: only allow slide filenames, no path traversal
  if (!/^slide-[\w-]+$/.test(slide)) {
    return res.status(400).json({ error: 'Invalid slide name' });
  }

  var filePath = path.join(__dirname, 'features/slides', slide + '.html');

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Slide not found: ' + slide });
  }

  try {
    var html = fs.readFileSync(filePath, 'utf8');
    // Load as fragment — prevents cheerio from moving <style> to <head>
    var $ = cheerio.load(html, { decodeEntities: false }, false);

    Object.entries(edits).forEach(function (entry) {
      $('[data-edit="' + entry[0] + '"]').html(entry[1]);
    });

    // Optional: update attributes on data-edit elements
    // attrs: { 'carousel-track': { 'data-autoplay': '7' } }
    var attrs = req.body.attrs || {};
    Object.entries(attrs).forEach(function (entry) {
      var key     = entry[0];
      var attrMap = entry[1];
      Object.entries(attrMap).forEach(function (a) {
        $('[data-edit="' + key + '"]').attr(a[0], a[1]);
      });
    });

    fs.writeFileSync(filePath, $.html(), 'utf8');

    res.json({ ok: true });
  } catch (err) {
    console.error('Save error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── API: upload an image file ─────────────────────────────────────────────────
// Saves an image buffer into uploads/ with:
//  - content dedup: identical bytes (size-prefiltered sha1) → reuse existing file, never duplicate
//  - overwrite-by-name: otherwise write under the sanitized name, replacing any file of that name
// Returns the public '/slides/uploads/<name>' path. Shared by all image-upload endpoints.
function dedupUpload(baseName, buffer, opts) {
  opts = opts || {};
  var uploadsDir = path.join(__dirname, 'features/slides/uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  var hash = crypto.createHash('sha1').update(buffer).digest('hex');
  var existingName = null;
  try {
    fs.readdirSync(uploadsDir).forEach(function (f) {
      if (existingName) return;
      var fp = path.join(uploadsDir, f);
      try {
        var st = fs.statSync(fp);
        if (st.isFile() && st.size === buffer.length &&
            crypto.createHash('sha1').update(fs.readFileSync(fp)).digest('hex') === hash) {
          existingName = f;
        }
      } catch (e) { /* skip unreadable entry */ }
    });
  } catch (e) { /* uploads dir unreadable — fall through to write */ }
  if (existingName) return '/slides/uploads/' + existingName;
  var sanitized = baseName.replace(/[^a-zA-Z0-9._-]/g, '-');
  var destPath = path.join(uploadsDir, sanitized);
  // Warn before replacing a file that other slides/decks reference (caller opts in)
  if (opts.checkUsage && !opts.confirmOverwrite && fs.existsSync(destPath)) {
    var usedIn = findImageUsage(sanitized);
    if (usedIn.length) return { needsConfirm: true, name: sanitized, usedIn: usedIn };
  }
  fs.writeFileSync(destPath, buffer);
  return '/slides/uploads/' + sanitized;
}

// Lists places that reference /slides/uploads/<name> — used to warn before overwriting
// an image that other slides/decks/templates depend on.
function findImageUsage(name) {
  var needle = '/slides/uploads/' + name;
  var hits = [];
  function scan(label, file) {
    try { if (fs.readFileSync(file, 'utf8').indexOf(needle) !== -1) hits.push(label); } catch (e) {}
  }
  scan('library', LIBRARY_PATH);
  scan('presentations', PRESENTATIONS_PATH);
  try {
    fs.readdirSync(DECKS_DIR_PATH).forEach(function (d) {
      var dp = path.join(DECKS_DIR_PATH, d, 'deck.json');
      if (fs.existsSync(dp)) scan('deck:' + d, dp);
    });
  } catch (e) {}
  var slidesDir = path.join(__dirname, 'features', 'slides');
  try {
    fs.readdirSync(slidesDir).forEach(function (f) {
      if (f.endsWith('.html')) scan('template:' + f.replace('.html', ''), path.join(slidesDir, f));
    });
  } catch (e) {}
  return hits;
}

// POST /api/upload-image  { filename: 'logo.png', data: 'data:image/png;base64,...' }
app.post('/api/upload-image', function (req, res) {
  var filename = req.body.filename;
  var dataUrl  = req.body.data;

  if (!filename || !dataUrl) return res.status(400).json({ error: 'Missing filename or data' });

  var baseName = path.basename(filename);

  // Reject non-web-compatible formats
  var ext = baseName.split('.').pop().toLowerCase();
  var webFormats = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif'];
  if (!webFormats.includes(ext)) {
    return res.status(400).json({ error: 'Unsupported format ".' + ext + '". Please use JPG, PNG, WebP, or GIF.' });
  }

  var matches = dataUrl.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
  if (!matches) return res.status(400).json({ error: 'Invalid image data' });

  try {
    var result = dedupUpload(baseName, Buffer.from(matches[2], 'base64'),
      { checkUsage: true, confirmOverwrite: !!req.body.confirmOverwrite });
    if (result && result.needsConfirm) {
      return res.status(409).json({ ok: false, needsConfirm: true, name: result.name, usedIn: result.usedIn });
    }
    res.json({ ok: true, path: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── API: save an image src attribute back to the slide file ───────────────────
// POST /api/save-image-src  { slide: 'slide-01-cover', editKey: 'customer-logo', src: '/slides/uploads/logo.png' }
// src may be '' to clear the image
app.post('/api/save-image-src', function (req, res) {
  var slide   = req.body.slide;
  var editKey = req.body.editKey;
  var src     = req.body.src;

  if (!slide || !editKey || src === undefined || src === null) return res.status(400).json({ error: 'Missing params' });
  if (!/^slide-[\w-]+$/.test(slide)) return res.status(400).json({ error: 'Invalid slide name' });

  var filePath = path.join(__dirname, 'features/slides', slide + '.html');
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Slide not found' });

  try {
    var html = fs.readFileSync(filePath, 'utf8');
    var $    = cheerio.load(html, { decodeEntities: false }, false);
    var imgEl = $('[data-edit="' + editKey + '"] img').first();
    if (src === '') {
      imgEl.removeAttr('src');
    } else {
      imgEl.attr('src', src);
    }
    fs.writeFileSync(filePath, $.html(), 'utf8');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── API: clone a slide ────────────────────────────────────────────────────────
// POST /api/clone-slide  { sourceId: 'slide-02-company' }
app.post('/api/clone-slide', function (req, res) {
  var sourceId = req.body.sourceId;

  if (!sourceId || !/^slide-[\w-]+$/.test(sourceId)) {
    return res.status(400).json({ error: 'Missing or invalid sourceId' });
  }

  var slidesDir = path.join(__dirname, 'features/slides');
  var sourceFile = path.join(slidesDir, sourceId + '.html');

  if (!fs.existsSync(sourceFile)) {
    return res.status(404).json({ error: 'Source slide not found: ' + sourceId });
  }

  try {
    // --- 1. Find the highest existing slide number ---
    var files = fs.readdirSync(slidesDir);
    var maxNum = 0;
    files.forEach(function (f) {
      var m = f.match(/^slide-(\d+)-/);
      if (m) {
        var n = parseInt(m[1], 10);
        if (n > maxNum) maxNum = n;
      }
    });
    var newNum = String(maxNum + 1).padStart(2, '0');

    // --- 2. Extract the source name part (e.g. "company" from "slide-02-company") ---
    var namePart = sourceId.replace(/^slide-\d+-/, '');
    var newId = 'slide-' + newNum + '-clone-of-' + namePart;

    // --- 3. Read source HTML and reset editable content via cheerio ---
    var html = fs.readFileSync(sourceFile, 'utf8');
    var $ = cheerio.load(html, { decodeEntities: false }, false);

    $('[data-edit]').each(function () {
      var key = $(this).attr('data-edit');
      $(this).text(key);
    });

    $('img').each(function () {
      $(this).attr('src', '/shared/brand/logo.svg');
    });

    // --- 4. Write new slide file ---
    var newFile = path.join(slidesDir, newId + '.html');
    fs.writeFileSync(newFile, $.html(), 'utf8');

    // --- 5. Update slide-library.json ---
    var library = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'));
    var sourceEntry = library.find(function (e) { return e.id === sourceId; });
    var sourceLabel = sourceEntry ? sourceEntry.label : namePart;
    var newEntry = { id: newId, label: 'Clone of ' + sourceLabel, category: 'custom' };
    library.push(newEntry);
    fs.writeFileSync(LIBRARY_PATH, JSON.stringify(library, null, 2), 'utf8');

    // --- 6. Update deck.json ---
    var cloneActiveDeckId = getActiveDeckId();
    var deck = readDeckById(cloneActiveDeckId);
    deck.slides.push({ id: newId, visible: true });
    writeDeckById(cloneActiveDeckId, deck);

    res.json({ ok: true, data: newEntry });
  } catch (err) {
    console.error('Clone error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Startup: rebuild library slide decks[] (runs every boot) ─────────────────
(function rebuildSlideDecks() {
  if (!fs.existsSync(LIBRARY_PATH)) return;

  var libData   = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'));
  var deckStore = readDecks();

  // Reset decks[] on every slide, then repopulate from deck.json slide lists.
  // Enforce 1-slide-per-deck: first deck found (deckStore order) wins; slide is removed
  // from any subsequent deck that also contains it.
  libData.slides.forEach(function (ls) { ls.decks = []; });

  var slideRemovals = {}; // deckId -> [librarySlideId, ...]

  deckStore.decks.forEach(function (deckMeta) {
    var deckData = readDeckById(deckMeta.id);
    (deckData.slides || []).forEach(function (ds) {
      if (!ds.librarySlideId) return;
      var ls = libData.slides.find(function (s) { return s.id === ds.librarySlideId; });
      if (!ls) return;
      if (ls.decks.length > 0) {
        console.log('[startup] WARNING: slide "' + (ls.name || ls.id) + '" in multiple decks — keeping "' + ls.decks[0].id + '", removing from "' + deckMeta.id + '"');
        if (!slideRemovals[deckMeta.id]) slideRemovals[deckMeta.id] = [];
        slideRemovals[deckMeta.id].push(ds.librarySlideId);
        return;
      }
      ls.decks.push({ id: deckMeta.id, name: deckMeta.name || deckMeta.id });
    });
  });

  // Remove slides from the extra decks
  Object.keys(slideRemovals).forEach(function (deckId) {
    var ids    = slideRemovals[deckId];
    var dkData = readDeckById(deckId);
    dkData.slides = dkData.slides.filter(function (s) {
      return !s.librarySlideId || ids.indexOf(s.librarySlideId) === -1;
    });
    writeDeckById(deckId, dkData);
    console.log('[startup] Removed ' + ids.length + ' duplicate slide(s) from deck "' + deckId + '"');
  });

  fs.writeFileSync(LIBRARY_PATH, JSON.stringify(libData, null, 2), 'utf8');
  console.log('[startup] Rebuilt decks[] on library slides');
})();

// ── One-time migration: per-deck slide isolation ──────────────────────────────
(function runDeckMigration() {
  if (fs.existsSync(getDeckPath('default'))) return;

  console.log('[migration] Migrating to per-deck slide isolation...');

  // 1. Move deck.json → decks/default/deck.json
  if (fs.existsSync(DECK_PATH)) {
    var defaultDir = path.join(DECKS_DIR_PATH, 'default');
    if (!fs.existsSync(defaultDir)) fs.mkdirSync(defaultDir, { recursive: true });
    fs.copyFileSync(DECK_PATH, getDeckPath('default'));
    console.log('[migration] Copied deck.json → decks/default/deck.json');
  }

  // 2. Migrate slide-library.json edits → deckEdits.default
  if (fs.existsSync(LIBRARY_PATH)) {
    var library = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'));
    var changed = false;
    library.slides.forEach(function (slide) {
      if (slide.edits && !slide.deckEdits) {
        slide.deckEdits = { default: slide.edits };
        changed = true;
      }
    });
    if (changed) {
      fs.writeFileSync(LIBRARY_PATH, JSON.stringify(library, null, 2), 'utf8');
      console.log('[migration] Converted slide-library.json edits → deckEdits.default');
    }
  }

  // 3. Create an empty deck.json for every other existing deck
  var store = readDecks();
  store.decks.forEach(function (d) {
    if (d.id !== 'default' && !fs.existsSync(getDeckPath(d.id))) {
      writeDeckById(d.id, { title: '', slides: [] });
      console.log('[migration] Created empty deck for: ' + d.id);
    }
  });

  console.log('[migration] Done.');
})();

app.listen(PORT, function () {
  console.log('Builder running at http://localhost:' + PORT);
  console.log('Preview:  http://localhost:' + PORT + '/builder/preview.html');
  setupUmamiWebsite();
});
