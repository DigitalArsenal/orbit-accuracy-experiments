// Amendment A5: the operators' ephemerides as data. GCRF trajectories of
// one object from each operator file, the files issued by a cutoff, the
// pairs and their scoring references. Reading, framing and selection only:
// the frame and time-scale conversions are the modules' (foundation/frames,
// foundation/time, files/orbit-products and analysis/reference-states through
// sp3.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { sha256 } from '../../harness/modules.mjs';
import { toGcrf } from '../../harness/frames.mjs';
import { convertIso } from '../../harness/time.mjs';
import { decodeOemStream } from '../../harness/records.mjs';
import { readSets } from './products.mjs';
import { DAY_MS, HOUR_MS, config } from './common.mjs';
import { readCpf, readIntelsat, readMeme, readOem, readPlanetStates, readTle, sp3Text, unzipMembers } from './operators.mjs';
import { gnssIdentities, sp3Satellites } from './sp3.mjs';

const iso = (ms) => new Date(ms).toISOString();
const STATE_KEYS = ['X', 'Y', 'Z', 'X_DOT', 'Y_DOT', 'Z_DOT'];
const intelsatStamp = (file) => {
  const m = /_(\d{8})_(\d{6})\.txt$/.exec(file);
  return m ? Date.parse(`${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6)}T${m[2].slice(0, 2)}:${m[2].slice(2, 4)}:${m[2].slice(4)}Z`) : null;
};

// One object's trajectory from one file: sample epochs (ms, ascending) and
// GCRF states [m, m/s], converted on first use; covariances (SpaceX's 21
// lower-triangle UVW entries, km) where the file has them.
class Trajectory {
  constructor({ file, issueMs, norad, epochs, raw, convert, covariances }) {
    Object.assign(this, { file, issueMs, norad, epochs, raw, convert, covariances });
    this.start = epochs[0];
    this.end = epochs.at(-1);
    this.cache = new Map();
  }
  covers(ms) { return ms >= this.start && ms <= this.end; }
  // The index of the first sample at or after ms within toleranceMs, or -1.
  indexAtOrAfter(ms, toleranceMs) {
    let a = 0, b = this.epochs.length;
    while (a < b) { const m = (a + b) >> 1; if (this.epochs[m] < ms) a = m + 1; else b = m; }
    return a < this.epochs.length && this.epochs[a] - ms <= toleranceMs ? a : -1;
  }
  async state(k) {
    if (!this.cache.has(k)) this.cache.set(k, await this.convert(k));
    return this.cache.get(k);
  }
}

// Every operator file of a provider that A5 reads, with its issue time and
// a loader of per-object trajectories.
export class OperatorFiles {
  constructor({ provider, inputs, readInput, ctx, sp3Ctx, sinex, gpNames }) {
    this.provider = provider;
    this.spec = config.providers[provider];
    this.record = JSON.parse(fs.readFileSync(path.join(inputs, provider, 'inputs.json'), 'utf8'));
    Object.assign(this, { readInput, ctx, sp3Ctx, sinex, gpNames });
    this.loaded = new Map();  // file -> Map norad -> Trajectory
  }

  ephemerisFiles() { return this.record.files.filter((f) => f.role === 'ephemeris' || f.role === 'a5-extra'); }

  // The file's issue time (PLAN.md amendment A5): stated creation where the
  // file states one, else the capture time.
  async issueMs(f) {
    const fmt = this.spec.format;
    if (fmt === 'intelsat-ecf') return intelsatStamp(f.file);
    if (fmt === 'meme' || fmt === 'ccsds-oem' || fmt === 'ccsds-oem-zip' || fmt === 'cpf') {
      const map = await this.load(f);
      const any = [...map.values()][0];
      return any ? any.issueMs : Date.parse(f.captured);
    }
    return Date.parse(f.captured);
  }

