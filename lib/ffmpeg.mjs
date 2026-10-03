import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

// Locate a usable ffmpeg binary: --ffmpeg flag > FFMPEG_PATH env > PATH > @ffmpeg-installer
export function resolveFfmpeg(userPath) {
  const tried = [];
  const candidates = [];
  if (userPath) candidates.push(userPath);
  if (process.env.FFMPEG_PATH) candidates.push(process.env.FFMPEG_PATH);
  candidates.push('ffmpeg');
  for (const c of candidates) {
    const r = spawnSync(c, ['-version'], { stdio: 'ignore' });
    if (r.status === 0) return c;
    if (c !== 'ffmpeg') tried.push(c);
  }
  // Bundled fallback (optionalDependency, may be absent with --omit=optional)
  try {
    const req = createRequire(import.meta.url);
    const installer = req('@ffmpeg-installer/ffmpeg');
    const bundled = installer.path;
    const r = spawnSync(bundled, ['-version'], { stdio: 'ignore' });
    if (r.status === 0) return bundled;
  } catch { /* not installed */ }
  throw new Error(
    'ffmpeg not found. Install ffmpeg (https://ffmpeg.org) or set FFMPEG_PATH,\n' +
    'or pass --ffmpeg /path/to/ffmpeg.exe. npm i video2guide bundles it by default.'
  );
}

export function run(ffmpeg, args, { capture = false } = {}) {
  const r = spawnSync(ffmpeg, args, {
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'ignore',
    maxBuffer: 64 * 1024 * 1024,
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr ? r.stderr.toString() : '' };
}

// ffmpeg -i prints "Duration: 00:09:19.03" on stderr; avoids needing ffprobe.
export function probeDuration(ffmpeg, video) {
  const { stderr } = run(ffmpeg, ['-hide_banner', '-i', video], { capture: true });
  const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) throw new Error(`Cannot read duration of ${video}. Is it a media file ffmpeg can open?`);
  return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]);
}
