/* Dashboard — Presentation Builder */

// ── State ──────────────────────────────────────────────────────────────────

let deck = { title: '', slides: [] };
let library = [];
let activePreview = null; // { origin: 'deck'|'library', slideId }

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
}

function buildDeckRow(slide, index) {
  const li = document.createElement('li');
  li.className = 'deck-row';
  li.dataset.id = slide.id;
  li.draggable = true;

  const isVisible = slide.visible !== false; // default to true if undefined
  const hiddenBadge = isVisible ? '' : '<span class="badge-hidden">Extras Menu</span>';
  const slideLabel = slide.name || idToLabel(slide.id);
  const libraryBadge = slide.layoutId
    ? '<span class="badge-library" title="From slide library">Custom</span>'
    : '';

  li.innerHTML =
    '<span class="drag-handle" aria-hidden="true">&#8942;</span>' +
    '<span class="slide-num">' + (index + 1) + '</span>' +
    '<span class="slide-title' + (isVisible ? '' : ' is-hidden') + '">' +
      escapeText(slideLabel) +
    '</span>' +
    libraryBadge +
    hiddenBadge +
    '<button class="btn-visibility' + (isVisible ? ' is-visible' : '') + '" ' +
      'title="' + (isVisible ? 'Hide slide' : 'Show slide') + '" ' +
      'aria-label="' + (isVisible ? 'Hide' : 'Show') + ' slide">' +
      (isVisible ? eyeIcon() : eyeOffIcon()) +
    '</button>' +
    '<button class="btn-remove" title="Remove slide" aria-label="Remove slide">' +
      '&times;' +
    '</button>';

  li.querySelector('.slide-title').addEventListener('click', function () {
    showPreview(slide.id, 'deck');
  });

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
  const available = library.filter(function (item) { return !deckIds.has(item.id); });

  if (available.length === 0) {
    // All slides are already in the deck — show empty state with action buttons
    const empty = document.createElement('div');
    empty.className = 'library-empty-state';
    empty.innerHTML =
      '<p class="deck-placeholder">All slides are in the deck.</p>' +
      '<div class="library-empty-actions">' +
        '<button class="btn-add-new" disabled>Add New</button>' +
        '<button class="btn-clone">Clone Existing</button>' +
      '</div>';

    empty.querySelector('.btn-clone').addEventListener('click', function () {
      openCloneDialog();
    });

    gridEl.appendChild(empty);
    return;
  }

  available.forEach(function (item) {
    gridEl.appendChild(buildLibCard(item));
  });
}

function buildLibCard(item) {
  const card = document.createElement('div');
  card.className = 'lib-card';
  card.dataset.id = item.id;

  card.innerHTML =
    '<div class="lib-card-label">' + escapeText(item.label) + '</div>' +
    '<div class="lib-card-footer">' +
      '<span class="badge-category" title="' + escapeText(item.category) + '">' +
        escapeText(item.category) +
      '</span>' +
      '<button class="btn-add">Add</button>' +
    '</div>';

  card.querySelector('.btn-add').addEventListener('click', function (e) {
    e.stopPropagation();
    addSlide(item, e.currentTarget);
  });

  if (item.category === 'custom') {
    var delBtn = document.createElement('button');
    delBtn.className = 'btn-lib-delete';
    delBtn.title = 'Delete slide';
    delBtn.textContent = '×';
    delBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!confirm('Delete "' + item.label + '" from the library? This cannot be undone.')) return;
      deleteFromLibrary(item.id);
    });
    card.appendChild(delBtn);
  }

  card.addEventListener('click', function () {
    showPreview(item.id, 'library');
  });

  return card;
}

function deleteFromLibrary(id) {
  fetch('/api/slide-library/' + id, { method: 'DELETE' })
    .then(function (r) { return r.json(); })
    .then(function () {
      library = library.filter(function (s) { return s.id !== id; });
      renderLibrary();
    })
    .catch(console.error);
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
  renderLibrary();
}

function removeSlide(id) {
  deck.slides = deck.slides.filter(function (s) { return s.id !== id; });
  putDeck().catch(console.error);
  renderDeck();
  renderLibrary();
}

async function addSlide(item, btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Adding…'; }
  try {
    const res = await fetch('/api/deck/slides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ librarySlideId: item.id })
    });
    if (!res.ok) throw new Error('POST /api/deck/slides failed');
    const json = await res.json();
    deck.slides.push(json.data);
    renderDeck();
    renderLibrary();
    if (btn) { btn.textContent = 'Added ✓'; setTimeout(function () { btn.textContent = 'Add'; btn.disabled = false; }, 1500); }
  } catch (e) {
    console.error('Failed to add slide:', e);
    if (btn) { btn.textContent = 'Add'; btn.disabled = false; }
  }
}

// ── Clone Slide ────────────────────────────────────────────────────────────

async function cloneSlide(sourceId) {
  try {
    const res = await fetch('/api/clone-slide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId })
    });
    if (!res.ok) throw new Error('POST /api/clone-slide failed');
    const json = await res.json();
    const newSlide = json.data || json; // { id, label, category }
    library.push(newSlide);
    renderLibrary();
    console.log('Clone created:', newSlide.id);
  } catch (e) {
    console.error('Failed to clone slide:', e);
  }
}

