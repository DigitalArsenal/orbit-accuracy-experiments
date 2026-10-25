// SpaceX public ephemerides: paced requests (the lock file spaces them 3.2 s apart across processes), the manifest, the head of a file.
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { config, store } from '../common.mjs';

export const STARLINK_ROOT = 'https://api.starlink.com/public-files/ephemerides';
let manifestCache = null;
export async function polite(url, { range } = {}) {
  const lock = path.join(store, 'fetch.lock');
  for (;;) {
    let last = 0;
    try { last = fs.statSync(lock).mtimeMs; } catch { /* first request */ }
    const wait = last + config.fit.requestSpacingSeconds * 1000 - Date.now();
    if (wait <= 0) break;
    await sleep(wait + Math.random() * 400);
  }
  fs.writeFileSync(lock, String(Date.now()));
  const response = await fetch(url, { headers: range ? { range } : {}, signal: AbortSignal.timeout(180000) });
  if (response.status === 403 || response.status === 429) throw new Error(`HTTP ${response.status} from ${new URL(url).host}: stop`);
  if (!response.ok && response.status !== 206) throw new Error(`HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}
export async function manifest() {
  manifestCache ??= (await polite(`${STARLINK_ROOT}/MANIFEST.txt`)).toString('utf8').split('\n').filter(Boolean);
  return manifestCache;
}
