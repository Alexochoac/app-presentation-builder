/* Dashboard — Presentation Builder */

// ── State ──────────────────────────────────────────────────────────────────

let deck = { title: '', slides: [] };
let library = [];

// ── Boot ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function () {
  loadDeck();
  loadLibrary();
});

// ── API Helpers ────────────────────────────────────────────────────────────

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Request failed: ' + url);
  return res.json();
}

async function putDeck() {
  const res = await fetch('/api/deck', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(deck)
  });
  if (!res.ok) throw new Error('PUT /api/deck failed');
  const json = await res.json();
  const updated = json.data || json;
  if (updated.title) deck.title = updated.title;
}

// ── Load Deck ──────────────────────────────────────────────────────────────

async function loadDeck() {
  try {
    const res = await fetchJSON('/api/deck');
    deck = res.data || res;
    renderDeck();
  } catch (e) {
    console.error('Failed to load deck:', e);
    document.getElementById('deckList').innerHTML =
      '<li class="deck-placeholder">Could not load deck.</li>';
  }
}

async function loadLibrary() {
  try {
    const res = await fetchJSON('/api/slide-library');
    library = res.data || res;
    renderLibrary();
  } catch (e) {
    console.error('Failed to load library:', e);
    document.getElementById('libraryGrid').innerHTML =
      '<div class="deck-placeholder">Could not load library.</div>';
  }
}

// ── Slide ID → Human Label ─────────────────────────────────────────────────

function idToLabel(id) {
  // "slide-03-why-us" → "Why Us"
  // strips leading "slide-NN-" prefix, then title-cases the rest
  const cleaned = id.replace(/^slide-\d+-/, '').replace(/-/g, ' ');
  return cleaned.replace(/\b\w/g, function (c) { return c.toUpperCase(); });
}

// ── Render Deck ────────────────────────────────────────────────────────────

function renderDeck() {
  const titleEl = document.getElementById('deckTitle');
  const listEl = document.getElementById('deckList');
  const emptyEl = document.getElementById('deckEmpty');

  titleEl.textContent = deck.title || 'Untitled Presentation';

  if (!deck.slides || deck.slides.length === 0) {
    listEl.innerHTML = '';
    emptyEl.classList.remove('hidden');
    return;
  }

  emptyEl.classList.add('hidden');
  listEl.innerHTML = '';

  deck.slides.forEach(function (slide, index) {
    listEl.appendChild(buildDeckRow(slide, index));
  });

  // Re-sync library cards after deck changes
  syncLibraryState();
}

function buildDeckRow(slide, index) {
  const li = document.createElement('li');
  li.className = 'deck-row';
  li.dataset.id = slide.id;
  li.draggable = true;

  const isVisible = slide.visible !== false; // default to true if undefined

  li.innerHTML =
    '<span class="drag-handle" aria-hidden="true">&#8942;</span>' +
    '<span class="slide-num">' + (index + 1) + '</span>' +
    '<span class="slide-title' + (isVisible ? '' : ' is-hidden') + '">' +
      escapeText(idToLabel(slide.id)) +
    '</span>' +
    '<button class="btn-visibility' + (isVisible ? ' is-visible' : '') + '" ' +
      'title="' + (isVisible ? 'Hide slide' : 'Show slide') + '" ' +
      'aria-label="' + (isVisible ? 'Hide' : 'Show') + ' slide">' +
      (isVisible ? eyeIcon() : eyeOffIcon()) +
    '</button>' +
    '<button class="btn-remove" title="Remove slide" aria-label="Remove slide">' +
      '&times;' +
    '</button>';

  li.querySelector('.btn-visibility').addEventListener('click', function () {
    toggleVisibility(slide.id);
  });

  li.querySelector('.btn-remove').addEventListener('click', function () {
    removeSlide(slide.id);
  });

  attachDragEvents(li);

  return li;
}

// ── Render Library ─────────────────────────────────────────────────────────

function renderLibrary() {
  const gridEl = document.getElementById('libraryGrid');
  gridEl.innerHTML = '';

  if (!library || library.length === 0) {
    gridEl.innerHTML = '<div class="deck-placeholder">No slides in library.</div>';
    return;
  }

  const deckIds = getDeckIds();

  library.forEach(function (item) {
    gridEl.appendChild(buildLibCard(item, deckIds.has(item.id)));
  });
}

