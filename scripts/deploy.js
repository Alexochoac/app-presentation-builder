#!/usr/bin/env node
/**
 * Deploy finished presentations to GitHub (Cloudflare Pages auto-deploys from master).
 *
 * Usage:
 *   node scripts/deploy.js --id=acme-glass-00000001
 *   node scripts/deploy.js --all
 */

const { execFileSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const REPO_ROOT          = path.join(__dirname, '..');
const PRESENTATIONS_PATH = path.join(REPO_ROOT, 'builder', 'data', 'presentations.json');
const BASE_URL           = 'https://app-presentation-builder.pages.dev/finished-presentations/';

function run(cmd, args) {
  return execFileSync(cmd, args, { cwd: REPO_ROOT, encoding: 'utf8' });
}

function publish(pres) {
  var folder = 'finished-presentations/' + pres.id;
  var label  = (pres.customerName || pres.id) + (pres.presentationName ? ' — ' + pres.presentationName : '');
  var msg    = 'publish: ' + label + ' (' + pres.id + ')';

  console.log('\nPublishing: ' + label);

  run('git', ['add', folder]);

  var status = run('git', ['status', '--porcelain', folder]).trim();
  if (!status) {
    console.log('  Already up to date — ' + BASE_URL + pres.id);
    return;
  }

  run('git', ['commit', '-m', msg]);
  console.log('  Committed.');
}

// ── Parse args ────────────────────────────────────────────────────────────────

var args   = process.argv.slice(2);
var idArg  = (args.find(function (a) { return a.startsWith('--id='); }) || '').replace('--id=', '');
var doAll  = args.includes('--all');

if (!idArg && !doAll) {
  console.error('Usage:\n  node scripts/deploy.js --id=<presentation-id>\n  node scripts/deploy.js --all');
  process.exit(1);
}

var data = JSON.parse(fs.readFileSync(PRESENTATIONS_PATH, 'utf8'));
var all  = data.presentations || [];

var targets;
if (doAll) {
  targets = all;
} else {
  var match = all.find(function (p) { return p.id === idArg; });
  if (!match) {
    console.error('Presentation not found: ' + idArg);
    process.exit(1);
  }
  targets = [match];
}

targets.forEach(publish);

// Push once after all commits
console.log('\nPushing to GitHub…');
run('git', ['push']);
console.log('Done.\n');

targets.forEach(function (p) {
  console.log('  ' + BASE_URL + p.id);
});
console.log('');
