// SpaceX's public Starlink ephemerides: a polite serial fetcher, the manifest,
// and an in-memory reader of one MEME file. Adapted from the starlink-forecast
// lane's lib/starlink.mjs. A raw file lives in memory only as long as its head
// takes to cut out (owner rule); nothing here writes an ephemeris to disk.
import { config, H, sha256, sleep } from './common.mjs';
import { readMeme } from '../e4-operator-ephemeris-parity/operators.mjs';

const S = config.starlink;

export class Refused extends Error {}

export class Fetcher {
  constructor(log) { this.last = 0; this.log = log; this.requests = 0; this.disabled = null; }

  // One GET, at least minGapMs after the previous request, one at a time.
  // 403 and 429 disable the fetcher for the run (a provider that says no is not asked again).
  async get(url, { headers = {}, attempts = 3, timeoutMs = 300000 } = {}) {
    if (this.disabled) throw new Refused(this.disabled);
    let lastError;
    for (let attempt = 1; attempt <= attempts; ++attempt) {
      const wait = this.last + S.minGapMs - Date.now();
      if (wait > 0) await sleep(wait);
      try {
        ++this.requests;
        const response = await fetch(url, { headers: { 'User-Agent': S.userAgent, ...headers }, signal: AbortSignal.timeout(timeoutMs) });
        this.last = Date.now();
        if (response.status === 304) return { status: 304, headers: response.headers };
        if (response.status === 404) return { status: 404 };
        if (response.status === 403 || response.status === 429) {
          this.disabled = `${url.split('/').pop()}: HTTP ${response.status}; the fetcher is disabled for this run`;
          throw new Refused(this.disabled);
        }
        if (response.status !== 200) { lastError = new Error(`HTTP ${response.status}`); this.log(`${url.split('/').pop()}: HTTP ${response.status} (attempt ${attempt})`); await sleep(60000); continue; }
        const bytes = Buffer.from(await response.arrayBuffer());
        return { status: 200, bytes, headers: response.headers, lastModified: response.headers.get('last-modified'), etag: response.headers.get('etag'), date: response.headers.get('date') };
      } catch (error) {
        if (error instanceof Refused) throw error;
        this.last = Date.now(); lastError = error;
        this.log(`${url.split('/').pop()}: ${error.message} (attempt ${attempt})`);
        await sleep(attempt === 1 ? 60000 : 120000);
      }
    }
    throw lastError ?? new Error('fetch failed');
  }

  // {names: Map norad -> file name, lastModified, etag, sha256, bytes}, or {notModified: true}.
  async manifest(previousEtag = null) {
    const response = await this.get(`${S.baseUrl}MANIFEST.txt`, { headers: previousEtag ? { 'If-None-Match': previousEtag } : {} });
    if (response.status === 304) return { notModified: true };
    if (response.status !== 200) throw new Error(`MANIFEST: HTTP ${response.status}`);
    return { names: manifestNames(response.bytes.toString('utf8')), lastModified: response.lastModified, etag: response.etag, sha256: sha256(response.bytes), bytes: response.bytes.length };
  }
}

export function manifestNames(text) {
  const names = new Map();
  for (const token of text.split(/\s+/)) if (token.startsWith('MEME_')) names.set(Number(token.split('_')[1]), token);
  return names;
}

// MEME_<norad>_<name>_<doy hhmm of the start>_<status>_<stop in GPS seconds>_UNCLASSIFIED.txt
export function nameFields(name) {
  const f = name.split('_');
  return { norad: Number(f[1]), satName: f[2], doyHhmm: f[3], status: f[4], stopGpsSeconds: Number(f[5]) };
}

// Header fields of a MEME text.
export function memeHeader(text) {
  const l = text.slice(0, 600).split(/\r?\n/);
  const created = /^created:(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d) UTC/.exec(l[0])?.[1];
  const m = /ephemeris_start:(\S+ \S+) UTC ephemeris_stop:(\S+ \S+) UTC step_size:(\d+)/.exec(l[1]);
  const source = /^ephemeris_source:(\S+)/.exec(l[2])?.[1];
  if (!created || !m) throw new Error('MEME: unreadable header');
  const z = (s) => `${s.replace(' ', 'T')}Z`;
  return { created: z(created), ephemerisStart: z(m[1]), ephemerisStop: z(m[2]), stepSeconds: Number(m[3]), source: source ?? null, axes: l[3]?.trim() ?? null };
}

const sigma = (cov, i, scale) => Math.sqrt(Math.abs(cov[i])) * scale;

// How much of a file the collector keeps in memory for the next version's mismatch (a version starts 6.5-7.2 h after the one before it,
// and up to a few versions may be skipped): states and the stated covariance's diagonal, never written to disk.
export const RETAIN_HOURS = 40;

// One file's text -> what the collector keeps in memory: the header, the first
// `headHours` of states (m, m/s, EME2000, UTC), the first RETAIN_HOURS for the pair mismatch and a few facts of the whole file.
export function cutHead(text, headHours = S.headHours) {
  const header = memeHeader(text);
  const parsed = readMeme(text);
  const t0 = Date.parse(parsed.epochs[0]);
  let n = 0;
  while (n < parsed.epochs.length && Date.parse(parsed.epochs[n]) - t0 <= headHours * H + 1) ++n;
  const steps = new Set();
  for (let i = 1; i < parsed.epochs.length; ++i) steps.add((Date.parse(parsed.epochs[i]) - Date.parse(parsed.epochs[i - 1])) / 1000);
  const cov = parsed.covariances[0];
  const epochsMs = parsed.epochs.map((e) => Date.parse(e));
  let nr = 0;
  while (nr < epochsMs.length && epochsMs[nr] - epochsMs[0] <= RETAIN_HOURS * H + 1) ++nr;
  const retained = {
    startMs: epochsMs[0], createdMs: Date.parse(header.created), frame: parsed.frame, timeScale: parsed.timeScale,
    epochsMs: Float64Array.from(epochsMs.slice(0, nr)),
    states: Float64Array.from(parsed.states.slice(0, nr).flat()),                                                  // m, m/s, 6 per epoch
    // stated sigma at every retained epoch: UVW position in m (3) then velocity in mm/s (3)
    sigma: Float64Array.from(parsed.covariances.slice(0, nr).flatMap((c) => [0, 2, 5].map((i) => sigma(c, i, 1000)).concat([9, 14, 20].map((i) => sigma(c, i, 1e6))))),
  };
  return {
    header,
    retained,
    head: { frame: parsed.frame, timeScale: parsed.timeScale, epochs: parsed.epochs.slice(0, n), states: parsed.states.slice(0, n).map((s) => s.slice()) },
    file: {
      states: parsed.epochs.length, distinctStepsSeconds: [...steps].sort((a, b) => a - b),
      // UVW covariance diagonal at the first state: position in m, velocity in mm/s (the operator's own statement).
      startSigma: { positionUvwM: [0, 2, 5].map((i) => sigma(cov, i, 1000)), velocityUvwMmS: [9, 14, 20].map((i) => sigma(cov, i, 1e6)) },
    },
  };
}
