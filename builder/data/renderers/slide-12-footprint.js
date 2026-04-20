function renderFullCarouselLayout(slideId, savedEdits) {
  savedEdits = savedEdits || {};

  var defaultFootprintDiagramHtml = [
    '<div class="ls-carousel-track" style="transform: translateX(0px);">',
    '    <div class="ls-carousel-slide">',
    '      <img src="/slides/uploads/Slide66.jpg" alt="LineScanner footprint diagram" data-zoom="" data-track="ls12:zoom:footprint-diagram">',
    '    </div>',
    '  <div class="ls-carousel-slide"><img src="/slides/uploads/CostOfQualityDefects.png" alt="CostOfQualityDefects" data-zoom=""></div>',
    '</div>'
  ].join('\n');

  return [
    '<div class="slide content ls12" data-slide="' + slideId + '">',

    '  <div class="slide-logo-row"><img src="/slides/shared/LOGO SoftSolution grays.png" alt="Softsolution"><span class="slide-logo-sep"></span><img src="/slides/shared/LOGO LiteSentry Greys.png" alt="LiteSentry" class="slide-logo-ls"></div>',

    '  <div class="slide-layout">',
    '    <header class="slide-head">',
    '      <div class="section-label" data-edit="section-label" contenteditable="" spellcheck="false">' + applyEdit('section-label', 'Installation', savedEdits) + '</div>',
    '      <h1 class="slide-title" data-edit="headline" contenteditable="" spellcheck="false">Modular based \u2014 <span class="blue">' + applyEdit('headline-emphasis', 'minimum footprint', savedEdits) + '</span></h1>',
    '      <p class="slide-subtitle" data-edit="subtitle" contenteditable="" spellcheck="false" style="margin-bottom:12px; margin-top:-6px;">' + applyEdit('subtitle', 'unique \u00b7 worldwide', savedEdits) + '</p>',
    '    </header>',

    '    <div class="slide-body">',

    '      <div class="ls12-diagram-wrap anim-in">',

    '        <div class="ls-carousel" data-counter="" data-edit="footprint-diagram" data-track="ls12:carousel:footprint" style="width:100%;flex:1;min-height:0;">',
    (savedEdits['footprint-diagram'] != null ? savedEdits['footprint-diagram'] : defaultFootprintDiagramHtml),
    '        </div>',

    '        <div class="ls12-badge ls12-badge-h">',
    '          <div class="ls12-badge-title" data-edit="badge-h-title" contenteditable="" spellcheck="false">' + applyEdit('badge-h-title', 'Horizontal', savedEdits) + '</div>',
    '          <div class="ls12-badge-spec" data-edit="badge-h-spec1" contenteditable="" spellcheck="false">' + applyEdit('badge-h-spec1', 'Depth ~475 mm', savedEdits) + '</div>',
    '          <div class="ls12-badge-spec" data-edit="badge-h-spec2" contenteditable="" spellcheck="false">' + applyEdit('badge-h-spec2', 'Individual width as required', savedEdits) + '</div>',
    '        </div>',

    '        <div class="ls12-badge ls12-badge-v">',
    '          <div class="ls12-badge-title" data-edit="badge-v-title" contenteditable="" spellcheck="false">' + applyEdit('badge-v-title', 'Vertical', savedEdits) + '</div>',
    '          <div class="ls12-badge-spec" data-edit="badge-v-spec1" contenteditable="" spellcheck="false">' + applyEdit('badge-v-spec1', 'Width ~700 mm', savedEdits) + '</div>',
    '          <div class="ls12-badge-spec" data-edit="badge-v-spec2" contenteditable="" spellcheck="false">' + applyEdit('badge-v-spec2', 'Depth only 420 mm', savedEdits) + '</div>',
    '        </div>',

    '      </div>',
    '    </div>',
    '  </div>',

    '  <style>',
    '    .ls12 { }',
    '',
    '    .ls12-diagram-wrap {',
    '      display: flex; flex-direction: column;',
    '      flex: 1; min-height: 0;',
    '      width: 100%; max-width: 860px;',
    '      position: relative;',
    '      margin-bottom: 0;',
    '    }',
    '    @media (max-width: 768px) {',
    '      .ls12-diagram-wrap { min-height: 300px; flex: none; }',
    '    }',
    '',
    '    /* Spec badges */',
    '    .ls12-badge {',
    '      position: absolute;',
    '      background: #E8711A; color: #fff;',
    '      border-radius: 20px; padding: 10px 18px;',
    '      display: flex; flex-direction: column; gap: 2px;',
    '      box-shadow: 0 4px 16px rgba(0,0,0,.3);',
    '      pointer-events: none;',
    '    }',
    '    .ls12-badge-title { font-size: 13px; font-weight: 800; letter-spacing: .02em; }',
    '    .ls12-badge-spec  { font-size: 11px; opacity: .9; }',
    '',
    '    .ls12-badge-h { top: 12%; right: 4%; }',
    '    .ls12-badge-v { bottom: 12%; left: 26%; }',
    '',
    '    /* \u2500\u2500 Mobile base \u2500\u2500 */',
    '    .ls12 { padding: 52px 16px 80px !important; }',
    '    .ls12-badge-h, .ls12-badge-v { display: none; }',
    '',
    '    /* \u2500\u2500 Desktop overrides \u2500\u2500 */',
    '    @media(min-width:769px) {',
    '      .ls12 { padding: 52px 80px 0 !important; }',
    '      .ls12-badge-h, .ls12-badge-v { display: flex; }',
    '    }',
    '  <\/style>',

    '  <script>',
    '  (function () { var s = document.currentScript;',
    '    setTimeout(function () { if (window.PE && s) PE.initSlide(s.closest(\'.slide\')); }, 0); })();',
    '  <\/script>',

    '</div>'
  ].join('\n');
}
