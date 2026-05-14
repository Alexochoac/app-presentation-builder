'use strict';

// ── Template Generator ────────────────────────────────────────────────────────
// Converts wizard payload → anatomy-compliant HTML slide fragment.
// Follows architecture/template-anatomy.md exactly.

var LOGO_ROW = [
  '  <div class="slide-logo-row">',
  '    <img src="/slides/shared/LOGO SoftSolution grays.png" alt="Softsolution">',
  '    <span class="slide-logo-sep"></span>',
  '    <img src="/slides/shared/LOGO LiteSentry Greys.png" alt="LiteSentry" class="slide-logo-ls">',
  '  </div>'
].join('\n');

// Header types are placed in <header>, everything else goes in <div class="slide-body">
var HEADER_TYPES = ['headline', 'section-label'];

function editableEl(tag, cls, editKey, id, placeholder) {
  return '<' + tag + ' class="' + cls + '"' +
    ' data-edit="' + editKey + '"' +
    ' data-lang-key="' + id + '.' + editKey + '"' +
    ' contenteditable spellcheck="false">' +
    placeholder +
    '</' + tag + '>';
}

function feedAttr(block) {
  if (!block.feedKey) return '';
  return ' data-feed="' + block.feedKey + '" data-feed-type="' + (block.feedType || 'text') + '"';
}

// ── Per-block HTML ────────────────────────────────────────────────────────────

function blockHtml(block, id, idx) {
  var type = block.type;
  var feed = feedAttr(block);
  var n    = idx + 1;

  if (type === 'subtitle') {
    return editableEl('p', 'slide-subtitle', 'subtitle', id, 'Subtitle placeholder');
  }
  if (type === 'body-text' || type === 'paragraph') {
    return editableEl('p', 'slide-body-text', 'body', id, 'Body text placeholder');
  }
  if (type === 'image') {
    return '<div class="slide-img-slot"' + feed + ' data-edit="image" data-builder-only="">[ Image ]</div>';
  }
  if (type === 'stat-number' || type === 'stat') {
    return [
      '<div class="stat-block">',
      '  <div class="stat-number"' + feed + '>0</div>',
      '  ' + editableEl('div', 'stat-label', 'stat-' + n + '-label', id, 'Metric'),
      '</div>'
    ].join('\n');
  }
  if (type === 'bullet-list') {
    return [
      '<ul class="slide-bullets">',
      '  <li ' + 'data-edit="bullet-1" data-lang-key="' + id + '.bullet-1" contenteditable spellcheck="false">Bullet item</li>',
      '  <li ' + 'data-edit="bullet-2" data-lang-key="' + id + '.bullet-2" contenteditable spellcheck="false">Bullet item</li>',
      '</ul>'
    ].join('\n');
  }
  if (type === 'cta-steps') {
    return [
      '<div class="cta-steps">',
      '  <div class="cta-step"><div class="step-num">1</div><span data-edit="step-1" data-lang-key="' + id + '.step-1" contenteditable spellcheck="false">First step</span></div>',
      '  <div class="cta-step"><div class="step-num">2</div><span data-edit="step-2" data-lang-key="' + id + '.step-2" contenteditable spellcheck="false">Second step</span></div>',
      '  <div class="cta-step"><div class="step-num">3</div><span data-edit="step-3" data-lang-key="' + id + '.step-3" contenteditable spellcheck="false">Third step</span></div>',
      '</div>'
    ].join('\n');
  }
  if (type === 'cta-button') {
    return [
      '<div class="cta-actions">',
      '  <a class="cta-btn cta-btn-wa" href="#" data-lang-key="' + id + '.btn-wa">WhatsApp</a>',
      '  <a class="cta-btn cta-btn-email" href="#" data-lang-key="' + id + '.btn-email">Email</a>',
      '</div>'
    ].join('\n');
  }
  if (type === 'contact-block') {
    return [
      '<div class="cta-contact">',
      '  ' + editableEl('strong', 'contact-name', 'contact-name', id, 'Contact Name'),
      '  ' + editableEl('span',   'contact-title', 'contact-title', id, 'Title'),
      '</div>'
    ].join('\n');
  }
  return ''; // unknown type — skip silently
}

// Indent every line of a multiline string by `spaces` spaces
function indent(str, spaces) {
  var pad = ' '.repeat(spaces);
  return str.split('\n').map(function (l) { return l ? pad + l : l; }).join('\n');
}

// ── Header ────────────────────────────────────────────────────────────────────

