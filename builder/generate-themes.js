// Run once: node generate-themes.js
// Generates builder/themes/*.css from builder/style-references/*.html

const fs   = require('fs');
const path = require('path');

const STYLE_REFS_DIR = path.join(__dirname, 'style-references');
const THEMES_DIR     = path.join(__dirname, 'themes');
if (!fs.existsSync(THEMES_DIR)) fs.mkdirSync(THEMES_DIR);

function extractStyleBlock(html) {
  var m = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  return m ? m[1] : '';
}
function resolveCssVar(css, value, depth) {
  if (!value || (depth || 0) > 4) return value;
  var m = value.match(/var\((--[^),\s]+)\)/);
  if (!m) return value;
  var re = new RegExp(m[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:\\s*([^;\\n}]+)');
  var found = css.match(re);
  if (!found) return value;
  return resolveCssVar(css, found[1].trim(), (depth || 0) + 1);
}
function hexToRgbStr(hex) {
  var h = hex.replace('#', '');
  if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  if (h.length !== 6) return null;
  return parseInt(h.slice(0,2),16)+','+parseInt(h.slice(2,4),16)+','+parseInt(h.slice(4,6),16);
}
function hexToLight(hex) {
  var h = hex.replace('#', '');
  if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  if (h.length !== 6) return hex;
  var r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
  r = Math.round(r + (255-r)*0.45); g = Math.round(g + (255-g)*0.45); b = Math.round(b + (255-b)*0.45);
  return '#' + [r,g,b].map(function(v){return ('0'+v.toString(16)).slice(-2);}).join('');
}
function isLight(color) {
  if (!color) return false;
  color = color.trim();
  if (color.startsWith('#')) {
    var h = color.replace('#', '');
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    if (h.length !== 6) return false;
    var r=parseInt(h.slice(0,2),16), g=parseInt(h.slice(2,4),16), b=parseInt(h.slice(4,6),16);
    return (0.299*r + 0.587*g + 0.114*b) / 255 > 0.5;
  }
  if (/^rgb/.test(color)) {
    var nums = color.match(/[\d.]+/g);
    if (nums && nums.length >= 3) return (0.299*+nums[0] + 0.587*+nums[1] + 0.114*+nums[2]) / 255 > 0.5;
  }
  return false;
}
function getBodyProp(css, prop) {
  var b = css.match(/body\s*\{([^}]+)\}/);
  if (!b) return null;
  var m = b[1].match(new RegExp(prop + '\\s*:\\s*([^;\\n]+)'));
  return m ? m[1].trim() : null;
}
function getCssRule(css, sel) {
  var re = new RegExp(sel + '\\s*\\{([^}]+)\\}', 'i');
  var m = css.match(re);
  return m ? m[1] : null;
}

