// E16's truth (PLAN.md 3.2) behind one interface, E3's `Products`: entries(norad), firstAtOrAfter(norad, tMs, tolMs),
// frame(entry), dropCache(), read. Two kinds:
//
// - MultiProducts: analysis/reference-states conversions under several roots (E3's Products per root, composed).
//   `fallbackPrefixes` fill only the spans no primary product covers (GNSS: ESA's final orbit, GFZ's MGEX rapid
//   orbit where ESA has none).
// - PlanetProducts: Planet's daily orbit-determination states (CC BY-NC 4.0; local only, never committed), read by
//   E13's reader, identified by the same day's crosswalk, taken from TT to UTC by foundation/time and from J2000 to
//   GCRF by foundation/frames (the modules' conversions; E13 arcs.mjs `toUtcGcrf`), and served as one-state $OEM
//   frames in the reference-states layout (GCRF, UTC, km, km/s).
//
// Reading, selecting and framing only.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { Products } from '../e3-combined-catalog/truth.mjs';
import { readPlanetSeries } from '../e13-open-dca/planet-history.mjs';
import { packOem, unpackOem } from '../supgp-omm/lib/records.mjs';
import { OEM_TYPE, decodeOemStream } from '../../harness/records.mjs';
import { toGcrf } from '../../harness/frames.mjs';
import { convertIso } from '../../harness/time.mjs';
import { config, runsCache, sha256, utcMs } from './common.mjs';

export class MultiProducts {
  constructor(roots, prefixes, fallbackPrefixes = []) {
    this.primary = roots.filter((r) => fs.existsSync(r)).map((r) => new Products(r, prefixes));
    this.fallback = fallbackPrefixes.length ? roots.filter((r) => fs.existsSync(r)).map((r) => new Products(r, fallbackPrefixes)) : [];
    this.cache = new Map();
  }

  get read() { return Object.assign({}, ...[...this.primary, ...this.fallback].map((p, i) => Object.fromEntries(Object.entries(p.read).map(([f, h]) => [`${p.dir}/${f}`, h])))); }

  objects() { return [...new Set([...this.primary, ...this.fallback].flatMap((p) => p.objects()))].sort((a, b) => a - b); }

  entries(norad) {
    if (this.cache.has(norad)) return this.cache.get(norad);
    const wrap = (p, e) => ({ ...e, file: `${p.dir}/${e.file}`, inner: e, part: p });
    const primary = this.primary.flatMap((p) => p.entries(norad).map((e) => wrap(p, e)));
    const covered = (e) => primary.some((x) => x.start <= e.stop && e.start <= x.stop);
    const fill = this.fallback.flatMap((p) => p.entries(norad).map((e) => wrap(p, e))).filter((e) => !covered(e));
    const out = [...primary, ...fill].sort((a, b) => a.start - b.start || a.file.localeCompare(b.file));
    this.cache.set(norad, out);
    return out;
  }

  // E3's rule over the composed entries: the first state at or after tMs within the tolerance; ties to the first product by name.
  firstAtOrAfter(norad, tMs, toleranceMs) {
    let best = null;
    for (const e of this.entries(norad)) {
      if (e.stop < tMs || e.start > tMs + toleranceMs) continue;
      const { epochs, lines } = e.part.load(e.inner);
      let lo = 0, hi = epochs.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (epochs[mid] < tMs) lo = mid + 1; else hi = mid; }
      if (lo >= epochs.length || epochs[lo] > tMs + toleranceMs) continue;
      if (!best || epochs[lo] < best.ms) {
        const l = lines[lo];
        best = { ms: epochs[lo], epoch: l.EPOCH, r: [l.X, l.Y, l.Z], v: [l.X_DOT, l.Y_DOT, l.Z_DOT], entry: e };
      }
    }
    return best;
  }

  frame(entry) { return entry.part.frame(entry.inner); }

  dropCache() { for (const p of [...this.primary, ...this.fallback]) p.dropCache(); }
}

// ── Planet ──

const J2000_TT_MS = Date.UTC(2000, 0, 1, 12, 0, 0);
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);

