#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { resolveFfmpeg, probeDuration } from '../lib/ffmpeg.mjs';
import { sampleFrames, frameDiffs, autoThreshold, pickCuts, buildSteps } from '../lib/detect.mjs';
import { extractKeyframes, parseSrt, assignSubs } from '../lib/frames.mjs';
import { renderGuide } from '../lib/html.mjs';
import { findBrowser, htmlToPdf } from '../lib/pdf.mjs';

const HELP = `
video2guide - turn a tutorial video into an illustrated step-by-step guide (HTML + PDF)

Usage:
  video2guide <video>                 full flow: detect steps -> extract keyframes -> build guide
  video2guide detect <video>          steps.json + frames/ only
  video2guide build                   re-render from (hand-polished) steps.json

Options:
  -o, --out <dir>        output directory            (default ./video2guide-out)
  -t, --title <s>        guide title                 (default: video filename)
      --fps <n>          sampling fps for detection  (default 2)
      --threshold <n>    manual MAD cut threshold    (default: adaptive)
      --min-gap <sec>    min seconds between steps   (default 3)
      --max-steps <n>    step cap                    (default 60)
      --width <px>       keyframe max width          (default 1280)
      --srt <file>       attach SRT subtitles per step
      --url <u>          source page URL; timestamp chips deep-link into it (?t=sec)
      --pdf              also export PDF (needs Edge or Chrome)
      --no-embed         reference frame files instead of base64-embedding
      --qa               mark output with data-qa (for screenshot self-tests)
      --ffmpeg <path>    ffmpeg binary               (default: PATH / FFMPEG_PATH / bundled)
      --browser <path>   browser for PDF             (default: auto-find Edge/Chrome)
  -q, --quiet            less console output
  -h, --help             this help

Workflow for polished guides:
  1) video2guide detect lecture.mp4        -> steps.json + frames/
  2) edit steps.json: fill "title"/"note" per step
  3) video2guide build                     -> guide.html (+ --pdf)

Steps.json is overwritten by "detect" - edit it between detect and build.
`;

