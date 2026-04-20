#!/usr/bin/env node
// scripts/build.js — rebuild a finished presentation from the current slide-library data.
// Usage: node scripts/build.js [presentation-id]
//   With no argument: rebuilds all presentations.
//   With an ID: rebuilds only that one.
//
// The server does NOT need to be running.

const path     = require('path');
const fs       = require('fs');
const cheerio  = require('../builder/node_modules/cheerio');

const BUILDER_DIR    = path.join(__dirname, '..', 'builder');
const LIBRARY_PATH   = path.join(BUILDER_DIR, 'data', 'slide-library.json');
const TEMPLATES_PATH = path.join(BUILDER_DIR, 'data', 'slide-templates.json');
const SETTINGS_PATH  = path.join(BUILDER_DIR, 'data', 'settings.json');
const PRESENTATIONS_PATH = path.join(BUILDER_DIR, 'data', 'presentations.json');

// ── Load render functions from server.js (single source of truth) ─────────────
const serverSrc = fs.readFileSync(path.join(BUILDER_DIR, 'server.js'), 'utf8');
const serverLines = serverSrc.split('\n');

function extractFn(startMarker, endMarker) {
  const start = serverSrc.indexOf(startMarker);
  const end   = endMarker ? serverSrc.indexOf(endMarker, start) : serverSrc.length;
  return serverSrc.slice(start, end);
}

// Evaluate render block + buildFrozenPresentation with __dirname pointing to builder/
var __dirname = BUILDER_DIR; // override so path.join(__dirname, ...) resolves correctly
eval(
  extractFn('function readSettings()', 'function writeSettings') + '\n' +
  serverLines.slice(171, 2791).join('\n') + '\n' +
  extractFn('function buildFrozenPresentation(', '\n// GET /api/presentations')
);

// ── CLI entry point ────────────────────────────────────────────────────────────
const targetId = process.argv[2] || null;
const data = JSON.parse(fs.readFileSync(PRESENTATIONS_PATH, 'utf8'));
const all  = data.presentations || [];

const toRebuild = targetId
  ? all.filter(p => p.id === targetId)
  : all;

if (!toRebuild.length) {
  console.error(targetId ? 'Presentation not found: ' + targetId : 'No presentations found.');
  process.exit(1);
}

toRebuild.forEach(function (pres) {
  process.stdout.write('Building "' + pres.customerName + '" (' + pres.id + ')… ');
  try {
    const outDir = buildFrozenPresentation(pres); // eslint-disable-line no-undef
    const size   = Math.round(fs.statSync(path.join(outDir, 'index.html')).size / 1024);
    console.log('OK — ' + size + 'KB → ' + outDir);
  } catch (err) {
    console.log('FAILED: ' + err.message);
  }
});