function buildLibCard(item, inDeck) {
  const card = document.createElement('div');
  card.className = 'lib-card' + (inDeck ? ' in-deck' : '');
  card.dataset.id = item.id;

  card.innerHTML =
    '<div class="lib-card-label">' + escapeText(item.label) + '</div>' +
    '<div class="lib-card-footer">' +
      '<span class="badge-category" title="' + escapeText(item.category) + '">' +
        escapeText(item.category) +
      '</span>' +
      (inDeck
        ? '<span class="btn-in-deck">In Deck</span>'
        : '<button class="btn-add">Add</button>') +
    '</div>';

  if (!inDeck) {
    card.querySelector('.btn-add').addEventListener('click', function () {
      addSlide(item);
    });
  }

  return card;
}

// Keep library cards in sync with current deck state without a full re-render
function syncLibraryState() {
  const deckIds = getDeckIds();
  const gridEl = document.getElementById('libraryGrid');

  gridEl.querySelectorAll('.lib-card').forEach(function (card) {
    const id = card.dataset.id;
    const shouldBeInDeck = deckIds.has(id);
    const isInDeck = card.classList.contains('in-deck');

    if (shouldBeInDeck === isInDeck) return;

    // Rebuild just this card
    const item = library.find(function (l) { return l.id === id; });
    if (!item) return;
    const newCard = buildLibCard(item, shouldBeInDeck);
    card.replaceWith(newCard);
  });
}

// ── Deck Mutations ─────────────────────────────────────────────────────────

function getDeckIds() {
  return new Set(deck.slides.map(function (s) { return s.id; }));
}

function toggleVisibility(id) {
  const slide = deck.slides.find(function (s) { return s.id === id; });
  if (!slide) return;
  slide.visible = slide.visible === false ? true : false;
  putDeck().catch(console.error);
  renderDeck();
}

function removeSlide(id) {
  deck.slides = deck.slides.filter(function (s) { return s.id !== id; });
  putDeck().catch(console.error);
  renderDeck();
}

function addSlide(item) {
  if (getDeckIds().has(item.id)) return;
  deck.slides.push({ id: item.id, visible: true });
  putDeck().catch(console.error);
  renderDeck();
  renderLibrary();
}

// ── Drag and Drop (HTML5 native) ───────────────────────────────────────────

let dragSrcId = null;

function attachDragEvents(row) {
  row.addEventListener('dragstart', function (e) {
    dragSrcId = row.dataset.id;
    row.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });

  row.addEventListener('dragend', function () {
    row.classList.remove('dragging');
    document.querySelectorAll('.deck-row').forEach(function (r) {
      r.classList.remove('drag-over');
    });
    dragSrcId = null;
  });

  row.addEventListener('dragover', function (e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (row.dataset.id !== dragSrcId) {
      row.classList.add('drag-over');
    }
  });

  row.addEventListener('dragleave', function () {
    row.classList.remove('drag-over');
  });

  row.addEventListener('drop', function (e) {
    e.preventDefault();
    row.classList.remove('drag-over');

    if (!dragSrcId || row.dataset.id === dragSrcId) return;

    const srcIndex = deck.slides.findIndex(function (s) { return s.id === dragSrcId; });
    const destIndex = deck.slides.findIndex(function (s) { return s.id === row.dataset.id; });
    if (srcIndex === -1 || destIndex === -1) return;

    // Reorder
    const moved = deck.slides.splice(srcIndex, 1)[0];
    deck.slides.splice(destIndex, 0, moved);

    putDeck().catch(console.error);
    renderDeck();
  });
}

// ── Company Settings ───────────────────────────────────────────────────────

function showComingSoon(btn) {
  const msg = document.getElementById('comingSoonMsg');
  msg.classList.remove('hidden');
  // Auto-hide after 3 seconds
  setTimeout(function () {
    msg.classList.add('hidden');
  }, 3000);
}

// ── Utility ────────────────────────────────────────────────────────────────

function escapeText(str) {
  const el = document.createElement('div');
  el.textContent = str;
  return el.innerHTML;
}

function eyeIcon() {
  return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
}

function eyeOffIcon() {
  return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
}
