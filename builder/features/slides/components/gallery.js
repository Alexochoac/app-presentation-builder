/**
 * gallery.js — Presentation Builder Gallery Component
 *
 * Activated when a slide contains:
 *   <div data-ls-gallery data-edit="gallery-track" data-autoplay="8" style="display:none;">
 *     <div class="ls-gallery-slide">...</div>
 *   </div>
 *   <button data-ls-gallery-open>Gallery</button>
 *
 * Usage:
 *   Gallery.init(slideEl)  — call from slide IIFE inside setTimeout
 *
 * Overlay is created as a sibling of the [data-slide] root so position:fixed
 * is not clipped by the slide's CSS transform stacking context.
 *
 * Save mechanism: dispatches 'slide-carousel-save' with editKey = data-edit value.
 * The server's injected save script handles persistence (same event as ls-carousel).
 */

window.Gallery = (function () {

  // ── Inject component styles ───────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('ls-gallery-styles')) return;
    var s = document.createElement('style');
    s.id = 'ls-gallery-styles';
    s.textContent = [
      /* Overlay */
      '.ls-gallery-overlay{position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.70);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;}',
      /* Popup */
      '.ls-gallery-popup{position:relative;background:var(--bg-card);border:1px solid var(--border);border-radius:20px;padding:20px;box-shadow:0 32px 96px rgba(0,0,0,.80);width:min(95vw,1200px);}',
      /* Close button */
      '.ls-gallery-close{position:absolute;top:-14px;right:-14px;width:30px;height:30px;min-width:44px;min-height:44px;border-radius:50%;background:var(--bg-card);border:1px solid var(--border);color:var(--text);font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .2s;font-family:inherit;}',
      '.ls-gallery-close:hover{background:var(--bg-card-hover);}',
      /* Carousel wrap */
      '.ls-gallery-wrap{position:relative;width:100%;height:390px;border-radius:12px;overflow:hidden;border:1px solid var(--border);}',
      '.ls-gallery-track{display:flex;height:100%;transition:transform .55s cubic-bezier(.4,0,.2,1);}',
      /* Slides */
      '.ls-gallery-slide{flex:0 0 100%;width:100%;height:100%;position:relative;background:var(--bg);}',
      '.ls-gallery-slide img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block;}',
      '.ls-gallery-caption{position:absolute;bottom:0;left:0;right:0;padding:8px 16px;background:linear-gradient(transparent,rgba(0,0,0,.75));color:rgba(255,255,255,.85);font-size:11px;font-weight:600;text-align:center;}',
      /* Nav buttons */
      '.ls-gallery-nav{position:absolute;top:50%;transform:translateY(-50%);background:rgba(0,0,0,.50);border:1px solid rgba(255,255,255,.20);color:#fff;font-size:24px;width:38px;height:38px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:5;font-family:inherit;}',
      '.ls-gallery-nav:hover{background:rgba(var(--accent-rgb),.60);}',
      '.ls-gallery-prev{left:10px;}',
      '.ls-gallery-next{right:10px;}',
      /* Text slide */
      '.ls-gallery-slide--text{display:flex;align-items:center;justify-content:center;background:var(--bg);}',
      '.ls-gallery-stat{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:32px;width:100%;text-align:center;}',
      '.ls-gallery-label{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text-muted);}',
      '.ls-gallery-number{font-size:clamp(2.5rem,7vw,5rem);font-weight:900;letter-spacing:-.03em;line-height:1;color:var(--accent);}',
      '.ls-gallery-body-text{font-size:14px;color:var(--text-muted);margin-top:6px;max-width:480px;}',
      /* Builder controls */
      '.ls-gallery-del{position:absolute;top:8px;left:8px;z-index:22;width:22px;height:22px;border-radius:50%;background:rgba(180,30,30,.75);border:1px solid rgba(255,100,100,.30);color:#fff;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .2s;font-family:inherit;}',
      '.ls-gallery-slide:hover .ls-gallery-del{opacity:1;}',
      '.ls-gallery-change{position:absolute;inset:0;z-index:15;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;letter-spacing:.06em;opacity:0;transition:opacity .2s;cursor:pointer;}',
      '.ls-gallery-slide:hover .ls-gallery-change{opacity:1;}',
      '.ls-gallery-move{position:absolute;bottom:10px;z-index:20;width:26px;height:26px;border-radius:50%;background:rgba(0,0,0,.65);border:1px solid rgba(255,255,255,.30);color:#fff;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .2s;font-family:inherit;}',
      '.ls-gallery-slide:hover .ls-gallery-move{opacity:1;}',
      '.ls-gallery-move-l{right:46px;}',
      '.ls-gallery-move-r{right:12px;}',
      /* Thumbnail strip */
      '.ls-gallery-thumbs{display:flex;gap:6px;padding:10px 0 4px;overflow-x:auto;scrollbar-width:thin;scrollbar-color:var(--border) transparent;}',
      '.ls-gallery-thumb{flex:0 0 68px;height:44px;border-radius:8px;border:2px solid var(--border);background:var(--bg-card);background-size:cover;background-position:center;cursor:pointer;transition:border-color .2s;}',
      '.ls-gallery-thumb:hover{border-color:var(--border-hover);}',
      '.ls-gallery-thumb--active{border-color:var(--accent) !important;}',
      '.ls-gallery-thumb--text{display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:700;letter-spacing:.06em;color:var(--accent);text-transform:uppercase;padding:4px;text-align:center;}',
      /* Footer */
      '.ls-gallery-footer{display:flex;align-items:center;justify-content:space-between;padding:8px 2px 0;}',
      '.ls-gallery-auto-label{font-size:11px;color:var(--text-muted);font-weight:600;letter-spacing:.06em;}',
      '.ls-gallery-auto-val{color:var(--text);min-width:14px;display:inline-block;text-align:center;border-bottom:1px solid var(--border);}',
      '.ls-gallery-add-btns{display:flex;gap:6px;}',
      '.ls-gallery-add{font-size:11px;font-weight:700;letter-spacing:.05em;padding:5px 12px;border-radius:20px;cursor:pointer;background:rgba(var(--accent-rgb),.08);border:1px solid var(--border);color:var(--text-muted);font-family:inherit;transition:background .2s,border-color .2s,color .2s;}',
      '.ls-gallery-add:hover{background:rgba(var(--accent-rgb),.15);border-color:var(--accent);color:var(--accent);}',
      /* Desktop */
      '@media(min-width:769px){.ls-gallery-wrap{height:630px;}}',
    ].join('');
    document.head.appendChild(s);
  }

  // ── Build overlay DOM ─────────────────────────────────────────────────────
  function buildOverlay(overlayId) {
    var d = document.createElement('div');
    d.className = 'ls-gallery-overlay';
    d.id = overlayId;
    d.style.display = 'none';
    d.innerHTML = [
      '<div class="ls-gallery-popup">',
      '  <button class="ls-gallery-close" data-gallery-close contenteditable="false">✕</button>',
      '  <div class="ls-gallery-wrap">',
      '    <div class="ls-gallery-track"></div>',
      '    <button class="ls-gallery-nav ls-gallery-prev" data-gallery-prev contenteditable="false">‹</button>',
      '    <button class="ls-gallery-nav ls-gallery-next" data-gallery-next contenteditable="false">›</button>',
      '  </div>',
      '  <div class="ls-gallery-thumbs"></div>',
      '  <div class="ls-gallery-footer" data-builder-only="">',
      '    <span class="ls-gallery-auto-label">Auto <span class="ls-gallery-auto-val" contenteditable spellcheck="false">8</span>s</span>',
      '    <div class="ls-gallery-add-btns">',
      '      <button class="ls-gallery-add" data-gallery-add="image" contenteditable="false">+ Image</button>',
      '      <button class="ls-gallery-add" data-gallery-add="text" contenteditable="false">+ Text</button>',
      '    </div>',
      '  </div>',
      '</div>',
    ].join('');
    return d;
  }

  // ── Create an instance per slide ──────────────────────────────────────────
  function createInstance(overlay, store, slideId) {
    var popup    = overlay.querySelector('.ls-gallery-popup');
    var track    = overlay.querySelector('.ls-gallery-track');
    var thumbEl  = overlay.querySelector('.ls-gallery-thumbs');
    var autoValEl = overlay.querySelector('.ls-gallery-auto-val');
    var idx      = 0;
    var autoTimer = null;

    function slides() { return Array.from(track.querySelectorAll(':scope > .ls-gallery-slide')); }
    function wrapW()  { return overlay.querySelector('.ls-gallery-wrap').offsetWidth || 760; }
    function autoMs() { return (parseInt(store.getAttribute('data-autoplay')) || 8) * 1000; }

    function goTo(i) {
      var all = slides();
      idx = Math.max(0, Math.min(all.length - 1, i));
      track.style.transform = 'translateX(' + (idx * -wrapW()) + 'px)';
      refreshThumbs();
    }

    function startAuto() {
      clearInterval(autoTimer);
      autoTimer = setInterval(function () {
        var all = slides();
        goTo(idx < all.length - 1 ? idx + 1 : 0);
      }, autoMs());
    }
    function stopAuto() { clearInterval(autoTimer); }

    function refreshThumbs() {
      var all = slides();
      thumbEl.innerHTML = '';
      all.forEach(function (s, i) {
        var t = document.createElement('div');
        t.className = 'ls-gallery-thumb' + (i === idx ? ' ls-gallery-thumb--active' : '');
        var img = s.querySelector('img');
        if (img && img.src && img.src !== window.location.href) {
          t.style.backgroundImage = 'url(' + img.src + ')';
        } else {
          t.classList.add('ls-gallery-thumb--text');
          t.textContent = ((s.querySelector('.ls-gallery-label') || {}).textContent || 'Text').slice(0, 14);
        }
        t.addEventListener('click', function () { goTo(i); });
        thumbEl.appendChild(t);
      });
    }

    function ensureBuilderControls() {
      if (window.PB_READONLY) return;
      slides().forEach(function (s) {
        /* Delete */
        if (!s.querySelector('.ls-gallery-del')) {
          var del = document.createElement('button');
          del.className = 'ls-gallery-del';
          del.textContent = '✕';
          del.title = 'Remove';
          del.setAttribute('data-builder-only', '');
          del.setAttribute('contenteditable', 'false');
          del.addEventListener('click', function () {
            if (slides().length <= 1) return;
            s.remove();
            goTo(0);
            save();
          });
          s.insertBefore(del, s.firstChild);
        }
        /* Change image overlay (image slides only) */
        if (s.querySelector('img') && !s.querySelector('.ls-gallery-change')) {
          var ch = document.createElement('div');
          ch.className = 'ls-gallery-change';
          ch.textContent = 'Change Image';
          ch.setAttribute('data-builder-only', '');
          ch.addEventListener('click', function () {
            if (window.PB_READONLY) return;
            pickFile(function (file) {
              uploadImage(file, function (path) {
                s.querySelector('img').src = path;
                refreshThumbs();
                save();
              });
            });
          });
          s.appendChild(ch);
        }
        /* Move L / Move R */
        if (!s.querySelector('.ls-gallery-move')) {
          [['‹', 'l', -1], ['›', 'r', 1]].forEach(function (cfg) {
            var btn = document.createElement('button');
            btn.className = 'ls-gallery-move ls-gallery-move-' + cfg[1];
            btn.textContent = cfg[0];
            btn.title = cfg[2] < 0 ? 'Move left' : 'Move right';
            btn.setAttribute('data-builder-only', '');
            btn.setAttribute('contenteditable', 'false');
            btn.addEventListener('click', function () {
              var all = slides(), i = all.indexOf(s), swap = all[i + cfg[2]];
              if (!swap) return;
              cfg[2] === 1 ? track.insertBefore(swap, s) : track.insertBefore(s, swap);
              goTo(0);
              save();
            });
            s.appendChild(btn);
          });
        }
      });
    }

    function save() {
      var clone = track.cloneNode(true);
      clone.querySelectorAll('[data-builder-only]').forEach(function (el) { el.remove(); });
      var html = clone.innerHTML;
      store.innerHTML = html;
      document.dispatchEvent(new CustomEvent('slide-carousel-save', {
        detail: { editKey: store.getAttribute('data-edit') || 'gallery-track', html: html }
      }));
    }

    function open() {
      /* Populate display track from data store */
      track.innerHTML = store.innerHTML;
      track.style.transform = 'translateX(0px)';
      idx = 0;
      overlay.style.display = 'flex';
      if (autoValEl) autoValEl.textContent = store.getAttribute('data-autoplay') || '8';
      if (window.PB_READONLY) {
        overlay.querySelectorAll('[data-builder-only]').forEach(function (el) {
          el.style.display = 'none';
        });
      } else {
        ensureBuilderControls();
      }
      refreshThumbs();
      startAuto();
    }

    function close() {
      if (!window.PB_READONLY) save();
      stopAuto();
      overlay.style.display = 'none';
    }

    /* Wire static overlay controls */
    overlay.querySelector('[data-gallery-close]').addEventListener('click', close);
    overlay.querySelector('[data-gallery-prev]').addEventListener('click', function () { goTo(idx - 1); });
    overlay.querySelector('[data-gallery-next]').addEventListener('click', function () { goTo(idx + 1); });

    overlay.querySelector('[data-gallery-add="image"]').addEventListener('click', function () {
      if (window.PB_READONLY) return;
      pickFile(function (file) {
        uploadImage(file, function (path) {
          var s = makeImageSlide(path, file.name.replace(/\.[^.]+$/, ''));
          track.appendChild(s);
          ensureBuilderControls();
          refreshThumbs();
          save();
          goTo(slides().length - 1);
        });
      });
    });

    overlay.querySelector('[data-gallery-add="text"]').addEventListener('click', function () {
      if (window.PB_READONLY) return;
      track.appendChild(makeTextSlide());
      ensureBuilderControls();
      refreshThumbs();
      save();
      goTo(slides().length - 1);
    });

    if (autoValEl && !window.PB_READONLY) {
      autoValEl.addEventListener('input', function () {
        var val = parseInt(autoValEl.textContent) || 8;
        store.setAttribute('data-autoplay', val);
        startAuto();
      });
      autoValEl.addEventListener('blur', save);
    }

    var wrap = overlay.querySelector('.ls-gallery-wrap');
    wrap.addEventListener('mouseenter', stopAuto);
    wrap.addEventListener('mouseleave', function () {
      if (overlay.style.display !== 'none') startAuto();
    });

    return { open: open, close: close };
  }

  // ── Slide factory helpers ─────────────────────────────────────────────────
  function makeImageSlide(src, caption) {
    var d = document.createElement('div');
    d.className = 'ls-gallery-slide';
    d.innerHTML = '<img src="' + src + '" alt="' + caption + '">'
      + '<div class="ls-gallery-caption" contenteditable spellcheck="false">' + caption + '</div>';
    return d;
  }

  function makeTextSlide() {
    var d = document.createElement('div');
    d.className = 'ls-gallery-slide ls-gallery-slide--text';
    d.innerHTML = '<div class="ls-gallery-stat">'
      + '<span class="ls-gallery-label" contenteditable spellcheck="false">Section Title</span>'
      + '<span class="ls-gallery-number" contenteditable spellcheck="false">Key Fact</span>'
      + '<span class="ls-gallery-body-text" contenteditable spellcheck="false">Description text here</span>'
      + '</div>';
    return d;
  }

  // ── File / upload helpers ─────────────────────────────────────────────────
  function pickFile(cb) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', function (e) {
      document.body.removeChild(input);
      if (e.target.files[0]) cb(e.target.files[0]);
    });
    input.click();
  }

  function uploadImage(file, cb) {
    var reader = new FileReader();
    reader.onload = function (ev) {
      window.PBUpload(file.name, ev.target.result).then(function (path) { if (path) cb(path); });
    };
    reader.readAsDataURL(file);
  }

  // ── Public API ────────────────────────────────────────────────────────────
  function init(slideEl) {
    injectStyles();
    var store = slideEl.querySelector('[data-ls-gallery]');
    if (!store) return;
    var trigger = slideEl.querySelector('[data-ls-gallery-open]');
    if (!trigger) return;

    // Resolve the slide root robustly — init() may be passed the slide element,
    // a container, or `document` (which has no .closest()). Derive from the store.
    var root = store.closest('[data-slide]') || store.parentElement
            || (slideEl.closest && slideEl.closest('[data-slide]')) || slideEl;
    var slideId = ((root.getAttribute && root.getAttribute('data-slide')) || 'gallery').replace(/[^a-z0-9]/gi, '');
    var overlayId = slideId + 'GalleryOverlay';

    if (!document.getElementById(overlayId)) {
      var overlay = buildOverlay(overlayId);
      root.insertAdjacentElement('afterend', overlay);
    }

    var overlay = document.getElementById(overlayId);
    var inst = createInstance(overlay, store, slideId);

    trigger.addEventListener('click', function () { inst.open(); });
  }

  return { init: init };

})();
