/**
 * language-switcher.js
 * Client-side language switcher for finished presentations.
 * Reads [data-lang] spans and shows only the active language.
 * Active language is resolved from: ?lang= URL param → localStorage → data-default-lang on <body>
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'pres-lang';

  function getDefaultLang() {
    return document.body.getAttribute('data-default-lang') || 'en';
  }

  function resolveActiveLang() {
    var params = new URLSearchParams(window.location.search);
    var fromUrl = params.get('lang');
    if (fromUrl) return fromUrl;
    try { var stored = localStorage.getItem(STORAGE_KEY); if (stored) return stored; } catch (e) {}
    return getDefaultLang();
  }

  function applyLang(lang) {
    document.querySelectorAll('[data-lang]').forEach(function (el) {
      el.hidden = el.getAttribute('data-lang') !== lang;
    });
    document.querySelectorAll('.lang-switcher-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-lang') === lang);
    });
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
  }

  function switchLang(lang) {
    applyLang(lang);
    var url = new URL(window.location.href);
    url.searchParams.set('lang', lang);
    history.replaceState(null, '', url.toString());
  }

  // Expose for footer buttons
  window.switchLang = switchLang;

  // Init on DOM ready
  function init() {
    var lang = resolveActiveLang();
    // Validate: check if any [data-lang] spans exist for this lang; fall back to default
    var available = Array.from(document.querySelectorAll('[data-lang]')).map(function (el) {
      return el.getAttribute('data-lang');
    });
    var unique = Array.from(new Set(available));
    if (unique.length > 0 && !unique.includes(lang)) lang = getDefaultLang();
    applyLang(lang);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
