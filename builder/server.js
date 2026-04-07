require('dotenv').config();

const express  = require('express');
const path     = require('path');
const fs       = require('fs');
const cheerio  = require('cheerio');
const session  = require('express-session');
const { requireAuth, registerAuthRoutes } = require('./features/auth/auth');

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

var ROW_HEIGHTS = { 'auto': 'auto', 'tall': '280px', 'short': '120px' };

var COMPONENT_DUMMY = {
  title: '<div class="lsc-title">Slide Title</div>',
  subtitle: '<div class="lsc-subtitle">Supporting headline goes here</div>',
  text: '<div class="lsc-text">Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</div>',
  tabs: [
    '<div class="lsc-tabs">',
    '  <div class="lsc-tab-list">',
    '    <button class="lsc-tab active">Tab 1</button>',
    '    <button class="lsc-tab">Tab 2</button>',
    '  </div>',
    '  <div class="lsc-tab-content">Tab content goes here</div>',
    '</div>'
  ].join('\n'),
  carousel: [
    '<div class="lsc-carousel">',
    '  <div class="lsc-carousel-icon">&#9654;</div>',
    '  <div class="lsc-carousel-label">Image Carousel</div>',
    '</div>'
  ].join('\n'),
  table: [
    '<table class="lsc-table">',
    '  <thead><tr><th>Column A</th><th>Column B</th><th>Column C</th></tr></thead>',
    '  <tbody>',
    '    <tr><td>Row 1A</td><td>Row 1B</td><td>Row 1C</td></tr>',
    '    <tr><td>Row 2A</td><td>Row 2B</td><td>Row 2C</td></tr>',
    '  </tbody>',
    '</table>'
  ].join('\n'),
  list: [
    '<ul class="lsc-list">',
    '  <li>List item one</li>',
    '  <li>List item two</li>',
    '  <li>List item three</li>',
    '  <li>List item four</li>',
    '</ul>'
  ].join('\n'),
  button: '<button class="lsc-button">Call to Action</button>'
};

var LAYOUT_CSS = [
  '.ls-custom { padding: 60px 80px; display: flex; flex-direction: column; gap: 16px; }',
  '.ls-custom .lsc-row { display: grid; gap: 16px; width: 100%; }',
  '.ls-custom .lsc-col { display: flex; flex-direction: column; gap: 12px; min-width: 0; }',
  '.ls-custom .lsc-title { font-size: clamp(24px, 3vw, 42px); font-weight: 700; color: #fff; border-bottom: 2px solid #F5A623; padding-bottom: 8px; }',
  '.ls-custom .lsc-subtitle { font-size: clamp(14px, 1.5vw, 20px); color: #aaa; }',
  '.ls-custom .lsc-text { font-size: 14px; color: #ccc; line-height: 1.6; }',
  '.ls-custom .lsc-tabs { display: flex; flex-direction: column; gap: 8px; }',
  '.ls-custom .lsc-tab-list { display: flex; gap: 4px; }',
  '.ls-custom .lsc-tab { padding: 6px 16px; border-radius: 100px; border: 1px solid rgba(255,255,255,0.1); background: transparent; color: #aaa; font-size: 12px; cursor: pointer; }',
  '.ls-custom .lsc-tab.active { background: rgba(245,166,35,0.15); border-color: rgba(245,166,35,0.3); color: #F5A623; }',
  '.ls-custom .lsc-tab-content { padding: 12px; border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; color: #aaa; font-size: 13px; }',
  '.ls-custom .lsc-carousel { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 140px; gap: 8px; }',
  '.ls-custom .lsc-carousel-icon { font-size: 28px; color: #F5A623; }',
  '.ls-custom .lsc-carousel-label { font-size: 12px; color: #aaa; }',
  '.ls-custom .lsc-table { width: 100%; border-collapse: collapse; font-size: 12px; color: #ccc; }',
  '.ls-custom .lsc-table th { background: rgba(245,166,35,0.1); color: #F5A623; padding: 8px 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }',
  '.ls-custom .lsc-table td { padding: 7px 12px; border-bottom: 1px solid rgba(255,255,255,0.05); }',
  '.ls-custom .lsc-table tr:last-child td { border-bottom: none; }',
  '.ls-custom .lsc-list { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 8px; }',
  '.ls-custom .lsc-list li { padding-left: 16px; position: relative; color: #ccc; font-size: 13px; }',
  '.ls-custom .lsc-list li::before { content: "\\203A"; position: absolute; left: 0; color: #F5A623; }',
  '.ls-custom .lsc-button { padding: 10px 28px; border-radius: 100px; background: linear-gradient(135deg, #F5A623, #e8850a); border: none; color: #000; font-size: 14px; font-weight: 700; cursor: pointer; align-self: flex-start; }',
  '@media (max-width: 768px) {',
  '  .ls-custom { padding: 60px 16px 80px; }',
  '  .ls-custom .lsc-row { grid-template-columns: 1fr !important; }',
  '}'
].join('\n');