  // norad -> Trajectory for one file (cached).
  async load(f) {
    if (this.loaded.has(f.file)) return this.loaded.get(f.file);
    const out = new Map();
    const fmt = this.spec.format, frames = this.ctx.modules['foundation/frames'];
    const inertial = (norad, epochsIso, states, issueMs, covariances) => {
      const epochs = epochsIso.map((e) => Date.parse(e));
      out.set(norad, new Trajectory({ file: f.file, issueMs, norad, epochs, covariances,
        convert: async (k) => toGcrf(frames, this.spec.frame, iso(epochs[k]), states[k]) }));
    };
    const blocks = (list, issueMs) => {
      for (const b of list) {
        const lines = b.block.EPHEMERIS_DATA_LINES;
        const epochs = lines.map((l) => Date.parse(/Z$/.test(l.EPOCH) ? l.EPOCH : `${l.EPOCH}Z`));
        out.set(b.norad, new Trajectory({ file: f.file, issueMs, norad: b.norad, epochs, convert: async (k) => STATE_KEYS.map((key) => lines[k][key] * 1000) }));
      }
    };
    if (fmt === 'meme') {
      const parsed = readMeme(this.readInput(f).toString('latin1'));
      inertial(Number(/MEME_(\d+)_/.exec(f.file)[1]), parsed.epochs, parsed.states, Date.parse(parsed.created), parsed.covariances);
    } else if (fmt === 'ccsds-oem' || fmt === 'ccsds-oem-zip') {
      const bytes = this.readInput(f);
      const texts = fmt === 'ccsds-oem' ? [bytes.toString('latin1')] : unzipMembers(bytes).filter((m) => !m.name.endsWith('/')).map((m) => m.bytes.toString('latin1'));
      for (const text of texts) { const parsed = readOem(text); inertial(this.spec.norad, parsed.epochs, parsed.states, Date.parse(parsed.created)); }
    } else if (fmt === 'planet-states') {
      // One state per satellite; the HWID's catalog number from Planet's own
      // element-set file captured with it or before (as step 10).
      const sets = this.record.files.filter((t) => t.role === 'operator-tle' && t.captured <= f.captured).sort((a, b) => a.captured.localeCompare(b.captured)).at(-1);
      const byHwid = new Map((sets ? readTle(this.readInput(sets).toString('latin1')) : []).map((t) => [t.hwid, t]));
      for (const s of readPlanetStates(this.readInput(f).toString('latin1'))) {
        const t = byHwid.get(s.hwid);
        if (!t) continue;
        const epoch = `${(await convertIso(this.ctx.modules['foundation/time'], s.epochTT.replace('Z', ''), 'TT', 'UTC')).replace(/Z?$/, '')}Z`;
        inertial(t.norad, [iso(Date.parse(epoch))], [s.state], Date.parse(f.captured));
      }
    } else if (fmt === 'intelsat-ecf') {
      const token = /_([a-z0-9-]+)_\d{8}_\d{6}\.txt$/.exec(f.file)[1];
      const norad = this.gpNames.resolve(token);
      if (norad) {
        const parsed = readIntelsat(this.readInput(f).toString('latin1'));
        const text = sp3Text('L01', parsed.rows, 'UTC', [`INTELSAT ECF ${token} TRANSCRIBED TO SP3-C, KM, UTC`, f.url]);
        blocks(await (await this.sp3Ctx()).convert(text, { product: f.file, source: f.url, statedSigmaM: this.spec.statedSigmaM, statedSigmaBasis: this.spec.statedSigmaBasis,
          satellites: { L01: { norad, objectId: '', name: parsed.title } } }), intelsatStamp(f.file));
      }
    } else if (fmt === 'ses-i11') {
      try {
        const ses = await (await this.sp3Ctx()).ses(this.readInput(f));
        const norad = this.gpNames.resolve(ses.name);
        if (norad) {
          const text = sp3Text('L01', ses.rows, 'UTC', [`SES I11 ${ses.name} EVALUATED BY ORBIT-PRODUCTS, KM, UTC`, f.url]);
          blocks(await (await this.sp3Ctx()).convert(text, { product: f.file, source: f.url, statedSigmaM: this.spec.statedSigmaM, statedSigmaBasis: this.spec.statedSigmaBasis,
            satellites: { L01: { norad, objectId: '', name: ses.name } } }), Date.parse(f.captured));
        }
      } catch { /* a refused file has no trajectory (step 10 lists it) */ }
    } else if (fmt === 'cpf') {
      const parsed = readCpf(this.readInput(f).toString('latin1'));
      if (parsed.frame === 0) {
        const text = sp3Text('L01', parsed.rows, 'UTC', [`CPF ${parsed.target} TRANSCRIBED TO SP3-C, KM, UTC`, f.url]);
        blocks(await (await this.sp3Ctx()).convert(text, { product: f.file, source: f.url, statedSigmaM: this.spec.statedSigmaM, statedSigmaBasis: this.spec.statedSigmaBasis,
          satellites: { L01: { norad: parsed.norad, objectId: '', name: parsed.target } } }), Date.parse(parsed.created));
      }
    } else if (fmt === 'sp3') {
      const text = gunzipSync(this.readInput(f));
      const ids = sp3Satellites(text.toString('latin1'));
      const mid = Date.parse(f.captured) + DAY_MS / 2;
      const satellites = Object.fromEntries(Object.entries(gnssIdentities(this.sinex.toString(), mid)).filter(([prn]) => this.spec.systems.includes(prn[0]) && ids.includes(prn)));
      blocks(await (await this.sp3Ctx()).convert(text, { product: f.file, source: f.url, satellites }), Date.parse(f.captured));
    }
    this.loaded.set(f.file, out);
    return out;
  }

