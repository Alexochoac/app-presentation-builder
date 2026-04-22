/**
 * tracker.js — Presentation Builder Analytics
 *
 * Event format follows umami-guidelines:
 *   event name  = 'slide-[slide-id]'   e.g. 'slide-ls4'
 *   properties  = { component, label, action? }
 *
 * Usage:
 *   Track.tab('ls4', 'Archive')                   → slide-ls4, { component:'tab',      label:'Archive' }
 *   Track.zoom('ls6', 'Camera Detail')             → slide-ls6, { component:'image',    label:'Camera Detail' }
 *   Track.carousel('ls4', 'next', 'Belt Detail')  → slide-ls4, { component:'carousel', label:'Belt Detail', action:'next' }
 *   Track.expand('ls10', 'Archive')               → slide-ls10,{ component:'toggle',   label:'Archive' }
 *   Track.click('ls14', 'whatsapp')               → slide-ls14,{ component:'button',   label:'whatsapp' }
 *   Track.event('slide-ls5', { component:'custom', label:'foo' }) → raw call
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
      fire(slideName(slide), { component: 'tab', label: String(label) });
    },

    /** Image zoom / lightbox open */
    zoom: function (slide, label) {
      fire(slideName(slide), { component: 'image', label: String(label) });
    },

    /** Carousel navigation — label is the caption/alt of the image navigated to */
    carousel: function (slide, action, label) {
      var props = { component: 'carousel', action: String(action), label: String(label || '') };
      fire(slideName(slide), props);
    },

    /** Accordion / expand section */
    expand: function (slide, label) {
      fire(slideName(slide), { component: 'toggle', label: String(label) });
    },

    /** Button / link click */
    click: function (slide, label) {
      fire(slideName(slide), { component: 'button', label: String(label) });
    },

    /** Generic event with full props control */
    event: function (name, props) {
      fire(String(name), props || undefined);
    }
  };

})();
