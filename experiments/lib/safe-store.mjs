// Safe local-disk staging & ZFS-symlink write guard (DigitalArsenal/spacedatanetwork-stack#960).
// Direct streaming writes through /opt/data/sdn-archive (symlinked to /Volumes/tdas ZFS array)
// produced silent line corruption on 2026-11-20. Experiment writers must stage stores on local
// disk, verify line/gzip integrity, and atomically copy finished publication artifacts.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const UNSAFE_WRITE_PREFIXES = ['/Volumes/tdas', '/opt/data/.array', '/opt/data/sdn-archive'];

export function resolveRealOrParent(targetPath) {
  let cur = path.resolve(targetPath);
  const tail = [];
  while (!fs.existsSync(cur)) {
    const parent = path.dirname(cur);
    if (parent === cur) break;
    tail.unshift(path.basename(cur));
    cur = parent;
  }
  const base = fs.existsSync(cur) ? fs.realpathSync(cur) : cur;
  return tail.length ? path.join(base, ...tail) : base;
}

export function assertLocalWritePath(targetPath, label = 'store') {
  const real = resolveRealOrParent(targetPath);
  for (const prefix of UNSAFE_WRITE_PREFIXES) {
    if (real === prefix || real.startsWith(prefix + path.sep)) {
      throw new Error(
        `Refusing direct write of ${label} to ZFS array path ${targetPath} (resolved ${real}); stage on local disk first (#960).`,
      );
    }
  }
  return real;
}

export function writeFileAtomicLocal(targetPath, data) {
  assertLocalWritePath(targetPath, path.basename(targetPath));
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const tmp = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, targetPath);
}

export function verifyJsonlFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  let lines = 0;
  for (const line of text.split('\n')) {
    if (!line) continue;
    JSON.parse(line);
    lines++;
  }
  return lines;
}

export function verifyGzipFile(filePath) {
  const buf = fs.readFileSync(filePath);
  return zlib.gunzipSync(buf).length;
}

export function publishVerifiedFile(localSrc, destPath) {
  if (localSrc.endsWith('.gz')) verifyGzipFile(localSrc);
  else if (localSrc.endsWith('.jsonl')) verifyJsonlFile(localSrc);
  else if (localSrc.endsWith('.json')) JSON.parse(fs.readFileSync(localSrc, 'utf8'));
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const tmp = `${destPath}.${process.pid}.stage`;
  fs.copyFileSync(localSrc, tmp);
  if (destPath.endsWith('.gz')) verifyGzipFile(tmp);
  else if (destPath.endsWith('.jsonl')) verifyJsonlFile(tmp);
  else if (destPath.endsWith('.json')) JSON.parse(fs.readFileSync(tmp, 'utf8'));
  fs.renameSync(tmp, destPath);
}

export function defaultLocalStagingDir(name) {
  return path.join(os.tmpdir(), `sdn-stage-${name}-${process.pid}`);
}
