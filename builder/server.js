require('dotenv').config();

const express  = require('express');
const path     = require('path');
const fs       = require('fs');
const cheerio  = require('cheerio');
const session  = require('express-session');
const { requireAuth, registerAuthRoutes } = require('./features/auth/auth');
const { execFile } = require('child_process');

const app  = express();
const PORT = 3000;

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: false }));

// ── Sessions ──────────────────────────────────────────────────────────────────
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 8 } // 8 hours
}));

// ── Auth routes (login / logout) ──────────────────────────────────────────────
registerAuthRoutes(app);

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
    var deck     = JSON.parse(fs.readFileSync(DECK_PATH, 'utf8'));
    var deckSlide = deck.slides.find(function (s) { return s.id === id; });
    if (!deckSlide || !deckSlide.librarySlideId) {
      return res.status(404).type('text/plain').send('Deck slide not found: ' + id);
    }
    var library  = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'));
    var libSlide = library.slides.find(function (s) { return s.id === deckSlide.librarySlideId; });
    if (!libSlide) return res.status(404).type('text/plain').send('Library slide not found');

    var templates = JSON.parse(fs.readFileSync(TEMPLATES_PATH, 'utf8'));
    var tpl       = templates.find(function (t) { return t.id === libSlide.templateId; });
    if (!tpl) return res.status(404).type('text/plain').send('Template not found');

    var fragment = renderLayoutToHtml(tpl, id, libSlide.edits || {});
    if (readonly) {
      fragment = fragment.replace(/ contenteditable=""/g, '').replace(/ contenteditable=''/g, '');
    }
    var page = [
      '<!DOCTYPE html>',
      '<html lang="en">',
      '<head>',
      '  <meta charset="UTF-8">',
      '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
      '  <link rel="stylesheet" href="/slides/style.css">',
      readonly ? '  <script>window.PB_READONLY = true;</script>' : '',
      '  <script src="/slides/components/lightbox.js"></script>',
      '  <script src="/slides/components/carousel.js"></script>',
      '  <script src="/slides/components/tabs.js"></script>',
      '  <script src="/slides/components/list.js"></script>',
      '  <script src="/slides/components/table.js"></script>',
      '  <style>',
      '    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }',
      '    html, body { width: 100%; height: 100%; overflow: hidden; }',
      '    .slides-container { position: relative; width: 100%; height: 100%; }',
      '    .slide { opacity: 1 !important; transform: scale(1) !important; pointer-events: auto !important; }',
      readonly ? '    [data-builder-only],[data-ls-add-row],[data-ls-add],[data-ls-restore]{ display:none !important; }' : '',
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
      '    });',
      '  </script>',
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

function renderHeroLayout(slideId, savedEdits) {
  savedEdits = savedEdits || {};
  // Build a stable prefix from slideId — use a hash of the full string when no digits present
  var digits = slideId.replace(/\D/g, '');
  var suffix = digits.slice(-8) || slideId.replace(/[^a-z]/gi, '').slice(-8) || 'cover';
  var p = 'h' + suffix;
  var settings    = readSettings();
  var heroBg      = settings.heroBg || '';
  var heroBgFocal = settings.heroBgFocal || 'center center';
  var logos       = Array.isArray(settings.logos) ? settings.logos : [];

  var logoRowHtml = logos.map(function (logo, i) {
    return [
      i > 0 ? '    <span class="slide-logo-sep"></span>' : '',
      '    <img src="' + logo.src + '" alt="' + (logo.alt || '') + '"' + (i > 0 ? ' class="slide-logo-ls"' : '') + '>'
    ].filter(Boolean).join('\n');
  }).join('\n');
  return [
    '<div class="slide hero" data-slide="' + slideId + '">',

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
    '  <img class="hero-bg" src="' + heroBg + '" alt="Hero background" data-edit="hero-bg" style="object-position:' + heroBgFocal + ';">',
    '  <div class="hero-overlay"></div>',

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

// ── Per-template custom renderers ─────────────────────────────────────────────

function renderCompanyLayout(slideId, savedEdits) {
  savedEdits = savedEdits || {};

  var tabsDefault = [
    '<div class="ls-tab-list">',
    '  <button class="ls-tab active" data-panel="1" data-edit="tab-about" contenteditable="false" spellcheck="false">About Us</button>',
    '  <button class="ls-tab" data-panel="2" data-edit="tab-technologies" contenteditable="false" spellcheck="false">Technologies</button>',
    '  <button class="ls-tab" data-panel="3" data-edit="tab-network" contenteditable="false" spellcheck="false">Global Network</button>',
    '  <button class="ls-tab" data-panel="4" data-edit="tab-iqc" contenteditable="false" spellcheck="false">IQC Group</button>',
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
    (savedEdits['tabs'] != null ? savedEdits['tabs'] : tabsDefault),
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
    '  <button class="ls-tab active" data-panel="0" data-edit="tab-capability" contenteditable="false" spellcheck="false">Capability Matrix</button>',
    '  <button class="ls-tab" data-panel="1" data-edit="tab-process" contenteditable="false" spellcheck="false">Where in Your Process</button>',
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
    (savedEdits['tabs'] != null ? savedEdits['tabs'] : defaultTabsHtml),
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
    '  <button class="ls-tab" data-panel="0" data-edit="tab-howitworks" contenteditable="false" spellcheck="false">How It Works</button>',
    '  <button class="ls-tab active" data-panel="1" data-edit="tab-16bit" contenteditable="false" spellcheck="false">16-bit Advantage</button>',
    '  <button class="ls-tab" data-panel="2" data-edit="tab-vs" contenteditable="false" spellcheck="false">vs Camera Systems</button>',
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
    (savedEdits['tabs'] != null ? savedEdits['tabs'] : defaultTabsHtml),
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
    '  <div class="s6-selector anim-in" id="s6-selector"></div>',
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
    '      background-image: url(\'/slides/uploads/Defect Icons from top to buttom Scratches-Inclusions-dirt-dust-water-fingerprints-ignore-edge defects-dirt on fram and bars-undefined.png\');',
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
    '    var DEFECTS = [',
    '      { name: \'Scratches\',    row: 0, carId: \'s6-car-scratches\'    },',
    '      { name: \'Inclusions\',   row: 1, carId: \'s6-car-inclusions\'   },',
    '      { name: \'Dirt\',         row: 2, carId: \'s6-car-dirt\'         },',
    '      { name: \'Dust\',         row: 3, carId: \'s6-car-dust\'         },',
    '      { name: \'Water\',        row: 4, carId: \'s6-car-water\'        },',
    '      { name: \'Fingerprints\', row: 5, carId: \'s6-car-fingerprints\' },',
    '      { name: \'Ignore\',       row: 6, carId: \'s6-car-ignore\'       },',
    '      { name: \'Edge defects\', row: 7, carId: \'s6-car-edge-defects\' },',
    '      { name: \'Frame & bars\', row: 8, carId: \'s6-car-frame-bars\'   },',
    '      { name: \'Undefined\',    row: 9, carId: \'s6-car-undefined\'    },',
    '      { name: \'Coating\',   icon: \'◈\', carId: \'s6-car-coating\'      }',
    '    ];',
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
    '      if (window.Carousel) Carousel.init(car);',
    '      if (window.Lightbox)  Lightbox.init(car);',
    '      updateBtns();',
    '    }',
    '',
    '    DEFECTS.forEach(function (d, i) {',
    '      var btn = document.createElement(\'button\');',
    '      btn.className = \'s6-defect-btn\';',
    '      if (d.icon) {',
    '        var emojiEl = document.createElement(\'div\');',
    '        emojiEl.className = \'s6-emoji-icon\';',
    '        emojiEl.textContent = d.icon;',
    '        btn.appendChild(emojiEl);',
    '      } else {',
    '        var icon = document.createElement(\'div\');',
    '        icon.className = \'s6-icon\';',
    '        setIconPos(icon, d.row, false);',
    '        btn.appendChild(icon);',
    '      }',
    '      var label = document.createElement(\'span\');',
    '      label.textContent = d.name;',
    '      btn.appendChild(label);',
    '      btn.addEventListener(\'click\', function () { showDefect(i); if (window.Track) Track.click(Track.slideId(btn), d.name); });',
    '      selector.appendChild(btn);',
    '    });',
    '',
    '    showDefault();',
    '',
    '  })();',
    '  <\/script>',
    '',
    '  <script>',
    '  (function () { var s = document.currentScript;',
    '    setTimeout(function () { if (window.PE && s) PE.initSlide(s.closest(\'.slide\')); }, 0); })();',
    '  <\/script>',
    '</div>'
  ].join('\n');
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
    '      <div class="section-label" data-edit="section-label">' + applyEdit('section-label', 'Dimensional Control', savedEdits) + '</div>',
    '      <h1 class="slide-title" data-edit="headline" style="margin-bottom:14px;">' + applyEdit('headline', 'Precise measurement of <span class="blue">dimensions and cutouts</span>', savedEdits) + '</h1>',
    '    </header>',
    '',
    '    <div class="slide-body">',
    '      <div class="ls-carousel anim-in" data-edit="carousel" data-counter="" data-track="ls7:carousel" data-zoom-group="" style="flex:1;min-height:0;width:100%;max-width:860px;">',
    (savedEdits['carousel'] != null ? savedEdits['carousel'] : defaultCarouselHtml),
    '      </div>',
    '',
    '      <div class="ls7-cards anim-in">',
    '        <div class="col-card">',
    '          <div class="col-label" data-edit="card-header-1">' + applyEdit('card-header-1', 'What is measured?', savedEdits) + '</div>',
    '          <div class="col-list">',
    '            <div class="col-item" data-edit="dim-item-1">' + applyEdit('dim-item-1', '<strong>Overall dimensions</strong> of the glass', savedEdits) + '</div>',
    '            <div class="col-item" data-edit="dim-item-2">' + applyEdit('dim-item-2', '<strong>Position and size</strong> of drill holes', savedEdits) + '</div>',
    '            <div class="col-item" data-edit="dim-item-3">' + applyEdit('dim-item-3', '<strong>Cutouts and notches</strong>', savedEdits) + '</div>',
    '            <div class="col-item" data-edit="dim-item-4">' + applyEdit('dim-item-4', '<strong>Angles and parallelism</strong> of edges', savedEdits) + '</div>',
    '            <div class="col-item" data-edit="dim-item-5">' + applyEdit('dim-item-5', '<strong>Rotation and position</strong> on line', savedEdits) + '</div>',
    '          </div>',
    '        </div>',
    '        <div class="col-card">',
    '          <div class="col-label" data-edit="card-header-2">' + applyEdit('card-header-2', 'Setup &amp; tolerances', savedEdits) + '</div>',
    '          <div class="col-list">',
    '            <div class="col-item" data-edit="dim-item-6">' + applyEdit('dim-item-6', 'Compatible with <strong class="ls7-trigger" onclick="ls7OpenTolerances()" data-edit="trigger-tolerances">individual tolerances per measurement \u2197</strong>', savedEdits) + '</div>',
    '            <div class="col-item" data-edit="dim-item-7">' + applyEdit('dim-item-7', '<strong>DXF</strong> model import', savedEdits) + '</div>',
    '            <div class="col-item" data-edit="dim-item-8">' + applyEdit('dim-item-8', '<strong>2-step</strong> verification: global + detail', savedEdits) + '</div>',
    '            <div class="col-item" data-edit="dim-item-9">' + applyEdit('dim-item-9', 'Compatible with <strong class="ls7-trigger" onclick="ls7OpenConveyor()" data-umami-event="conveyor-gallery-open">belt conveyors \u2197</strong>', savedEdits) + '</div>',
    '            <div class="col-item" data-edit="dim-item-10">' + applyEdit('dim-item-10', 'Parallel light for <strong>maximum precision</strong>', savedEdits) + '</div>',
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
    '      <img src="/slides/uploads/image89.png" alt="Screen printing overview" data-zoom="" data-track="ls9:zoom:overview">',
    '    </div>',
    '    <div class="ls-carousel-slide">',
    '      <img src="/slides/uploads/image90.png" alt="Distortion" data-zoom="" data-track="ls9:zoom:distortion">',
    '    </div>',
    '    <div class="ls-carousel-slide">',
    '      <img src="/slides/uploads/image91.png" alt="Rotation" data-zoom="" data-track="ls9:zoom:rotation">',
    '    </div>',
    '    <div class="ls-carousel-slide">',
    '      <img src="/slides/uploads/image92.png" alt="Out of position" data-zoom="" data-track="ls9:zoom:out-of-position">',
    '    </div>',
    '    <div class="ls-carousel-slide">',
    '      <img src="/slides/uploads/image96.png" alt="Filled items" data-zoom="" data-track="ls9:zoom:filled-items">',
    '    </div>',
    '  </div>'
  ].join('\n');

  return [
    '<div class="slide content ls9" data-slide="' + slideId + '">',
    '  <div class="slide-logo-row"><img src="/slides/shared/LOGO SoftSolution grays.png" alt="Softsolution"><span class="slide-logo-sep"></span><img src="/slides/shared/LOGO LiteSentry Greys.png" alt="LiteSentry" class="slide-logo-ls"></div>',
    '',
    '  <div class="slide-layout">',
    '    <header class="slide-head">',
    '      <div class="section-label" data-edit="section-label" contenteditable="" spellcheck="false">' + applyEdit('section-label', 'Screen Printing &amp; Logo', savedEdits) + '</div>',
    '      <h1 class="slide-title" data-edit="headline" contenteditable="" spellcheck="false" style="margin-bottom:14px;">' + applyEdit('headline', 'Position and <span class="blue">print quality control</span>', savedEdits) + '</h1>',
    '    </header>',
    '',
    '    <div class="slide-body">',
    '      <!-- ── Carousel ── -->',
    '      <div class="ls-carousel anim-in" id="ls9-carousel" data-edit="carousel" data-counter="" data-track="ls9:carousel" data-zoom-group="" style="flex:1;min-height:0;width:100%;max-width:860px;">',
    (savedEdits['carousel'] != null ? savedEdits['carousel'] : defaultCarouselHtml),
    '      </div>',
    '',
    '      <!-- ── Tags — always above nav ── -->',
    '      <div class="ls9-info anim-in" style="">',
    '        <div class="tag-grid" style="justify-content:center;">',
    '          <span class="tag error" data-edit="tag-1" contenteditable="" spellcheck="false">' + applyEdit('tag-1', '&#10060; Missing print', savedEdits) + '</span>',
    '          <span class="tag error ls9-tag" data-img="1" data-edit="tag-2" contenteditable="" spellcheck="false">' + applyEdit('tag-2', '&#128208; Distortion', savedEdits) + '</span>',
    '          <span class="tag warn" data-edit="tag-3" contenteditable="" spellcheck="false">' + applyEdit('tag-3', '&#128161; Shiny ink', savedEdits) + '</span>',
    '          <span class="tag warn ls9-tag" data-img="2" data-edit="tag-4" contenteditable="" spellcheck="false">' + applyEdit('tag-4', '&#128260; Rotation', savedEdits) + '</span>',
    '          <span class="tag error ls9-tag" data-img="3" data-edit="tag-5" contenteditable="" spellcheck="false">' + applyEdit('tag-5', '&#128205; Out of position', savedEdits) + '</span>',
    '          <span class="tag ls9-tag" data-img="4" data-edit="tag-6" contenteditable="" spellcheck="false">' + applyEdit('tag-6', '&#11035; &quot;Filled&quot; items', savedEdits) + '</span>',
    '        </div>',
    '      </div>',
    '    </div>',
    '  </div>',
    '',
    '  <!-- ── Scoped Styles ── -->',
    '  <style>',
    '    .ls9 { }',
    '    .ls9 .slide-body { width: 100%; align-items: center; }',
    '    .ls9 .ls-carousel { min-height: 260px !important; height: 260px !important; }',
    '    .ls9 { padding: 52px 16px 80px !important; }',
    '',
    '    @media (min-width: 769px) {',
    '      .ls9 .ls-carousel { min-height: 0 !important; height: 100% !important; }',
    '      .ls9 { padding: 52px 80px 0 !important; }',
    '    }',
    '',
    '    /* ── Tags strip ── */',
    '    .ls9-info {',
    '      flex-shrink: 0;',
    '      width: 100%; max-width: 860px;',
    '      margin-top: 10px;',
    '    }',
    '',
    '    /* ── Clickable tags ── */',
    '    .ls9-tag { cursor: pointer; transition: all .2s; }',
    '    .ls9-tag:hover { outline: 1px solid rgba(232,113,26,.5); }',
    '    .ls9-tag.active { outline: 2px solid #E8711A; opacity: 1 !important; }',
    '  </style>',
    '',
    '  <!-- ── Scoped Script ── -->',
    '  <script>',
    '  // Tag click → navigate carousel to matching image index',
    '  setTimeout(function () {',
    '    var carousel = document.getElementById(\'ls9-carousel\');',
    '    document.querySelectorAll(\'.ls9-tag\').forEach(function (tag) {',
    '      tag.addEventListener(\'click\', function () {',
    '        var targetIdx = parseInt(tag.getAttribute(\'data-img\'));',
    '        if (carousel && !isNaN(targetIdx)) {',
    '          var track = carousel.querySelector(\'.ls-carousel-track\');',
    '          var slides = Array.from(carousel.querySelectorAll(\'.ls-carousel-slide\'));',
    '          if (track && slides.length > targetIdx) {',
    '            var currentIdx = Math.round(parseFloat(track.style.transform.replace(\'translateX(\',\'\')) / -carousel.offsetWidth) || 0;',
    '            var delta = targetIdx - currentIdx;',
    '            var btn = delta > 0 ? carousel.querySelector(\'.ls-carousel-next\') : carousel.querySelector(\'.ls-carousel-prev\');',
    '            for (var i = 0; i < Math.abs(delta); i++) { if (btn) btn.click(); }',
    '          }',
    '        }',
    '        if (window.Track) Track.click(\'ls9\', tag.textContent.trim().toLowerCase().replace(/\\s+/g,\'-\'));',
    '      });',
    '    });',
    '  }, 100);',
    '',
    '  <\/script>',
    '',
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
    '      <button class="ls-tab active" data-panel="0" data-edit="tab-archive" contenteditable="false">Archive</button>',
    '      <button class="ls-tab" data-panel="1" data-edit="tab-console" contenteditable="false">Management Console</button>',
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
    (savedEdits['tabs'] != null ? savedEdits['tabs'] : defaultTabsHtml),
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

  var cards = [
    { name: 'int-name-1', nameDefault: 'LiSEC',        type: 'int-type-1', typeDefault: 'Processing lines' },
    { name: 'int-name-2', nameDefault: 'FOREL',         type: 'int-type-2', typeDefault: 'Architectural glass' },
    { name: 'int-name-3', nameDefault: 'Benteler',      type: 'int-type-3', typeDefault: 'Automotive glass' },
    { name: 'int-name-4', nameDefault: 'CMS Tecglass',  type: 'int-type-4', typeDefault: 'Digital printing' },
    { name: 'int-name-5', nameDefault: 'Bystronic',     type: 'int-type-5', typeDefault: 'Cutting and processing' },
    { name: 'int-name-6', nameDefault: 'Hegla',         type: 'int-type-6', typeDefault: 'Cutting and storage' },
    { name: 'int-name-7', nameDefault: 'Glaston',       type: 'int-type-7', typeDefault: 'Tempering and bending' },
    { name: 'int-name-8', nameDefault: 'TecoFerrari',   type: 'int-type-8', typeDefault: 'Insulating glass' },
    { name: 'int-name-9', nameDefault: 'Erdman',        type: 'int-type-9', typeDefault: 'Automated lines' },
  ];

  var cardLines = cards.map(function (c) {
    return [
      '    <div class="int-card anim-in">',
      '      <div class="int-name" data-edit="' + c.name + '" contenteditable="" spellcheck="false">' + applyEdit(c.name, c.nameDefault, savedEdits) + '</div>',
      '      <div class="int-type" data-edit="' + c.type + '" contenteditable="" spellcheck="false">' + applyEdit(c.type, c.typeDefault, savedEdits) + '</div>',
      '    </div>',
    ].join('\n');
  });

  return [
    '<div class="slide content ls13" data-slide="' + slideId + '">',
    '  <div class="slide-logo-row"><img src="/slides/shared/LOGO SoftSolution grays.png" alt="Softsolution"><span class="slide-logo-sep"></span><img src="/slides/shared/LOGO LiteSentry Greys.png" alt="LiteSentry" class="slide-logo-ls"></div>',
    '  <div class="slide-layout">',
    '    <header class="slide-head">',
    '      <div class="section-label" data-edit="section-label" contenteditable="" spellcheck="false">' + applyEdit('section-label', 'Integrations', savedEdits) + '</div>',
    '      <h1 class="slide-title" data-edit="headline" contenteditable="" spellcheck="false">' + applyEdit('headline', 'Compatible with<br><span class="blue">your current machinery</span>', savedEdits) + '</h1>',
    '      <div class="divider"></div>',
    '      <p class="slide-subtitle" data-edit="subtitle" contenteditable="" spellcheck="false" style="margin-bottom:4px;">' + applyEdit('subtitle', 'LineScanner is already integrated with the leading glass machinery manufacturers \u2014 if you already run any of these lines, integration is direct.', savedEdits) + '</p>',
    '    </header>',
    '    <div class="slide-body">',
    '  <div class="integration-grid">',
  ].concat(cardLines).concat([
    '  </div>',
    '    </div><!-- /.slide-body -->',
    '  </div><!-- /.slide-layout -->',
    '  <!-- \u2500\u2500 Scoped Styles \u2500\u2500 -->',
    '  <style>',
    '    /* Mobile base: collapse the inline 80px side padding */',
    '    .ls13 { padding: 70px 16px 80px !important; }',
    '',
    '    /* Desktop: restore intended layout padding */',
    '    @media (min-width: 769px) {',
    '      .ls13 { padding: 52px 80px 0 !important; }',
    '    }',
    '  </style>',
    '  <script>',
    '  (function () { var s = document.currentScript;',
    '    setTimeout(function () { if (window.PE && s) PE.initSlide(s.closest(\'.slide\')); }, 0); })();',
    '  <\/script>',
    '</div>',
  ]).join('\n');
}

function renderCtaLayout(slideId, savedEdits) {
  savedEdits = savedEdits || {};

  function applyEdit(key, defaultVal, edits) {
    return edits[key] != null ? edits[key] : defaultVal;
  }

  var defaultStep1 = 'Analyse [Customer]\'s current production line';
  var defaultStep2 = 'Live demo with [Customer] glass samples';
  var defaultStep3 = 'Customised technical and commercial proposal';

  var defaultIntro = 'We propose that your team visit our facilities in Austria so we can carry out an on-site demonstration with <strong>your own glass samples</strong> \u2014 together.';

  var waSvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"></path><path d="M12 0C5.373 0 0 5.373 0 12c0 2.117.554 4.103 1.523 5.83L.057 23.25a.75.75 0 0 0 .918.919l5.42-1.466A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.694 9.694 0 0 1-4.946-1.355l-.354-.212-3.658.989.989-3.658-.212-.354A9.694 9.694 0 0 1 2.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"></path></svg>';
  var emailSvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path></svg>';

  var contactEmail = applyEdit('contact-email', 'alex.ochoa@softsolution.at', savedEdits);
  var emailHref = 'mailto:' + contactEmail;
  var contactPhone = applyEdit('contact-phone', '', savedEdits);
  var waHref = contactPhone ? 'https://wa.me/' + contactPhone.replace(/\D/g, '') : '#';

  return [
    '<div class="slide content ls14" data-slide="' + slideId + '">',
    '  <img src="/slides/uploads/image112.png" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.06;pointer-events:none;z-index:0;">',
    '  <div class="slide-logo-row"><img src="/slides/shared/LOGO SoftSolution grays.png" alt="Softsolution"><span class="slide-logo-sep"></span><img src="/slides/shared/LOGO LiteSentry Greys.png" alt="LiteSentry" class="slide-logo-ls"></div>',
    '  <div class="slide-layout">',
    '    <header class="slide-head">',
    '      <div class="section-label" data-edit="section-label" contenteditable="" spellcheck="false">' + applyEdit('section-label', 'Next Steps', savedEdits) + '</div>',
    '      <h1 class="slide-title" data-edit="headline" contenteditable="" spellcheck="false">' + applyEdit('headline', 'Ready for a<br><span class="blue">live demonstration?</span>', savedEdits) + '</h1>',
    '      <div class="divider"></div>',
    '    </header>',
    '    <div class="slide-body">',
    '  <div class="cta-box anim-in" style="flex:1; min-height:0; display:flex; flex-direction:column; justify-content:center; padding-bottom:72px; max-width:680px; width:100%; text-align:left;">',
    '    <p data-edit="intro" contenteditable="" spellcheck="false">' + applyEdit('intro', defaultIntro, savedEdits) + '</p>',
    '    <div class="cta-steps">',
    '      <div class="cta-step" data-umami-event="cta-step" data-umami-event-step="1-analysis"><div class="step-num">1</div><span data-edit="step1" contenteditable="" spellcheck="false">' + applyEdit('step1', defaultStep1, savedEdits) + '</span></div>',
    '      <div class="cta-step" data-umami-event="cta-step" data-umami-event-step="2-live-demo"><div class="step-num">2</div><span data-edit="step2" contenteditable="" spellcheck="false">' + applyEdit('step2', defaultStep2, savedEdits) + '</span></div>',
    '      <div class="cta-step" data-umami-event="cta-step" data-umami-event-step="3-proposal"><div class="step-num">3</div><span data-edit="step3" contenteditable="" spellcheck="false">' + applyEdit('step3', defaultStep3, savedEdits) + '</span></div>',
    '    </div>',
    '    <div class="cta-contact">',
    '      <div class="cta-contact-name">',
    '        <strong data-edit="contact-name" contenteditable="" spellcheck="false">' + applyEdit('contact-name', 'Alex Ochoa', savedEdits) + '</strong>',
    '        <span class="cta-contact-role" data-edit="contact-title" contenteditable="" spellcheck="false">' + applyEdit('contact-title', 'Sales Manager', savedEdits) + '</span>',
    '        <span class="cta-contact-addr" data-edit="contact-addr" contenteditable="" spellcheck="false">' + applyEdit('contact-addr', 'Im Vogelsang 18 \u00b7 3340 Waidhofen \u00b7 Austria', savedEdits) + '</span>',
    '        <span class="cta-contact-phone" data-edit="contact-phone" contenteditable="" spellcheck="false" title="WhatsApp phone number (digits only, e.g. 4366412345678)">' + applyEdit('contact-phone', '+43 664 123 45678', savedEdits) + '</span>',
    '      </div>',
    '      <div class="cta-contact-btns">',
    '        <a class="cta-btn-wa" href="' + waHref + '" target="_blank" data-umami-event="cta-whatsapp">',
    '          ' + waSvg,
    '          WhatsApp',
    '        </a>',
    '        <a class="cta-btn-email" href="' + emailHref + '" data-umami-event="cta-email">',
    '          ' + emailSvg,
    '          <span data-edit="contact-email" contenteditable="" spellcheck="false">' + contactEmail + '</span>',
    '        </a>',
    '      </div>',
    '    </div>',
    '  </div>',
    '    </div><!-- /.slide-body -->',
    '  </div><!-- /.slide-layout -->',
    '',
    '  <!-- \u2500\u2500 Scoped Styles \u2500\u2500 -->',
    '  <style>',
    '    .cta-contact {',
    '      display:flex; align-items:center; justify-content:space-between; gap:20px;',
    '      margin-top:24px; padding-top:20px;',
    '      border-top:1px solid rgba(var(--accent-rgb),.2);',
    '      flex-wrap:wrap;',
    '    }',
    '    .cta-contact-name { display:flex; flex-direction:column; gap:3px; }',
    '    .cta-contact-name strong { font-size:15px; color:var(--text); }',
    '    .cta-contact-role { font-size:13px; color:var(--text-muted); }',
    '    .cta-contact-addr { font-size:12px; color:var(--text-muted); opacity:.7; }',
    '    .cta-contact-phone { font-size:12px; color:var(--text-muted); opacity:.7; }',
    '    .cta-contact-btns { display:flex; flex-direction:column; gap:10px; }',
    '    .cta-btn-wa, .cta-btn-email {',
    '      display:inline-flex; align-items:center; gap:10px;',
    '      padding:10px 20px; border-radius:100px;',
    '      font-size:13px; font-weight:600; text-decoration:none;',
    '      transition:all .2s; white-space:nowrap;',
    '    }',
    '    .cta-btn-wa {',
    '      background:rgba(37,211,102,.15); border:1px solid rgba(37,211,102,.35);',
    '      color:#25d366;',
    '    }',
    '    .cta-btn-wa:hover { background:rgba(37,211,102,.25); border-color:rgba(37,211,102,.6); }',
    '    .cta-btn-email {',
    '      background:rgba(var(--accent-rgb),.12); border:1px solid rgba(var(--accent-rgb),.3);',
    '      color:var(--accent);',
    '    }',
    '    .cta-btn-email:hover { background:rgba(var(--accent-rgb),.22); border-color:rgba(var(--accent-rgb),.55); }',
    '    /* \u2500\u2500 Mobile base \u2500\u2500 */',
    '    .ls14 { padding:52px 20px 80px !important; }',
    '    .cta-contact { flex-direction:column; align-items:flex-start; gap:14px; }',
    '    .cta-btn-wa, .cta-btn-email { font-size:14px; padding:14px 20px; min-height:44px; }',
    '',
    '    /* \u2500\u2500 Desktop overrides \u2500\u2500 */',
    '    @media(min-width:769px){',
    '      .ls14 { padding:60px 80px 0 !important; }',
    '      .cta-contact { flex-direction:row; align-items:center; gap:20px; }',
    '      .cta-btn-wa, .cta-btn-email { font-size:13px; padding:10px 20px; min-height:unset; }',
    '    }',
    '  </style>',
    '  <script>',
    '  (function () { var s = document.currentScript;',
    '    setTimeout(function () { if (window.PE && s) PE.initSlide(s.closest(\'.slide\')); }, 0); })();',
    '  <\/script>',
    '',
    '  <script>',
    '  (function() {',
    '    function syncLinks() {',
    '      var emailEl = document.querySelector(\'[data-edit="contact-email"]\');',
    '      var emailBtn = document.querySelector(\'.cta-btn-email\');',
    '      if (emailEl && emailBtn) {',
    '        var email = emailEl.textContent.trim();',
    '        if (email) emailBtn.href = \'mailto:\' + email;',
    '      }',
    '    }',
    '    document.addEventListener(\'DOMContentLoaded\', syncLinks);',
    '    var emailEl = document.querySelector(\'[data-edit="contact-email"]\');',
    '    if (emailEl) emailEl.addEventListener(\'input\', syncLinks);',
    '  })();',
    '  <\/script>',
    '</div>'
  ].join('\n');
}

function renderLayoutToHtml(layout, slideId, savedEdits) {
  savedEdits = savedEdits || {};

  // Merge template defaultContent — savedEdits (user changes) take priority
  // layout.fromTemplate is set on layout objects; layout.id is the template id when called directly
  var tplId = layout.fromTemplate || layout.id;
  var templates = JSON.parse(fs.readFileSync(TEMPLATES_PATH, 'utf8'));
  var tpl = templates.find(function(t) { return t.id === tplId; });
  var defaultContent = (tpl && tpl.defaultContent) || {};
  savedEdits = Object.assign({}, defaultContent, savedEdits);

  if (tplId === 'tpl-new-cover')    return renderHeroLayout(slideId, savedEdits);
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
  if (tplId === 'tpl-new-cta')                  return renderCtaLayout(slideId, savedEdits);

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
    var deck      = JSON.parse(fs.readFileSync(DECK_PATH, 'utf8'));
    var deckSlide = deck.slides.find(function (s) { return s.id === deckSlideId; });
    if (!deckSlide || !deckSlide.librarySlideId) return next();

    var library  = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'));
    var libSlide = library.slides.find(function (s) { return s.id === deckSlide.librarySlideId; });
    if (!libSlide) return next();

    var templates = JSON.parse(fs.readFileSync(TEMPLATES_PATH, 'utf8'));
    var tpl       = templates.find(function (t) { return t.id === libSlide.templateId; });
    if (!tpl) return next();

    var savedEdits = libSlide.edits || {};
    var html = renderLayoutToHtml(tpl, deckSlideId, savedEdits);
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
  res.json({ success: true, data: readSettings() });
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
    var safeName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
    var dest     = path.join(__dirname, 'features', 'slides', 'uploads', safeName);
    fs.writeFileSync(dest, buffer);

    var src      = '/slides/uploads/' + safeName;
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
    var safeName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
    var dest     = path.join(__dirname, 'features', 'slides', 'uploads', safeName);
    fs.writeFileSync(dest, buffer);

    var src      = '/slides/uploads/' + safeName;
    var settings = readSettings();
    settings.heroBg = src;
    writeSettings(settings);
    res.json({ success: true, data: settings });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── API: deck config ──────────────────────────────────────────────────────────
var DECK_PATH          = path.join(__dirname, 'data', 'deck.json');
var LIBRARY_PATH       = path.join(__dirname, 'data', 'slide-library.json');
var PRESENTATIONS_PATH = path.join(__dirname, 'data', 'presentations.json');
var LAYOUTS_PATH   = path.join(__dirname, 'data', 'layouts.json');
var TEMPLATES_PATH = path.join(__dirname, 'data', 'slide-templates.json');
var SETTINGS_PATH  = path.join(__dirname, 'data', 'settings.json');

function readSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')); }
  catch (e) { return { logos: [], logosOnAllSlides: true, heroBg: '', heroBgFocal: '50% 50%', heroBgFocalGrid: 3 }; }
}
function writeSettings(data) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(data, null, 2), 'utf8');
}

// GET /api/deck — return the current deck config, with library slide names merged in
app.get('/api/deck', function (req, res) {
  try {
    var deck    = JSON.parse(fs.readFileSync(DECK_PATH, 'utf8'));
    var library = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'));

    deck.slides = deck.slides.map(function (slide) {
      if (!slide.librarySlideId) return slide;
      var libSlide = library.slides.find(function (s) { return s.id === slide.librarySlideId; });
      if (!libSlide) return slide;
      return Object.assign({}, slide, { name: libSlide.name });
    });

    res.json({ success: true, data: deck });
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
    var existing = JSON.parse(fs.readFileSync(DECK_PATH, 'utf8'));
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
    fs.writeFileSync(DECK_PATH, JSON.stringify(merged, null, 2), 'utf8');
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

    var deck     = JSON.parse(fs.readFileSync(DECK_PATH, 'utf8'));
    var existing = deck.slides.find(function (s) { return s.librarySlideId === librarySlideId; });
    if (existing) return res.json({ success: true, data: existing });
    var newSlide = { id: 'deck-' + librarySlideId + '-' + Date.now(), librarySlideId: librarySlideId, visible: true };
    if (librarySlideId === 'lib-cover') {
      deck.slides.unshift(newSlide);
    } else if (librarySlideId === 'lib-cta') {
      deck.slides.push(newSlide);
    } else {
      deck.slides.push(newSlide);
    }
    fs.writeFileSync(DECK_PATH, JSON.stringify(deck, null, 2), 'utf8');
    res.json({ success: true, data: newSlide });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/deck/slides/:id — remove a slide from the deck (does not touch layouts.json)
app.delete('/api/deck/slides/:id', function (req, res) {
  try {
    var deck     = JSON.parse(fs.readFileSync(DECK_PATH, 'utf8'));
    var filtered = deck.slides.filter(function (s) { return s.id !== req.params.id; });
    deck.slides  = filtered;
    fs.writeFileSync(DECK_PATH, JSON.stringify(deck, null, 2), 'utf8');
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

    var deck      = JSON.parse(fs.readFileSync(DECK_PATH, 'utf8'));
    var deckSlide = deck.slides.find(function (s) { return s.id === id; });
    if (!deckSlide) return res.status(404).json({ success: false, error: 'Deck slide not found' });

    var library  = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'));
    var libSlide = library.slides.find(function (s) { return s.id === deckSlide.librarySlideId; });
    if (!libSlide) return res.status(404).json({ success: false, error: 'Library slide not found' });

    libSlide.edits = Object.assign({}, libSlide.edits || {}, edits);
    fs.writeFileSync(LIBRARY_PATH, JSON.stringify(library, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
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
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Frozen presentation builder ───────────────────────────────────────────────
// Renders a presentation snapshot to finished-presentations/[presId]/index.html
// All images are copied to finished-presentations/shared/ (shared across all
// presentations) so assets are never duplicated. Each HTML file references them
// via the relative path ../shared/filename.
function buildFrozenPresentation(presentation) {
  var presId   = presentation.id;
  var outDir   = path.join(__dirname, '..', 'finished-presentations', presId);
  var assetDir = path.join(__dirname, '..', 'finished-presentations', 'shared');
  fs.mkdirSync(outDir,    { recursive: true });
  fs.mkdirSync(assetDir,  { recursive: true });

  var library   = JSON.parse(fs.readFileSync(LIBRARY_PATH,  'utf8'));
  var templates = JSON.parse(fs.readFileSync(TEMPLATES_PATH, 'utf8'));
  var appSettings = readSettings();
  var umamiWebsiteId = appSettings.umamiWebsiteId || '';

  // Image path mappings: URL prefix → filesystem dir
  var imgRoots = [
    { prefix: '/slides/uploads/', dir: path.join(__dirname, 'features', 'slides', 'uploads') },
    { prefix: '/slides/shared/',  dir: path.join(__dirname, 'shared', 'assets') },
    { prefix: '/slides/assets/',  dir: path.join(__dirname, 'features', 'slides', 'assets') },
    { prefix: '/shared/assets/',  dir: path.join(__dirname, 'shared', 'assets') }
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

  // Per-presentation cover overrides (never written back to library)
  var coverEdits = {};
  if (presentation.customerName) {
    var sub = 'Proposal for ' + presentation.customerName;
    if (presentation.contactName)  sub += ' \u00b7 ' + presentation.contactName;
    if (presentation.contactTitle) sub += ', ' + presentation.contactTitle;
    coverEdits.subheadline = sub;
  }
  if (presentation.customerLogoSrc) {
    coverEdits['customer-logo-src'] = presentation.customerLogoSrc;
  }

  // Render each visible slide
  var slideFragments = [];
  var slideNames = [];
  (presentation.slides || []).forEach(function (s, idx) {
    if (!s.visible) return;
    var libSlide = (library.slides || []).find(function (l) { return l.id === s.librarySlideId; });
    if (!libSlide) return;
    var tpl = (templates || []).find(function (t) { return t.id === libSlide.templateId; });
    if (!tpl) return;

    var edits = Object.assign({}, libSlide.edits || {});
    if (s.librarySlideId === 'lib-cover') Object.assign(edits, coverEdits);

    var fragment = renderLayoutToHtml(tpl, s.id, edits);

    // Strip builder-only elements + contenteditable + logo change interactivity
    var $ = cheerio.load(fragment, { xmlMode: false });
    $('[data-builder-only],[data-ls-add-row],[data-ls-add],[data-ls-restore]').remove();
    $('[contenteditable]').removeAttr('contenteditable');
    $('[spellcheck]').removeAttr('spellcheck');
    $('[data-edit="customer-logo"]').removeAttr('onclick').removeAttr('title');
    $('input[type="file"]').remove();
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
    var tpl = (templates || []).find(function (t) { return t.id === libSlide.templateId; });
    if (!tpl) return;

    var edits = Object.assign({}, libSlide.edits || {});
    if (s.librarySlideId === 'lib-cover') Object.assign(edits, coverEdits);

    var fragment = renderLayoutToHtml(tpl, s.id, edits);
    var $ = cheerio.load(fragment, { xmlMode: false });
    $('[data-builder-only],[data-ls-add-row],[data-ls-add],[data-ls-restore]').remove();
    $('[contenteditable]').removeAttr('contenteditable');
    $('[spellcheck]').removeAttr('spellcheck');
    $('[data-edit="customer-logo"]').removeAttr('onclick').removeAttr('title');
    $('input[type="file"]').remove();
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
    '  </style>',
    (umamiWebsiteId ? '  <script defer src="https://umami.wbtm.io/script.js" data-website-id="' + umamiWebsiteId + '"></script>' : ''),
    '</head>',
    '<body>',
    '<div id="fp-shell">',
    '  <div id="fp-header">',
    '    <a href="/" id="fp-dash-btn">&#8592; Dashboard</a>',
    '    <div style="width:1px;height:20px;background:#333;flex-shrink:0;"></div>',
    '    <button class="fp-nav-btn" id="fp-prev" disabled>&#8249;</button>',
    '    <div id="fp-counter">1 / ' + totalSlides + '</div>',
    '    <button class="fp-nav-btn" id="fp-next"' + (totalSlides <= 1 ? ' disabled' : '') + '>&#8250;</button>',
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
    'window.PB_READONLY = true;',
    inlineJs,
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
    '  var baseUrl   = "https://app-presentation-builder.pages.dev/finished-presentations/" + presId + "/";',
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
    '</body>',
    '</html>'
  ].join('\n');

  fs.writeFileSync(path.join(outDir, 'index.html'), html, 'utf8');
  return outDir;
}

function makePresId() {
  var data = JSON.parse(fs.readFileSync(PRESENTATIONS_PATH, 'utf8'));
  var count = (data.presentations || []).length + 1;
  return String(count).padStart(8, '0');
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

// POST /api/presentations — save a new finished presentation (snapshot of current deck + customer info)
app.post('/api/presentations', function (req, res) {
  var body = req.body || {};
  var customerName = (body.customerName || '').trim();
  if (!customerName) {
    return res.status(400).json({ success: false, error: 'customerName is required' });
  }
  try {
    var deck    = JSON.parse(fs.readFileSync(DECK_PATH, 'utf8'));
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
        var logoSafe   = path.basename(logoFilename).replace(/[^a-zA-Z0-9._-]/g, '_');
        var logoDest   = path.join(__dirname, 'features', 'slides', 'uploads', logoSafe);
        fs.writeFileSync(logoDest, logoBuffer);
        customerLogoSrc = '/slides/uploads/' + logoSafe;
      }
    }

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

    var presentation = {
      id:              makePresId(),
      createdAt:       new Date().toISOString().slice(0, 10),
      presentationName: presentationName,
      customerName:    customerName,
      contactName:     contactName,
      contactTitle:    contactTitle,
      customerLogoSrc: customerLogoSrc,
      slideCount:      slides.filter(function (s) { return s.visible; }).length,
      slides:          slides
    };

    var data = JSON.parse(fs.readFileSync(PRESENTATIONS_PATH, 'utf8'));
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
        var logoSafe   = path.basename(logoFilename).replace(/[^a-zA-Z0-9._-]/g, '_');
        var logoDest   = path.join(__dirname, 'features', 'slides', 'uploads', logoSafe);
        fs.writeFileSync(logoDest, logoBuffer);
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

// DELETE /api/presentations/:id — remove a finished presentation + its frozen folder
app.delete('/api/presentations/:id', function (req, res) {
  try {
    var data = JSON.parse(fs.readFileSync(PRESENTATIONS_PATH, 'utf8'));
    var before = (data.presentations || []).length;
    data.presentations = (data.presentations || []).filter(function (p) { return p.id !== req.params.id; });
    if (data.presentations.length === before) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }
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
        var logoSafe   = path.basename(logoFilename).replace(/[^a-zA-Z0-9._-]/g, '_');
        var logoDest   = path.join(__dirname, 'features', 'slides', 'uploads', logoSafe);
        fs.writeFileSync(logoDest, logoBuffer);
        logoSrc = '/slides/uploads/' + logoSafe;
      }
    }

    var slides = (src.slides || []).map(function (s) {
      return { id: s.id, librarySlideId: s.librarySlideId, name: s.name, visible: s.visible };
    });

    var presentation = {
      id:              makePresId(),
      createdAt:       new Date().toISOString().slice(0, 10),
      customerName:    customerName,
      contactName:     contactName,
      contactTitle:    contactTitle,
      customerLogoSrc: logoSrc,
      slideCount:      slides.filter(function (s) { return s.visible; }).length,
      slides:          slides
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

  var repoRoot = path.join(__dirname, '..');
  var folderArg = 'finished-presentations/' + id;
  var commitMsg = 'publish: ' + (pres.customerName || id) + (pres.presentationName ? ' — ' + pres.presentationName : '') + ' (' + id + ')';
  var publicUrl = 'https://app-presentation-builder.pages.dev/finished-presentations/' + id;

  function run(cmd, args, cwd, cb) {
    execFile(cmd, args, { cwd: cwd }, function (err, stdout, stderr) {
      cb(err, stdout, stderr);
    });
  }

  run('git', ['add', folderArg], repoRoot, function (err) {
    if (err) return res.status(500).json({ success: false, error: 'git add failed: ' + err.message });
    run('git', ['commit', '-m', commitMsg], repoRoot, function (err, stdout) {
      var nothingToCommit = stdout && stdout.includes('nothing to commit');
      if (err && !nothingToCommit) return res.status(500).json({ success: false, error: 'git commit failed: ' + err.message });
      run('git', ['push'], repoRoot, function (err) {
        if (err) return res.status(500).json({ success: false, error: 'git push failed: ' + err.message });
        res.json({ success: true, url: publicUrl, alreadyPublished: !!nothingToCommit });
      });
    });
  });
});

// Static: serve frozen finished presentations (index.html + assets/)
// Mounted before /view redirect so relative asset paths resolve correctly.
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

// GET /api/slide-library — return the slide library catalog
app.get('/api/slide-library', function (req, res) {
  try {
    var library = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'));
    res.json({ success: true, data: library.slides });
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

    var library  = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'));
    var newSlide = {
      id: 'lib-' + Date.now(),
      name: name,
      templateId: templateId,
      edits: {}
    };
    library.slides.push(newSlide);
    fs.writeFileSync(LIBRARY_PATH, JSON.stringify(library, null, 2), 'utf8');
    res.json({ success: true, data: newSlide });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Page: slides ──────────────────────────────────────────────────────────────
app.get('/slides', function (_req, res) {
  res.sendFile(path.join(__dirname, 'features/slides/index.html'));
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
      createdAt: new Date().toISOString()
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
    var layouts = JSON.parse(fs.readFileSync(LAYOUTS_PATH, 'utf8'));
    var idx = layouts.findIndex(function (l) { return l.id === req.params.id; });
    if (idx === -1) return res.status(404).json({ success: false, error: 'Layout not found' });
    layouts[idx] = Object.assign({}, layouts[idx], req.body, { id: req.params.id });
    fs.writeFileSync(LAYOUTS_PATH, JSON.stringify(layouts, null, 2), 'utf8');
    res.json({ success: true, data: layouts[idx] });
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

    var deck = JSON.parse(fs.readFileSync(DECK_PATH, 'utf8'));

    if (inDeck) {
      var existing = deck.slides.find(function (s) { return s.layoutId === id; });
      if (existing) {
        return res.json({ success: true, alreadyInDeck: true });
      }
      deck.slides.push({ id: 'deck-slide-' + Date.now(), layoutId: id, visible: true });
      fs.writeFileSync(DECK_PATH, JSON.stringify(deck, null, 2), 'utf8');
      return res.json({ success: true, inDeck: true });
    }

    // inDeck: false — remove any deck slide backed by this layout
    deck.slides = deck.slides.filter(function (s) { return s.layoutId !== id; });
    fs.writeFileSync(DECK_PATH, JSON.stringify(deck, null, 2), 'utf8');
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
// POST /api/upload-image  { filename: 'logo.png', data: 'data:image/png;base64,...' }
app.post('/api/upload-image', function (req, res) {
  var filename = req.body.filename;
  var dataUrl  = req.body.data;

  if (!filename || !dataUrl) return res.status(400).json({ error: 'Missing filename or data' });

  // Sanitize filename — no path traversal
  filename = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '-');

  var matches = dataUrl.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
  if (!matches) return res.status(400).json({ error: 'Invalid image data' });

  try {
    var uploadsDir = path.join(__dirname, 'features/slides/uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    fs.writeFileSync(path.join(uploadsDir, filename), Buffer.from(matches[2], 'base64'));
    res.json({ ok: true, path: '/slides/uploads/' + filename });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── API: save an image src attribute back to the slide file ───────────────────
// POST /api/save-image-src  { slide: 'slide-01-cover', editKey: 'customer-logo', src: '/slides/uploads/logo.png' }
app.post('/api/save-image-src', function (req, res) {
  var slide   = req.body.slide;
  var editKey = req.body.editKey;
  var src     = req.body.src;

  if (!slide || !editKey || !src) return res.status(400).json({ error: 'Missing params' });
  if (!/^slide-[\w-]+$/.test(slide)) return res.status(400).json({ error: 'Invalid slide name' });

  var filePath = path.join(__dirname, 'features/slides', slide + '.html');
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Slide not found' });

  try {
    var html = fs.readFileSync(filePath, 'utf8');
    var $    = cheerio.load(html, { decodeEntities: false }, false);
    $('[data-edit="' + editKey + '"] img').first().attr('src', src);
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
      $(this).attr('src', '/slides/shared/placeholder.png');
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
    var deck = JSON.parse(fs.readFileSync(DECK_PATH, 'utf8'));
    deck.slides.push({ id: newId, visible: true });
    fs.writeFileSync(DECK_PATH, JSON.stringify(deck, null, 2), 'utf8');

    res.json({ ok: true, data: newEntry });
  } catch (err) {
    console.error('Clone error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, function () {
  console.log('Builder running at http://localhost:' + PORT);
  console.log('Preview:  http://localhost:' + PORT + '/builder/preview.html');
});
