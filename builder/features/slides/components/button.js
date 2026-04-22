/**
 * button.js — Presentation Builder Button Component
 *
 * Attaches Track.click() to every .slide-btn inside each slide on page load.
 * Label is taken from the button's text content.
 *
 * HTML structure:
 *   <a class="slide-btn" href="...">Contact us</a>
 *   <button class="slide-btn">Learn more</button>
 */

(function () {
  if (typeof window === 'undefined') return;

  function initSlide(slideEl) {
    slideEl.querySelectorAll('.slide-btn').forEach(function (btn) {
      if (btn.dataset.trackInit) return;
      btn.dataset.trackInit = '1';
      btn.addEventListener('click', function () {
        if (!window.Track) return;
        var slide = Track.slideId(btn);
        var label = (btn.textContent || '').trim() || 'button';
        Track.click(slide, label);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-slide]').forEach(initSlide);
  });

  window.Button = { init: initSlide };
})();
