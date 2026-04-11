/**
 * tabs.js — Presentation Builder Tabs Component
 *
 * Declarative tab system where each panel can hold any content,
 * including .ls-carousel elements.
 *
 * HTML structure:
 *   <div class="ls-tabs" data-edit="tabs" data-track="ls10:tabs">
 *     <div class="ls-tab-list">
 *       <button class="ls-tab active" data-panel="0">Archive</button>
 *       <button class="ls-tab" data-panel="1">Management Console</button>
 *     </div>
 *     <div class="ls-tab-panels">
 *       <div class="ls-tab-panel active" data-panel="0">
 *         <!-- any content, e.g. .ls-carousel -->
 *       </div>
 *       <div class="ls-tab-panel" data-panel="1">
 *         <!-- any content -->
 *       </div>
 *     </div>
 *   </div>
 *
 * Builder features (data-builder-only, stripped in final output):
 *   - Double-click a tab label to rename it
 *   - ✕ button on each tab to delete it (hidden when only 1 tab)
 *   - "+ Tab" button to add a new empty tab
 *
 * Usage:
 *   Tabs.init(slideEl)  — call after a slide is injected into the DOM
 */

window.Tabs = (function () {

  // ── Inject component styles ────────────────────────────────────────────────
  (function injectStyle() {
    if (document.getElementById('ls-tabs-styles')) return;
    var style = document.createElement('style');
    style.id = 'ls-tabs-styles';
    style.textContent = [
      /* Wrapper */
      '.ls-tabs{display:flex;flex-direction:column;width:100%;height:100%;}',

      /* Tab list row */
      '.ls-tab-list{flex-shrink:0;display:flex;align-items:center;gap:6px;margin-bottom:10px;flex-wrap:wrap;}',

      /* Individual tab button */
      '.ls-tab{padding:6px 20px;border-radius:100px;border:1px solid var(--border,rgba(255,255,255,.1));background:var(--bg-card,#111);color:var(--text-muted,rgba(255,255,255,.45));font-size:12px;font-weight:600;font-family:inherit;cursor:pointer;transition:all .2s;letter-spacing:.02em;white-space:nowrap;position:relative;}',
      '.ls-tab:hover{border-color:#E8711A;color:#E8711A;}',
      '.ls-tab.active{background:rgba(232,113,26,.15);border-color:#E8711A;color:#E8711A;}',

      /* Delete button on tab (builder-only) */
      '.ls-tab-del{position:absolute;top:-5px;right:-5px;width:16px;height:16px;border-radius:50%;background:rgba(180,30,30,.85);border:1px solid rgba(255,100,100,.3);color:#fff;font-size:9px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .2s,background .2s;font-family:inherit;padding:0;z-index:5;}',
      '.ls-tab:hover .ls-tab-del{opacity:1;}',
      '.ls-tab-del:hover{background:rgba(220,40,40,1);}',

      /* Add tab button (builder-only) */
      '.ls-tab-add{padding:5px 14px;border-radius:100px;border:1px dashed rgba(255,255,255,.18);background:transparent;color:rgba(255,255,255,.3);font-size:11px;font-weight:700;font-family:inherit;cursor:pointer;transition:all .2s;letter-spacing:.04em;flex-shrink:0;}',
      '.ls-tab-add:hover{border-color:#E8711A;color:#E8711A;}',

      /* Panels container */
      '.ls-tab-panels{flex:1;min-height:0;position:relative;}',

      /* Individual panel */
      '.ls-tab-panel{display:none;width:100%;height:100%;}',
      '.ls-tab-panel.active{display:flex;flex-direction:column;}',
    ].join('');
    document.head.appendChild(style);
  })();

  // ── Init a single tabs element ─────────────────────────────────────────────
  function initOne(el) {
    if (el._lsTabsInit) return;
    el._lsTabsInit = true;

    var editKey = el.getAttribute('data-edit') || 'tabs';
    var trackId = el.getAttribute('data-track') || '';

    var tabList   = el.querySelector('.ls-tab-list');
    var panelsEl  = el.querySelector('.ls-tab-panels');
    if (!tabList || !panelsEl) return;

    // ── Helpers ──────────────────────────────────────────────────────────────

    function getTabs()   { return Array.from(tabList.querySelectorAll('.ls-tab:not(.ls-tab-add)')); }
    function getPanels() { return Array.from(panelsEl.querySelectorAll('.ls-tab-panel')); }

    function switchTo(panelId) {
      getTabs().forEach(function (t) { t.classList.toggle('active', t.dataset.panel === panelId); });
      getPanels().forEach(function (p) { p.classList.toggle('active', p.dataset.panel === panelId); });
      // Init any carousels inside the newly visible panel
      var activePanel = panelsEl.querySelector('.ls-tab-panel.active');
      if (activePanel && window.Carousel) Carousel.init(activePanel);
      if (activePanel && window.LSTable)  LSTable.init(activePanel);
      if (trackId && window.Track) Track.click(trackId.split(':')[0], 'tab-' + panelId);
    }

    function saveTabs() {
      // Clone the tab-list + panels, strip builder-only elements
      var clone = el.cloneNode(true);
      clone.querySelectorAll('[data-builder-only]').forEach(function (n) { n.remove(); });
      document.dispatchEvent(new CustomEvent('slide-carousel-save', {
        detail: { editKey: editKey, html: clone.innerHTML }
      }));
    }

    function nextPanelId() {
      var ids = getPanels().map(function (p) { return parseInt(p.dataset.panel, 10) || 0; });
      return String(ids.length ? Math.max.apply(null, ids) + 1 : 0);
    }

    // ── Wire delete button on a tab ──────────────────────────────────────────
    function addDelBtn(tabBtn) {
      if (tabBtn.querySelector('.ls-tab-del')) return;
      var del = document.createElement('button');
      del.className = 'ls-tab-del';
      del.setAttribute('data-builder-only', '');
      del.textContent = '✕';
      del.title = 'Delete tab';
      del.addEventListener('click', function (e) {
        e.stopPropagation();
        var tabs = getTabs();
        if (tabs.length <= 1) return; // never delete the last tab
        var id = tabBtn.dataset.panel;
        var panel = panelsEl.querySelector('.ls-tab-panel[data-panel="' + id + '"]');
        var wasActive = tabBtn.classList.contains('active');
        tabBtn.remove();
        if (panel) panel.remove();
        // If we deleted the active tab, activate the first remaining one
        if (wasActive) {
          var remaining = getTabs();
          if (remaining.length) switchTo(remaining[0].dataset.panel);
        }
        updateDelBtns();
        saveTabs();
      });
      tabBtn.appendChild(del);
    }

    // ── Show/hide delete buttons (hide when only 1 tab) ──────────────────────
    function updateDelBtns() {
      var tabs = getTabs();
      tabs.forEach(function (t) {
        addDelBtn(t);
        var btn = t.querySelector('.ls-tab-del');
        if (btn) btn.style.display = tabs.length > 1 ? '' : 'none';
      });
    }

    // ── Wire rename on double-click ──────────────────────────────────────────
    function wireRename(tabBtn) {
      if (tabBtn._lsRenameWired) return;
      tabBtn._lsRenameWired = true;
      tabBtn.addEventListener('dblclick', function (e) {
        e.stopPropagation();
        var del = tabBtn.querySelector('.ls-tab-del');
        // Temporarily hide del button so it doesn't interfere
        if (del) del.style.opacity = '0';
        tabBtn.contentEditable = 'true';
        tabBtn.focus();
        // Select all text
        var range = document.createRange();
        range.selectNodeContents(tabBtn);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      });
      tabBtn.addEventListener('blur', function () {
        tabBtn.contentEditable = 'false';
        // Strip any del button text that got into the label
        var del = tabBtn.querySelector('.ls-tab-del');
        if (del) del.style.opacity = '';
        saveTabs();
      });
      tabBtn.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); tabBtn.blur(); }
        if (e.key === 'Escape') { e.preventDefault(); tabBtn.blur(); }
      });
    }

    // ── Wire click on a tab ──────────────────────────────────────────────────
    function wireTab(tabBtn) {
      addDelBtn(tabBtn);
      wireRename(tabBtn);
      if (tabBtn._lsClickWired) return;
      tabBtn._lsClickWired = true;
      tabBtn.addEventListener('click', function (e) {
        // Ignore clicks on child buttons (del)
        if (e.target !== tabBtn) return;
        switchTo(tabBtn.dataset.panel);
      });
    }

    // ── "+ Tab" button ───────────────────────────────────────────────────────
    var addBtn = document.createElement('button');
    addBtn.className = 'ls-tab-add';
    addBtn.setAttribute('data-builder-only', '');
    addBtn.textContent = '+ Tab';
    addBtn.addEventListener('click', function () {
      var id = nextPanelId();

      // New tab button
      var newTab = document.createElement('button');
      newTab.className = 'ls-tab';
      newTab.dataset.panel = id;
      newTab.textContent = 'New Tab';
      tabList.insertBefore(newTab, addBtn);

      // New empty panel
      var newPanel = document.createElement('div');
      newPanel.className = 'ls-tab-panel';
      newPanel.dataset.panel = id;
      newPanel.innerHTML = [
        '<div class="ls-carousel" data-counter data-zoom-group style="flex:1;min-height:0;width:100%;">',
        '  <div class="ls-carousel-track">',
        '    <div class="ls-carousel-slide" style="display:flex;align-items:center;justify-content:center;">',
        '      <span style="color:rgba(255,255,255,.2);font-size:13px;font-style:italic;">Add images with the + Image button</span>',
        '    </div>',
        '  </div>',
        '</div>',
      ].join('');
      panelsEl.appendChild(newPanel);

      wireTab(newTab);
      updateDelBtns();
      switchTo(id);
      saveTabs();

      // Trigger rename immediately
      setTimeout(function () { newTab.dispatchEvent(new MouseEvent('dblclick')); }, 50);
    });
    tabList.appendChild(addBtn);

    // ── Init existing tabs + panels ──────────────────────────────────────────
    getTabs().forEach(wireTab);
    updateDelBtns();

    // Ensure one active tab; activate first if none
    if (!tabList.querySelector('.ls-tab.active')) {
      var first = getTabs()[0];
      if (first) first.classList.add('active');
    }
    var activePanelId = (tabList.querySelector('.ls-tab.active') || {}).dataset && tabList.querySelector('.ls-tab.active').dataset.panel;
    getPanels().forEach(function (p) {
      p.classList.toggle('active', p.dataset.panel === activePanelId);
    });

    // Init carousels in the initially visible panel
    var initPanel = panelsEl.querySelector('.ls-tab-panel.active');
    if (initPanel && window.Carousel) Carousel.init(initPanel);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Scan root element for .ls-tabs elements and initialise each.
   * Safe to call multiple times — skips already-initialised elements.
   * @param {Element} root
   */
  function init(root) {
    if (!root) root = document;
    root.querySelectorAll('.ls-tabs').forEach(initOne);
  }

  return { init: init };

})();
