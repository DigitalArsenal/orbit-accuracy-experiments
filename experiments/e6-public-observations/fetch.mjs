// Polite, cached HTTP capture for E6's public sources. Every file is written
// once under the source's archive directory with its provenance (URL, time,
// SHA-256, bytes) appended to that directory's provenance.jsonl; a file on
// disk is never fetched again. Transport only.
import fs from 'node:fs';
import path from 'node:path';
import { sha256 } from '../../harness/modules.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function capture({ root, userAgent, minIntervalMs }) {
  fs.mkdirSync(root, { recursive: true });
  const log = path.join(root, 'provenance.jsonl');
  let last = 0;
  return {
    root,
    has: (relative) => fs.existsSync(path.join(root, relative)),
    read: (relative) => fs.readFileSync(path.join(root, relative)),
    // Fetches url into root/relative unless it is there; returns the bytes.
    // 429 and 5xx back off and retry; other failures throw.
    // reject(bytes) -> reason: a 200 answer that is not the file (an HTML
    // error page) is not stored and throws as 'not found'.
    async get(url, relative, { headers = {}, reject = null } = {}) {
      const file = path.join(root, relative);
      if (fs.existsSync(file)) return { bytes: fs.readFileSync(file), cached: true, link: fs.existsSync(`${file}.link`) ? fs.readFileSync(`${file}.link`, 'utf8') : null };
      for (let attempt = 0; ; ++attempt) {
        const wait = last + minIntervalMs - Date.now();
        if (wait > 0) await sleep(wait);
        last = Date.now();
        let response;
        try {
          response = await fetch(url, { headers: { 'user-agent': userAgent, ...headers }, signal: AbortSignal.timeout(120000) });
        } catch (error) {
          if (attempt < 4) { await sleep(5000 * 2 ** attempt); continue; }
          throw error;
        }
        if (response.status === 429 || response.status >= 500) {
          if (attempt >= 6) throw new Error(`${url}: HTTP ${response.status}`);
          const retry = Number(response.headers.get('retry-after'));
          await sleep(Number.isFinite(retry) && retry > 0 ? retry * 1000 : 10000 * 2 ** attempt);
          continue;
        }
        if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
        const bytes = Buffer.from(await response.arrayBuffer());
        const reason = reject?.(bytes);
        if (reason) throw new Error(`${url}: HTTP 404 (${reason})`);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(`${file}.part`, bytes);
        if (response.headers.get('link')) fs.writeFileSync(`${file}.link`, response.headers.get('link'));
        fs.renameSync(`${file}.part`, file);
        fs.appendFileSync(log, `${JSON.stringify({ url, path: relative, retrieved: new Date().toISOString(), sha256: sha256(bytes), bytes: bytes.length, link: response.headers.get('link') })}\n`);
        return { bytes, cached: false, link: response.headers.get('link') };
      }
    },
  };
}
