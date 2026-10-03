import { readFileSync, statSync } from 'node:fs';

export function fmtTime(sec) {
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const pad = (x) => String(x).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
}

const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// If the user passed the original page URL, timestamp chips deep-link into it
// (bilibili ?t=<sec>, youtube &t=<sec>s) — handy while writing notes.
function timeLink(url, sec, label) {
  if (!url) return `<span class="t">${esc(label)}</span>`;
  const href = /youtu\.?be/.test(url)
    ? `${url}${url.includes('?') ? '&' : '?'}t=${Math.round(sec)}s`
    : `${url}${url.includes('?') ? '&' : '?'}t=${Math.round(sec)}`;
  return `<a class="t" href="${esc(href)}" target="_blank" rel="noopener">${esc(label)}</a>`;
}

function stepCard(step, i, opts) {
  const range = `${fmtTime(step.start)} – ${fmtTime(step.end)}`;
  const title = step.title?.trim() || `Step ${i + 1}`;
  const note = step.note?.trim()
    ? `<div class="cap">${esc(step.note).replace(/\n/g, '<br>')}</div>`
    : '';
  const subs = (step.subs || []).length
    ? `<div class="subs">${step.subs.map((s) => `<div class="quote">${esc(s)}</div>`).join('')}</div>`
    : '';
  const src = step.image ? (opts.embed ? embedImg(opts.outDir, step.image) : esc(step.image)) : null;
  const img = src
    ? `<div class="dia"><img src="${src}" alt="Step ${i + 1} keyframe" loading="lazy"></div>`
    : '';
  return `<div class="step" id="s${i + 1}">
    <div class="head"><span class="no">STEP ${i + 1}</span><h3>${esc(title)}</h3>${timeLink(opts.url, step.start, range)}</div>
    ${img}${note}${subs}
  </div>`;
}

function embedImg(outDir, rel) {
  const file = outDir + '/' + rel.replace(/\\/g, '/');
  try {
    if (statSync(file).size > 0) return `data:image/jpeg;base64,${readFileSync(file).toString('base64')}`;
  } catch { /* missing frame -> render without image */ }
  return null;
}

export function renderGuide({ title, video, duration, steps, opts }) {
  const toc = steps
    .map((s, i) => {
      const t = s.title?.trim() || `Step ${i + 1}`;
      return `<a href="#s${i + 1}">${i + 1}. ${esc(t.length > 18 ? t.slice(0, 18) + '…' : t)}</a>`;
    })
    .join('');
  const cards = steps.map((s, i) => stepCard(s, i, opts)).join('\n');
  const today = new Date().toISOString().slice(0, 10);
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<style>
:root{--bg:#f5f6f8;--card:#fff;--ink:#1a1d21;--sub:#5c6470;--line:#e6e9ee;--acc:#0a66ff;--chip:#eef2f8}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--bg);color:var(--ink);font-family:"Segoe UI","Microsoft YaHei",system-ui,sans-serif;line-height:1.75}
.wrap{max-width:960px;margin:0 auto;padding:0 20px 80px}
header.hero{background:linear-gradient(135deg,#0b1c33 0%,#123a63 55%,#0a66ff 130%);color:#fff;padding:52px 20px 40px;margin-bottom:30px}
.hero-inner{max-width:960px;margin:0 auto}
.hero .tag{display:inline-block;font-size:13px;letter-spacing:2px;border:1px solid rgba(255,255,255,.35);padding:3px 12px;border-radius:99px;margin-bottom:16px;opacity:.9}
.hero h1{font-size:32px;font-weight:800;letter-spacing:.5px;line-height:1.35}
.hero .meta{margin-top:16px;font-size:14px;opacity:.85;display:flex;flex-wrap:wrap;gap:8px 22px}
nav.toc{position:sticky;top:0;z-index:50;background:rgba(255,255,255,.94);backdrop-filter:blur(8px);border-bottom:1px solid var(--line);padding:10px 0;margin-bottom:26px}
nav.toc .row{max-width:960px;margin:0 auto;padding:0 20px;display:flex;gap:6px;flex-wrap:wrap}
nav.toc a{font-size:12.5px;color:var(--sub);text-decoration:none;padding:3px 10px;border-radius:99px;background:var(--chip)}
nav.toc a:hover{color:var(--acc)}
.step{background:var(--card);border:1px solid var(--line);border-radius:16px;overflow:hidden;margin:18px 0;box-shadow:0 1px 4px rgba(16,24,40,.05)}
.step .head{display:flex;align-items:baseline;gap:12px;padding:16px 22px 12px}
.step .no{font-size:13px;font-weight:800;color:#fff;background:var(--acc);border-radius:8px;padding:2px 9px;letter-spacing:1px;flex:none}
.step h3{margin:0;font-size:17.5px;line-height:1.4}
.step .t,.step a.t{margin-left:auto;font-size:12.5px;color:var(--sub);white-space:nowrap;text-decoration:none;font-variant-numeric:tabular-nums}
.step a.t:hover{color:var(--acc)}
.step .dia{padding:8px 12px;background:#fbfcfe;border-top:1px solid var(--line)}
.step .dia img{width:100%;height:auto;display:block;border-radius:6px}
.step .cap{padding:12px 22px 6px;font-size:14px;color:#33383e}
.step .subs{padding:4px 22px 16px}
.quote{border-left:3px solid #c9d4e3;background:#f8fafc;padding:8px 14px;margin:8px 0;border-radius:0 10px 10px 0;font-size:13.5px;color:#3d434b}
footer{margin-top:60px;text-align:center;color:var(--sub);font-size:12.5px}
footer a{color:var(--sub)}
@media print{
  body{background:#fff}
  nav.toc{display:none}
  header.hero{margin-bottom:12px}
  .step{page-break-inside:avoid;box-shadow:none;break-inside:avoid}
  .step .dia img{max-height:170mm;object-fit:contain}
}
</style>
</head>
<body${opts.qa ? ' data-qa="1"' : ''}>
<header class="hero">
  <div class="hero-inner">
    <span class="tag">VIDEO → STEP-BY-STEP GUIDE</span>
    <h1>${esc(title)}</h1>
    <div class="meta">
      <span>🎬 ${esc(video)}</span>
      <span>⏱ ${fmtTime(duration)}</span>
      <span>🪜 ${steps.length} steps</span>
      <span>📅 ${today}</span>
    </div>
  </div>
</header>
<nav class="toc"><div class="row">${toc}</div></nav>
<div class="wrap">
${cards}
<footer>Generated by <a href="https://github.com/yhd071207/video2guide" target="_blank" rel="noopener">video2guide</a> · scene cuts auto-detected with ffmpeg MAD · timestamps are approximate</footer>
</div>
</body>
</html>`;
}