  // Every trajectory of one object, with its file's issue time, newest issue first.
  async history(norad) {
    const out = [];
    for (const f of this.ephemerisFiles()) {
      const t = (await this.load(f)).get(norad);
      if (t) out.push(t);
    }
    return out.sort((a, b) => b.issueMs - a.issueMs || b.end - a.end);
  }
}

// E4's within-span horizons on one trajectory: the first sample at or after
// tc + h within config.scoring.maximumGapSeconds (step 10's rule).
export function horizonIndices(trajectory, tc) {
  const out = [];
  for (const h of config.horizonsHours) {
    const k = trajectory.indexAtOrAfter(tc + h * HOUR_MS, config.scoring.maximumGapSeconds * 1000);
    if (k >= 0 && !out.some((o) => o.k === k)) out.push({ h, k });
  }
  return out;
}

// Observation epochs for a window: the paired file's samples within
// [tc - past, tc + future], one per samplingSeconds (the fit uses only the
// paired file). Returns [{k, ms}] ascending.
export function windowSamples(trajectory, tc, [pastHours, futureHours], samplingSeconds) {
  const from = tc - pastHours * HOUR_MS, to = tc + futureHours * HOUR_MS;
  const out = [];
  trajectory.epochs.forEach((ms, k) => {
    if (ms < from || ms > to) return;
    if (!out.length || ms - out.at(-1).ms >= samplingSeconds * 1000) out.push({ k, ms });
  });
  return out;
}

// The truth state at exactly ms, from the converted precise orbits, or null.
export function truthAt(truthIndex, norad, ms) {
  if (!truthIndex) return null;
  for (const f of truthIndex.frames(norad, ms - 1000, ms + 1000))
    for (const o of decodeOemStream(new Uint8Array(f.payload)))
      for (const l of o.EPHEMERIS_DATA_BLOCK[0].EPHEMERIS_DATA_LINES)
        if (Date.parse(/Z$/.test(l.EPOCH) ? l.EPOCH : `${l.EPOCH}Z`) === ms) return { state: STATE_KEYS.map((k) => l[k] * 1000), product: f.product ?? truthIndex.products[0]?.product };
  return null;
}