// hwid -> {norad, name} from one day's planet_mc_YYYYMMDD.tle (name line "0 NAME ... HWID", then the two lines).
function crosswalk(dir, day) {
  const file = path.join(dir, `planet_mc_${day.replaceAll('-', '')}.tle`);
  if (!fs.existsSync(file)) return null;
  const bytes = fs.readFileSync(file);
  const lines = bytes.toString('utf8').split(/\r?\n/);
  const map = new Map();
  for (let i = 0; i + 1 < lines.length; ++i) {
    if (!lines[i].startsWith('0 ') || !lines[i + 1].startsWith('1 ')) continue;
    const words = lines[i].trim().split(/\s+/);
    const norad = Number(lines[i + 1].slice(2, 7));
    if (norad) map.set(words.at(-1).toLowerCase(), { norad, name: words.slice(1, -1).join(' ') });   // NORAD 0: no identity yet
  }
  return { file: path.basename(file), sha256: sha256(bytes), map };
}

// The family of a Planet satellite from its name (config tiers.N.LEO.planetFamilies), or 'other'.
export function planetFamily(name) {
  for (const [family, re] of Object.entries(config.tiers.N.LEO.planetFamilies)) if (new RegExp(re).test(name)) return family;
  return 'other';
}

let TEMPLATE = null;
function template() {
  if (TEMPLATE) return TEMPLATE;
  // The reference-states layout, from one converted object (its block metadata only; the states are replaced).
  const root = config.inputs.referenceRoots[0];
  const product = fs.readdirSync(root).find((n) => n.startsWith('SW_OPER_SP3ACOM'));
  const index = JSON.parse(fs.readFileSync(path.join(root, product, 'index.json'), 'utf8'));
  TEMPLATE = fs.readFileSync(path.join(root, product, index.objects[0].file));
  return TEMPLATE;
}

export class PlanetProducts {
  // readers: {time: foundation/time, frames: foundation/frames} (loaded and pinned by the caller).
  constructor({ readers, fromDay, toDay, log = () => {} }) {
    Object.assign(this, { readers, fromDay, toDay, log });
    this.dir = config.inputs.planetDir;
    this.byObject = new Map();
    this.info = new Map();   // norad -> {name, family, hwids}
    this.frames = new Map();
    this.read = {};
  }

