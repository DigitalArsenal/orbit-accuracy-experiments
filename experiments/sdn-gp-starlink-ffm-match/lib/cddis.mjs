// NASA CDDIS (cddis.nasa.gov/archive) with the owner's Earthdata bearer token, the pattern of E14's truth-fetch.mjs: the token is
// read from /opt/data/sdn-archive/.secrets/earthdata.env at run time, sent only to cddis.nasa.gov (redirects are followed by hand
// and the header is dropped when the host changes), and never printed, logged or written. Requests are paced per host.
import fs from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';
import { UA } from './paced.mjs';

const SECRETS = '/opt/data/sdn-archive/.secrets/earthdata.env';
export const HOST = 'cddis.nasa.gov';
const STAMP = '/opt/data/sdn-archive/hac/.fetch-stamps/cddis.nasa.gov';

function token() {
  for (const line of fs.readFileSync(SECRETS, 'utf8').split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?EARTHDATA_TOKEN\s*=\s*(.*)\s*$/);
    if (m) return m[1].replace(/^(['"])(.*)\1$/, '$2');
  }
  throw new Error('earthdata.env has no EARTHDATA_TOKEN');
}

async function pace(spacingMs) {
  fs.mkdirSync(path.dirname(STAMP), { recursive: true });
  for (;;) {
    let last = 0;
    try { last = Number(fs.readFileSync(STAMP, 'utf8')); } catch { /* first request */ }
    const wait = last + spacingMs - Date.now();
    if (wait <= 0) break;
    await sleep(wait + Math.random() * 300);
  }
  fs.writeFileSync(STAMP, String(Date.now()));
}

/** GET with the bearer token on cddis.nasa.gov only. Returns { status, headers, bytes } (bytes null unless 200). */
export async function cddisGet(url, { spacingMs = 3000, timeoutMs = 300000 } = {}) {
  const t = token();
  let target = new URL(url);
  for (let hop = 0; hop < 6; hop += 1) {
    await pace(spacingMs);
    const onHost = target.protocol === 'https:' && target.hostname === HOST;
    const response = await fetch(target, { redirect: 'manual', headers: { 'user-agent': UA, ...(onHost ? { Authorization: `Bearer ${t}` } : {}) }, signal: AbortSignal.timeout(timeoutMs) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const next = response.headers.get('location');
      await response.arrayBuffer().catch(() => null);
      if (!next) return { status: response.status, headers: Object.fromEntries(response.headers), bytes: null };
      target = new URL(next, target);
      continue;
    }
    if (response.status === 403 || response.status === 429) throw new Error(`HTTP ${response.status} from ${target.hostname}: stop`);
    const bytes = response.ok ? Buffer.from(await response.arrayBuffer()) : (await response.arrayBuffer().catch(() => null), null);
    return { status: response.status, headers: Object.fromEntries(response.headers), bytes };
  }
  throw new Error(`too many redirects for ${url}`);
}

/** The file names in a CDDIS archive directory ("*?list"). */
export async function cddisList(dir) {
  const r = await cddisGet(`https://${HOST}/archive/${dir.replace(/^\/|\/$/g, '')}/*?list`);
  return r.bytes ? r.bytes.toString('utf8').split('\n').map((l) => l.trim().split(/\s+/)[0]).filter(Boolean) : [];
}
