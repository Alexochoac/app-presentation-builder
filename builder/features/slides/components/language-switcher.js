/**
 * language-switcher.js
 * Client-side language switcher for finished presentations.
 * Reads [data-lang] spans and shows only the active language.
 * Active language is resolved from: ?lang= URL param → per-presentation localStorage → data-default-lang on <body>
 */
(function () {
  'use strict';

  // Use a per-presentation key so each presentation starts in its own default language
  var presId = document.body.getAttribute('data-pres-id') || 'default';
  var STORAGE_KEY = 'pres-lang-' + presId;

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
    // Update dropdown label and active state
    var label = document.getElementById('fp-lang-label');
    if (label) label.textContent = lang.toUpperCase();
    document.querySelectorAll('#fp-lang-menu button[data-lang]').forEach(function (btn) {
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

  // Expose for dropdown buttons
  window.switchLang = switchLang;

  window.fpLangToggle = function () {
    var menu = document.getElementById('fp-lang-menu');
    if (menu) menu.classList.toggle('open');
  };

  window.fpLangSelect = function (lang) {
    switchLang(lang);
    var menu = document.getElementById('fp-lang-menu');
    if (menu) menu.classList.remove('open');
  };

  // Close dropdown on outside click
  document.addEventListener('click', function (e) {
    var drop = document.getElementById('fp-lang-drop');
    if (drop && !drop.contains(e.target)) {
      var menu = document.getElementById('fp-lang-menu');
      if (menu) menu.classList.remove('open');
    }
  });

  // Init on DOM ready
  function init() {
    var lang = resolveActiveLang();
    // Validate: if resolved lang has no spans in this presentation, fall back to default
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