  async init() {
    const cacheFile = path.join(runsCache, `planet-gcrf-${this.fromDay}-${this.toDay}.json.gz`);
    let states;
    if (fs.existsSync(cacheFile)) {
      ({ states, read: this.read } = JSON.parse(zlib.gunzipSync(fs.readFileSync(cacheFile))));
    } else {
      const series = readPlanetSeries({ dir: this.dir, fromDay: this.fromDay, toDay: this.toDay });
      for (const name of fs.readdirSync(this.dir).filter((n) => /^planet_\d{8}\.states$/.test(n))) {
        const day = `${name.slice(7, 11)}-${name.slice(11, 13)}-${name.slice(13, 15)}`;
        if (day >= this.fromDay && day <= this.toDay) this.read[name] = sha256(fs.readFileSync(path.join(this.dir, name)));
      }
      const walks = new Map();
      states = [];
      let n = 0;
      for (const [hwid, list] of series) {
        for (const s of list) {
          const day = dayOf(s.ttMs);
          if (!walks.has(day)) { const w = crosswalk(this.dir, day); walks.set(day, w); if (w) this.read[w.file] = w.sha256; }
          const id = walks.get(day)?.map.get(hwid);
          if (!id) continue;
          const utc = await convertIso(this.readers.time, s.epochTt.replace(/Z$/, ''), 'TT', 'UTC');
          const ms = Date.parse(`${utc.slice(0, 19)}Z`) + Number(`0.${(utc.split('.')[1] ?? '0').replace(/Z$/, '')}`) * 1000;
          const iso = new Date(ms).toISOString().replace('Z', '');
          const gcrf = await toGcrf(this.readers.frames, 'MEAN_EQUATOR_EQUINOX_J2000', iso, s.state);
          states.push({ norad: id.norad, name: id.name, hwid, ms, ttMs: s.ttMs, state: gcrf, j2000: s.state });
          if (++n % 5000 === 0) this.log(`planet: ${n} states converted`);
        }
      }
      fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
      const tmp = `${cacheFile}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, zlib.gzipSync(JSON.stringify({ states, read: this.read })));
      fs.renameSync(tmp, cacheFile);   // atomic: parallel shards may build the same cache
    }
    for (const s of states) {
      if (!this.byObject.has(s.norad)) this.byObject.set(s.norad, []);
      this.byObject.get(s.norad).push(s);
      const info = this.info.get(s.norad) ?? { name: s.name, family: planetFamily(s.name), hwids: new Set() };
      info.hwids.add(s.hwid);
      this.info.set(s.norad, info);
    }
    for (const list of this.byObject.values()) {
      list.sort((a, b) => a.ms - b.ms);
      // The same state can appear in two files: keep distinct epochs.
      for (let i = list.length - 1; i > 0; --i) if (list[i].ms === list[i - 1].ms) list.splice(i, 1);
    }
    return this;
  }

  objects() { return [...this.byObject.keys()].sort((a, b) => a - b); }

  entries(norad) {
    return (this.byObject.get(norad) ?? []).map((s) => ({ file: `planet:${norad}:${s.ms}`, start: s.ms, stop: s.ms, product: 'planet', state: s }));
  }

  stateOf(entry) {
    const s = entry.state;
    return { ms: s.ms, epoch: `${new Date(s.ms).toISOString().replace('Z', '')}000Z`, r: s.state.slice(0, 3).map((x) => x / 1000), v: s.state.slice(3).map((x) => x / 1000), entry };
  }

  firstAtOrAfter(norad, tMs, toleranceMs) {
    const e = this.entries(norad).find((x) => x.start >= tMs && x.start <= tMs + toleranceMs);
    return e ? this.stateOf(e) : null;
  }

  // The state nearest to tMs inside [loMs, hiMs) (the day bins of PLAN.md section 4).
  nearestIn(norad, tMs, loMs, hiMs) {
    let best = null;
    for (const e of this.entries(norad)) if (e.start >= loMs && e.start < hiMs && (!best || Math.abs(e.start - tMs) < Math.abs(best.start - tMs))) best = e;
    return best ? this.stateOf(best) : null;
  }

  frame(entry) {
    if (!this.frames.has(entry.file)) {
      const oem = unpackOem(template());
      const block = oem.EPHEMERIS_DATA_BLOCK[0];
      const s = this.stateOf(entry);
      block.COMMENT = `Planet Labs daily orbit-determination state of ${this.info.get(Number(entry.file.split(':')[1]))?.name ?? 'a Planet satellite'} (hardware id ${entry.state.hwid}); TT to UTC by foundation/time, J2000 to GCRF by foundation/frames (CC BY-NC 4.0; local only).`;
      block.OBJECT.NORAD_CAT_ID = Number(entry.file.split(':')[1]);
      block.OBJECT.OBJECT_NAME = this.info.get(block.OBJECT.NORAD_CAT_ID)?.name ?? null;
      block.OBJECT.OBJECT_ID = null;
      block.START_TIME = s.epoch;
      block.STOP_TIME = s.epoch;
      const line = block.EPHEMERIS_DATA_LINES[0];
      Object.assign(line, { EPOCH: s.epoch, X: s.r[0], Y: s.r[1], Z: s.r[2], X_DOT: s.v[0], Y_DOT: s.v[1], Z_DOT: s.v[2] });
      block.EPHEMERIS_DATA_LINES = [line];
      block.COVARIANCE_MATRIX_LINES = [];
      oem.EPHEMERIS_DATA_BLOCK = [block];
      this.frames.set(entry.file, packOem(oem));
    }
    return { portId: 'reference', typeRef: OEM_TYPE, payload: this.frames.get(entry.file) };
  }

  dropCache() { this.frames.clear(); }
}

// One-state $OEM frames for scoring: a target's truth state alone, in its product's own block header (the product's
// frame, time system and object), so that `accumulate` reads a few hundred bytes instead of the product's whole span.
// With a +-1 s age bin around the target the module meets the same single state either way (checked in acceptance).
const headers = new Map();
function headerOf(entry) {
  if (!headers.has(entry.file)) {
    if (headers.size > 64) headers.clear();
    headers.set(entry.file, decodeOemStream(new Uint8Array(entry.part.load(entry.inner).bytes))[0]);
  }
  return headers.get(entry.file);
}
export function oneStateFrame(truth, state) {
  if (state.entry.product === 'planet') return truth.frame(state.entry);
  const { lines, epochs } = state.entry.part.load(state.entry.inner);
  let i = 0, j = epochs.length;
  while (i < j) { const m = (i + j) >> 1; if (epochs[m] < state.ms) i = m + 1; else j = m; }
  if (epochs[i] !== state.ms) throw new Error(`no state at ${new Date(state.ms).toISOString()} in ${state.entry.file}`);
  const oem = headerOf(state.entry);
  const block = oem.EPHEMERIS_DATA_BLOCK[0];
  const saved = { blocks: oem.EPHEMERIS_DATA_BLOCK, lines: block.EPHEMERIS_DATA_LINES, cov: block.COVARIANCE_MATRIX_LINES, start: block.START_TIME, stop: block.STOP_TIME };
  try {
    oem.EPHEMERIS_DATA_BLOCK = [block];
    block.EPHEMERIS_DATA_LINES = [lines[i]];
    block.COVARIANCE_MATRIX_LINES = [];
    block.START_TIME = lines[i].EPOCH; block.STOP_TIME = lines[i].EPOCH;
    return { portId: 'reference', typeRef: OEM_TYPE, payload: packOem(oem) };
  } finally {
    oem.EPHEMERIS_DATA_BLOCK = saved.blocks; block.EPHEMERIS_DATA_LINES = saved.lines; block.COVARIANCE_MATRIX_LINES = saved.cov; block.START_TIME = saved.start; block.STOP_TIME = saved.stop;
  }
}
// The truth state of a stored target: the state at `ms` in the entry `file` (the one step 20 scored), or null.
export function stateAt(truth, norad, file, ms) {
  const e = truth.entries(norad).find((x) => x.file === file);
  if (!e) return null;
  if (e.product === 'planet') return truth.stateOf(e);
  const { lines, epochs } = e.part.load(e.inner);
  let i = 0, j = epochs.length;
  while (i < j) { const m = (i + j) >> 1; if (epochs[m] < ms) i = m + 1; else j = m; }
  if (epochs[i] !== ms) return null;
  const l = lines[i];
  return { ms, epoch: l.EPOCH, r: [l.X, l.Y, l.Z], v: [l.X_DOT, l.Y_DOT, l.Z_DOT], entry: e };
}

// The truth of a list of targets as E7's sgp4Errors reads it (entries(norad) and frame(entry)), each target its own
// one-state frame. targets: [{ms, state (a truth state), missing}] -> {source, targets (with file keys)}.
export function oneStateSource(truth, targets) {
  const frames = new Map();
  const keyed = targets.map((t) => {
    if (t.missing) return t;
    const file = `${t.state.entry.file}#${t.ms}`;
    if (!frames.has(file)) frames.set(file, oneStateFrame(truth, t.state));
    return { ...t, file };
  });
  return { targets: keyed, source: { entries: () => [...frames.keys()].map((file) => ({ file })), frame: (e) => frames.get(e.file) } };
}