function buildHeader(id, blocks) {
  var hasSectionLabel = blocks.some(function (b) { return b.type === 'section-label'; });
  var lines = ['<header class="slide-head">'];
  if (hasSectionLabel) {
    lines.push('  ' + editableEl('div', 'section-label', 'section-label', id, 'Section Name'));
  }
  lines.push('  ' + editableEl('h1', 'slide-title', 'headline', id, 'Headline Placeholder'));
  lines.push('  <div class="divider"></div>');
  lines.push('</header>');
  return indent(lines.join('\n'), 4);
}

// ── Body (layout-specific) ────────────────────────────────────────────────────

function bodyBlocks(blocks) {
  return blocks.filter(function (b) { return HEADER_TYPES.indexOf(b.type) === -1; });
}

function renderBlocks(blocks, id, extraIndent) {
  extraIndent = extraIndent || 0;
  return blocks
    .map(function (b, i) {
      var html = blockHtml(b, id, i);
      return html ? indent(html, extraIndent) : '';
    })
    .filter(Boolean)
    .join('\n');
}

function buildBody(id, layout, blocks) {
  var body = bodyBlocks(blocks);

  if (layout === 'two-col') {
    var left  = body.filter(function (b) { return b.type !== 'image'; });
    var right = body.filter(function (b) { return b.type === 'image'; });
    var rightHtml = right.length
      ? renderBlocks(right, id, 8)
      : '        <div class="slide-img-slot" data-edit="image" data-builder-only="">[ Image ]</div>';
    return [
      '    <div class="slide-body two-col-body">',
      '      <div class="col-left">',
      renderBlocks(left, id, 8),
      '      </div>',
      '      <div class="col-right">',
      rightHtml,
      '      </div>',
      '    </div>'
    ].join('\n');
  }

  if (layout === 'stats-grid') {
    var stats  = body.filter(function (b) { return b.type === 'stat-number' || b.type === 'stat'; });
    var others = body.filter(function (b) { return b.type !== 'stat-number' && b.type !== 'stat'; });
    return [
      '    <div class="slide-body stats-grid-body">',
      renderBlocks(others, id, 6),
      '      <div class="stats-grid">',
      renderBlocks(stats, id, 8),
      '      </div>',
      '    </div>'
    ].join('\n');
  }

  if (layout === 'hero') {
    return [
      '    <div class="hero-overlay">',
      renderBlocks(body, id, 6),
      '    </div>'
    ].join('\n');
  }

  if (layout === 'list') {
    var lists  = body.filter(function (b) { return b.type === 'bullet-list'; });
    var pre    = body.filter(function (b) { return b.type !== 'bullet-list'; });
    var listContent = lists.length
      ? renderBlocks(lists, id, 8)
      : '        <ul class="list-col"><li data-edit="bullet-1" data-lang-key="' + id + '.bullet-1" contenteditable spellcheck="false">Bullet item</li></ul>';
    return [
      '    <div class="slide-body list-body">',
      renderBlocks(pre, id, 6),
      '      <div class="list-cols">',
      listContent,
      '      </div>',
      '    </div>'
    ].join('\n');
  }

  if (layout === 'cta') {
    return [
      '    <div class="slide-body cta-body">',
      renderBlocks(body, id, 6),
      '    </div>'
    ].join('\n');
  }

  // Default: single-col
  return [
    '    <div class="slide-body">',
    renderBlocks(body, id, 6),
    '    </div>'
  ].join('\n');
}

// ── CSS block ─────────────────────────────────────────────────────────────────

