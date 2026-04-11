function renderCardsGridLayout(slideId, savedEdits) {
  savedEdits = savedEdits || {};

  var cards = [
    { name: 'int-name-1', nameDefault: 'LiSEC',        type: 'int-type-1', typeDefault: 'Processing lines' },
    { name: 'int-name-2', nameDefault: 'FOREL',         type: 'int-type-2', typeDefault: 'Architectural glass' },
    { name: 'int-name-3', nameDefault: 'Benteler',      type: 'int-type-3', typeDefault: 'Automotive glass' },
    { name: 'int-name-4', nameDefault: 'CMS Tecglass',  type: 'int-type-4', typeDefault: 'Digital printing' },
    { name: 'int-name-5', nameDefault: 'Bystronic',     type: 'int-type-5', typeDefault: 'Cutting and processing' },
    { name: 'int-name-6', nameDefault: 'Hegla',         type: 'int-type-6', typeDefault: 'Cutting and storage' },
    { name: 'int-name-7', nameDefault: 'Glaston',       type: 'int-type-7', typeDefault: 'Tempering and bending' },
    { name: 'int-name-8', nameDefault: 'TecoFerrari',   type: 'int-type-8', typeDefault: 'Insulating glass' },
    { name: 'int-name-9', nameDefault: 'Erdman',        type: 'int-type-9', typeDefault: 'Automated lines' },
  ];

  var cardLines = cards.map(function (c) {
    return [
      '    <div class="int-card anim-in">',
      '      <div class="int-name" data-edit="' + c.name + '" contenteditable="" spellcheck="false">' + applyEdit(c.name, c.nameDefault, savedEdits) + '</div>',
      '      <div class="int-type" data-edit="' + c.type + '" contenteditable="" spellcheck="false">' + applyEdit(c.type, c.typeDefault, savedEdits) + '</div>',
      '    </div>',
    ].join('\n');
  });

  return [
    '<div class="slide content ls13" data-slide="' + slideId + '">',
    '  <div class="slide-logo-row"><img src="/slides/shared/LOGO SoftSolution grays.png" alt="Softsolution"><span class="slide-logo-sep"></span><img src="/slides/shared/LOGO LiteSentry Greys.png" alt="LiteSentry" class="slide-logo-ls"></div>',
    '  <div class="slide-layout">',
    '    <header class="slide-head">',
    '      <div class="section-label" data-edit="section-label" contenteditable="" spellcheck="false">' + applyEdit('section-label', 'Integrations', savedEdits) + '</div>',
    '      <h1 class="slide-title" data-edit="headline" contenteditable="" spellcheck="false">' + applyEdit('headline', 'Compatible with<br><span class="blue">your current machinery</span>', savedEdits) + '</h1>',
    '      <div class="divider"></div>',
    '      <p class="slide-subtitle" data-edit="subtitle" contenteditable="" spellcheck="false" style="margin-bottom:4px;">' + applyEdit('subtitle', 'LineScanner is already integrated with the leading glass machinery manufacturers \u2014 if you already run any of these lines, integration is direct.', savedEdits) + '</p>',
    '    </header>',
    '    <div class="slide-body">',
    '  <div class="integration-grid">',
  ].concat(cardLines).concat([
    '  </div>',
    '    </div><!-- /.slide-body -->',
    '  </div><!-- /.slide-layout -->',
    '  <!-- \u2500\u2500 Scoped Styles \u2500\u2500 -->',
    '  <style>',
    '    /* Mobile base: collapse the inline 80px side padding */',
    '    .ls13 { padding: 70px 16px 80px !important; }',
    '',
    '    /* Desktop: restore intended layout padding */',
    '    @media (min-width: 769px) {',
    '      .ls13 { padding: 52px 80px 0 !important; }',
    '    }',
    '  </style>',
    '  <script>',
    '  (function () { var s = document.currentScript;',
    '    setTimeout(function () { if (window.PE && s) PE.initSlide(s.closest(\'.slide\')); }, 0); })();',
    '  <\/script>',
    '</div>',
  ]).join('\n');
}
