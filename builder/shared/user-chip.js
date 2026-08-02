/**
 * user-chip.js — shows "Signed in as <email>" in the sidebar, above the Log out
 * link. Loaded on every builder page (served from /shared, auth-gated). Keeps
 * the logic in one place so the 5 page templates don't each duplicate it.
 */
(function () {
  function inject(email) {
    var box = document.querySelector('.sidebar-logout');
    if (!box || box.querySelector('.sidebar-user')) return;
    var el = document.createElement('div');
    el.className = 'sidebar-user';
    el.title = 'Signed in as ' + email;
    el.textContent = email;
    el.style.cssText =
      'padding:6px 16px 4px;font-size:11px;line-height:1.3;color:var(--muted,#8b98a6);' +
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;';
    box.insertBefore(el, box.firstChild);
  }

  function start() {
    fetch('/api/me')
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res && res.success && res.data && res.data.email) inject(res.data.email);
      })
      .catch(function () { /* non-fatal — chip just won't show */ });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
