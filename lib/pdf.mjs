import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
];

export function findBrowser(explicit) {
  const tried = [];
  const list = explicit ? [explicit] : [...CANDIDATES];
  for (const p of list) {
    const norm = p.replace(/\//g, path.sep === '\\' ? '/' : path.sep);
    if (fs.existsSync(norm) || p === 'chrome' || p === 'msedge') return p;
    tried.push(p);
  }
  // PATH lookup as last resort
  for (const name of ['chrome', 'msedge', 'chromium']) {
    const r = spawnSync(name, ['--version'], { stdio: 'ignore', shell: true });
    if (r.status === 0) return name;
  }
  throw new Error(
    'No Edge/Chrome found for PDF export. Install Microsoft Edge or Google Chrome,\n' +
    'or pass --browser "C:/path/to/msedge.exe".'
  );
}

// Headless print-to-pdf from the generated HTML. Isolated user-data-dir so a
// running browser instance never blocks us.
export function htmlToPdf(browser, htmlPath, pdfPath, { quiet = false } = {}) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'v2g-pdf-'));
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    `--user-data-dir=${profile}`,
    '--virtual-time-budget=8000',
    `--print-to-pdf=${pdfPath}`,
    '--no-pdf-header-footer',
    new URL('file:///' + path.resolve(htmlPath).replace(/\\/g, '/')).href,
  ];
  const r = spawnSync(browser, args, { stdio: 'ignore', timeout: 120000 });
  fs.rmSync(profile, { recursive: true, force: true });
  if (!fs.existsSync(pdfPath) || fs.statSync(pdfPath).size === 0) {
    throw new Error(`PDF export failed (browser exit ${r.status}).`);
  }
  if (!quiet) console.log(`PDF  ${pdfPath} (${kb(pdfPath)})`);
  return pdfPath;
}

const kb = (f) => Math.round(fs.statSync(f).size / 1024) + ' KB';