function openCloneDialog() {
  const gridEl = document.getElementById('libraryGrid');

  if (deck.slides.length === 0) {
    console.log('No slides in deck to clone.');
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'clone-dialog';

  const options = deck.slides.map(function (s) {
    return '<option value="' + escapeText(s.id) + '">' + escapeText(idToLabel(s.id)) + '</option>';
  }).join('');

  wrapper.innerHTML =
    '<p>Select a slide to clone:</p>' +
    '<select class="clone-select">' + options + '</select>' +
    '<div class="clone-dialog-actions">' +
      '<button class="btn-clone-confirm">Clone</button>' +
      '<button class="btn-clone-cancel">Cancel</button>' +
    '</div>';

  wrapper.querySelector('.btn-clone-confirm').addEventListener('click', function () {
    const selectedId = wrapper.querySelector('.clone-select').value;
    cloneSlide(selectedId);
  });

  wrapper.querySelector('.btn-clone-cancel').addEventListener('click', function () {
    renderLibrary();
  });

  gridEl.innerHTML = '';
  gridEl.appendChild(wrapper);
}

// ── Preview ────────────────────────────────────────────────────────────────

function showPreview(slideId, origin) {
  activePreview = { origin, slideId };

  const SLIDE_W = 1280;
  const SLIDE_H = 720;

  // Measure the panel that will show the preview
  var panelEl = origin === 'deck'
    ? document.querySelector('.panel-library')
    : document.querySelector('.panel-deck');
  var headerEl2 = panelEl ? panelEl.querySelector('.panel-header') : null;

  var panelW = panelEl ? panelEl.clientWidth : 500;
  var panelH = panelEl ? panelEl.clientHeight : 400;
  var headerH = headerEl2 ? headerEl2.offsetHeight : 70;

  // Fit the slide inside available space (width × height), maintaining 16:9
  var availW = panelW;
  var availH = panelH - headerH - 16; // 16px breathing room
  var scaleW = availW / SLIDE_W;
  var scaleH = availH / SLIDE_H;
  var scale  = Math.min(scaleW, scaleH);

  var fitW   = Math.round(SLIDE_W * scale);
  var fitH   = Math.round(SLIDE_H * scale);

  const thumbnailHtml =
    '<div class="preview-thumbnail" id="preview-thumb-active" onclick="openPreviewLightbox(\'' + slideId + '\')" title="Click to zoom" style="width:' + fitW + 'px;height:' + fitH + 'px;overflow:hidden;cursor:pointer;position:relative;">' +
      '<div class="preview-scale-wrap" style="width:' + SLIDE_W + 'px;height:' + SLIDE_H + 'px;transform:scale(' + scale + ');transform-origin:top left;">' +
        '<iframe ' +
          'src="/slides/preview/' + slideId + '" ' +
          'style="width:' + SLIDE_W + 'px;height:' + SLIDE_H + 'px;border:none;" ' +
          'scrolling="no" ' +
          'title="Slide preview"' +
        '></iframe>' +
      '</div>' +
      '<div class="preview-zoom-hint">&#x26F6; Click to zoom</div>' +
    '</div>';

  const closeBtn =
    '<button class="btn-close-preview" onclick="closePreview()">&#x2715; Close Preview</button>';

  if (origin === 'deck') {
    const headerEl = document.querySelector('.panel-library .panel-header');
    const gridEl = document.getElementById('libraryGrid');
    if (headerEl) {
      const existing = headerEl.querySelector('.btn-close-preview');
      if (existing) existing.remove();
      headerEl.insertAdjacentHTML('beforeend', closeBtn);
    }
    gridEl.innerHTML = thumbnailHtml;
  } else {
    const headerEl = document.querySelector('.panel-deck .panel-header');
    const listEl = document.getElementById('deckList');
    if (headerEl) {
      const existing = headerEl.querySelector('.btn-close-preview');
      if (existing) existing.remove();
      headerEl.insertAdjacentHTML('beforeend', closeBtn);
    }
    listEl.innerHTML = thumbnailHtml;
  }

}

function openPreviewLightbox(slideId) {
  const existing = document.getElementById('preview-lightbox');
  if (existing) existing.remove();

  const lb = document.createElement('div');
  lb.id = 'preview-lightbox';
  lb.className = 'preview-lightbox';
  lb.innerHTML =
    '<div class="preview-lightbox-inner">' +
      '<div class="preview-lightbox-actions">' +
        '<a class="btn-lightbox-edit" href="/builder/preview.html" target="_blank">Edit Slide &#x2192;</a>' +
        '<button class="preview-lightbox-close" onclick="closePreviewLightbox()">&#x2715;</button>' +
      '</div>' +
      '<iframe ' +
        'src="/slides/preview/' + slideId + '" ' +
        'style="width:100%;height:100%;border:none;" ' +
        'title="Slide fullscreen preview"' +
      '></iframe>' +
    '</div>';

  lb.addEventListener('click', function (e) {
    if (e.target === lb) closePreviewLightbox();
  });

  document.body.appendChild(lb);

  document.addEventListener('keydown', function escHandler(e) {
    if (e.key === 'Escape') {
      closePreviewLightbox();
      document.removeEventListener('keydown', escHandler);
    }
  });
}

function closePreviewLightbox() {
  const lb = document.getElementById('preview-lightbox');
  if (lb) lb.remove();
}

function closePreview() {
  if (!activePreview) return;

  const origin = activePreview.origin;
  activePreview = null;

  if (origin === 'deck') {
    const headerEl = document.querySelector('.panel-library .panel-header');
    if (headerEl) {
      const btn = headerEl.querySelector('.btn-close-preview');
      if (btn) btn.remove();
    }
    renderLibrary();
  } else {
    const headerEl = document.querySelector('.panel-deck .panel-header');
    if (headerEl) {
      const btn = headerEl.querySelector('.btn-close-preview');
      if (btn) btn.remove();
    }
    renderDeck();
  }
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