// When a truth state became usable by the fleet nowcast (config.release): Planet 6 h after the state; a converted
// product its latency in days after the end of its span, by the product name's prefix.
export function releaseMs(state) {
  const r = config.release;
  if (state.entry.product === 'planet') return state.ms + r.planetHours * 3600e3;
  const product = state.entry.inner?.product ?? state.entry.product ?? '';
  const key = Object.keys(r.productDaysAfterEnd).find((k) => product.startsWith(k) || (k === 'S1' && /^S1[A-D]_OPER/.test(product)) || (k === 'nsgf' && product.startsWith('nsgf.')) || (k === 'ilrsa' && product.startsWith('ilrsa.')));
  if (!key) throw new Error(`no release latency for product ${product}`);
  return state.entry.stop + r.productDaysAfterEnd[key] * 86400e3;
}

// The truth source of a regime class over [fromDay, toDay] (`readers` for Planet).
export async function truthFor(regimeClass, { readers, fromDay, toDay, log } = {}) {
  const r = config.regimes[regimeClass];
  if (r.truth === 'planet') return new PlanetProducts({ readers, fromDay, toDay, log }).init();
  return new MultiProducts(config.inputs.referenceRoots, r.prefixes, r.fallbackPrefixes ?? []);
}

export { utcMs };
