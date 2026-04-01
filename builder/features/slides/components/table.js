/**
 * table.js — Editable Capability-Matrix Table Component
 *
 * Adds to any <table data-ls-table>:
 *   - Row reorder (drag handle in first cell)
 *   - Row hide/restore  (× button; Shift+click to delete permanently)
 *   - Row add           (via [data-ls-add-row] button outside the table)
 *   - Column hide/restore (− button in each th)
 *   - Cell text edit    (double-click first cell)
 *   - Dot cells cycling (click: filled → outline → empty → filled …)
 *   - Auto-save to disk via slide-carousel-save event
 *
 * HTML structure:
 *   <div class="my-table-wrap">
 *     <table data-ls-table data-edit="my-table">
 *       <colgroup><col><col>…</colgroup>
 *       <thead>
 *         <tr>
 *           <th></th>
 *           <th class="ls-th-col"><span class="ls-col-label">Product A</span></th>
 *           …
 *         </tr>
 *       </thead>
 *       <tbody>
 *         <tr>
 *           <td>Row label</td>
 *           <td><span class="ls-dot ls-dot-on">◆</span></td>
 *           …
 *         </tr>
 *       </tbody>
 *     </table>
 *     <div data-ls-col-restore></div>   <!-- column restore chips -->
 *     <div data-ls-row-restore></div>   <!-- row restore chips    -->
 *     <button data-ls-add-row>+ Add row</button>
 *   </div>
 *
 * Dot classes:
 *   ls-dot-on  — filled, primary colour
 *   ls-dot-off — outline / optional
 *   (add ls-dot-red / ls-dot-blue etc. to <th> → auto-applied to new dots in that column)
 *
 * Usage:
 *   LSTable.init(slideEl)  — call after slide is injected into the DOM
 */

