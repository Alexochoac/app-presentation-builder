/**
 * carousel.js — Presentation Builder Carousel Component
 *
 * One reusable carousel implementation for all slides.
 * Replaces per-slide carousel code with a single declarative component.
 *
 * HTML structure:
 *   <div class="ls-carousel" data-edit="key" data-autoplay="4000" data-track="ls4:carousel">
 *     <div class="ls-carousel-track">
 *       <div class="ls-carousel-slide">
 *         <img src="/slides/uploads/image.jpg" alt="Caption text">
 *       </div>
 *     </div>
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
      '.ls-carousel-counter{position:absolute;bottom:10px;left:50%;transform:translateX(-50%);font-size:11px;font-weight:600;color:rgba(255,255,255,.5);letter-spacing:.06em;pointer-events:none;z-index:5;}',
    ].join('');
    document.head.appendChild(style);
  })();

  // ── Init a single carousel element ───────────────────────────────────────

  function initOne(el) {
    if (el._lsCarouselInit) return;
    el._lsCarouselInit = true;

    var track      = el.querySelector('.ls-carousel-track');
    var editKey    = el.getAttribute('data-edit') || 'carousel';
    var autoplayMs = parseInt(el.getAttribute('data-autoplay'), 10) || 0;
    var trackId    = el.getAttribute('data-track') || '';
    var showCounter = el.hasAttribute('data-counter') && el.getAttribute('data-counter') !== 'false';
    var idx        = 0;
    var timer      = null;

    if (!track) return;

    // ── Inject nav buttons ──────────────────────────────────────────────────
    var prevBtn = document.createElement('button');
    prevBtn.className = 'ls-carousel-btn ls-carousel-prev';
    prevBtn.setAttribute('data-builder-only', '');
    prevBtn.textContent = '‹';

    var nextBtn = document.createElement('button');
    nextBtn.className = 'ls-carousel-btn ls-carousel-next';
    nextBtn.setAttribute('data-builder-only', '');
    nextBtn.textContent = '›';

    var addBtn = document.createElement('button');
    addBtn.className = 'ls-carousel-add';
    addBtn.setAttribute('data-builder-only', '');
    addBtn.textContent = '+ Image';

    // ── Counter (optional) ──────────────────────────────────────────────────
    var counterEl = null;
    if (showCounter) {
      counterEl = document.createElement('div');
      counterEl.className = 'ls-carousel-counter';
      el.appendChild(counterEl);
    }

    el.appendChild(prevBtn);
    el.appendChild(nextBtn);
    el.appendChild(addBtn);

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
      clone.querySelectorAll('.ls-carousel-del').forEach(function (d) { d.remove(); });
      clone.querySelectorAll('.ls-carousel-caption').forEach(function (c) { c.remove(); });
      document.dispatchEvent(new CustomEvent('slide-carousel-save', {
        detail: { editKey: editKey, html: clone.outerHTML }
      }));
    }

    function ensureDelBtn(slide, isNew) {
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

    function initSlide(slide) {
      ensureDelBtn(slide);
      // Add caption overlay from img alt
      var img = slide.querySelector('img');
      if (img && img.alt && !slide.querySelector('.ls-carousel-caption')) {
        var cap = document.createElement('div');
        cap.className = 'ls-carousel-caption';
        cap.textContent = img.alt;
        slide.appendChild(cap);
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
      var newIdx = idx > 0 ? idx - 1 : slides.length - 1;
      goTo(newIdx);
      resetTimer();
      if (trackId && window.Track) Track.carousel(trackId.split(':')[0], 'prev');
    });

    nextBtn.addEventListener('click', function () {
      var slides = getSlides();
      var newIdx = idx < slides.length - 1 ? idx + 1 : 0;
      goTo(newIdx);
      resetTimer();
      if (trackId && window.Track) Track.carousel(trackId.split(':')[0], 'next');
    });

    // ── Pause autoplay on hover ─────────────────────────────────────────────
    el.addEventListener('mouseenter', function () { clearInterval(timer); });
    el.addEventListener('mouseleave', resetTimer);

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
    addBtn.addEventListener('click', function () {
      var input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*'; input.style.display = 'none';
      document.body.appendChild(input);
      input.addEventListener('change', function (e) {
        document.body.removeChild(input);
        var file = e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function (ev) {
          fetch('/api/upload-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: file.name, data: ev.target.result })
          })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (!data.path) return;
            var slide = document.createElement('div');
            slide.className = 'ls-carousel-slide';
            var img = document.createElement('img');
            img.src = data.path;
            img.alt = file.name.replace(/\.[^.]+$/, '');
            slide.appendChild(img);
            track.appendChild(slide);
            initSlide(slide);
            goTo(getSlides().length - 1);
            updateNav();
            saveCarousel();
          });
        };
        reader.readAsDataURL(file);
      });
      input.click();
    });

    // ── Start autoplay ──────────────────────────────────────────────────────
    resetTimer();
    updateNav();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Scan root element for .ls-carousel elements and initialise each.
   * Safe to call multiple times — skips already-initialised carousels.
   * @param {Element} root
   */
  function init(root) {
    if (!root) root = document;
    root.querySelectorAll('.ls-carousel').forEach(initOne);
  }

  return { init: init };

})();
