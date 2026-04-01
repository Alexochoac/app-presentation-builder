/**
 * list.js — Editable List Component
 *
 * Adds drag-reorder, hide/show, add, delete, and double-click-edit behaviour
 * to any <ul data-ls-list> element.
 *
 * HTML structure:
 *   <ul data-ls-list data-edit="my-list">
 *     <li class="my-item">Item text</li>
 *   </ul>
 *   <div data-ls-restore></div>           <!-- optional: restore hidden items -->
 *   <button data-ls-add>+ Add item</button>  <!-- optional: add new item -->
 *
 * Item controls (injected at runtime, stripped on save):
 *   ⠿  drag handle — drag to reorder
 *   ×  hide button — hides item (restoreable via chip); shift+click to DELETE permanently
 *
 * Usage:
 *   List.init(slideEl)  — call after a slide is injected into the DOM
 */

window.List = (function () {

  // ── Inject component styles ───────────────────────────────────────────────
  (function injectStyle() {
    if (document.getElementById('ls-list-styles')) return;
    var style = document.createElement('style');
    style.id = 'ls-list-styles';
    style.textContent = [
      // Item controls overlay
      '.ls-list-item-controls{position:absolute;right:2px;top:50%;transform:translateY(-50%);display:flex;gap:3px;opacity:0;transition:opacity .2s;z-index:2;}',
      'li:hover .ls-list-item-controls{opacity:1;}',
      '.ls-list-item-btn{width:15px;height:15px;border-radius:3px;padding:0;background:rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.18);color:rgba(255,255,255,.45);font-size:8px;font-weight:900;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s;font-family:inherit;line-height:1;}',
      '.ls-list-drag-btn{cursor:grab;font-size:10px;}',
      '.ls-list-drag-btn:active{cursor:grabbing;}',
      // Hide btn: red on hover, darker red on shift
      '.ls-list-hide-btn:hover{background:rgba(239,68,68,.5);color:#fff;border-color:rgba(239,68,68,.4);}',
      // Hidden / drag states
      'li.ls-list-hidden{display:none;}',
      'li.ls-list-dragging{opacity:.35;}',
      'li.ls-list-dragover{border-top:2px solid #E8711A;}',
      // Editable state
      'li[contenteditable="true"]{outline:1px solid rgba(232,113,26,.5);border-radius:4px;background:rgba(232,113,26,.05);}',
      // Restore chip area
      '[data-ls-restore]{display:flex;flex-wrap:wrap;gap:4px;padding:4px 12px;flex-shrink:0;}',
      '[data-ls-restore]:empty{display:none;}',
      '.ls-list-restore-chip{padding:2px 9px;border-radius:20px;cursor:pointer;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);color:var(--text-muted,rgba(255,255,255,.5));font-size:10px;font-weight:600;font-family:inherit;transition:all .2s;}',
      '.ls-list-restore-chip:hover{background:rgba(255,255,255,.15);color:#fff;}',
      // Add button
      '[data-ls-add]{margin:4px 12px 8px;padding:3px 10px;border-radius:20px;background:transparent;border:1px dashed rgba(255,255,255,.15);color:rgba(255,255,255,.25);font-size:10px;font-weight:600;letter-spacing:.04em;font-family:inherit;cursor:pointer;transition:all .2s;align-self:flex-start;display:block;}',
      '[data-ls-add]:hover{border-color:rgba(232,113,26,.4);color:#E8711A;}',
    ].join('');
    document.head.appendChild(style);
  })();

  // ── Init a single list ────────────────────────────────────────────────────
  function initOne(ul) {
    if (ul._lsListInit) return;
    ul._lsListInit = true;

    var parent      = ul.parentElement;
    var restoreArea = parent ? parent.querySelector('[data-ls-restore]') : null;
    var addBtn      = parent ? parent.querySelector('[data-ls-add]')     : null;
    var dragSrc     = null;

    function saveList() {
      var clone = ul.cloneNode(true);
      clone.querySelectorAll('[data-builder-only]').forEach(function (n) { n.remove(); });
      clone.querySelectorAll('[contenteditable]').forEach(function (n) { n.removeAttribute('contenteditable'); });
      document.dispatchEvent(new CustomEvent('slide-carousel-save', {
        detail: { editKey: ul.getAttribute('data-edit') || ul.id, html: clone.innerHTML }
      }));
    }

    function initItem(li, isNew) {
      if (li._lsListItemInit) return;
      li._lsListItemInit = true;

      var ctrl = document.createElement('div');
      ctrl.className = 'ls-list-item-controls';
      ctrl.setAttribute('data-builder-only', '');

      // ── Drag handle ──────────────────────────────────────────────────────
      var dragBtn = document.createElement('button');
      dragBtn.className = 'ls-list-item-btn ls-list-drag-btn';
      dragBtn.textContent = '⠿';
      dragBtn.title = 'Drag to reorder';
      dragBtn.addEventListener('mousedown', function () { li.draggable = true; });
      dragBtn.addEventListener('mouseup',   function () { li.draggable = false; });

      // ── Hide / Delete button ─────────────────────────────────────────────
      // Normal click  → hide (restoreable)
      // Shift+click   → delete permanently
      // New items     → always delete
      var hideBtn = document.createElement('button');
      hideBtn.className = 'ls-list-item-btn ls-list-hide-btn';
      hideBtn.textContent = '×';
      hideBtn.title = isNew ? 'Delete' : 'Hide (Shift+click to delete)';
      hideBtn.onclick = function (e) {
        e.stopPropagation();
        if (isNew || e.shiftKey) {
          li.remove();
          saveList();
        } else {
          var text = li.innerText.replace('⠿×', '').trim().substring(0, 40);
          li.classList.add('ls-list-hidden');
          saveList();
          if (restoreArea) {
            var chip = document.createElement('button');
            chip.className = 'ls-list-restore-chip';
            chip.textContent = '+ ' + text;
            chip.onclick = function (ev) {
              ev.stopPropagation();
              li.classList.remove('ls-list-hidden');
              chip.remove();
              saveList();
            };
            restoreArea.appendChild(chip);
          }
        }
      };

      ctrl.appendChild(dragBtn);
      ctrl.appendChild(hideBtn);
      li.appendChild(ctrl);

      // ── Double-click to edit ─────────────────────────────────────────────
      // Suppresses onclick (e.g. popover) during editing
      li.addEventListener('dblclick', function (e) {
        if (e.target.closest('.ls-list-item-controls')) return;
        e.stopPropagation(); e.preventDefault();
        var orig = li.onclick;
        li.onclick = null;
        li.contentEditable = 'true'; li.focus();
        li.addEventListener('blur', function done() {
          li.contentEditable = 'false';
          li.onclick = orig;
          li.removeEventListener('blur', done);
          saveList();
        }, { once: true });
      });
      li.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); li.blur(); }
        if (e.key === 'Escape') { li.blur(); }
      });

      // ── Drag & drop reorder ──────────────────────────────────────────────
      li.addEventListener('dragstart', function (ev) {
        ev.dataTransfer.effectAllowed = 'move';
        dragSrc = li;
        setTimeout(function () { li.classList.add('ls-list-dragging'); }, 0);
      });
      li.addEventListener('dragend', function () {
        li.draggable = false;
        li.classList.remove('ls-list-dragging');
        ul.querySelectorAll('li').forEach(function (r) { r.classList.remove('ls-list-dragover'); });
      });
      li.addEventListener('dragover', function (ev) {
        ev.preventDefault();
        ul.querySelectorAll('li').forEach(function (r) { r.classList.remove('ls-list-dragover'); });
        if (li !== dragSrc) li.classList.add('ls-list-dragover');
      });
      li.addEventListener('drop', function (ev) {
        ev.stopPropagation();
        if (dragSrc && dragSrc !== li) {
          var items = Array.from(ul.querySelectorAll('li'));
          var si = items.indexOf(dragSrc), ti = items.indexOf(li);
          if (si < ti) ul.insertBefore(dragSrc, li.nextSibling);
          else         ul.insertBefore(dragSrc, li);
        }
        li.classList.remove('ls-list-dragover');
        saveList();
      });
    }

    ul.querySelectorAll('li').forEach(function (li) { initItem(li, false); });

    // Recreate restore chips for items already saved as hidden
    if (restoreArea) {
      ul.querySelectorAll('li.ls-list-hidden').forEach(function (li) {
        var text = li.innerText.replace('⠿×', '').trim().substring(0, 40);
        var chip = document.createElement('button');
        chip.className = 'ls-list-restore-chip';
        chip.textContent = '+ ' + text;
        chip.onclick = function (ev) {
          ev.stopPropagation();
          li.classList.remove('ls-list-hidden');
          chip.remove();
          saveList();
        };
        restoreArea.appendChild(chip);
      });
    }

    // ── Add new item ─────────────────────────────────────────────────────
    if (addBtn) {
      addBtn.onclick = function (e) {
        e.stopPropagation();
        var li = document.createElement('li');
        // Inherit class from first visible sibling so styling matches
        var sibling = ul.querySelector('li:not(.ls-list-hidden)');
        if (sibling) li.className = sibling.className;
        li.textContent = 'New item';
        ul.appendChild(li);
        initItem(li, true);
        // Open edit mode immediately
        li.dispatchEvent(new MouseEvent('dblclick'));
      };
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────
  function init(root) {
    (root || document).querySelectorAll('ul[data-ls-list]').forEach(initOne);
  }

  return { init: init };

})();
