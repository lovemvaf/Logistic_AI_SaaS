#!/usr/bin/env node
/**
 * Sync the shared, self-hosted fonts into every portal.
 *
 * Run after changing packages/ui-tokens/fonts.css:
 *   node scripts/sync-ui-fonts.mjs
 *
 * For each portal it:
 *   1. copies packages/ui-tokens/fonts/*.woff2 -> <app>/public/fonts/
 *   2. injects packages/ui-tokens/fonts.css at the top of
 *      <app>/src/styles/layout-tokens.css (idempotent, marker based)
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sourceDir = path.join(root, 'packages/ui-tokens/fonts');
const sourceCss = path.join(root, 'packages/ui-tokens/fonts.css');

const apps = [
  'frontend/feature-test/admin-portal',
  'frontend/reporting/tenant-portal',
  'frontend/reporting/customer-portal',
  'frontend/reporting/pack-station-web',
];

const START = '/* @@SMARTLOGI_FONTS_START@@ */';
const END = '/* @@SMARTLOGI_FONTS_END@@ */';

const fontsCss = fs.readFileSync(sourceCss, 'utf8').trim();
const blocks = `${START}\n${fontsCss}\n${END}`;
const fontFiles = fs.readdirSync(sourceDir).filter((f) => f.endsWith('.woff2'));

for (const app of apps) {
  const publicFonts = path.join(root, app, 'public/fonts');
  fs.mkdirSync(publicFonts, { recursive: true });
  for (const file of fontFiles) {
    fs.copyFileSync(path.join(sourceDir, file), path.join(publicFonts, file));
  }

  const cssPath = path.join(root, app, 'src/styles/layout-tokens.css');
  let css = fs.readFileSync(cssPath, 'utf8');

  const startIdx = css.indexOf(START);
  const endIdx = css.indexOf(END);
  if (startIdx !== -1 && endIdx !== -1) {
    css = css.slice(0, startIdx) + blocks + css.slice(endIdx + END.length);
  } else {
    css = `${blocks}\n\n${css}`;
  }

  fs.writeFileSync(cssPath, css);
  console.log(`synced ${fontFiles.length} fonts -> ${app}`);
}
