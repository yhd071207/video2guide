// Scene detection: pass 1 streams a tiny grayscale version of the video through a
// rawvideo pipe and measures mean-absolute-difference (MAD) between consecutive
// frames; pass 2 (in ffmpeg extraction) pulls a full-res JPEG at each detected cut.
import { spawn } from 'node:child_process';

export function sampleFrames(ffmpeg, video, fps, onProgress) {
  return new Promise((resolve, reject) => {
    const args = [
      '-hide_banner', '-nostdin',
      '-i', video,
      '-vf', `fps=${fps},scale=64:36,format=gray`,
      '-f', 'rawvideo', '-',
    ];
    const child = spawn(ffmpeg, args, { stdio: ['ignore', 'pipe', 'ignore'] });
    const chunks = [];
    let total = 0;
    child.stdout.on('data', (c) => {
      chunks.push(c);
      total += c.length;
      if (onProgress) onProgress(total);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0 && total === 0) return reject(new Error(`ffmpeg sampling failed (exit ${code})`));
      resolve({ data: Buffer.concat(chunks), bytesPerFrame: 64 * 36 });
    });
  });
}

// MAD between consecutive frames -> diffs[i] is the change from frame i to i+1.
export function frameDiffs(data, bytesPerFrame) {
  const n = Math.floor(data.length / bytesPerFrame);
  const diffs = new Float64Array(Math.max(0, n - 1));
  const a = new Uint8Array(bytesPerFrame);
  const b = new Uint8Array(bytesPerFrame);
  for (let i = 0; i < n - 1; i++) {
    data.copy(a, 0, i * bytesPerFrame, (i + 1) * bytesPerFrame);
    data.copy(b, 0, (i + 1) * bytesPerFrame, (i + 2) * bytesPerFrame);
    let sum = 0;
    for (let j = 0; j < bytesPerFrame; j++) sum += Math.abs(a[j] - b[j]);
    diffs[i] = sum / bytesPerFrame;
  }
  return diffs;
}

// Robust adaptive threshold: median + max(k*MAD, floor). Heavy-tail proof — a
// handful of hard cuts barely moves the median/MAD of the whole stream.
export function autoThreshold(diffs) {
  const sorted = Float64Array.from(diffs).sort();
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const med = q(0.5);
  const abs = Float64Array.from(diffs, (d) => Math.abs(d - med)).sort();
  const mad = abs[Math.min(abs.length - 1, Math.floor(0.5 * abs.length))];
  return med + Math.max(4 * mad, 8);
}

// Pick cut indices: threshold + local max, then greedy strongest-first with a
// min-gap constraint. Iteratively raises the threshold until under maxSteps.
export function pickCuts(diffs, { threshold, minGapFrames, maxSteps }) {
  const isLocalMax = (i) => {
    const d = diffs[i];
    return d > threshold && (i === 0 || d >= diffs[i - 1]) && (i === diffs.length - 1 || d > diffs[i + 1]);
  };
  let thr = threshold;
  let cands = [];
  for (let iter = 0; iter < 24; iter++) {
    cands = [];
    for (let i = 0; i < diffs.length; i++) if (isLocalMax(i)) cands.push(i);
    if (cands.length <= maxSteps) break;
    thr = thr <= 0 ? 10 : thr * 1.3;
  }
  cands.sort((a, b) => diffs[b] - diffs[a]);
  const picked = [];
  for (const c of cands) {
    if (picked.every((p) => Math.abs(p - c) >= minGapFrames)) picked.push(c);
  }
  return picked.sort((a, b) => a - b);
}

// Turn cut times into step segments covering [0, duration].
export function buildSteps(cutFrames, fps, duration) {
  const cuts = cutFrames.map((f) => (f + 1) / fps); // first frame of the new scene
  const starts = [0, ...cuts];
  return starts.map((start, i) => {
    const end = i + 1 < starts.length ? starts[i + 1] : duration;
    return {
      id: i + 1,
      start: round2(start),
      end: round2(end),
      title: '',
      note: '',
      image: `frames/step-${String(i + 1).padStart(2, '0')}.jpg`,
      subs: [],
    };
  });
}

const round2 = (x) => Math.round(x * 100) / 100;
