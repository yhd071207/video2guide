import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { run } from './ffmpeg.mjs';

// Full-res keyframe extraction at each step start (fast output-seek: cuts are
// almost always on keyframes, so landing within ~0.5s is fine and much faster).
export function extractKeyframes(ffmpeg, video, steps, outDir, maxWidth) {
  fs.mkdirSync(path.join(outDir, 'frames'), { recursive: true });
  const vf = `scale='min(${maxWidth},iw)':-2`;
  let ok = 0;
  for (const step of steps) {
    const out = path.join(outDir, 'frames', path.basename(step.image));
    const args = [
      '-y', '-hide_banner', '-nostdin',
      '-ss', String(step.start),
      '-i', video,
      '-frames:v', '1',
      '-vf', vf,
      '-q:v', '3',
      out,
    ];
    const r = spawnSync(ffmpeg, args, { stdio: 'ignore' });
    if (r.status === 0 && fs.existsSync(out) && fs.statSync(out).size > 0) {
      ok++;
    } else {
      // retry with accurate (input-first) seek for the rare non-keyframe cut
      const args2 = ['-y', '-hide_banner', '-nostdin', '-i', video, '-ss', String(step.start), '-frames:v', '1', '-vf', vf, '-q:v', '3', out];
      run(ffmpeg, args2);
      if (fs.existsSync(out) && fs.statSync(out).size > 0) ok++;
      else step.image = ''; // drop the image rather than fail the whole run
    }
  }
  return ok;
}

// Minimal SRT parser; subs are attached to whichever step contains their start time.
export function parseSrt(text) {
  const subs = [];
  const blocks = String(text).replace(/\r\n/g, '\n').trim().split(/\n\n+/);
  const tc = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/;
  for (const block of blocks) {
    const m = block.match(tc);
    if (!m) continue;
    const start = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4]) / 1000;
    const end = (+m[5]) * 3600 + (+m[6]) * 60 + (+m[7]) + (+m[8]) / 1000;
    const lines = block.split('\n').filter((l) => !tc.test(l) && !/^\d+$/.test(l.trim()));
    const text1 = lines.join(' ').trim();
    if (text1) subs.push({ start, end, text: text1 });
  }
  return subs;
}

export function assignSubs(steps, subs) {
  for (const step of steps) {
    step.subs = subs
      .filter((s) => s.start >= step.start && s.start < step.end)
      .slice(0, 6)
      .map((s) => s.text);
  }
}