function buildCss(id, layout) {
  var rules = ['    .' + id + ' { /* base layout */ }'];

  if (layout === 'two-col') {
    rules.push('    .' + id + ' .two-col-body { display: flex; gap: 32px; align-items: flex-start; }');
    rules.push('    .' + id + ' .col-left  { flex: 1; }');
    rules.push('    .' + id + ' .col-right { flex: 1; min-height: 200px; }');
  }
  if (layout === 'stats-grid') {
    rules.push('    .' + id + ' .stats-grid   { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 20px; margin-top: 24px; }');
    rules.push('    .' + id + ' .stat-block   { background: var(--bg-card); border-radius: 10px; padding: 20px; text-align: center; }');
    rules.push('    .' + id + ' .stat-number  { font-size: 2.5rem; font-weight: 800; color: var(--accent); }');
    rules.push('    .' + id + ' .stat-label   { font-size: 13px; color: var(--text-muted); margin-top: 6px; }');
  }
  if (layout === 'hero') {
    rules.push('    .' + id + '.hero         { position: relative; }');
    rules.push('    .' + id + ' .hero-overlay { position: absolute; bottom: 10%; left: 10%; right: 10%; }');
    rules.push('    .' + id + ' .slide-title  { font-size: clamp(2rem, 5vw, 3.5rem); color: #fff; }');
  }
  if (layout === 'list') {
    rules.push('    .' + id + ' .list-cols      { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 20px; }');
    rules.push('    .' + id + ' .slide-bullets  { padding-left: 20px; }');
    rules.push('    .' + id + ' .slide-bullets li { margin-bottom: 10px; color: var(--text); }');
  }
  if (layout === 'cta') {
    rules.push('    .' + id + ' .cta-steps   { display: flex; flex-direction: column; gap: 14px; margin: 20px 0; }');
    rules.push('    .' + id + ' .cta-step    { display: flex; align-items: center; gap: 14px; }');
    rules.push('    .' + id + ' .step-num    { width: 32px; height: 32px; border-radius: 50%; background: var(--accent); color: #000; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }');
    rules.push('    .' + id + ' .cta-actions { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 20px; }');
    rules.push('    .' + id + ' .cta-btn     { padding: 12px 24px; border-radius: 100px; font-weight: 600; text-decoration: none; }');
    rules.push('    .' + id + ' .cta-btn-wa    { background: #25D366; color: #000; }');
    rules.push('    .' + id + ' .cta-btn-email { background: var(--accent); color: #000; }');
  }

  // Mobile overrides
  var mediaRules = [];
  if (layout === 'two-col') mediaRules.push('      .' + id + ' .two-col-body { flex-direction: column; }');
  if (layout === 'list')    mediaRules.push('      .' + id + ' .list-cols { grid-template-columns: 1fr; }');
  if (layout === 'stats-grid') mediaRules.push('      .' + id + ' .stats-grid { grid-template-columns: 1fr 1fr; }');

  var lines = ['  <style>'].concat(rules);
  if (mediaRules.length) {
    lines.push('    @media (max-width: 768px) {');
    lines = lines.concat(mediaRules);
    lines.push('    }');
  }
  lines.push('  </style>');
  return lines.join('\n');
}

// ── Script block ──────────────────────────────────────────────────────────────

function buildScript(id, blocks) {
  var hasCtaButton = blocks.some(function (b) { return b.type === 'cta-button'; });
  var lines = [
    '  <script>',
    '  (function () {',
    "    var slide   = document.currentScript.closest('[data-slide]');",
    '    var slideId = Track.slideId(slide);'
  ];
  if (hasCtaButton) {
    lines.push("    var btnWa    = slide.querySelector('.cta-btn-wa');");
    lines.push("    var btnEmail = slide.querySelector('.cta-btn-email');");
    lines.push("    if (btnWa)    btnWa.addEventListener('click', function () { Track.click(slideId, 'whatsapp'); });");
    lines.push("    if (btnEmail) btnEmail.addEventListener('click', function () { Track.click(slideId, 'email'); });");
  }
  lines.push("    setTimeout(function () { if (window.PE) PE.initSlide(slide); }, 0);");
  lines.push('  })();');
  lines.push('  </script>');
  return lines.join('\n');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * generateHtml(payload) → string
 *
 * payload: {
 *   id:        string   — e.g. "ls16-stats"
 *   slideMode: string   — "sequence" | "embedded"  (default: "sequence")
 *   layout:    string   — "single-col" | "two-col" | "stats-grid" | "hero" | "list" | "cta"
 *   blocks:    Array<{ type, feedKey?, feedType? }>
 * }
 */
function generateHtml(payload) {
  var id        = (payload.id || '').trim();
  var slideMode = payload.slideMode || 'sequence';
  var layout    = payload.layout    || 'single-col';
  var blocks    = Array.isArray(payload.blocks) ? payload.blocks : [];

  if (!id) throw new Error('id is required');

  var embeddedComment = slideMode === 'embedded'
    ? '<!-- embedded slide — triggered by data-trigger-slide="' + id + '" on parent -->\n'
    : '';

  var layoutClass = layout === 'hero' ? 'hero' : 'content';

  return [
    embeddedComment + '<div class="slide ' + layoutClass + ' ' + id + '"',
    '     data-slide="' + id + '"',
    '     data-slide-mode="' + slideMode + '">',
    '',
    LOGO_ROW,
    '',
    '  <div class="slide-layout">',
    buildHeader(id, blocks),
    buildBody(id, layout, blocks),
    '  </div>',
    '',
    buildCss(id, layout),
    '',
    buildScript(id, blocks),
    '',
    '</div>'
  ].join('\n');
}

module.exports = { generateHtml: generateHtml };
