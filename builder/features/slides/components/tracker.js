/**
 * tracker.js — Presentation Builder Analytics
 *
 * Event format follows umami-guidelines:
 *   event name  = 'slide-[slide-id]'   e.g. 'slide-ls4'
 *   properties  = { label: 'component-label-action' }
 *
 * Usage:
 *   Track.tab('ls4', 'Archive')                   → slide-ls4, { label:'tab-Archive-click' }
 *   Track.zoom('ls6', 'Camera Detail')             → slide-ls6, { label:'image-Camera Detail-open' }
 *   Track.carousel('ls4', 'next', 'Belt Detail')  → slide-ls4, { label:'carousel-Belt Detail-next' }
 *   Track.expand('ls10', 'Archive')               → slide-ls10,{ label:'toggle-Archive-expand' }
 *   Track.click('ls14', 'whatsapp')               → slide-ls14,{ label:'button-whatsapp-click' }
 *   Track.event('slide-ls5', { label:'custom-foo' }) → raw call
 *
 * Silently does nothing if window.umami is not available.
 */

window.Track = (function () {

  function fire(name, props) {
    if (!window.umami) return;
    window.umami.track(name, props);
  }

  function slug(str) {
    return String(str).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function slideName(id) {
    return 'slide-' + slug(id);
  }

  /** Resolve slide id from a DOM element — walks up to the nearest [data-slide] */
  function slideId(el) {
    if (!el) return '';
    var node = el.closest ? el.closest('[data-slide]') : null;
    return node ? (node.getAttribute('data-slide') || '') : '';
  }

  return {
    /** Expose slideId helper so components can use it */
    slideId: slideId,

    /** Tab click */
    tab: function (slide, label) {
      fire(slideName(slide), { label: 'tab-' + String(label) + '-click' });
    },

    /** Image zoom / lightbox open */
    zoom: function (slide, label) {
      fire(slideName(slide), { label: 'image-' + String(label) + '-open' });
    },

    /** Carousel navigation — label is the caption/alt of the image navigated to */
    carousel: function (slide, action, label) {
      fire(slideName(slide), { label: 'carousel-' + String(label || '') + '-' + String(action) });
    },

    /** Accordion / expand section */
    expand: function (slide, label) {
      fire(slideName(slide), { label: 'toggle-' + String(label) + '-expand' });
    },

    /** Button / link click */
    click: function (slide, label) {
      fire(slideName(slide), { label: 'button-' + String(label) + '-click' });
    },

    /** Generic event with full props control */
    event: function (name, props) {
      fire(String(name), props || undefined);
    }
  };

})();