window.LSTable = (function () {

  // ── Inject component styles ───────────────────────────────────────────────
  (function injectStyle() {
    if (document.getElementById('ls-table-styles')) return;
    var style = document.createElement('style');
    style.id = 'ls-table-styles';
    style.textContent = [
      /* ── Dot symbols ── */
      '.ls-dot{font-size:12px;}',
      '.ls-dot-on{color:#E8711A;}',
      '.ls-dot-off{color:rgba(255,255,255,.25);}',
      '.ls-dot-red{color:#f87171;}',
      '.ls-dot-blue{color:#63b3ed;}',

      /* ── Column toggle button (hidden until th:hover) ── */
      '.ls-col-toggle{opacity:0;width:14px;height:14px;border-radius:3px;padding:0;background:rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.5);font-size:9px;font-weight:900;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:all .2s;font-family:inherit;line-height:1;margin-top:2px;vertical-align:middle;}',
      'th:hover .ls-col-toggle{opacity:1;}',
      '.ls-col-toggle:hover{background:rgba(239,68,68,.4);color:#fff;border-color:rgba(239,68,68,.4);}',
      'col.ls-col-collapsed{visibility:collapse;}',

      /* ── Row drag handle ── */
      '.ls-row-drag{opacity:0;cursor:grab;font-size:11px;color:rgba(255,255,255,.3);margin-right:4px;vertical-align:middle;user-select:none;transition:opacity .2s;}',
      'tr:hover .ls-row-drag{opacity:1;}',
      '.ls-row-drag:active{cursor:grabbing;}',
      'tr.ls-row-dragging{opacity:.4;background:rgba(232,113,26,.08)!important;}',
      'tr.ls-row-dragover td{border-top:2px solid #E8711A!important;}',
      'tr.ls-row-hidden{display:none;}',

      /* ── Row hide button ── */
      '.ls-row-hide-btn{opacity:0;width:13px;height:13px;border-radius:3px;padding:0;background:rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.18);color:rgba(255,255,255,.45);font-size:8px;font-weight:900;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:all .2s;font-family:inherit;line-height:1;margin-right:5px;flex-shrink:0;vertical-align:middle;}',
      'tr:hover .ls-row-hide-btn{opacity:1;}',
      '.ls-row-hide-btn:hover{background:rgba(239,68,68,.45);color:#fff;border-color:rgba(239,68,68,.4);}',

      /* ── Editable first cell ── */
      'td[contenteditable="true"]{outline:1px solid rgba(232,113,26,.5);border-radius:3px;background:rgba(232,113,26,.05);padding-left:4px;}',

      /* ── Dot cells clickable ── */
      '[data-ls-table] tbody td:not(:first-child){cursor:pointer;}',
      '[data-ls-table] tbody td:not(:first-child):hover{background:rgba(255,255,255,.05)!important;}',

      /* ── Restore chip areas ── */
      '[data-ls-col-restore],[data-ls-row-restore]{display:flex;flex-wrap:wrap;gap:5px;padding:4px 0;min-height:0;}',
      '[data-ls-col-restore]:empty,[data-ls-row-restore]:empty{display:none;}',
      '.ls-table-restore-chip{padding:3px 10px;border-radius:20px;cursor:pointer;background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.3);color:#4ade80;font-size:10px;font-weight:700;letter-spacing:.04em;font-family:inherit;transition:all .2s;}',
      '.ls-table-restore-chip:hover{background:rgba(34,197,94,.25);color:#fff;}',
      '.ls-table-row-chip{background:rgba(155,155,155,.1)!important;border-color:rgba(255,255,255,.2)!important;color:var(--text-muted)!important;}',
      '.ls-table-row-chip:hover{background:rgba(255,255,255,.15)!important;color:#fff!important;}',

      /* ── Add row button ── */
      '[data-ls-add-row]{align-self:flex-start;padding:3px 10px;border-radius:20px;cursor:pointer;background:transparent;border:1px dashed rgba(255,255,255,.15);color:rgba(255,255,255,.25);font-size:10px;font-weight:600;letter-spacing:.04em;font-family:inherit;margin-top:2px;transition:all .2s;display:inline-block;}',
      '[data-ls-add-row]:hover{border-color:rgba(232,113,26,.4);color:#E8711A;}',
    ].join('');
    document.head.appendChild(style);
  })();

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Get the dot class to apply for a given column index (reads th class) */
  function dotClass(table, colIdx) {
    var ths = table.querySelectorAll('thead th');
    var th = ths[colIdx];
    if (!th) return 'ls-dot-on';
    if (th.classList.contains('ls-dot-red')  || th.classList.contains('ls4-col-red'))  return 'ls-dot-red';
    if (th.classList.contains('ls-dot-blue') || th.classList.contains('ls4-col-blue')) return 'ls-dot-blue';
    return 'ls-dot-on';
  }

  /** Save full table HTML to disk */
  function saveTable(table) {
    var editKey = table.getAttribute('data-edit') || 'table';
    var clone = table.cloneNode(true);
    clone.querySelectorAll('[data-builder-only]').forEach(function (n) { n.remove(); });
    clone.querySelectorAll('[contenteditable]').forEach(function (n) { n.removeAttribute('contenteditable'); });
    document.dispatchEvent(new CustomEvent('slide-carousel-save', {
      detail: { editKey: editKey, html: clone.outerHTML }
    }));
  }

  // ── Init a single table ───────────────────────────────────────────────────
  function initOne(table) {
    if (table._lsTableInit) return;
    table._lsTableInit = true;

    var wrap        = table.parentElement;
    var tbody       = table.querySelector('tbody');
    if (!tbody) return;

    var colRestore  = wrap ? wrap.querySelector('[data-ls-col-restore]') : null;
    var rowRestore  = wrap ? wrap.querySelector('[data-ls-row-restore]') : null;
    var addRowBtn   = wrap ? wrap.querySelector('[data-ls-add-row]')     : null;

    // ── Column toggle buttons ─────────────────────────────────────────────
    table.querySelectorAll('thead th').forEach(function (th, idx) {
      if (idx === 0) return; // skip label column
      if (th.querySelector('.ls-col-toggle')) return; // already has one

      var btn = document.createElement('button');
      btn.className = 'ls-col-toggle';
      btn.setAttribute('data-builder-only', '');
      btn.textContent = '−';
      btn.title = 'Hide column (Shift+click to show all)';
      btn.onclick = function (e) {
        e.stopPropagation();
        if (e.shiftKey) {
          // Shift+click: restore all hidden columns
          table.querySelectorAll('colgroup col.ls-col-collapsed').forEach(function (c) {
            c.classList.remove('ls-col-collapsed');
          });
          if (colRestore) colRestore.innerHTML = '';
          saveTable(table);
          return;
        }
        var col = table.querySelectorAll('colgroup col')[idx];
        var name = th.querySelector('.ls-col-label') ? th.querySelector('.ls-col-label').textContent.trim() : th.textContent.trim();
        col.classList.add('ls-col-collapsed');
        saveTable(table);
        if (colRestore) {
          var chip = document.createElement('button');
          chip.className = 'ls-table-restore-chip';
          chip.textContent = '+ ' + name;
          chip.onclick = function (ev) {
            ev.stopPropagation();
            col.classList.remove('ls-col-collapsed');
            chip.remove();
            saveTable(table);
          };
          colRestore.appendChild(chip);
        }
      };
      th.appendChild(btn);
    });

    // ── Row init ──────────────────────────────────────────────────────────
    function initRow(tr, isNew) {
      var firstTd = tr.children[0];
      if (!firstTd) return;
      if (firstTd.querySelector('.ls-row-hide-btn')) return; // already init

      // Drag handle
      var drag = document.createElement('span');
      drag.className = 'ls-row-drag';
      drag.setAttribute('data-builder-only', '');
      drag.textContent = '⠿';
      drag.title = 'Drag to reorder';
      drag.addEventListener('mousedown', function () { tr.draggable = true; });
      drag.addEventListener('mouseup',   function () { tr.draggable = false; });
      firstTd.insertBefore(drag, firstTd.firstChild);

      // Row drag & drop
      tr.addEventListener('dragstart', function (ev) {
        ev.dataTransfer.effectAllowed = 'move';
        tr.classList.add('ls-row-dragging');
        tbody._dragSrc = tr;
      });
      tr.addEventListener('dragend', function () {
        tr.draggable = false;
        tr.classList.remove('ls-row-dragging');
        tbody.querySelectorAll('tr').forEach(function (r) { r.classList.remove('ls-row-dragover'); });
        saveTable(table);
      });
      tr.addEventListener('dragover', function (ev) {
        ev.preventDefault();
        tbody.querySelectorAll('tr').forEach(function (r) { r.classList.remove('ls-row-dragover'); });
        if (tr !== tbody._dragSrc) tr.classList.add('ls-row-dragover');
      });
      tr.addEventListener('drop', function (ev) {
        ev.stopPropagation();
        var src = tbody._dragSrc;
        if (src && src !== tr) {
          var rows = Array.from(tbody.children);
          if (rows.indexOf(src) < rows.indexOf(tr)) tbody.insertBefore(src, tr.nextSibling);
          else tbody.insertBefore(src, tr);
        }
        tr.classList.remove('ls-row-dragover');
      });

      // Hide / Delete button
      var hideBtn = document.createElement('button');
      hideBtn.className = 'ls-row-hide-btn';
      hideBtn.setAttribute('data-builder-only', '');
      hideBtn.textContent = '×';
      hideBtn.title = isNew ? 'Delete row' : 'Hide row (Shift+click to delete)';
      hideBtn.onclick = function (ev) {
        ev.stopPropagation();
        if (isNew || ev.shiftKey) {
          tr.remove();
          saveTable(table);
        } else {
          var rowName = firstTd.innerText.replace('×⠿', '').replace('×', '').trim().substring(0, 35);
          tr.classList.add('ls-row-hidden');
          saveTable(table);
          if (rowRestore) {
            var chip = document.createElement('button');
            chip.className = 'ls-table-restore-chip ls-table-row-chip';
            chip.textContent = '+ ' + rowName;
            chip.onclick = function (cev) {
              cev.stopPropagation();
              tr.classList.remove('ls-row-hidden');
              chip.remove();
              saveTable(table);
            };
            rowRestore.appendChild(chip);
          }
        }
      };
      firstTd.insertBefore(hideBtn, firstTd.firstChild);

      // Double-click first cell to edit label text
      firstTd.addEventListener('dblclick', function (ev) {
        ev.stopPropagation();
        firstTd.contentEditable = 'true';
        firstTd.focus();
      });
      firstTd.addEventListener('blur', function () {
        firstTd.contentEditable = 'false';
        saveTable(table);
      });
      firstTd.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter')  { ev.preventDefault(); firstTd.blur(); }
        if (ev.key === 'Escape') { firstTd.blur(); }
      });

      // Click dot cells to cycle: filled → outline → empty
      Array.from(tr.children).slice(1).forEach(function (td, i) {
        td.addEventListener('click', function (ev) {
          ev.stopPropagation();
          var colIdx = i + 1;
          var span = td.querySelector('.ls-dot');
          var dc = dotClass(table, colIdx);
          if (!span) {
            td.innerHTML = '<span class="ls-dot ' + dc + '">◆</span>';
          } else if (span.classList.contains('ls-dot-off')) {
            td.innerHTML = '';
          } else {
            // filled → outline
            span.className = 'ls-dot ls-dot-off';
            span.textContent = '◇';
          }
          saveTable(table);
        });
      });
    }

    tbody.querySelectorAll('tr').forEach(function (tr) { initRow(tr, false); });

    // Rebuild column restore chips from saved collapsed state
    if (colRestore) {
      colRestore.innerHTML = '';
      var cols = Array.from(table.querySelectorAll('colgroup col'));
      var ths  = Array.from(table.querySelectorAll('thead th'));
      cols.forEach(function (col, idx) {
        if (!col.classList.contains('ls-col-collapsed')) return;
        var th = ths[idx]; if (!th) return;
        var label = th.querySelector('.ls-col-label') || th;
        var name  = label.textContent.trim();
        var chip  = document.createElement('button');
        chip.className = 'ls-table-restore-chip';
        chip.textContent = '+ ' + name;
        chip.onclick = function (ev) {
          ev.stopPropagation();
          col.classList.remove('ls-col-collapsed');
          chip.remove();
          saveTable(table);
        };
        colRestore.appendChild(chip);
      });
    }

    // Rebuild row restore chips from saved hidden state
    if (rowRestore) {
      rowRestore.innerHTML = '';
      tbody.querySelectorAll('tr.ls-row-hidden').forEach(function (tr) {
        var firstTd = tr.children[0]; if (!firstTd) return;
        var rowName = firstTd.innerText.replace('×⠿', '').replace('×', '').trim().substring(0, 35);
        var chip = document.createElement('button');
        chip.className = 'ls-table-restore-chip ls-table-row-chip';
        chip.textContent = '+ ' + rowName;
        chip.onclick = function (cev) {
          cev.stopPropagation();
          tr.classList.remove('ls-row-hidden');
          chip.remove();
          saveTable(table);
        };
        rowRestore.appendChild(chip);
      });
    }

    // Add row button
    if (addRowBtn && !addRowBtn._lsInit) {
      addRowBtn._lsInit = true;
      addRowBtn.onclick = function (ev) {
        ev.stopPropagation();
        var colCount = table.querySelectorAll('thead th').length;
        var tr = document.createElement('tr');
        for (var c = 0; c < colCount; c++) {
          var td = document.createElement('td');
          if (c === 0) td.textContent = 'New row';
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
        initRow(tr, true);
        tr.children[0].dispatchEvent(new MouseEvent('dblclick'));
      };
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────
  function init(root) {
    (root || document).querySelectorAll('table[data-ls-table]').forEach(initOne);
  }

  return { init: init };

})();