function renderComponentHtml(type) {
  return COMPONENT_DUMMY[type] || ('<div class="lsc-text">[' + type + ']</div>');
}

function renderLayoutToHtml(layout, slideId) {
  var rows = Array.isArray(layout.rows) ? layout.rows : [];

  var rowsHtml = rows.map(function (row) {
    var cols     = Array.isArray(row.columns) ? row.columns : [];
    var gridCols = COL_LAYOUTS[row.layout] || '1fr';
    var minH     = ROW_HEIGHTS[row.height] || 'auto';
    var rowStyle = 'grid-template-columns:' + gridCols + '; min-height:' + minH + ';';

    var colsHtml = cols.map(function (col) {
      var components = Array.isArray(col.components) ? col.components : [];
      var innerHtml  = components.map(function (c) {
        return renderComponentHtml(c.type || c);
      }).join('\n      ');
      return '    <div class="lsc-col">\n      ' + innerHtml + '\n    </div>';
    }).join('\n');

    return '  <div class="lsc-row" style="' + rowStyle + '">\n' + colsHtml + '\n  </div>';
  }).join('\n');

  return [
    '<style>',
    LAYOUT_CSS,
    '</style>',
    '<div class="slide content ls-custom" data-slide="' + slideId + '">',
    rowsHtml,
    '</div>',
    '<script>',
    '  if (window.PE && typeof PE.initSlide === "function") { PE.initSlide(); }',
    '</script>'
  ].join('\n');
}

app.get('/slides/deck-slide-:id.html', function (req, res, next) {
  var rawId = req.params.id;

  // Sanitize: only digits (timestamp IDs are all-numeric)
  if (!/^\d+$/.test(rawId)) return next();

  var slideId = 'deck-slide-' + rawId;

  try {
    var deck    = JSON.parse(fs.readFileSync(DECK_PATH, 'utf8'));
    var slide   = deck.slides.find(function (s) { return s.id === slideId; });
    if (!slide || !slide.layoutId) return next();

    var layouts = JSON.parse(fs.readFileSync(LAYOUTS_PATH, 'utf8'));
    var layout  = layouts.find(function (l) { return l.id === slide.layoutId; });
    if (!layout) return next();

    var html = renderLayoutToHtml(layout, slideId);
    res.type('text/html').send(html);
  } catch (err) {
    console.error('Layout render error:', err.message);
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

// ── API: deck config ──────────────────────────────────────────────────────────
var DECK_PATH    = path.join(__dirname, 'data', 'deck.json');
var LIBRARY_PATH = path.join(__dirname, 'data', 'slide-library.json');
var LAYOUTS_PATH = path.join(__dirname, 'data', 'layouts.json');

// GET /api/deck — return the current deck config, with layout data merged in for layout-backed slides
app.get('/api/deck', function (req, res) {
  try {
    var deck    = JSON.parse(fs.readFileSync(DECK_PATH, 'utf8'));
    var layouts = JSON.parse(fs.readFileSync(LAYOUTS_PATH, 'utf8'));

    deck.slides = deck.slides.map(function (slide) {
      if (!slide.layoutId) return slide;
      var layout = layouts.find(function (l) { return l.id === slide.layoutId; });
      if (!layout) return slide;
      return Object.assign({}, slide, { name: layout.name, rows: layout.rows });
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
      merged.slides = merged.slides.map(function (s) {
        var clean = { id: s.id, visible: s.visible };
        if (s.layoutId) clean.layoutId = s.layoutId;
        return clean;
      });
    }
    fs.writeFileSync(DECK_PATH, JSON.stringify(merged, null, 2), 'utf8');
    res.json({ success: true, data: merged });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/deck/slides — add a layout-backed slide to the deck
// Body: { layoutId: "layout-..." }
app.post('/api/deck/slides', function (req, res) {
  var layoutId = req.body && req.body.layoutId;
  if (!layoutId || typeof layoutId !== 'string') {
    return res.status(400).json({ success: false, error: 'layoutId is required' });
  }

  try {
    var layouts = JSON.parse(fs.readFileSync(LAYOUTS_PATH, 'utf8'));
    var layout  = layouts.find(function (l) { return l.id === layoutId; });
    if (!layout) return res.status(404).json({ success: false, error: 'Layout not found: ' + layoutId });

    var deck     = JSON.parse(fs.readFileSync(DECK_PATH, 'utf8'));
    var newSlide = { id: 'deck-slide-' + Date.now(), layoutId: layoutId, visible: true };
    deck.slides.push(newSlide);
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

// GET /api/slide-library — return the slide template catalog
app.get('/api/slide-library', function (req, res) {
  try {
    var library = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'));
    res.json({ success: true, data: library });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/slide-library/:id — remove an entry from the slide library by id (does not delete the .html file)
app.delete('/api/slide-library/:id', function (req, res) {
  try {
    var library  = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'));
    var filtered = library.filter(function (e) { return e.id !== req.params.id; });
    fs.writeFileSync(LIBRARY_PATH, JSON.stringify(filtered, null, 2), 'utf8');
    res.json({ success: true });
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
