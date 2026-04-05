/**
 * lightbox.js — Presentation Builder Lightbox Component
 *
 * Single-image mode:
 *   Lightbox.open('/slides/uploads/image.png', 'Caption')
 *
 * Gallery mode (prev/next + thumbnails):
 *   Lightbox.openGallery([
 *     { src: '/slides/uploads/a.png', caption: 'A' },
 *     { src: '/slides/uploads/b.png', caption: 'B' }
 *   ], 0)
 *
 * Declarative (auto-wired by Lightbox.init):
 *   <img src="..." alt="Caption" data-zoom>
 *   <img src="..." alt="Caption" data-zoom data-track="ls6:zoom:diagram">
 *
 * Gallery group — all [data-zoom] imgs inside the same [data-zoom-group] share
 * a gallery when any one is clicked:
 *   <div data-zoom-group>
 *     <img src="a.png" alt="A" data-zoom>
 *     <img src="b.png" alt="B" data-zoom>
 *   </div>
 *
 * Backwards-compatible aliases: window.openLb / window.closeLb
 */

window.Lightbox = (function () {

  // ── Inject cursor style ──────────────────────────────────────────────────
  (function injectStyle() {
    var style = document.createElement('style');
    style.textContent = '[data-zoom]{cursor:zoom-in;}';
    document.head.appendChild(style);
  })();

  // ── Internal state ───────────────────────────────────────────────────────
  var gallery       = [];   // [{ src, caption }]
  var galIdx        = 0;
  var activeCarousel = null; // carousel element that triggered the current open

  // ── DOM refs (resolved lazily after DOMContentLoaded) ───────────────────
  function lb()     { return document.getElementById('lightbox'); }
  function lbImg()  { return document.getElementById('lb-img'); }
  function lbCap()  { return document.getElementById('lb-cap'); }
  function lbPrev() { return document.getElementById('lb-prev'); }
  function lbNext() { return document.getElementById('lb-next'); }
  function lbThumbs(){ return document.getElementById('lb-thumbs'); }

  // ── Render current gallery index ─────────────────────────────────────────
  function render() {
    var item = gallery[galIdx] || {};
    var img  = lbImg();
    var cap  = lbCap();
    var prev = lbPrev();
    var next = lbNext();
    var thumbsEl = lbThumbs();

    if (img) { img.src = item.src || ''; img.alt = item.caption || ''; }
    if (cap) cap.textContent = item.caption || '';

    // Nav buttons — hide if single image
    if (prev) { prev.style.display = gallery.length > 1 ? '' : 'none'; prev.disabled = galIdx <= 0; }
    if (next) { next.style.display = gallery.length > 1 ? '' : 'none'; next.disabled = galIdx >= gallery.length - 1; }

    // Thumbnails — hide if single image
    if (thumbsEl) {
      thumbsEl.style.display = gallery.length > 1 ? '' : 'none';
      thumbsEl.innerHTML = '';
      if (gallery.length > 1) {
        gallery.forEach(function (item, i) {
          var t  = document.createElement('div');
          t.className = 'lb-thumb' + (i === galIdx ? ' active' : '');
          var ti = document.createElement('img');
          ti.src = item.src; ti.alt = item.caption || '';
          t.appendChild(ti);
          t.addEventListener('click', function () { galIdx = i; render(); });
          thumbsEl.appendChild(t);
        });
      }
    }
  }

  // ── Open single image ────────────────────────────────────────────────────
  function open(src, alt) {
    gallery = [{ src: src || '', caption: alt || '' }];
    galIdx  = 0;
    render();
    var l = lb(); if (l) l.classList.add('on');
  }

  // ── Open gallery ─────────────────────────────────────────────────────────
  function openGallery(items, startIndex) {
    gallery = items || [];
    galIdx  = startIndex || 0;
    render();
    var l = lb(); if (l) l.classList.add('on');
  }

  // ── Close ────────────────────────────────────────────────────────────────
  function close() {
    var l = lb();
    if (l) {
      l.classList.remove('on');
      l.classList.remove('has-carousel');
    }
    // Sync originating carousel to the index last viewed in the lightbox
    if (activeCarousel && typeof activeCarousel._lsGoTo === 'function') {
      activeCarousel._lsGoTo(galIdx);
    }
    activeCarousel = null;
  }

  // ── Keyboard + backdrop + nav wiring ─────────────────────────────────────
  document.addEventListener('keydown', function (e) {
    var l = lb(); if (!l || !l.classList.contains('on')) return;
    if (e.key === 'Escape')      close();
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown')  { if (galIdx < gallery.length - 1) { galIdx++; render(); } }
    if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')    { if (galIdx > 0) { galIdx--; render(); } }
  });

  document.addEventListener('DOMContentLoaded', function () {
    var l      = lb();
    var closeB = document.getElementById('lb-close');
    var prev   = lbPrev();
    var next   = lbNext();

    if (closeB) closeB.addEventListener('click', close);
    if (l) l.addEventListener('click', function (e) { if (e.target === l || e.target.id === 'lb-inner' || e.target === lbImg()) { if (e.target !== lbImg()) close(); } });

    if (prev) prev.addEventListener('click', function () { if (galIdx > 0) { galIdx--; render(); } });
    if (next) next.addEventListener('click', function () { if (galIdx < gallery.length - 1) { galIdx++; render(); } });
  });

  // ── init(root) — wire [data-zoom] elements ────────────────────────────────
  function init(root) {
    if (!root) root = document;
    var els = root.querySelectorAll('[data-zoom]');
    els.forEach(function (el) {
      if (el._lsZoomInit) return;
      el._lsZoomInit = true;
      el.addEventListener('click', function (e) {
        e.stopPropagation();

        // Build gallery from group or single
        var group = el.closest('[data-zoom-group]');
        var items, startIdx;

        if (group) {
          var siblings = Array.from(group.querySelectorAll('[data-zoom]'));
          items    = siblings.map(function (s) {
            return { src: s.src || s.getAttribute('data-src') || '', caption: s.alt || s.getAttribute('data-alt') || '' };
          });
          startIdx = siblings.indexOf(el);
          // Track which carousel triggered this open for sync-back on close
          activeCarousel = group.classList.contains('ls-carousel') ? group : null;
        } else {
          items    = [{ src: el.src || el.getAttribute('data-src') || '', caption: el.alt || el.getAttribute('data-alt') || '' }];
          startIdx = 0;
          activeCarousel = null;
        }

        openGallery(items, startIdx);
        // Show/hide "Add Image" button in lightbox based on carousel source
        var lbEl = lb();
        if (lbEl) lbEl.classList.toggle('has-carousel', !!activeCarousel);

        // Fire tracking
        var track = el.getAttribute('data-track');
        if (track && window.Track) {
          var parts = track.split(':');
          if (parts.length >= 3) Track.zoom(parts[0], parts.slice(2).join('-'));
          else Track.event(track);
        }
      });
    });
  }

  function triggerAddImage() {
    if (activeCarousel) {
      var addBtn = activeCarousel.querySelector('.ls-carousel-add');
      if (addBtn) { close(); addBtn.click(); }
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────
  return { open: open, openGallery: openGallery, close: close, init: init, triggerAddImage: triggerAddImage };

})();

// ── Backwards-compatible aliases ──────────────────────────────────────────────
window.openLb  = function (src, alt) { window.Lightbox.open(src, alt); };
window.closeLb = function ()         { window.Lightbox.close(); };
