/**
 * carousel.js — Presentation Builder Carousel Component
 *
 * Slide modes:
 *   Single  — one image per slide (default)
 *   Compare — two images, togglable between Split (50/50) and Reveal (drag handle)
 *
 * HTML structure (single):
 *   <div class="ls-carousel" data-edit="key" data-autoplay="4000" data-track="ls4:carousel">
 *     <div class="ls-carousel-track">
 *       <div class="ls-carousel-slide">
 *         <img src="..." alt="Caption">
 *       </div>
 *     </div>
 *   </div>
 *
 * HTML structure (compare, saved):
 *   <div class="ls-carousel-slide ls-compare" data-compare-mode="split">
 *     <img class="ls-cmp-left"  src="..." alt="Label A">
 *     <img class="ls-cmp-right" src="..." alt="Label B">
 *   </div>
 *
 * Usage:
 *   Carousel.init(slideEl)  — call after a slide is injected into the DOM
 */

window.Carousel = (function () {

  // ── Inject component styles ───────────────────────────────────────────────
  (function injectStyle() {
    if (document.getElementById('ls-carousel-styles')) return;
    var style = document.createElement('style');
    style.id = 'ls-carousel-styles';
    style.textContent = [
      /* ── Base carousel ── */
      '.ls-carousel{position:relative;overflow:hidden;border-radius:14px;border:1px solid rgba(255,255,255,.07);background:#0a0a0a;width:100%;height:100%;}',
      '.ls-carousel-track{display:flex;height:100%;transition:transform .5s cubic-bezier(.4,0,.2,1);}',
      '.ls-carousel-slide{flex:0 0 100%;height:100%;position:relative;}',
      '.ls-carousel-slide img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block;}',
      '.ls-carousel-caption{position:absolute;bottom:0;left:0;right:0;padding:10px 18px;background:linear-gradient(transparent,rgba(0,0,0,.75));color:rgba(255,255,255,.85);font-size:12px;font-weight:600;letter-spacing:.05em;text-align:center;pointer-events:none;}',
      '.ls-carousel-btn{position:absolute;top:50%;transform:translateY(-50%);background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.20);color:#fff;font-size:26px;line-height:1;width:38px;height:38px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .2s;z-index:5;font-family:inherit;}',
      '.ls-carousel-btn:hover{background:rgba(245,166,35,.55);}',
      '.ls-carousel-prev{left:10px;}',
      '.ls-carousel-next{right:10px;}',
      '.ls-carousel-add{position:absolute;bottom:8px;right:10px;font-size:11px;font-weight:700;letter-spacing:.05em;padding:5px 14px;border-radius:20px;cursor:pointer;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);color:rgba(255,255,255,.6);font-family:inherit;transition:all .2s;z-index:5;}',
      '.ls-carousel-add:hover{background:rgba(245,166,35,.15);border-color:#F5A623;color:#F5A623;}',
      '.ls-carousel-del{position:absolute;top:8px;left:8px;z-index:22;width:24px;height:24px;border-radius:50%;background:rgba(180,30,30,.75);border:1px solid rgba(255,100,100,.30);color:#fff;font-size:13px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .2s,background .2s;font-family:inherit;}',
      '.ls-carousel-slide:hover .ls-carousel-del{opacity:1;}',
      '.ls-carousel-del:hover{background:rgba(220,40,40,1);}',
      '.ls-carousel-counter{position:absolute;bottom:10px;right:12px;font-size:11px;font-weight:600;color:rgba(255,255,255,.5);letter-spacing:.06em;pointer-events:none;z-index:5;}',

      /* ── Compare enter button (on single slides, hover) ── */
      '.ls-cmp-enter{position:absolute;top:8px;left:50%;transform:translateX(-50%);padding:3px 10px;border-radius:20px;background:rgba(0,0,0,.6);border:1px solid rgba(255,255,255,.15);color:rgba(255,255,255,.45);font-size:10px;font-weight:700;letter-spacing:.05em;cursor:pointer;z-index:8;opacity:0;transition:all .2s;font-family:inherit;white-space:nowrap;}',
      '.ls-carousel-slide:hover .ls-cmp-enter{opacity:1;}',
      '.ls-cmp-enter:hover{border-color:#E8711A;color:#E8711A;}',

      /* ── Compare slide base ── */
      '.ls-compare{overflow:hidden;}',
      '.ls-cmp-side{position:absolute;top:0;bottom:0;overflow:hidden;}',
      '.ls-cmp-side img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block;}',

      /* ── Split mode ── */
      '.ls-compare.ls-split .ls-cmp-side-left{left:0;right:50.1%;}',
      '.ls-compare.ls-split .ls-cmp-side-right{left:50.1%;right:0;}',
      '.ls-cmp-divider{position:absolute;top:0;bottom:0;left:50%;width:2px;background:rgba(255,255,255,.35);transform:translateX(-50%);z-index:6;pointer-events:none;}',

      /* ── Reveal mode ── */
      '.ls-compare.ls-reveal .ls-cmp-side-left{left:0;right:0;}',
      '.ls-compare.ls-reveal .ls-cmp-side-right{left:0;right:0;clip-path:inset(0 50% 0 0);}',
      '.ls-cmp-handle{position:absolute;top:0;bottom:0;left:50%;width:4px;background:#fff;transform:translateX(-50%);cursor:ew-resize;z-index:10;box-shadow:0 0 10px rgba(0,0,0,.5);touch-action:none;}',
      '.ls-cmp-handle-grip{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:32px;height:32px;border-radius:50%;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;font-size:13px;color:#333;user-select:none;pointer-events:none;}',

      /* ── Labels ── */
      '.ls-cmp-label{position:absolute;bottom:10px;padding:3px 10px;background:rgba(0,0,0,.65);color:#fff;border-radius:20px;font-size:11px;font-weight:600;letter-spacing:.03em;white-space:nowrap;z-index:7;cursor:default;}',
      '.ls-cmp-label-left{left:8px;}',
      '.ls-cmp-label-right{right:8px;}',
      '.ls-cmp-label[contenteditable="true"]{outline:1px solid rgba(232,113,26,.6);cursor:text;}',

      /* ── Per-side replace button ── */
      '.ls-cmp-replace{position:absolute;top:8px;left:50%;transform:translateX(-50%);width:26px;height:26px;border-radius:50%;background:rgba(0,0,0,.65);border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.7);font-size:14px;cursor:pointer;z-index:8;opacity:0;transition:opacity .2s;display:flex;align-items:center;justify-content:center;font-family:inherit;}',
      '.ls-cmp-side:hover .ls-cmp-replace{opacity:1;}',
      '.ls-cmp-replace:hover{background:rgba(245,166,35,.3);border-color:#F5A623;color:#F5A623;}',

      /* ── Mode toggle + exit buttons ── */
      '.ls-cmp-mode-btn{position:absolute;bottom:8px;left:50%;transform:translateX(-50%);padding:3px 12px;border-radius:20px;background:rgba(0,0,0,.6);border:1px solid rgba(255,255,255,.18);color:rgba(255,255,255,.6);font-size:10px;font-weight:700;letter-spacing:.05em;cursor:pointer;font-family:inherit;z-index:8;transition:all .2s;white-space:nowrap;}',
      '.ls-cmp-mode-btn:hover{border-color:#E8711A;color:#E8711A;}',
      '.ls-cmp-exit{position:absolute;top:8px;right:38px;padding:3px 8px;border-radius:20px;background:rgba(0,0,0,.6);border:1px solid rgba(255,100,100,.3);color:rgba(255,100,100,.65);font-size:10px;font-weight:700;letter-spacing:.04em;cursor:pointer;font-family:inherit;z-index:8;opacity:0;transition:opacity .2s;}',
      '.ls-compare:hover .ls-cmp-exit{opacity:1;}',
      '.ls-cmp-exit:hover{background:rgba(220,40,40,.3);}',
    ].join('');
    document.head.appendChild(style);
  })();

  // ── Upload helper ─────────────────────────────────────────────────────────

  function uploadImage(file, callback) {
    var reader = new FileReader();
    reader.onload = function (ev) {
      fetch('/api/upload-image', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ filename: file.name, data: ev.target.result })
      })
      .then(function (r) { return r.json(); })
      .then(function (data) { if (data.path) callback(data.path); });
    };
    reader.readAsDataURL(file);
  }

  function pickImage(callback) {
    var input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', function (e) {
      document.body.removeChild(input);
      var file = e.target.files[0];
      if (!file) return;
      uploadImage(file, function (path) { callback(path, file.name.replace(/\.[^.]+$/, '')); });
    });
    input.click();
  }

  // ── Init a single carousel element ───────────────────────────────────────

  function initOne(el) {
    if (el._lsCarouselInit) return;
    el._lsCarouselInit = true;

    var track       = el.querySelector('.ls-carousel-track');
    var editKey     = el.getAttribute('data-edit') || 'carousel';
    var autoplayMs  = parseInt(el.getAttribute('data-autoplay'), 10) || 0;
    var trackId     = el.getAttribute('data-track') || '';
    var showCounter = el.hasAttribute('data-counter') && el.getAttribute('data-counter') !== 'false';
    var idx         = 0;
    var timer       = null;

    if (!track) return;

    // ── Nav buttons ─────────────────────────────────────────────────────────
    var prevBtn = document.createElement('button');
    prevBtn.className = 'ls-carousel-btn ls-carousel-prev';
    prevBtn.setAttribute('data-builder-only', '');
    prevBtn.textContent = '‹';

    var nextBtn = document.createElement('button');
    nextBtn.className = 'ls-carousel-btn ls-carousel-next';
    nextBtn.setAttribute('data-builder-only', '');
    nextBtn.textContent = '›';

    // ── Counter (optional) ──────────────────────────────────────────────────
    // Remove any stale counter divs left over from saved HTML before adding a fresh one
    el.querySelectorAll('.ls-carousel-counter').forEach(function (n) { n.remove(); });
    var counterEl = null;
    if (showCounter) {
      counterEl = document.createElement('div');
      counterEl.className = 'ls-carousel-counter';
      el.appendChild(counterEl);
    }

    // ── Autoplay toggle ─────────────────────────────────────────────────────
    var autoplaySteps = [0, 3000, 5000, 10000, 15000];
    var autoplayIdx   = Math.max(0, autoplaySteps.indexOf(autoplayMs));

    el.appendChild(prevBtn);
    el.appendChild(nextBtn);

    if (!window.PB_READONLY) {
      var addBtn = document.createElement('button');
      addBtn.className = 'ls-carousel-add';
      addBtn.setAttribute('data-builder-only', '');
      addBtn.textContent = '+ Image';

      var autoBtn = document.createElement('button');
      autoBtn.className = 'ls-carousel-add';
      autoBtn.setAttribute('data-builder-only', '');
      autoBtn.style.cssText = 'right:auto;left:10px;bottom:8px;';

      function updateAutoLabel() {
        var ms = autoplaySteps[autoplayIdx];
        autoBtn.textContent = ms === 0 ? '⏸ Auto' : '▶ ' + (ms / 1000) + 's';
        autoBtn.title = ms === 0 ? 'Autoplay off — click to enable' : 'Autoplay ' + (ms / 1000) + 's — click to change';
      }
      updateAutoLabel();

      autoBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        autoplayIdx = (autoplayIdx + 1) % autoplaySteps.length;
        autoplayMs  = autoplaySteps[autoplayIdx];
        updateAutoLabel();
        el.setAttribute('data-autoplay', autoplayMs ? String(autoplayMs) : '');
        clearInterval(timer);
        resetTimer();

        if (el.hasAttribute('data-edit')) {
          // Carousel has its own data-edit — save via __attr: approach
          document.dispatchEvent(new CustomEvent('slide-carousel-save', {
            detail: { editKey: editKey, html: null, autoplay: autoplayMs }
          }));
        } else {
          // No data-edit on carousel — save the nearest ancestor editable so
          // data-autoplay is embedded in its HTML (e.g. tabs containing this carousel)
          var parent = el.parentElement && el.parentElement.closest('[data-edit]:not(.slide)');
          if (parent) {
            var clone = parent.cloneNode(true);
            clone.querySelectorAll('[data-builder-only]').forEach(function (n) { n.remove(); });
            clone.querySelectorAll('[data-zoom-init]').forEach(function (n) { n.removeAttribute('data-zoom-init'); });
            clone.querySelectorAll('.ls-carousel-counter').forEach(function (n) { n.remove(); });
            document.dispatchEvent(new CustomEvent('slide-carousel-save', {
              detail: { editKey: parent.getAttribute('data-edit'), html: clone.innerHTML }
            }));
          } else {
            // Fallback: attr save with default editKey
            document.dispatchEvent(new CustomEvent('slide-carousel-save', {
              detail: { editKey: editKey, html: null, autoplay: autoplayMs }
            }));
          }
        }
      });

      el.appendChild(addBtn);
      el.appendChild(autoBtn);
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    function getSlides() {
      return Array.from(track.querySelectorAll('.ls-carousel-slide'));
    }

    function goTo(i) {
      var slides = getSlides();
      if (!slides.length) return;
      idx = Math.max(0, Math.min(slides.length - 1, i));
      track.style.transform = 'translateX(' + (idx * -el.offsetWidth) + 'px)';
      updateNav();
    }

    function updateNav() {
      var slides = getSlides();
      prevBtn.style.display = slides.length > 1 ? '' : 'none';
      nextBtn.style.display = slides.length > 1 ? '' : 'none';
      if (counterEl) {
        counterEl.textContent = slides.length > 1 ? (idx + 1) + ' / ' + slides.length : '';
      }
    }

    function resetTimer() {
      clearInterval(timer);
      if (autoplayMs > 0) {
        timer = setInterval(function () {
          var slides = getSlides();
          goTo(idx >= slides.length - 1 ? 0 : idx + 1);
        }, autoplayMs);
      }
    }

    function saveCarousel() {
      var clone = track.cloneNode(true);
      clone.querySelectorAll('[data-builder-only]').forEach(function (n) { n.remove(); });
      clone.querySelectorAll('.ls-carousel-caption').forEach(function (c) { c.remove(); });
      clone.querySelectorAll('[data-zoom-init]').forEach(function (n) { n.removeAttribute('data-zoom-init'); });
      // Strip stale counter divs that accumulate on repeated saves
      clone.querySelectorAll('.ls-carousel-counter').forEach(function (n) { n.remove(); });

      // Unwrap compare slides: side divs → flat imgs back on the slide element
      clone.querySelectorAll('.ls-compare').forEach(function (s) {
        var li = s.querySelector('.ls-cmp-side-left  img');
        var ri = s.querySelector('.ls-cmp-side-right img');
        s.innerHTML = '';
        if (li) { li.className = 'ls-cmp-left';  li.removeAttribute('data-zoom-init'); s.appendChild(li); }
        if (ri) { ri.className = 'ls-cmp-right'; ri.removeAttribute('data-zoom-init'); s.appendChild(ri); }
      });

      document.dispatchEvent(new CustomEvent('slide-carousel-save', {
        detail: { editKey: editKey, html: clone.outerHTML }
      }));
    }

    // ── Delete button ────────────────────────────────────────────────────────

    function ensureDelBtn(slide) {
      if (slide.querySelector('.ls-carousel-del')) return;
      var del = document.createElement('button');
      del.className = 'ls-carousel-del';
      del.textContent = '✕';
      del.setAttribute('data-builder-only', '');
      del.addEventListener('click', function (e) {
        e.stopPropagation();
        var slides = getSlides();
        if (slides.length <= 1) return;
        var i = slides.indexOf(slide);
        slide.remove();
        goTo(Math.min(i, getSlides().length - 1));
        updateNav();
        saveCarousel();
      });
      slide.insertBefore(del, slide.firstChild);
    }

    // ── Move left/right buttons ──────────────────────────────────────────────

    function ensureMoveButtons(slide) {
      if (slide.querySelector('.ls-carousel-move')) return;

      var moveLeft = document.createElement('button');
      moveLeft.className = 'ls-carousel-btn ls-carousel-move';
      moveLeft.setAttribute('data-builder-only', '');
      moveLeft.textContent = '◀';
      moveLeft.title = 'Move image left';
      moveLeft.style.cssText = 'position:absolute;top:8px;left:8px;width:26px;height:26px;font-size:13px;z-index:22;opacity:0;transition:opacity .2s;';

      var moveRight = document.createElement('button');
      moveRight.className = 'ls-carousel-btn ls-carousel-move';
      moveRight.setAttribute('data-builder-only', '');
      moveRight.textContent = '▶';
      moveRight.title = 'Move image right';
      moveRight.style.cssText = 'position:absolute;top:8px;right:38px;width:26px;height:26px;font-size:13px;z-index:22;opacity:0;transition:opacity .2s;';

      moveLeft.addEventListener('click', function (e) {
        e.stopPropagation();
        var slides = getSlides();
        var i = slides.indexOf(slide);
        if (i > 0) { track.insertBefore(slide, slides[i - 1]); goTo(i - 1); saveCarousel(); }
      });

      moveRight.addEventListener('click', function (e) {
        e.stopPropagation();
        var slides = getSlides();
        var i = slides.indexOf(slide);
        if (i < slides.length - 1) { track.insertBefore(slide, slides[i + 2] || null); goTo(i + 1); saveCarousel(); }
      });

      slide.addEventListener('mouseenter', function () {
        var slides = getSlides();
        var i = slides.indexOf(slide);
        moveLeft.style.opacity  = i > 0                 ? '1' : '0';
        moveRight.style.opacity = i < slides.length - 1 ? '1' : '0';
      });
      slide.addEventListener('mouseleave', function () {
        moveLeft.style.opacity = '0';
        moveRight.style.opacity = '0';
      });

      slide.appendChild(moveLeft);
      slide.appendChild(moveRight);
    }

    // ── Compare mode ─────────────────────────────────────────────────────────

    function ensureCompareBtn(slide) {
      if (slide.classList.contains('ls-compare')) return;
      if (slide.querySelector('.ls-cmp-enter')) return;
      var btn = document.createElement('button');
      btn.className = 'ls-cmp-enter';
      btn.setAttribute('data-builder-only', '');
      btn.textContent = '⇔ Compare';
      btn.title = 'Compare two images side by side';
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        enterCompare(slide);
      });
      slide.appendChild(btn);
    }

    function enterCompare(slide) {
      var existingImg = slide.querySelector('img:not([data-builder-only])');
      if (!existingImg) return;
      pickImage(function (path, name) {
        // Mark existing as left
        existingImg.classList.add('ls-cmp-left');
        existingImg.setAttribute('data-zoom', '');
        // Create right img
        var rightImg = document.createElement('img');
        rightImg.src = path;
        rightImg.alt = name;
        rightImg.className = 'ls-cmp-right';
        rightImg.setAttribute('data-zoom', '');
        slide.appendChild(rightImg);
        // Activate compare
        slide.classList.add('ls-compare');
        slide.dataset.compareMode = 'split';
        // Remove all builder-only controls then rebuild
        slide.querySelectorAll('[data-builder-only]').forEach(function (n) { n.remove(); });
        slide._lsCmpBuilt = false;
        buildCompareUI(slide);
        ensureDelBtn(slide);
        ensureMoveButtons(slide);
        if (window.Lightbox) Lightbox.init(slide);
        saveCarousel();
      });
    }

    function exitCompare(slide) {
      var leftImg = slide.querySelector('.ls-cmp-side-left img');
      if (!leftImg) leftImg = slide.querySelector('.ls-cmp-left');
      var src = leftImg ? leftImg.src  : '';
      var alt = leftImg ? leftImg.alt  : '';
      // Rebuild slide as single
      slide.innerHTML = '';
      slide.classList.remove('ls-compare', 'ls-split', 'ls-reveal');
      delete slide.dataset.compareMode;
      slide._lsCmpBuilt = false;
      if (src) {
        var img = document.createElement('img');
        img.src = src; img.alt = alt;
        img.setAttribute('data-zoom', '');
        slide.appendChild(img);
      }
      ensureDelBtn(slide);
      ensureMoveButtons(slide);
      ensureCompareBtn(slide);
      if (window.Lightbox) Lightbox.init(slide);
      saveCarousel();
    }

    function buildCompareUI(slide) {
      if (slide._lsCmpBuilt) return;
      slide._lsCmpBuilt = true;

      var leftImg  = slide.querySelector('img.ls-cmp-left');
      var rightImg = slide.querySelector('img.ls-cmp-right');
      if (!leftImg || !rightImg) return;

      var mode = slide.dataset.compareMode || 'split';

      // ── Build side wrappers ────────────────────────────────────────────────
      var leftSide  = document.createElement('div');
      leftSide.className = 'ls-cmp-side ls-cmp-side-left';

      var rightSide = document.createElement('div');
      rightSide.className = 'ls-cmp-side ls-cmp-side-right';

      // Move imgs into sides
      leftImg.parentNode.insertBefore(leftSide,  leftImg);
      leftSide.appendChild(leftImg);
      rightImg.parentNode.insertBefore(rightSide, rightImg);
      rightSide.appendChild(rightImg);

      // ── Labels (builder-only) ─────────────────────────────────────────────
      if (!window.PB_READONLY) {
        function makeLabel(side, img, pos) {
          var lbl = document.createElement('div');
          lbl.className = 'ls-cmp-label ls-cmp-label-' + pos;
          lbl.setAttribute('data-builder-only', '');
          lbl.textContent = img.alt || (pos === 'left' ? 'Before' : 'After');
          lbl.title = 'Double-click to rename';
          lbl.addEventListener('dblclick', function (e) {
            e.stopPropagation();
            lbl.contentEditable = 'true';
            lbl.focus();
            var r = document.createRange();
            r.selectNodeContents(lbl);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(r);
          });
          lbl.addEventListener('blur', function () {
            lbl.contentEditable = 'false';
            img.alt = lbl.textContent.trim() || img.alt;
            saveCarousel();
          });
          lbl.addEventListener('keydown', function (ev) {
            if (ev.key === 'Enter')  { ev.preventDefault(); lbl.blur(); }
            if (ev.key === 'Escape') { lbl.blur(); }
          });
          side.appendChild(lbl);
        }
        makeLabel(leftSide,  leftImg,  'left');
        makeLabel(rightSide, rightImg, 'right');

        // ── Per-side replace buttons (builder-only) ───────────────────────────
        function makeReplaceBtn(side, img) {
          var btn = document.createElement('button');
          btn.className = 'ls-cmp-replace';
          btn.setAttribute('data-builder-only', '');
          btn.textContent = '⟳';
          btn.title = 'Replace this image';
          btn.addEventListener('click', function (e) {
            e.stopPropagation();
            pickImage(function (path, name) {
              img.src = path;
              img.alt = name;
              var lbl = side.querySelector('.ls-cmp-label');
              if (lbl) lbl.textContent = name;
              saveCarousel();
            });
          });
          side.appendChild(btn);
        }
        makeReplaceBtn(leftSide,  leftImg);
        makeReplaceBtn(rightSide, rightImg);
      }

      // ── Divider line (split) and Reveal handle ────────────────────────────
      var divider = document.createElement('div');
      divider.className = 'ls-cmp-divider';
      divider.setAttribute('data-builder-only', '');
      slide.appendChild(divider);

      var handle = document.createElement('div');
      handle.className = 'ls-cmp-handle';
      // NOT data-builder-only — handle works in presentation mode too
      var grip = document.createElement('div');
      grip.className = 'ls-cmp-handle-grip';
      grip.textContent = '⇔';
      handle.appendChild(grip);
      slide.appendChild(handle);

      // Reveal drag logic
      var revealPct = 50;
      var dragging  = false;

      function setReveal(pct) {
        revealPct = Math.max(5, Math.min(95, pct));
        rightSide.style.clipPath = 'inset(0 ' + (100 - revealPct) + '% 0 0)';
        handle.style.left = revealPct + '%';
      }

      handle.addEventListener('mousedown',  function (e) { e.stopPropagation(); dragging = true; });
      handle.addEventListener('touchstart', function (e) { e.stopPropagation(); dragging = true; }, { passive: true });
      document.addEventListener('mousemove', function (e) {
        if (!dragging) return;
        var r = slide.getBoundingClientRect();
        setReveal(((e.clientX - r.left) / r.width) * 100);
      });
      document.addEventListener('touchmove', function (e) {
        if (!dragging) return;
        var r = slide.getBoundingClientRect();
        setReveal(((e.touches[0].clientX - r.left) / r.width) * 100);
      }, { passive: true });
      document.addEventListener('mouseup',  function () { dragging = false; });
      document.addEventListener('touchend', function () { dragging = false; });

      // ── Mode toggle button (builder-only) ─────────────────────────────────
      if (!window.PB_READONLY) {
        var modeBtn = document.createElement('button');
        modeBtn.className = 'ls-cmp-mode-btn';
        modeBtn.setAttribute('data-builder-only', '');

        function applyMode(m) {
          mode = m;
          slide.dataset.compareMode = m;
          slide.classList.toggle('ls-split',  m === 'split');
          slide.classList.toggle('ls-reveal', m === 'reveal');
          divider.style.display = m === 'split'  ? '' : 'none';
          handle.style.display  = m === 'reveal' ? '' : 'none';
          modeBtn.textContent   = m === 'split'  ? '⇔ Switch to Reveal' : '⇔ Switch to Split';
          if (m === 'reveal') setReveal(50);
          saveCarousel();
        }

        modeBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          applyMode(mode === 'split' ? 'reveal' : 'split');
        });
        slide.appendChild(modeBtn);

        // ── Exit compare button (builder-only) ────────────────────────────────
        var exitBtn = document.createElement('button');
        exitBtn.className = 'ls-cmp-exit';
        exitBtn.setAttribute('data-builder-only', '');
        exitBtn.textContent = '✕ Compare';
        exitBtn.title = 'Exit compare — keeps left image';
        exitBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          exitCompare(slide);
        });
        slide.appendChild(exitBtn);
      }

      // Apply initial mode (no save — just render)
      mode = slide.dataset.compareMode || 'split';
      slide.classList.toggle('ls-split',  mode === 'split');
      slide.classList.toggle('ls-reveal', mode === 'reveal');
      divider.style.display = mode === 'split'  ? '' : 'none';
      handle.style.display  = mode === 'reveal' ? '' : 'none';
      if (!window.PB_READONLY && typeof modeBtn !== 'undefined') {
        modeBtn.textContent = mode === 'split' ? '⇔ Switch to Reveal' : '⇔ Switch to Split';
      }
      if (mode === 'reveal') setReveal(50);
    }

    // ── Init a single carousel slide ─────────────────────────────────────────

    function initSlide(slide) {
      if (!window.PB_READONLY) {
        ensureDelBtn(slide);
        ensureMoveButtons(slide);
      }
      if (slide.classList.contains('ls-compare')) {
        buildCompareUI(slide);
      } else {
        if (!window.PB_READONLY) ensureCompareBtn(slide);
        // Caption overlay from img alt — skip if carousel opted out via data-no-caption
        if (!el.hasAttribute('data-no-caption')) {
          var img = slide.querySelector('img');
          if (img && img.alt && !slide.querySelector('.ls-carousel-caption')) {
            var cap = document.createElement('div');
            cap.className = 'ls-carousel-caption';
            cap.textContent = img.alt;
            slide.appendChild(cap);
          }
        }
      }
    }

    // ── Expose goTo for external sync (e.g. lightbox close) ────────────────
    el._lsGoTo = goTo;

    // ── Init existing slides ────────────────────────────────────────────────
    getSlides().forEach(initSlide);
    goTo(0);

    // ── Nav button handlers ─────────────────────────────────────────────────
    prevBtn.addEventListener('click', function () {
      var slides = getSlides();
      goTo(idx > 0 ? idx - 1 : slides.length - 1);
      resetTimer();
      if (window.Track) {
        var sid = Track.slideId(el);
        if (sid) {
          var img = getSlides()[idx] && getSlides()[idx].querySelector('img');
          Track.carousel(sid, 'prev', img ? (img.alt || '') : '');
        }
      }
    });

    nextBtn.addEventListener('click', function () {
      var slides = getSlides();
      goTo(idx < slides.length - 1 ? idx + 1 : 0);
      resetTimer();
      if (window.Track) {
        var sid = Track.slideId(el);
        if (sid) {
          var img = getSlides()[idx] && getSlides()[idx].querySelector('img');
          Track.carousel(sid, 'next', img ? (img.alt || '') : '');
        }
      }
    });

    // ── Pause autoplay on hover (builder only — not in readonly/viewer) ────
    if (!window.PB_READONLY) {
      el.addEventListener('mouseenter', function () { clearInterval(timer); });
      el.addEventListener('mouseleave', resetTimer);
    }

    // ── Touch swipe ─────────────────────────────────────────────────────────
    var touchX = 0;
    el.addEventListener('touchstart', function (e) { touchX = e.changedTouches[0].clientX; }, { passive: true });
    el.addEventListener('touchend', function (e) {
      var dx = touchX - e.changedTouches[0].clientX;
      if (Math.abs(dx) > 40) {
        var slides = getSlides();
        goTo(dx > 0
          ? (idx < slides.length - 1 ? idx + 1 : 0)
          : (idx > 0 ? idx - 1 : slides.length - 1));
        resetTimer();
      }
    });

    // ── Add image button ────────────────────────────────────────────────────
    if (!window.PB_READONLY) {
      addBtn.addEventListener('click', function () {
        pickImage(function (path, name) {
          var slide = document.createElement('div');
          slide.className = 'ls-carousel-slide';
          var img = document.createElement('img');
          img.src = path;
          img.alt = name;
          img.setAttribute('data-zoom', '');
          slide.appendChild(img);
          track.appendChild(slide);
          initSlide(slide);
          if (window.Lightbox) Lightbox.init(slide);
          goTo(getSlides().length - 1);
          updateNav();
          saveCarousel();
        });
      });
    }

    // ── Start autoplay ─────────────────────────────────────────────────────
    // Defer to next frame so layout is computed even if loaded inside display:none iframe
    requestAnimationFrame(function () { goTo(0); resetTimer(); });
    updateNav();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function init(root) {
    if (!root) root = document;
    root.querySelectorAll('.ls-carousel').forEach(initOne);
  }

  return { init: init };

})();