function parseArgs(argv) {
  const args = { _: [] };
  const aliases = { '-o': 'out', '--out': 'out', '-t': 'title', '--title': 'title' };
  const withValue = new Set(['-o', '--out', '-t', '--title', '--fps', '--threshold', '--min-gap', '--max-steps', '--width', '--srt', '--url', '--ffmpeg', '--browser', '--steps']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { args.help = true; continue; }
    if (a === '-q' || a === '--quiet') { args.quiet = true; continue; }
    if (a === '--pdf') { args.pdf = true; continue; }
    if (a === '--no-embed') { args.embed = false; continue; }
    if (a === '--qa') { args.qa = true; continue; }
    if (withValue.has(a)) {
      const key = aliases[a] || a.replace(/^-+/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      args[key] = argv[++i];
      continue;
    }
    args._.push(a);
  }
  return args;
}

const num = (v, d) => (v === undefined ? d : Number(v) || d);
const log = (quiet, ...m) => { if (!quiet) console.log(...m); };

async function cmdDetect(args) {
  const video = args._[1];
  if (!video || !fs.existsSync(video)) throw new Error(`video not found: ${video}`);
  const ffmpeg = resolveFfmpeg(args.ffmpeg);
  const outDir = path.resolve(args.out || 'video2guide-out');
  fs.mkdirSync(outDir, { recursive: true });

  const fps = num(args.fps, 2);
  const minGap = num(args.minGap, 3);
  const maxSteps = num(args.maxSteps, 60);
  const width = num(args.width, 1280);
  const title = args.title || path.basename(video, path.extname(video));

  const duration = probeDuration(ffmpeg, video);
  log(args.quiet, `ffmpeg  ${ffmpeg}`);
  log(args.quiet, `video   ${video} (${fmtDur(duration)})`);

  const BPF = 64 * 36; // 64x36 grayscale sample frame size
  let sampled = 0;
  const { data, bytesPerFrame } = await sampleFrames(ffmpeg, video, fps, (total) => {
    const n = Math.floor(total / BPF);
    if (n - sampled >= 500) { sampled = n; log(args.quiet, `  sampled ${n} frames…`); }
  });
  const nFrames = Math.floor(data.length / bytesPerFrame);
  if (nFrames < 2) throw new Error('video too short to detect scenes');
  log(args.quiet, `sampled ${nFrames} frames @ ${fps} fps (64x36 grayscale)`);

  const diffs = frameDiffs(data, bytesPerFrame);
  const threshold = args.threshold !== undefined ? num(args.threshold, 0) : autoThreshold(diffs);
  const cuts = pickCuts(diffs, { threshold, minGapFrames: Math.round(minGap * fps), maxSteps });
  const steps = buildSteps(cuts, fps, duration);
  log(args.quiet, `cuts    ${cuts.length} (threshold ${threshold.toFixed(1)})`);

  if (args.srt) {
    const subs = parseSrt(fs.readFileSync(args.srt, 'utf8'));
    assignSubs(steps, subs);
    log(args.quiet, `subs    ${subs.length} cues attached`);
  }

  const meta = {
    title,
    video: path.basename(video),
    source: path.resolve(video),
    duration,
    fps,
    threshold,
    steps,
  };
  const stepsFile = path.join(outDir, 'steps.json');
  fs.writeFileSync(stepsFile, JSON.stringify(meta, null, 2), 'utf8');
  log(args.quiet, `steps   ${stepsFile}`);

  const ok = extractKeyframes(ffmpeg, path.resolve(video), steps, outDir, width);
  log(args.quiet, `frames  ${ok}/${steps.length} keyframes extracted`);
  return meta;
}

function cmdBuild(args) {
  const stepsFile = args.steps || findSteps(args);
  const meta = JSON.parse(fs.readFileSync(stepsFile, 'utf8'));
  const outDir = path.dirname(path.resolve(stepsFile));
  const opts = {
    embed: args.embed !== false,
    qa: !!args.qa,
    url: args.url || meta.url || '',
    outDir,
  };
  const title = args.title || meta.title || 'Video Guide';
  const htmlPath = path.join(outDir, 'guide.html');
  fs.writeFileSync(htmlPath, renderGuide({ title, video: meta.video, duration: meta.duration, steps: meta.steps, opts }), 'utf8');
  log(args.quiet, `HTML  ${htmlPath} (${kb(htmlPath)})`);
  if (args.pdf) {
    const browser = findBrowser(args.browser);
    htmlToPdf(browser, htmlPath, path.join(outDir, 'guide.pdf'), { quiet: args.quiet });
  }
}

function findSteps(args) {
  const p = path.resolve(args.out || 'video2guide-out', 'steps.json');
  if (!fs.existsSync(p)) throw new Error(`steps.json not found at ${p}. Run "video2guide detect <video>" first.`);
  return p;
}

function fmtDur(sec) {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
const kb = (f) => Math.round(fs.statSync(f).size / 1024) + ' KB';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.length === 0) { console.log(HELP); return; }
  const cmd = args._[0];
  if (cmd === 'detect') { await cmdDetect(args); return; }
  if (cmd === 'build') { cmdBuild(args); return; }
  // default: <video> -> detect + build
  if (!/\.(mp4|mkv|mov|avi|webm|flv|m4v|ts|wmv)$/i.test(cmd) && !fs.existsSync(cmd)) {
    throw new Error(`unknown command or video: ${cmd}`);
  }
  args._.unshift('detect');
  const meta = await cmdDetect(args);
  if (!args.quiet) {
    console.log('\nDetected steps:');
    for (const s of meta.steps.slice(0, 12)) {
      console.log(`  ${String(s.id).padStart(2)}  ${fmtDur(s.start)} – ${fmtDur(s.end)}  ${s.title || '(untitled)'}`);
    }
    if (meta.steps.length > 12) console.log(`  … ${meta.steps.length - 12} more`);
    console.log('');
  }
  cmdBuild({ ...args, steps: path.resolve(args.out || 'video2guide-out', 'steps.json') });
}

main().catch((e) => {
  console.error('error:', e.message);
  process.exit(1);
});
