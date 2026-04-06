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

// ── Static: customer uploads ──────────────────────────────────────────────────
app.use('/slides/uploads', express.static(path.join(__dirname, 'features/slides/uploads')));

// ── Static: shared brand assets (logos) ──────────────────────────────────────
app.use('/slides/shared', express.static(path.join(__dirname, 'shared/assets')));

// ── Static: shared app styles ─────────────────────────────────────────────────
app.use('/shared', express.static(path.join(__dirname, 'shared')));

// ── Static: slide files ───────────────────────────────────────────────────────
app.use('/slides', express.static(path.join(__dirname, 'features/slides')));

// ── Static: dashboard ─────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'features/dashboard')));

// ── Static: builder UI ────────────────────────────────────────────────────────
app.use('/builder', express.static(path.join(__dirname, 'features/builder-ui')));

// ── API: deck config ──────────────────────────────────────────────────────────
var DECK_PATH    = path.join(__dirname, 'data', 'deck.json');
var LIBRARY_PATH = path.join(__dirname, 'data', 'slide-library.json');

// GET /api/deck — return the current deck config
app.get('/api/deck', function (req, res) {
  try {
    var deck = JSON.parse(fs.readFileSync(DECK_PATH, 'utf8'));
    res.json({ success: true, data: deck });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/deck — overwrite the deck config
// Body must be: { title: string (optional), slides: [{ id: string, visible: boolean }] }
app.put('/api/deck', function (req, res) {
  var body = req.body;

  if (!body || !Array.isArray(body.slides)) {
    return res.status(400).json({ success: false, error: 'Body must include a slides array' });
  }

  for (var i = 0; i < body.slides.length; i++) {
    var s = body.slides[i];
    if (typeof s.id !== 'string' || typeof s.visible !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'Each slide must have id (string) and visible (boolean). Failed at index ' + i
      });
    }
  }

  try {
    fs.writeFileSync(DECK_PATH, JSON.stringify(body, null, 2), 'utf8');
    res.json({ success: true, data: body });
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
