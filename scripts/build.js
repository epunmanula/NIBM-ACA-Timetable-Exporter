/**
 * NIBM ACA Timetable Exporter - Production Extension Bundler
 * 
 * Bundles:
 * - Content script (IIFE, self-contained for Chrome MV3 compatibility)
 * - Page interceptor (IIFE)
 * - Service worker (ESM)
 * - Popup controller (ESM)
 * 
 * Copies:
 * - manifest.json
 * - icons/
 * - popup/popup.html & popup/popup.css
 */

import fs from 'node:fs';
import path from 'node:path';
import esbuild from 'esbuild';

const ROOT_DIR = path.resolve('.');
const DIST_DIR = path.resolve('dist');

async function buildExtension() {
  console.log('Building NIBM ACA Timetable Exporter Chrome Extension...');

  // Clean or create dist directory
  if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(DIST_DIR, { recursive: true });
  fs.mkdirSync(path.join(DIST_DIR, 'content'), { recursive: true });
  fs.mkdirSync(path.join(DIST_DIR, 'background'), { recursive: true });
  fs.mkdirSync(path.join(DIST_DIR, 'popup'), { recursive: true });
  fs.mkdirSync(path.join(DIST_DIR, 'icons'), { recursive: true });

  // 1. Bundle Content Script (IIFE - strict zero-module isolation for Chrome MV3 content scripts)
  console.log('Bundling content script...');
  await esbuild.build({
    entryPoints: [path.join(ROOT_DIR, 'src/content/content.ts')],
    outfile: path.join(DIST_DIR, 'content/content.js'),
    bundle: true,
    format: 'iife',
    target: 'chrome110',
    sourcemap: false,
    minify: false, // Keep clean and human-inspectable
  });

  // 2. Bundle Page Interceptor (IIFE)
  console.log('Bundling page interceptor...');
  await esbuild.build({
    entryPoints: [path.join(ROOT_DIR, 'src/content/page-interceptor.ts')],
    outfile: path.join(DIST_DIR, 'content/page-interceptor.js'),
    bundle: true,
    format: 'iife',
    target: 'chrome110',
    sourcemap: false,
    minify: false,
  });

  // 3. Bundle Service Worker (ESM)
  console.log('Bundling service worker...');
  await esbuild.build({
    entryPoints: [path.join(ROOT_DIR, 'src/background/service-worker.ts')],
    outfile: path.join(DIST_DIR, 'background/service-worker.js'),
    bundle: true,
    format: 'esm',
    target: 'chrome110',
    sourcemap: false,
    minify: false,
  });

  // 4. Bundle Popup Controller (ESM)
  console.log('Bundling popup script...');
  await esbuild.build({
    entryPoints: [path.join(ROOT_DIR, 'src/popup/popup.ts')],
    outfile: path.join(DIST_DIR, 'popup/popup.js'),
    bundle: true,
    format: 'esm',
    target: 'chrome110',
    sourcemap: false,
    minify: false,
  });

  // 5. Copy manifest.json
  console.log('Copying manifest.json...');
  fs.copyFileSync(
    path.join(ROOT_DIR, 'manifest.json'),
    path.join(DIST_DIR, 'manifest.json')
  );

  // 6. Copy Icons
  console.log('Copying icons...');
  const iconFiles = fs.readdirSync(path.join(ROOT_DIR, 'icons'));
  for (const iconFile of iconFiles) {
    if (iconFile.endsWith('.png')) {
      fs.copyFileSync(
        path.join(ROOT_DIR, 'icons', iconFile),
        path.join(DIST_DIR, 'icons', iconFile)
      );
    }
  }

  // 7. Copy and adapt popup.html
  console.log('Copying popup assets...');
  let popupHtml = fs.readFileSync(path.join(ROOT_DIR, 'src/popup/popup.html'), 'utf8');
  // Adjust script tag from popup.ts to popup.js
  popupHtml = popupHtml.replace('src="popup.ts"', 'src="popup.js"');
  fs.writeFileSync(path.join(DIST_DIR, 'popup/popup.html'), popupHtml, 'utf8');

  // Copy popup.css
  fs.copyFileSync(
    path.join(ROOT_DIR, 'src/popup/popup.css'),
    path.join(DIST_DIR, 'popup/popup.css')
  );

  console.log('✅ Extension built successfully into dist/ directory!');
  console.log('Ready to load unpacked into Chrome from: ' + DIST_DIR);
}

buildExtension().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
