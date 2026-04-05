/**
 * tracker.js — Presentation Builder Analytics
 *
 * Standardises Umami event names across all slides.
 * Event format: [slide]:[type]:[action]  (lowercase, hyphens)
 *
 * Usage:
 *   Track.tab('ls4', 'horizontal')       → ls4:tab:horizontal
 *   Track.zoom('ls6', 'defect-chip')     → ls6:zoom:defect-chip
 *   Track.carousel('ls4', 'next')        → ls4:carousel:next
 *   Track.expand('ls10', 'archive')      → ls10:expand:archive
 *   Track.click('ls14', 'whatsapp')      → ls14:click:whatsapp
 *   Track.event('ls5:custom', { val:1 }) → custom event with data
 *
 * Silently does nothing if window.umami is not available.
 */

window.Track = (function () {

  function fire(name, data) {
    if (!window.umami) return;
    if (data) {
      window.umami.track(name, data);
    } else {
      window.umami.track(name);
    }
  }

  function slug(str) {
    return String(str).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  return {
    /** Tab click: ls4:tab:horizontal */
    tab: function (slide, tabName) {
      fire(slug(slide) + ':tab:' + slug(tabName));
    },

    /** Image zoom / lightbox open: ls6:zoom:defect-chip */
    zoom: function (slide, imageKey) {
      fire(slug(slide) + ':zoom:' + slug(imageKey));
    },

    /** Carousel navigation: ls4:carousel:next */
    carousel: function (slide, direction) {
      fire(slug(slide) + ':carousel:' + slug(direction));
    },

    /** Accordion / expand section: ls10:expand:archive */
    expand: function (slide, section) {
      fire(slug(slide) + ':expand:' + slug(section));
    },

    /** Button / link click: ls14:click:whatsapp */
    click: function (slide, action) {
      fire(slug(slide) + ':click:' + slug(action));
    },

    /** Generic event with optional data payload */
    event: function (name, data) {
      fire(slug(name), data || undefined);
    }
  };

})();
