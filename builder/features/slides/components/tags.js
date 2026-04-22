/**
 * tags.js — Presentation Builder Tags Component
 *
 * Attaches Track.click() to every .slide-tag inside each slide on page load.
 * Label is taken from the tag's text content.
 *
 * HTML structure:
 *   <div class="slide-tags">
 *     <span class="slide-tag">Enterprise</span>
 *     <span class="slide-tag active">Cloud</span>
 *   </div>
 */

(function () {
  if (typeof window === 'undefined') return;

  function initSlide(slideEl) {
    slideEl.querySelectorAll('.slide-tag').forEach(function (tag) {
      if (tag.dataset.trackInit) return;
      tag.dataset.trackInit = '1';
      tag.addEventListener('click', function () {
        if (!window.Track) return;
        var slide = Track.slideId(tag);
        var label = (tag.textContent || '').trim() || 'tag';
        Track.click(slide, label);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-slide]').forEach(initSlide);
  });

  window.Tags = { init: initSlide };
})();