function generateThemeCss(html) {
  var css = extractStyleBlock(html);

  // imports
  var imports = [];
  var ir = /@import\s+url\([^)]+\)[^;]*;/g, im;
  while ((im = ir.exec(css)) !== null) imports.push(im[0]);

  // background
  var rawBg = resolveCssVar(css, getBodyProp(css, 'background(?:-color)?') || '#0a0a0f');
  var bgColor = rawBg.trim().split(/\s+/)[0];
  if (bgColor.startsWith('linear') || bgColor.startsWith('radial') || bgColor.startsWith('var(')) {
    var fb = rawBg.match(/#[0-9a-f]{3,8}|rgba?\([^)]+\)/i);
    bgColor = fb ? fb[0] : '#0a0a0f';
  }
  var light   = isLight(bgColor);
  var heroRgb = bgColor.startsWith('#') ? hexToRgbStr(bgColor) : null;

  // text
  var rawText  = resolveCssVar(css, getBodyProp(css, '(?<![\\w-])color'));
  var textColor = (rawText && !rawText.startsWith('var(')) ? rawText : (light ? '#1d1d1f' : '#ffffff');
  var textMuted = light ? 'rgba(0,0,0,.50)' : 'rgba(255,255,255,.55)';

  // accent
  var accentColor = null;
  var rootM = css.match(/:root\s*\{([^}]+)\}/);
  if (rootM) {
    var rc = rootM[1];
    var keys = ['--accent:', '--accent-primary:', '--primary-color:', '--primary:', '--brand-color:', '--color-primary:', '--highlight:'];
    for (var k = 0; k < keys.length; k++) {
      var are = new RegExp(keys[k].replace(/-/g, '\\-') + '\\s*([^;\\n]+)');
      var am  = rc.match(are);
      if (am) {
        var c = resolveCssVar(css, am[1].trim());
        if (c && (c.startsWith('#') || c.startsWith('rgb'))) { accentColor = c; break; }
      }
    }
    if (!accentColor) {
      var nm = rc.match(/--(?:neon|glow)-\w+\s*:\s*(#[0-9a-f]{3,8})/i);
      if (nm) accentColor = nm[1];
    }
  }
  if (!accentColor) accentColor = light ? '#0066cc' : '#F5A623';
  var aRgb = accentColor.startsWith('#') ? hexToRgbStr(accentColor) : null;

  // font
  var rawFont    = getBodyProp(css, 'font-family') || null;
  var headingFont = null;
  var hRule = getCssRule(css, 'h[123]');
  if (hRule) { var hf = hRule.match(/font-family\s*:\s*([^;\n]+)/); if (hf) headingFont = hf[1].trim(); }

  // hero overlay
  var overlayStart = light ? '.25' : '.72';
  var overlayEnd   = light ? '.10' : '.38';
  var gradAngle    = '135deg';
  var gm = css.match(/linear-gradient\(\s*(\d+deg)/);
  if (gm) gradAngle = gm[1];

  // card
  var cardBg = null, cardBorder = null, cardRadius = null, cardShadow = null;
  var crule = getCssRule(css, '\\.(?:card|feature-card|glass-card|panel|surface|gradient-card|content-card|info-card|stat-card|metric-card)');
  if (crule) {
    var cb = crule.match(/background(?:-color)?\s*:\s*([^;\n]+)/);
    if (cb) { var r = resolveCssVar(css, cb[1].trim()); if (r && !r.startsWith('var(')) cardBg = r; }
    var cbr = crule.match(/border-radius\s*:\s*([^;\n]+)/);
    if (cbr) cardRadius = cbr[1].trim();
    var cs = crule.match(/box-shadow\s*:\s*([^;\n]+)/);
    if (cs) cardShadow = cs[1].trim();
  }
  if (!cardBg)     cardBg     = light ? 'rgba(0,0,0,.04)'              : 'rgba(255,255,255,.05)';
  if (!cardBorder) cardBorder = light ? 'rgba(0,0,0,.10)'              : 'rgba(255,255,255,.10)';
  if (!cardRadius) cardRadius = '12px';
  if (!cardShadow) cardShadow = light ? '0 2px 12px rgba(0,0,0,.08)' : '0 4px 20px rgba(0,0,0,.35)';

  // badge
  var badgeBg = null, badgeBorder = null, badgeRadius = null, badgeColor = null;
  var brule = getCssRule(css, '\\.(?:badge|chip|tag|label|pill|category-badge|category|keyword)');
  if (brule) {
    var bb = brule.match(/background(?:-color)?\s*:\s*([^;\n]+)/);
    if (bb) { var rb = resolveCssVar(css, bb[1].trim()); if (rb && !rb.startsWith('var(')) badgeBg = rb; }
    var br2 = brule.match(/border-radius\s*:\s*([^;\n]+)/);
    if (br2) badgeRadius = br2[1].trim();
    var bc = brule.match(/(?<![\\w-])color\s*:\s*([^;\n]+)/);
    if (bc) { var rc2 = resolveCssVar(css, bc[1].trim()); if (rc2 && !rc2.startsWith('var(')) badgeColor = rc2; }
  }
  var aAlpha  = aRgb ? 'rgba(' + aRgb + ',.15)' : (light ? 'rgba(0,0,0,.06)'  : 'rgba(255,255,255,.08)');
  var aBorder = aRgb ? 'rgba(' + aRgb + ',.35)' : (light ? 'rgba(0,0,0,.20)'  : 'rgba(255,255,255,.20)');
  if (!badgeBg)     badgeBg     = aAlpha;
  if (!badgeBorder) badgeBorder = aBorder;
  if (!badgeRadius) badgeRadius = '6px';
  if (!badgeColor)  badgeColor  = accentColor;

  // logo container
  var logoBg     = light ? 'rgba(0,0,0,.04)' : 'rgba(255,255,255,.05)';
  var logoBorder = cardBorder;
  var logoRadius = '20px';

  var out = '/* auto-generated */\n';
  if (imports.length) out += imports.join('\n') + '\n\n';
  out += ':root {\n';
  out += '  /* Identity */\n';
  out += '  --bg:                 ' + bgColor     + ';\n';
  out += '  --slide-hero-bg:      ' + bgColor     + ';\n';
  if (heroRgb) out += '  --slide-hero-rgb:     ' + heroRgb     + ';\n';
  out += '  --text:               ' + textColor   + ';\n';
  out += '  --text-muted:         ' + textMuted   + ';\n';
  var accentLight = accentColor.startsWith('#') ? hexToLight(accentColor) : accentColor;
  out += '  --accent:             ' + accentColor + ';\n';
  if (aRgb) out += '  --accent-rgb:         ' + aRgb         + ';\n';
  out += '  --accent-mid:         ' + accentColor + ';\n';
  out += '  --accent-light:       ' + accentLight + ';\n';
  if (rawFont) {
    out += '  --font-body:          ' + rawFont                 + ';\n';
    out += '  --font-heading:       ' + (headingFont || rawFont) + ';\n';
  }
  out += '\n  /* Hero overlay */\n';
  out += '  --hero-overlay-angle: ' + gradAngle    + ';\n';
  out += '  --hero-overlay-start: ' + overlayStart + ';\n';
  out += '  --hero-overlay-end:   ' + overlayEnd   + ';\n';
  out += '\n  /* Cards */\n';
  out += '  --card-bg:            ' + cardBg     + ';\n';
  out += '  --card-border:        ' + cardBorder + ';\n';
  out += '  --card-radius:        ' + cardRadius + ';\n';
  out += '  --card-shadow:        ' + cardShadow + ';\n';
  out += '\n  /* Badge */\n';
  out += '  --badge-bg:           ' + badgeBg     + ';\n';
  out += '  --badge-border:       ' + badgeBorder + ';\n';
  out += '  --badge-radius:       ' + badgeRadius + ';\n';
  out += '  --badge-color:        ' + badgeColor  + ';\n';
  out += '\n  /* Logo container */\n';
  out += '  --logo-bg:            ' + logoBg     + ';\n';
  out += '  --logo-border:        ' + logoBorder + ';\n';
  out += '  --logo-radius:        ' + logoRadius + ';\n';
  out += '}\n';
  if (rawFont) out += 'body, .slide { font-family: var(--font-body); }\n';
  if (headingFont && headingFont !== rawFont) out += 'h1, h2, h3 { font-family: var(--font-heading); }\n';
  return out;
}

var files = fs.readdirSync(STYLE_REFS_DIR).filter(f => f.endsWith('.html')).sort();
files.forEach(file => {
  try {
    var html = fs.readFileSync(path.join(STYLE_REFS_DIR, file), 'utf8');
    var css  = generateThemeCss(html);
    var out  = file.replace(/\.html$/, '.css');
    fs.writeFileSync(path.join(THEMES_DIR, out), css, 'utf8');
    process.stdout.write('.');
  } catch (e) { console.error('\nFailed:', file, e.message); }
});
console.log('\nDone: ' + files.length + ' themes written to builder/themes/');
