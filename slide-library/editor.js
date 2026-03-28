/**
 * editor.js — Presentation Editor
 * ─────────────────────────────────────────────────────────────
 * Features : Resize · Text Edit · Card Drag & Drop · Share
 *
 * Key design decision:
 *   Controls (resize / drag / share) are rendered as a FIXED-POSITION
 *   overlay appended to <body> — NOT inside the card. This means
 *   overflow:hidden, border-radius clipping, and image layers never
 *   interfere with the editor UI.
 *
 * Usage
 *   <script src="../editor.js"></script>
 *   PE.initAll()         — after all slides are in the DOM
 *   PE.initSlide(el)     — for a single slide element
 *   PE.lock()            — delivery mode (hides all editor UI)
 *   PE.unlock()          — re-enables editor UI
 *   PE.config.baseUrl    — set your hosted presentation URL
 * ─────────────────────────────────────────────────────────────
 */

(function (global) {
  'use strict';

  /* ── Public object ─────────────────────────────────────── */
  var PE = global.PE || {};
  global.PE = PE;

  /* ── Configuration ─────────────────────────────────────── */
  PE.config = {
    baseUrl: 'https://alexochoac.github.io/softsolution-presentations/starglass-spain/'
  };

  /* ── Internal state ────────────────────────────────────── */
  PE._locked     = false;
  PE._ready      = false;
  PE._currentUrl = '';
  PE._dragSrc    = null;   // global drag source for cross-card DnD

  /* ══════════════════════════════════════════════════════════
     SELECTORS
     Extend these lists when adding new slide types.
  ══════════════════════════════════════════════════════════ */

  // Cards that get resize · drag · share overlay
  var CARD_SEL = [
    '.card', '.kpi-card', '.col-card', '.int-card',
    '.pillar', '.t5-comp-card', '.iqc-card', '.tech-item',
    '.feature-item', '.why3-col', '.t5-cmp-col',
    '.t5-vc-card', '.cta-box'
  ].join(',');

  // Text elements that become double-click editable
  var TEXT_SEL = [
    'h1.slide-title', 'h2', '.section-label', '.slide-subtitle',
    '.card-title', '.card-desc',
    '.kpi-value', '.kpi-label',
    '.pillar-title', '.pillar-desc',
    '.feature-text', '.col-item',
    '.int-name', '.int-type',
    '.tech-name', '.tech-body',
    '.ss-tagline', '.t5-comp-text',
    '.brand-badge', '.click-hint',
    '.why3-col-label', '.t5-vc-label',
    '.ls4-proc-card-label'
  ].join(',');

  /* ══════════════════════════════════════════════════════════
     PUBLIC API
  ══════════════════════════════════════════════════════════ */

  PE.initAll = function () {
    _bootstrap();
    document.querySelectorAll('.slide').forEach(function (slide) {
      _initSlideEl(slide);
    });
  };

  PE.initSlide = function (slideEl) {
    if (!slideEl) return;
    _bootstrap();
    _initSlideEl(slideEl);
  };

  PE.lock = function () {
    PE._locked = true;
    // Hide all overlays
    document.querySelectorAll('.pe-overlay').forEach(function (o) {
      o.style.opacity = '0';
      o.style.pointerEvents = 'none';
    });
    // Disable contenteditable
    document.querySelectorAll('[contenteditable="true"]').forEach(function (el) {
      el.contentEditable = 'false';
    });
    _getOrCreateLockBadge().style.display = '';
    PE.closeShare();
  };

  PE.unlock = function () {
    PE._locked = false;
    var badge = document.getElementById('pe-lock-badge');
    if (badge) badge.style.display = 'none';
  };

  /* ══════════════════════════════════════════════════════════
     BOOTSTRAP
  ══════════════════════════════════════════════════════════ */

  function _bootstrap() {
    if (PE._ready) return;
    PE._ready = true;
    _injectStyles();
    _buildShareModal();
  }

  function _initSlideEl(slide) {
    if (PE._locked) return;
    setTimeout(function () {
      _initTextEdit(slide);
      _initCardControls(slide);
      _initCarouselControls(slide);
    }, 120);
  }

  /* ══════════════════════════════════════════════════════════
     1 · TEXT EDIT  (double-click any labelled text)
  ══════════════════════════════════════════════════════════ */

  function _initTextEdit(scope) {
    scope.querySelectorAll(TEXT_SEL).forEach(function (el) {
      if (el._peText) return;
      el._peText = true;

      el.addEventListener('dblclick', function (e) {
        if (PE._locked) return;
        if (e.target.closest('button, input, select, [contenteditable="true"]')) return;
        e.stopPropagation();
        e.preventDefault();

        // Gradient text uses -webkit-text-fill-color:transparent — clear while editing
        var savedFill = el.style.webkitTextFillColor;
        var savedBg   = el.style.backgroundImage;
        el.style.webkitTextFillColor = 'inherit';
        el.style.backgroundImage     = 'none';

        el.contentEditable = 'true';
        el.focus();

        // Select all on entry
        try {
          var r = document.createRange();
          r.selectNodeContents(el);
          var sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(r);
        } catch (_) {}

        el.addEventListener('blur', function restore() {
          el.contentEditable           = 'false';
          el.style.webkitTextFillColor = savedFill;
          el.style.backgroundImage     = savedBg;
          el.removeEventListener('blur', restore);
        }, { once: true });

        el.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); el.blur(); }
          if (ev.key === 'Escape') { el.blur(); }
        });
      });
    });
  }

  /* ══════════════════════════════════════════════════════════
     2 · CARD CONTROLS  (floating overlay approach)

     Each card gets one fixed-position overlay div appended to
     <body>. The overlay sits visually on top of the card but
     lives OUTSIDE it in the DOM, so overflow:hidden, border-
     radius clipping, and image z-stacking never block it.
  ══════════════════════════════════════════════════════════ */

  function _initCardControls(scope) {
    scope.querySelectorAll(CARD_SEL).forEach(function (el) {
      if (el._peOverlay) return;
      el._peOverlay = true;

      /* Create fixed overlay -------------------------------- */
      var ov = _el('div', 'pe-overlay');
      document.body.appendChild(ov);

      /* Edge resize strips (N / S / E / W) ----------------- */
      var edgeN = _el('div', 'pe-edge pe-edge-n'); ov.appendChild(edgeN);
      var edgeS = _el('div', 'pe-edge pe-edge-s'); ov.appendChild(edgeS);
      var edgeE = _el('div', 'pe-edge pe-edge-e'); ov.appendChild(edgeE);
      var edgeW = _el('div', 'pe-edge pe-edge-w'); ov.appendChild(edgeW);

      /* Resize handle (bottom-right corner) ---------------- */
      var rh = _el('div', 'pe-resize-handle');
      rh.title = 'Drag to resize  ·  Double-click to reset';
      ov.appendChild(rh);

      /* Drag handle (top-left) ----------------------------- */
      var dh = _el('div', 'pe-drag-handle');
      dh.textContent = '⠿';
      dh.title = 'Drag to reorder';
      ov.appendChild(dh);

      /* Show overlay on card hover ------------------------- */
      function showOv() {
        if (PE._locked) return;
        var r = el.getBoundingClientRect();
        ov.style.left   = r.left   + 'px';
        ov.style.top    = r.top    + 'px';
        ov.style.width  = r.width  + 'px';
        ov.style.height = r.height + 'px';
        ov.style.opacity = '1';
        // pointer-events stays 'none' on overlay itself — only handles are clickable
        // this ensures card content (lists, dblclick edits, etc.) stays fully interactive
      }
      function hideOv(e) {
        // Don't hide if mouse moved into one of the handles
        var rt = e && e.relatedTarget;
        if (rt && ov.contains(rt)) return;
        ov.style.opacity = '0';
      }
      // When mouse leaves a handle, hide unless returning to card or another handle
      function onHandleLeave(e) {
        var rt = e.relatedTarget;
        if (rt && (rt === el || el.contains(rt) || ov.contains(rt))) return;
        ov.style.opacity = '0';
      }

      el.addEventListener('mouseenter', showOv);
      el.addEventListener('mouseleave', hideOv);
      [rh, dh, edgeN, edgeS, edgeE, edgeW].forEach(function (h) {
        h.addEventListener('mouseleave', onHandleLeave);
      });

      /* Wire edge resize ----------------------------------- */
      _wireEdge(edgeN, el, showOv, 'n');
      _wireEdge(edgeS, el, showOv, 's');
      _wireEdge(edgeE, el, showOv, 'e');
      _wireEdge(edgeW, el, showOv, 'w');
      _wireEdge(rh,    el, showOv, 'se');  // corner: both axes + dblclick reset

      /* Wire drag ------------------------------------------ */
      _wireDrag(dh, el);

    });
  }

  /* ── Resize (all edges + corner) ────────────────────────── */
  /*  mode: 'n' | 's' | 'e' | 'w' | 'se'                    */

  function _wireEdge(handle, el, refreshOverlay, mode) {
    var sx, sy, sw, sh, didResize;

    handle.addEventListener('mousedown', function (e) {
      if (PE._locked) return;
      e.preventDefault();
      e.stopPropagation();

      var r = el.getBoundingClientRect();
      sx = e.clientX; sy = e.clientY;
      sw = r.width;   sh = r.height;
      didResize = false;

      // Capture original styles once so double-click (on corner) can fully restore
      if (!el._peOrig) {
        el._peOrig = {
          width:      el.style.width,
          height:     el.style.height,
          flexShrink: el.style.flexShrink,
          flexGrow:   el.style.flexGrow,
          minHeight:  el.style.minHeight
        };
      }

      function onMove(ev) {
        var dx = ev.clientX - sx;
        var dy = ev.clientY - sy;
        if (!didResize && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
        didResize = true;

        if (mode === 'se' || mode === 'e') el.style.width  = Math.max(100, sw + dx) + 'px';
        if (mode === 'w')                  el.style.width  = Math.max(100, sw - dx) + 'px';
        if (mode === 'se' || mode === 's') el.style.height = Math.max(60,  sh + dy) + 'px';
        if (mode === 'n')                  el.style.height = Math.max(60,  sh - dy) + 'px';

        el.style.minHeight  = '0';
        el.style.flexShrink = '0';
        el.style.flexGrow   = '0';
        refreshOverlay();
      }

      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
    });

    // Double-click corner → restore all original styles
    if (mode === 'se') {
      handle.addEventListener('dblclick', function (e) {
        e.stopPropagation();
        var o = el._peOrig || {};
        el.style.width      = o.width      !== undefined ? o.width      : '';
        el.style.height     = o.height     !== undefined ? o.height     : '';
        el.style.flexShrink = o.flexShrink !== undefined ? o.flexShrink : '';
        el.style.flexGrow   = o.flexGrow   !== undefined ? o.flexGrow   : '';
        el.style.minHeight  = o.minHeight  !== undefined ? o.minHeight  : '';
        el._peOrig = null;
        refreshOverlay();
      });
    }
  }

  /* ── Drag & drop (reorder within same parent) ────────────── */

  function _wireDrag(handle, el) {
    handle.addEventListener('mousedown', function () { el.draggable = true; });
    handle.addEventListener('mouseup',   function () { el.draggable = false; });

    el.addEventListener('dragstart', function (e) {
      if (PE._locked) { el.draggable = false; return; }
      e.dataTransfer.effectAllowed = 'move';
      PE._dragSrc = el;
      setTimeout(function () { el.classList.add('pe-dragging'); }, 0);
    });

    el.addEventListener('dragend', function () {
      el.draggable = false;
      el.classList.remove('pe-dragging');
      if (el.parentElement) {
        el.parentElement.querySelectorAll('.pe-drag-over')
          .forEach(function (c) { c.classList.remove('pe-drag-over'); });
      }
    });

    el.addEventListener('dragover', function (e) {
      if (PE._locked || !PE._dragSrc) return;
      if (PE._dragSrc.parentElement !== el.parentElement) return;
      e.preventDefault();
      el.parentElement.querySelectorAll('.pe-drag-over')
        .forEach(function (c) { c.classList.remove('pe-drag-over'); });
      if (el !== PE._dragSrc) el.classList.add('pe-drag-over');
    });

    el.addEventListener('drop', function (e) {
      e.stopPropagation();
      if (PE._locked || !PE._dragSrc || PE._dragSrc === el) return;
      if (PE._dragSrc.parentElement !== el.parentElement) return;
      var wrap  = el.parentElement;
      var items = Array.from(wrap.children);
      var si = items.indexOf(PE._dragSrc);
      var ti = items.indexOf(el);
      wrap.insertBefore(PE._dragSrc, si < ti ? el.nextSibling : el);
      el.classList.remove('pe-drag-over');
    });
  }

  /* ══════════════════════════════════════════════════════════
     4 · CAROUSEL IMAGE ADD
     Any element with data-pe-carousel attribute + _peAddImage()
     method gets a hover button and drag-drop support.
  ══════════════════════════════════════════════════════════ */

  var _addImgTarget   = null;
  var _addImgDataUrl  = '';
  var _addImgFileName = '';

  function _initCarouselControls(scope) {
    scope.querySelectorAll('[data-pe-carousel]').forEach(function (el) {
      if (el._peCarouselInit) return;
      el._peCarouselInit = true;

      /* Hover overlay with "Add Image" button */
      var ov = _el('div', 'pe-carousel-overlay');
      var btn = _el('button', 'pe-carousel-add-btn');
      btn.textContent = '＋ Add Image';
      ov.appendChild(btn);
      document.body.appendChild(ov);

      function showOv() {
        if (PE._locked) return;
        var r = el.getBoundingClientRect();
        ov.style.left   = r.left   + 'px';
        ov.style.top    = r.top    + 'px';
        ov.style.width  = r.width  + 'px';
        ov.style.height = r.height + 'px';
        ov.style.opacity = '1';
      }
      function hideOv(e) {
        var rt = e && e.relatedTarget;
        if (rt && ov.contains(rt)) return;
        ov.style.opacity = '0';
      }

      el.addEventListener('mouseenter', showOv);
      el.addEventListener('mouseleave', hideOv);
      btn.addEventListener('mouseleave', function (e) {
        var rt = e.relatedTarget;
        if (rt && (rt === el || el.contains(rt) || ov.contains(rt))) return;
        ov.style.opacity = '0';
      });

      btn.addEventListener('click', function (e) {
        if (PE._locked) return;
        e.stopPropagation();
        _openAddImgModal(el, null);
      });

      /* Drag image file directly onto carousel */
      el.addEventListener('dragover', function (e) {
        if (PE._locked) return;
        if (Array.from(e.dataTransfer.types).indexOf('Files') >= 0) {
          e.preventDefault();
          el.classList.add('pe-carousel-drop-hover');
        }
      });
      el.addEventListener('dragleave', function () {
        el.classList.remove('pe-carousel-drop-hover');
      });
      el.addEventListener('drop', function (e) {
        el.classList.remove('pe-carousel-drop-hover');
        if (PE._locked) return;
        var file = e.dataTransfer.files && e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
          e.preventDefault();
          e.stopPropagation();
          _openAddImgModal(el, file);
        }
      });
    });
  }

  /* ── Add image modal ──────────────────────────────────────── */

  function _buildAddImgDialog() {
    if (document.getElementById('pe-add-img-modal')) return;
    var m = _el('div', 'pe-modal');
    m.id = 'pe-add-img-modal';
    m.innerHTML = [
      '<div class="pe-modal-card" onclick="event.stopPropagation()">',
        '<button class="pe-modal-close" onclick="PE._closeAddImg()">×</button>',
        '<div class="pe-modal-title">Add Image to Carousel</div>',
        '<div class="pe-add-drop" id="pe-add-drop">',
          '<div id="pe-add-preview-wrap">',
            '<div class="pe-add-drop-hint">🖼 Drop image here or click to browse</div>',
          '</div>',
          '<input type="file" id="pe-add-file" accept="image/*" style="display:none">',
        '</div>',
        '<div class="pe-form-group" style="margin-top:12px;">',
          '<label>Caption</label>',
          '<input id="pe-add-caption" type="text" placeholder="Describe this image...">',
        '</div>',
        '<div id="pe-add-snippet-wrap" style="display:none; margin-top:10px;">',
          '<div class="pe-form-group">',
            '<label>To make permanent — paste into IMAGES array</label>',
            '<div class="pe-link-box" id="pe-add-snippet"></div>',
          '</div>',
          '<button class="pe-btn pe-btn-copy" style="width:100%;margin-top:6px;" id="pe-add-copy-btn" onclick="PE._copySnippet()">Copy Line</button>',
        '</div>',
        '<div class="pe-share-actions" style="margin-top:14px;">',
          '<button class="pe-btn pe-btn-email" id="pe-add-confirm-btn" onclick="PE._confirmAddImg()" disabled>Add to Carousel</button>',
          '<button class="pe-btn pe-btn-copy" onclick="PE._closeAddImg()">Cancel</button>',
        '</div>',
      '</div>'
    ].join('');
    m.addEventListener('click', PE._closeAddImg);
    document.body.appendChild(m);

    var drop     = document.getElementById('pe-add-drop');
    var fileInput = document.getElementById('pe-add-file');

    drop.addEventListener('click', function () { fileInput.click(); });
    drop.addEventListener('dragover', function (e) {
      e.preventDefault(); drop.classList.add('pe-add-drop-active');
    });
    drop.addEventListener('dragleave', function () {
      drop.classList.remove('pe-add-drop-active');
    });
    drop.addEventListener('drop', function (e) {
      e.preventDefault();
      drop.classList.remove('pe-add-drop-active');
      var file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) _loadAddFile(file);
    });
    fileInput.addEventListener('change', function () {
      if (fileInput.files[0]) _loadAddFile(fileInput.files[0]);
    });
    document.getElementById('pe-add-caption').addEventListener('input', PE._updateSnippet);
  }

  function _loadAddFile(file) {
    _addImgFileName = file.name;
    var reader = new FileReader();
    reader.onload = function (e) {
      _addImgDataUrl = e.target.result;
      var wrap = document.getElementById('pe-add-preview-wrap');
      wrap.innerHTML = '<img src="' + _addImgDataUrl + '" style="max-width:100%;max-height:140px;object-fit:contain;border-radius:8px;">';
      document.getElementById('pe-add-confirm-btn').disabled = false;
      PE._updateSnippet();
      document.getElementById('pe-add-snippet-wrap').style.display = '';
    };
    reader.readAsDataURL(file);
  }

  function _openAddImgModal(carouselEl, file) {
    _buildAddImgDialog();
    _addImgTarget  = carouselEl;
    _addImgDataUrl = '';
    _addImgFileName = '';
    document.getElementById('pe-add-preview-wrap').innerHTML =
      '<div class="pe-add-drop-hint">🖼 Drop image here or click to browse</div>';
    document.getElementById('pe-add-caption').value = '';
    document.getElementById('pe-add-confirm-btn').disabled = true;
    document.getElementById('pe-add-snippet-wrap').style.display = 'none';
    document.getElementById('pe-add-file').value = '';
    document.getElementById('pe-add-img-modal').classList.add('on');
    if (file) setTimeout(function () { _loadAddFile(file); }, 30);
  }

  PE._confirmAddImg = function () {
    if (!_addImgTarget || !_addImgDataUrl || !_addImgTarget._peAddImage) return;
    var caption = document.getElementById('pe-add-caption').value.trim();
    _addImgTarget._peAddImage(_addImgDataUrl, caption, _addImgFileName);
    PE._closeAddImg();
  };

  PE._closeAddImg = function () {
    var m = document.getElementById('pe-add-img-modal');
    if (m) m.classList.remove('on');
    _addImgTarget = null; _addImgDataUrl = ''; _addImgFileName = '';
  };

  PE._updateSnippet = function () {
    var caption  = (document.getElementById('pe-add-caption') || {}).value || '';
    var snippet  = "{ src: 'assets/" + _addImgFileName + "', caption: '" + caption.replace(/'/g, "\\'") + "' }";
    var snippetEl = document.getElementById('pe-add-snippet');
    if (snippetEl) snippetEl.textContent = snippet;
  };

  PE._copySnippet = function () {
    PE._updateSnippet();
    var text = (document.getElementById('pe-add-snippet') || {}).textContent || '';
    navigator.clipboard.writeText(text).then(function () {
      var btn = document.getElementById('pe-add-copy-btn');
      if (btn) { var o = btn.textContent; btn.textContent = '✓ Copied!'; setTimeout(function () { btn.textContent = o; }, 2000); }
    });
  };

  /* ══════════════════════════════════════════════════════════
     3 · SHARE MODAL
  ══════════════════════════════════════════════════════════ */

  var SHARE_SVG = [
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor"',
    ' stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">',
    '<circle cx="12.5" cy="2.5"  r="1.4"/>',
    '<circle cx="3.5"  cy="8"    r="1.4"/>',
    '<circle cx="12.5" cy="13.5" r="1.4"/>',
    '<line x1="4.9" y1="7.2"  x2="11.1" y2="3.8"/>',
    '<line x1="4.9" y1="8.8"  x2="11.1" y2="12.2"/>',
    '</svg>'
  ].join('');

  function _buildShareModal() {
    if (document.getElementById('pe-share-modal')) return;
    var m = _el('div', 'pe-modal');
    m.id = 'pe-share-modal';
    m.innerHTML = [
      '<div class="pe-modal-card" onclick="event.stopPropagation()">',
        '<button class="pe-modal-close" onclick="PE.closeShare()">×</button>',
        '<div class="pe-modal-title">Share Presentation</div>',
        '<div class="pe-form-row">',
          '<div class="pe-form-group">',
            '<label>Name</label>',
            '<input id="pe-name" type="text" placeholder="e.g. John" oninput="PE._validateShare()">',
          '</div>',
          '<div class="pe-form-group">',
            '<label>Position</label>',
            '<input id="pe-pos" type="text" placeholder="e.g. Sales Manager" oninput="PE._validateShare()">',
          '</div>',
        '</div>',
        '<div class="pe-form-group" style="margin-bottom:14px;">',
          '<label>Message (optional)</label>',
          '<textarea id="pe-msg" placeholder="Add a personal note to include in the message..."></textarea>',
        '</div>',
        '<div class="pe-share-actions">',
          '<button class="pe-btn pe-btn-wa"    id="pe-btn-wa"    onclick="PE._toggleSub(\'wa\')"  disabled>WhatsApp</button>',
          '<button class="pe-btn pe-btn-email" id="pe-btn-email" onclick="PE._toggleSub(\'email\')" disabled>Email</button>',
          '<button class="pe-btn pe-btn-copy"  id="pe-copy-btn"  onclick="PE._copyLink()"         disabled>Copy Link</button>',
        '</div>',
        '<div class="pe-share-hint" id="pe-share-hint">Fill in name and position to share</div>',
        '<div class="pe-sub-form" id="pe-sub-wa">',
          '<input id="pe-wa-num" type="tel" placeholder="+1 234 567 8900">',
          '<button onclick="PE._sendWa()">Send ↗</button>',
        '</div>',
        '<div class="pe-sub-form" id="pe-sub-email">',
          '<input id="pe-email-to" type="email" placeholder="email@example.com">',
          '<button onclick="PE._sendEmail()">Send ↗</button>',
        '</div>',
      '</div>'
    ].join('');
    m.addEventListener('click', PE.closeShare);
    document.body.appendChild(m);
  }

  function _openShareModal(target) {
    PE._shareTarget = target;
    document.getElementById('pe-share-modal').classList.add('on');
    _hideSubs();
  }

  PE.openShare = function () { _openShareModal(null); };

  PE.closeShare = function () {
    var m = document.getElementById('pe-share-modal');
    if (m) m.classList.remove('on');
    _hideSubs();
  };

  PE._buildUrl = function (medium, recipient) {
    var name   = (_inputVal('pe-name') || '').replace(/\s+/g, '-');
    var pos    = (_inputVal('pe-pos')  || '').replace(/\s+/g, '-');
    var params = ['utm_source=sharepresentationbutton', 'utm_medium=' + encodeURIComponent(medium)];
    if (name)      params.push('utm_content='  + encodeURIComponent(name));
    if (pos)       params.push('utm_term='     + encodeURIComponent(pos));
    if (recipient) params.push('utm_campaign=' + encodeURIComponent(recipient));
    return PE.config.baseUrl + '?' + params.join('&');
  };

  PE._validateShare = function () {
    var ok   = !!_inputVal('pe-name') && !!_inputVal('pe-pos');
    var hint = document.getElementById('pe-share-hint');
    ['pe-btn-wa', 'pe-btn-email', 'pe-copy-btn'].forEach(function (id) {
      var btn = document.getElementById(id);
      if (btn) btn.disabled = !ok;
    });
    if (hint) hint.style.opacity = ok ? '0' : '1';
  };

  PE._toggleSub = function (id) {
    var wa    = document.getElementById('pe-sub-wa');
    var email = document.getElementById('pe-sub-email');
    if (id === 'wa') { wa.classList.toggle('on');    email.classList.remove('on'); }
    else             { email.classList.toggle('on'); wa.classList.remove('on');    }
  };

  PE._copyLink = function () {
    var btn = document.getElementById('pe-copy-btn');
    navigator.clipboard.writeText(PE._buildUrl('copy'))
      .then(function () {
        var orig = btn.textContent;
        btn.textContent = '✓ Copied!';
        setTimeout(function () { btn.textContent = orig; }, 2000);
      });
  };

  PE._sendWa = function () {
    var phone  = _inputVal('pe-wa-num').replace(/\s/g, '');
    var name   = _inputVal('pe-name') || 'there';
    var custom = _inputVal('pe-msg');
    var url    = PE._buildUrl('whatsapp', phone);
    var msg    = 'Hi ' + name + ',\n\n' + (custom ? custom + '\n\n' : 'Here is the LineScanner presentation:\n') + url;
    window.open('https://wa.me/' + phone.replace(/\D/g, '') + '?text=' + encodeURIComponent(msg), '_blank');
    PE.closeShare();
  };

  PE._sendEmail = function () {
    var to       = _inputVal('pe-email-to');
    var name     = _inputVal('pe-name') || 'there';
    var custom   = _inputVal('pe-msg');
    var url      = PE._buildUrl('email', to);
    var subject  = encodeURIComponent('LineScanner Presentation');
    var bodyText = 'Hi ' + name + ',\n\n' + (custom ? custom + '\n\n' : 'Here is the LineScanner presentation:\n') + url + '\n\nBest regards';
    window.open('mailto:' + to + '?subject=' + subject + '&body=' + encodeURIComponent(bodyText));
    PE.closeShare();
  };

  /* ══════════════════════════════════════════════════════════
     LOCK BADGE
  ══════════════════════════════════════════════════════════ */

  function _getOrCreateLockBadge() {
    var b = document.getElementById('pe-lock-badge');
    if (!b) {
      b = _el('div');
      b.id = 'pe-lock-badge';
      b.textContent = '🔒 Locked';
      b.style.cssText = [
        'position:fixed;top:18px;right:44px;z-index:9999;',
        'font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;',
        'color:rgba(255,255,255,.4);background:rgba(0,0,0,.5);',
        'border:1px solid rgba(255,255,255,.12);border-radius:100px;',
        'padding:4px 14px;pointer-events:none;'
      ].join('');
      document.body.appendChild(b);
    }
    return b;
  }

  /* ══════════════════════════════════════════════════════════
     HELPERS
  ══════════════════════════════════════════════════════════ */

  function _el(tag, cls) {
    var el = document.createElement(tag || 'div');
    if (cls) el.className = cls;
    return el;
  }

  function _inputVal(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  function _hideSubs() {
    ['pe-sub-wa', 'pe-sub-email'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.classList.remove('on');
    });
  }

  /* ══════════════════════════════════════════════════════════
     STYLES
  ══════════════════════════════════════════════════════════ */

  function _injectStyles() {
    if (document.getElementById('pe-styles')) return;
    var s = document.createElement('style');
    s.id  = 'pe-styles';
    s.textContent = `
      /* ── Floating overlay (lives in <body>, positioned over card) ── */
      .pe-overlay {
        position: fixed;
        pointer-events: none;
        opacity: 0;
        transition: opacity .15s;
        z-index: 9990;
      }

      /* ── Edge resize strips (N / S / E / W) ── */
      .pe-edge {
        position: absolute; z-index: 2; pointer-events: auto;
      }
      /* Horizontal edges — leave 20px gap at each corner so they don't overlap handles */
      .pe-edge-n { top: 0;    left: 20px; right: 20px; height: 7px; cursor: n-resize; }
      .pe-edge-s { bottom: 0; left: 20px; right: 20px; height: 7px; cursor: s-resize; }
      /* Vertical edges */
      .pe-edge-e { top: 20px; bottom: 20px; right: 0;   width:  7px; cursor: e-resize; }
      .pe-edge-w { top: 20px; bottom: 20px; left: 0;    width:  7px; cursor: w-resize; }
      /* Subtle highlight on hover so user can see the edge is draggable */
      .pe-edge:hover { background: rgba(245,166,35,.18); border-radius: 3px; }

      /* ── Resize handle (bottom-right) ── */
      .pe-resize-handle {
        position: absolute; bottom: 6px; right: 6px;
        width: 16px; height: 16px;
        cursor: se-resize; z-index: 1;
        pointer-events: auto;
      }
      .pe-resize-handle::before {
        content: ''; position: absolute; bottom: 2px; right: 2px;
        width: 8px; height: 8px;
        border-right: 2px solid rgba(255,255,255,.4);
        border-bottom: 2px solid rgba(255,255,255,.4);
        border-radius: 1px; transition: border-color .2s;
      }
      .pe-resize-handle:hover::before { border-color: rgba(245,166,35,.9); }

      /* ── Drag handle (top-left) ── */
      .pe-drag-handle {
        position: absolute; top: 6px; left: 6px;
        width: 16px; height: 16px;
        cursor: grab; z-index: 1;
        color: rgba(255,255,255,.35); font-size: 12px;
        display: flex; align-items: center; justify-content: center;
        user-select: none; transition: color .2s;
        pointer-events: auto;
      }
      .pe-drag-handle:active { cursor: grabbing; }
      .pe-drag-handle:hover  { color: rgba(245,166,35,.9); }

      /* ── Share button (bottom-left) ── */
      .pe-share-btn {
        position: absolute; bottom: 6px; left: 6px;
        width: 18px; height: 18px;
        border-radius: 4px; padding: 0;
        background: rgba(0,0,0,.45);
        border: 1px solid rgba(255,255,255,.15);
        color: rgba(255,255,255,.35);
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        transition: background .2s, color .2s, border-color .2s;
        z-index: 1;
        pointer-events: auto;
      }
      .pe-share-btn svg { width: 10px; height: 10px; pointer-events: none; }
      .pe-share-btn:hover {
        background: rgba(245,166,35,.22);
        color: #F5A623;
        border-color: rgba(245,166,35,.4);
      }

      /* ── Drag states ── */
      .pe-dragging  { opacity: .35 !important; }
      .pe-drag-over { outline: 2px dashed rgba(245,166,35,.45); border-radius: 4px; }

      /* ── Text editing ── */
      [contenteditable="true"] {
        outline: 1px solid rgba(245,166,35,.55) !important;
        border-radius: 3px;
        background: rgba(245,166,35,.05) !important;
        cursor: text !important;
        -webkit-text-fill-color: inherit !important;
      }

      /* ── Share modal backdrop ── */
      .pe-modal {
        display: none; position: fixed; inset: 0;
        background: rgba(0,0,0,.65); backdrop-filter: blur(8px);
        z-index: 9994; align-items: center; justify-content: center;
      }
      .pe-modal.on { display: flex; }

      .pe-modal-card {
        background: #111; border: 1px solid rgba(255,255,255,.12);
        border-radius: 18px; padding: 26px 28px;
        width: 90vw; max-width: 400px;
        position: relative; box-shadow: 0 24px 80px rgba(0,0,0,.85);
      }
      .pe-modal-close {
        position: absolute; top: 12px; right: 16px;
        background: none; border: none;
        color: rgba(255,255,255,.4); font-size: 20px;
        cursor: pointer; line-height: 1; font-family: inherit;
      }
      .pe-modal-close:hover { color: #fff; }
      .pe-modal-title {
        font-size: 14px; font-weight: 700; color: #fff;
        margin-bottom: 18px; letter-spacing: .02em;
      }
      .pe-form-row {
        display: grid; grid-template-columns: 1fr 1fr;
        gap: 10px; margin-bottom: 12px;
      }
      .pe-form-group label {
        display: block; font-size: 10px; font-weight: 700;
        letter-spacing: .08em; text-transform: uppercase;
        color: rgba(255,255,255,.35); margin-bottom: 5px;
      }
      .pe-form-group input, .pe-form-group textarea, .pe-sub-form input {
        width: 100%; padding: 8px 10px;
        background: rgba(255,255,255,.06);
        border: 1px solid rgba(255,255,255,.12);
        border-radius: 8px; color: #fff;
        font-size: 12px; font-family: inherit;
        outline: none; transition: border-color .2s;
      }
      .pe-form-group textarea {
        resize: vertical; min-height: 64px; line-height: 1.5;
      }
      .pe-form-group input:focus, .pe-form-group textarea:focus,
      .pe-sub-form input:focus { border-color: rgba(245,166,35,.5); }
.pe-share-actions {
        display: grid; grid-template-columns: 1fr 1fr 1fr;
        gap: 7px; margin-bottom: 10px;
      }
      .pe-btn {
        padding: 8px 0; border-radius: 8px; cursor: pointer;
        font-size: 11px; font-weight: 700; font-family: inherit;
        letter-spacing: .04em; transition: all .2s; border: 1px solid;
      }
      .pe-btn-wa    { background: rgba(37,211,102,.10); border-color: rgba(37,211,102,.30); color: #25D366; }
      .pe-btn-wa:hover    { background: rgba(37,211,102,.22); }
      .pe-btn-email { background: rgba(245,166,35,.10);  border-color: rgba(245,166,35,.30);  color: #F5A623; }
      .pe-btn-email:hover { background: rgba(245,166,35,.22); }
      .pe-btn-copy  { background: rgba(255,255,255,.05); border-color: rgba(255,255,255,.15); color: rgba(255,255,255,.6); }
      .pe-btn-copy:hover  { background: rgba(255,255,255,.12); }
      .pe-btn:disabled { opacity: .3; cursor: not-allowed; pointer-events: none; }
      .pe-share-hint {
        font-size: 10px; text-align: center; color: rgba(255,255,255,.3);
        margin-top: -4px; margin-bottom: 6px; letter-spacing: .03em;
        transition: opacity .2s;
      }
      .pe-sub-form { display: none; gap: 8px; margin-top: 4px; }
      .pe-sub-form.on { display: flex; }
      .pe-sub-form input { flex: 1; }
      .pe-sub-form button {
        padding: 8px 14px; border-radius: 8px; border: none;
        background: linear-gradient(135deg,#F5A623,#E8890C);
        color: #000; font-weight: 700; font-size: 11px;
        cursor: pointer; white-space: nowrap; font-family: inherit;
      }
      .pe-sub-form button:hover { opacity: .85; }

      /* ── Mobile: hide editor controls ── */
      @media (max-width: 768px) {
        .pe-overlay { display: none !important; }
      }

      /* ── Carousel overlay ── */
      .pe-carousel-overlay {
        position: fixed; opacity: 0; pointer-events: none;
        transition: opacity .15s; z-index: 9989;
        display: flex; align-items: center; justify-content: center;
      }
      .pe-carousel-add-btn {
        padding: 8px 20px; border-radius: 20px; pointer-events: auto;
        background: rgba(0,0,0,.65); border: 1px dashed rgba(245,166,35,.55);
        color: rgba(245,166,35,.85); font-size: 11px; font-weight: 700;
        letter-spacing: .07em; cursor: pointer; font-family: inherit;
        transition: all .2s; text-transform: uppercase; white-space: nowrap;
      }
      .pe-carousel-add-btn:hover {
        background: rgba(245,166,35,.18); border-color: #F5A623; color: #F5A623;
      }
      .pe-carousel-drop-hover {
        outline: 2px dashed rgba(245,166,35,.7) !important;
        outline-offset: -4px;
      }

      /* ── Add image dialog ── */
      .pe-add-drop {
        width: 100%; height: 150px; border-radius: 10px; cursor: pointer;
        border: 2px dashed rgba(255,255,255,.18);
        display: flex; align-items: center; justify-content: center;
        transition: border-color .2s, background .2s; overflow: hidden;
      }
      .pe-add-drop:hover, .pe-add-drop-active {
        border-color: rgba(245,166,35,.55); background: rgba(245,166,35,.05);
      }
      .pe-add-drop-hint {
        color: rgba(255,255,255,.3); font-size: 12px; text-align: center; padding: 0 20px;
      }

      /* ── Save toast ── */
      .pe-save-toast {
        position: fixed; bottom: 80px; left: 50%;
        transform: translateX(-50%) translateY(8px);
        background: rgba(20,20,20,.96); border: 1px solid rgba(245,166,35,.35);
        color: rgba(245,166,35,.9); padding: 8px 20px; border-radius: 20px;
        font-size: 12px; font-weight: 600; letter-spacing: .04em;
        opacity: 0; transition: opacity .25s, transform .25s;
        z-index: 9999; pointer-events: none; white-space: nowrap;
      }
      .pe-save-toast.on { opacity: 1; transform: translateX(-50%) translateY(0); }
      .pe-save-toast.err { border-color: rgba(248,113,113,.4); color: #f87171; }
    `;
    document.head.appendChild(s);
  }

  /* ══════════════════════════════════════════════════════════
     5 · SAVE TO FILE  (File System Access API — Chrome/Edge)
     Writes the active slide's current DOM state back to its
     source fragment file in the linescanner/ folder.
  ══════════════════════════════════════════════════════════ */

  PE._dirHandle = null;

  PE.saveAllSlides = async function () {
    if (!('showDirectoryPicker' in window)) {
      _showSaveToast('Saving requires Chrome, Edge or Brave', true); return;
    }
    if (!PE._dirHandle) {
      try { PE._dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' }); }
      catch (e) { return; }
    }
    var slides = Array.from(document.querySelectorAll('.slide[data-pe-source-file]'));
    if (!slides.length) { _showSaveToast('No slides found — reload and try again', true); return; }

    _showSaveToast('Saving ' + slides.length + ' slides…', false);

    // Write ALL slides in parallel so Live Server's file-watcher doesn't reload the page
    // between individual writes and kill the remaining saves.
    var results = await Promise.allSettled(slides.map(function (slide) {
      var sourceFile = slide.dataset.peSourceFile;
      var html = _prepareForSave(slide);
      return PE._dirHandle.getFileHandle(sourceFile, { create: false })
        .then(function (fh) { return fh.createWritable(); })
        .then(function (wr) { return wr.write(html).then(function () { return wr.close(); }); })
        .then(function () { return sourceFile; });
    }));

    var saved  = results.filter(function (r) { return r.status === 'fulfilled'; }).length;
    var errors = results.filter(function (r) { return r.status === 'rejected'; })
                        .map(function (r) { return r.reason && r.reason.message || String(r.reason); });

    // Persist result in localStorage so it survives a Live Server auto-reload
    var msg   = errors.length === 0 ? '✓ All ' + saved + ' slides saved'
              : errors.length === slides.length ? 'Failed — select the linescanner/ folder'
              : '✓ ' + saved + ' saved · ' + errors.length + ' failed: ' + errors[0];
    var isErr = errors.length > 0;
    if (isErr && errors.length === slides.length) PE._dirHandle = null;

    try { localStorage.setItem('pe-save-result', JSON.stringify({ msg: msg, err: isErr })); } catch(e) {}
    _showSaveToast(msg, isErr);
  };

  PE.saveSlide = async function () {
    if (!('showDirectoryPicker' in window)) {
      _showSaveToast('Saving requires Chrome, Edge or Brave', true);
      return;
    }

    var slide = document.querySelector('.slide.active');
    if (!slide) { _showSaveToast('No active slide found', true); return; }

    var sourceFile = slide.dataset.peSourceFile;
    if (!sourceFile) { _showSaveToast('Slide has no source file', true); return; }

    // Ask for folder once per session
    if (!PE._dirHandle) {
      try {
        PE._dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      } catch (e) { return; } // user cancelled
    }

    try {
      var fileHandle = await PE._dirHandle.getFileHandle(sourceFile, { create: false });
      var writable   = await fileHandle.createWritable();
      await writable.write(_prepareForSave(slide));
      await writable.close();
      _showSaveToast('✓ Saved — ' + sourceFile);
    } catch (e) {
      // Wrong folder selected — reset so next click re-prompts
      PE._dirHandle = null;
      _showSaveToast('Select the linescanner/ folder', true);
    }
  };

  function _prepareForSave(slide) {
    var clone = slide.cloneNode(true);

    // Remove contenteditable left open
    clone.querySelectorAll('[contenteditable]').forEach(function (el) {
      el.removeAttribute('contenteditable');
    });

    // Remove runtime-only classes and attributes
    clone.classList.remove('active', 'exit-left', 'exit-right');
    clone.removeAttribute('data-pe-source-file');

    // Strip dynamically-added item controls and stale restore chips
    // (why3InitList re-adds controls on reload; chips are rebuilt from .why3-hidden items)
    clone.querySelectorAll('.why3-item-controls').forEach(function (el) { el.remove(); });
    clone.querySelectorAll('.why3-restore-chip').forEach(function (el) { el.remove(); });
    // Migrate any old inline display:none to the class-based approach (why3)
    clone.querySelectorAll('li[style*="display"]').forEach(function (el) {
      if (el.style.display === 'none') {
        el.classList.add('why3-hidden');
        el.style.display = '';
      }
    });

    // Strip ls4 dynamically-added row and card controls (rebuilt by ls4InitTable / ls4InitCards on reload)
    clone.querySelectorAll('.ls4-row-drag, .ls4-row-hide-btn').forEach(function (el) { el.remove(); });
    // Clear ls4 restore chip areas (rebuilt from ls4-col-collapsed / ls4-row-hidden on init)
    clone.querySelectorAll('.ls4-col-restore, .ls4-row-restore').forEach(function (el) { el.innerHTML = ''; });

    // Clear s6-selector (buttons are rebuilt by JS on load — saves must not persist them)
    var s6sel = clone.querySelector('#s6-selector');
    if (s6sel) s6sel.innerHTML = '';
    // Migrate any old inline display:none on table rows to the class-based approach
    clone.querySelectorAll('tr[style*="display"]').forEach(function (el) {
      if (el.style.display === 'none') {
        el.classList.add('ls4-row-hidden');
        el.style.display = '';
      }
    });

    var html = clone.outerHTML;

    // Reverse path rewrites applied by _preview.html
    (PE.config.pathMappings || []).forEach(function (pair) {
      html = html.split(pair[0]).join(pair[1]);
    });

    return html + '\n';
  }

  PE._showSaveToast = function (msg, isErr) { _showSaveToast(msg, isErr); };

  function _showSaveToast(msg, isErr) {
    var t = document.getElementById('pe-save-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'pe-save-toast';
      t.className = 'pe-save-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.toggle('err', !!isErr);
    t.classList.remove('on');
    t.offsetHeight; // force reflow for re-trigger
    t.classList.add('on');
    clearTimeout(t._hideTimer);
    t._hideTimer = setTimeout(function () { t.classList.remove('on'); }, 10000);
  }

})(window);