// The first truth epoch at or after ms within toleranceMs, from the truth's
// own samples, or null.
export function truthAtOrAfter(truthIndex, norad, ms, toleranceMs) {
  if (!truthIndex) return null;
  let best = null;
  for (const f of truthIndex.frames(norad, ms - 1000, ms + toleranceMs + 1000))
    for (const o of decodeOemStream(new Uint8Array(f.payload)))
      for (const l of o.EPHEMERIS_DATA_BLOCK[0].EPHEMERIS_DATA_LINES) {
        const t = Date.parse(/Z$/.test(l.EPOCH) ? l.EPOCH : `${l.EPOCH}Z`);
        if (t >= ms && t - ms <= toleranceMs && (!best || t < best.ms)) best = { ms: t, state: STATE_KEYS.map((k) => l[k] * 1000) };
      }
  return best;
}

// A later operator reference at or after ms: the newest file issued after
// tc whose span covers ms, its first sample at or after ms within toleranceMs.
export async function laterAt(history, tc, ms, toleranceMs) {
  const later = history.filter((t) => t.issueMs > tc && t.covers(ms));
  for (const t of later) {
    const k = t.indexAtOrAfter(ms, toleranceMs);
    if (k >= 0) return { ms: t.epochs[k], state: await t.state(k), file: t.file, issueMs: t.issueMs };
  }
  return null;
}

// Planet: the later state (a file captured after tc) nearest to ms within toleranceMs.
export async function laterPlanetState(history, tc, ms, toleranceMs) {
  let best = null;
  for (const t of history) {
    if (t.issueMs <= tc) continue;
    const d = Math.abs(t.epochs[0] - ms);
    if (d <= toleranceMs && (!best || d < best.d)) best = { d, t };
  }
  return best ? { ms: best.t.epochs[0], state: await best.t.state(0), file: best.t.file, issueMs: best.t.issueMs } : null;
}

// Catalog names (Intelsat, SES) as step 10 resolves them: {resolve(name or
// file token) -> catalog number | null}, from the element-set archive's names.
export function catalogNames(provider, files, archive) {
  const days = files.map((f) => f.captured.slice(0, 10)).sort();
  const named = readSets(archive, iso(Date.parse(`${days[0]}T00:00:00Z`) - config.elementSets.lookbackDays * DAY_MS).slice(0, 10), days.at(-1), null, null);
  const latest = new Map([...named].map(([n, l]) => [n, l.sort((a, b) => a.creationDate.localeCompare(b.creationDate)).at(-1).objectName]));
  const payload = (name) => !/\bDEB\b|R\/B/.test(name);
  if (provider === 'ses') {
    const key = (name) => name.replace(/\s*\(.*$/, '').toUpperCase().replace(/[\s-]+/g, '');
    return { resolve: (name) => { const hits = [...latest].filter(([, n]) => key(n) === key(name) && payload(n)).map(([n]) => n); return hits.length === 1 ? hits[0] : null; } };
  }
  const rule = config.providers.intelsat.names;
  const target = (token) => {
    if (rule.aliases[token]) return rule.aliases[token];
    const m = /^([a-z]+\d*[a-z]*?)-?([0-9a-z]+)?$/.exec(token);
    if (rule.prefixes[token]) return rule.prefixes[token];
    const [prefix, rest] = token.includes('-') ? token.split('-') : [token, ''];
    return rule.prefixes[prefix] ? `${rule.prefixes[prefix]} ${rest.toUpperCase()}`.trim() : (m ? token.toUpperCase() : token);
  };
  return { resolve: (token) => { const want = target(token); const hits = [...latest].filter(([, n]) => n.replace(/\s*\(.*$/, '').trim().toUpperCase() === want && payload(n)).map(([n]) => n); return hits.length === 1 ? hits[0] : null; } };
}

// Validation (NORAD divisible by 4) or test.
export const splitOf = (norad) => (norad % 4 === 0 ? 'validation' : 'test');

export { sha256, iso };
