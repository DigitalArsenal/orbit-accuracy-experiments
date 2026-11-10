// #316 diagnosis helpers (exploratory, not registered). The published cells' truth, windows, grid, coverage rule, FFM settings and
// as-issued weather (experiments/operator-theory/all-regimes.mjs, ap-truth.mjs, ap-all-regimes-suite/run.mjs), with AP at 0.6.5
// (modules 3a3661ea, wasm f0b8352a). Module calls only; nothing here computes an orbit.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const OT = path.join(REPO, 'experiments/operator-theory');
// The environment is the headline loop's (../lib/env.mjs): this checkout's packages must equal its lockfile (refused otherwise, naming
// `npm ci`), and XM's installed-host guard is answered by the one documented adapter there, the installed versions recorded (HOSTS).
const ENV = await import('../lib/env.mjs');
ENV.usePackages();
export const INSTALLED = ENV.HOSTS.installed;
const xp2 = await import(path.join(OT, 'lib/xp2.mjs'));
export const { config, root, HOUR, DAY, iso, ms, rms, XM } = xp2;
XM.config.spaceWeather.rsgaDirs = [...XM.config.spaceWeather.rsgaDirs, '/opt/data/sdn-archive/hac/noaa-swpc/warehouse/2026/RSGA', '/opt/data/sdn-archive/hac/noaa-swpc/2026'];
const { driverRows } = await import(path.join(OT, 'lib/xm3.mjs'));
const APL = await import(path.join(OT, 'lib/ap.mjs'));
export const { apForces, fitWeather, horizonOf, readOcm, standalone } = APL;
const { openFfmHost, openAxes, apriori } = await import(path.join(OT, 'lib/host.mjs'));
const R = await import(path.join(OT, 'lib/regimes.mjs'));
export const S = await import(path.join(root, config.xm.dir, 'lib/sds.mjs'));
export const T = await import(path.join(root, config.xm.dir, 'lib/truth.mjs'));
export const W = await import(path.join(root, config.xm.dir, 'lib/weather.mjs'));
const SRC = await import(pathToFileURL(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/sources.mjs')).href);
const { openModules } = await import(path.join(root, config.xm.dir, 'lib/modules.mjs'));

export const AP065 = { modulesCommit: '3a3661eaf9caa84fc776a9959494e1ca14358db1', wasmSha256: 'f0b8352a43f305fbdd1ad15c9894e2d28f3179528838cae8f967bf1ea5d089b7' };
export const GRID = 300000;
export const MIN_COV = XM.config.fit.minimumCoverage;
export const MIN_BIN_300 = XM.config.scoring.binMinimumEpochs;

// The published FFM settings (all-regimes.mjs ffmLow / ffmHigh; AP5's are the same).
export const ffmLow = () => ({
  forces: { gravity: 'SPHERICAL_HARMONICS', degree: 40, order: 40, thirdBodies: [10, 301], srp: true, drag: true, atmosphere: 'NRLMSISE00', solidTides: true, relativity: undefined },
  integrator: { tolerance: 1e-8, maxStep: 120, minStep: 1e-3 }, sigmaM: 10, sigmaEditThreshold: 0, maximumIterations: 40, correctionTolerance: 0.01,
  parameters: [{ kind: 'DRAG_AREA_OVER_MASS', value: 0.01 }], fixed: { agom: 0.02 }, apriori: apriori([0.1]),
});
export const ffmHigh = () => ({
  forces: { gravity: 'SPHERICAL_HARMONICS', degree: 20, order: 20, thirdBodies: [10, 301], srp: true, drag: false, solidTides: false, relativity: undefined },
  integrator: { tolerance: 1e-8, maxStep: 300, minStep: 1e-3 }, sigmaM: 10, sigmaEditThreshold: 0, maximumIterations: 40, correctionTolerance: 0.01,
  parameters: [{ kind: 'SRP_AREA_OVER_MASS', value: 0.02 }], fixed: {}, apriori: apriori([0.2]),
});

/** A fit $PCF with any FIT field (pcfBytes sets only the priors): fit { dragPrior, srpPrior, ...PCFFitPolicyT fields }. */
export function pcf({ forces = {}, fit = null } = {}) {
  const P = S.PCF, f0 = { ATMOSPHERE_MODEL: 'JACCHIA70', ...forces };
  const stock = f0.ATMOSPHERE_MODEL !== 'NRLMSISE00' && !f0.MAXIMUM_TESSERAL_DEGREE && !f0.MAXIMUM_DEGREE;
  const bytes = S.pcfBytes({ theory: stock ? 'SGP4XP' : 'AP', forces: f0, fit: fit ? { dragPrior: fit.dragPrior, srpPrior: fit.srpPrior } : null });
  const extra = fit ? Object.fromEntries(Object.entries(fit).filter(([k]) => !['dragPrior', 'srpPrior'].includes(k))) : {};
  if (!Object.keys(extra).length) return bytes;
  const t = P.PCF.getRootAsPCF(new S.flatbuffers.ByteBuffer(bytes)).unpack();
  t.FIT ??= new P.PCFFitPolicyT();
  Object.assign(t.FIT, extra);
  // keep FORCES' explicit scalars (pcfBytes forces defaults on the wire): re-pack FORCES the same way
  const fpack = t.FORCES.pack.bind(t.FORCES);
  t.FORCES.pack = (b) => { const offset = b.addFieldOffset; b.addFieldOffset = function (slot, value, d) { if (value !== d) offset.call(this, slot, value, d); }; b.forceDefaults(true); try { return fpack(b); } finally { b.forceDefaults(false); b.addFieldOffset = offset; } };
  const b = new S.flatbuffers.Builder(512);
  P.PCF.finishPCFBuffer(b, t.pack(b));
  return b.asUint8Array().slice();
}

/** sdn-ap 0.6.5 with its instance exports (the fit-design diagnostics). */
export async function openAp065() {
  const h = await standalone('propagator/sdn-ap', AP065);
  const ex = () => h.instance?.exports ?? h.exports ?? null;
  return {
    h, ex,
    async fit(oem, pcfBytes, spw) {
      const inputs = [{ portId: 'ephemeris', typeRef: S.TYPE('OEM'), payload: oem }, { portId: 'configuration', typeRef: S.TYPE('PCF'), payload: pcfBytes },
        ...(spw ? [{ portId: 'space_weather', typeRef: S.TYPE('SPW'), payload: spw }] : [])];
      let r;
      try { r = await h.invoke({ methodId: 'fit', inputs }); } catch (e) { return { ok: false, error: String(e?.message ?? e).slice(0, 200) }; }
      if (r.statusCode !== 0) return { ok: false, error: `${r.errorCode}: ${String(r.errorMessage).slice(0, 200)}` };
      return { ok: true, ocm: new Uint8Array(r.outputs.find((o) => o.portId === 'elements').payload) };
    },
    async propagate(ocm, epochs) {
      const r = await h.invoke({ methodId: 'propagate', inputs: [{ portId: 'ocm', typeRef: S.TYPE('OCM'), payload: ocm }, { portId: 'configuration', typeRef: S.TYPE('PCF'), payload: S.flightPcfBytes(epochs) }] });
      if (r.statusCode !== 0) throw new Error(`propagate: ${r.errorCode}: ${String(r.errorMessage).slice(0, 200)}`);
      const lines = S.oemLines(new Uint8Array(r.outputs.find((o) => o.portId === 'ephemeris').payload));
      if (lines.length !== epochs.length) throw new Error(`propagate returned ${lines.length} of ${epochs.length}`);
      return lines;
    },
    close: async () => h.destroy?.(),
  };
}

export async function openAll({ ffm = true } = {}) {
  const A = await openAp065();
  const m = await openModules();
  const F = ffm ? await openFfmHost() : null;
  const axes = await openAxes();
  return { A, m, F, axes, close: async () => { await axes.close(); await F?.close(); await m.close(); await A.close(); } };
}

async function spkOnGrid(lines, axes) {
  const norm = lines.map((l) => ({ ...l, epoch: new Date(Date.parse(/Z$/.test(l.epoch) ? l.epoch : `${l.epoch}Z`)).toISOString() }));
  const first = Math.round(ms(norm[0].epoch) / 1000) * 1000;
  const thin = norm.filter((l) => (Math.round(ms(l.epoch) / 1000) * 1000 - first) % GRID === 0).map((l) => ({ ...l, epoch: new Date(Math.round(ms(l.epoch) / 1000) * 1000).toISOString() }));
  return axes.convert(thin, 'EME2000', 'GCRF');
}

const every = (from, to, days) => { const out = []; for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += days * DAY) out.push(t); return out; };
const FORBIDDEN = (t) => (t >= Date.parse('2026-03-01T00:00:00Z') && t < Date.parse('2026-06-01T00:00:00Z')) || t > Date.parse('2026-11-10T00:00:00Z');

/** The objects of a group with a getter for their truth series: { group, name, norad, objectId, vacuum, cutoffs, series(fromMs, toMs) }.
 *  set 'pub': the published cells' cutoffs; set 'b': a second set of windows from the same regime (cutoffs between the published ones). */
export async function objectsOf(group, { names = null, set = 'pub', axes } = {}) {
  const out = [];
  const keep = (n) => !names || names.includes(n);
  if (group === 'HX') {
    const { spkObjectSeries } = await import(pathToFileURL(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/spk-sources.mjs')).href);
    for (const h of R.HX) {
      if (!keep(h.name)) continue;
      const cutoffs = set === 'pub' ? h.cutoffs : h.name === 'CHANDRA' ? every('2018-03-11', '2018-04-22', 7) : every('2013-02-12', '2013-02-16', 2);
      let lines = null;
      out.push({ group, name: h.name, norad: h.norad, objectId: h.objectId, vacuum: true, cutoffs, async series(a, b) {
        lines ??= await spkOnGrid((await spkObjectSeries(process.env.SDN_MODULES_ROOT, { files: [h.file], source: 'ap6-heo', id: h.id, name: h.name, norad: h.norad, fromUtc: h.from, toUtc: h.to, stride: 1 })).lines, axes);
        return lines.filter((l) => { const t = ms(l.epoch); return t >= a && t <= b; });
      } });
    }
  } else if (group === 'HE') {
    const { spkObjectSeries } = await import(pathToFileURL(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/spk-sources.mjs')).href);
    const T0 = R.TESS;
    let lines = null;
    const cutoffs = set === 'pub' ? T0.cutoffs : T0.cutoffs.slice(0, -1).map((t) => t + 3 * DAY);
    out.push({ group, name: T0.name, norad: T0.norad, objectId: T0.objectId, vacuum: true, cutoffs, async series(a, b) {
      if (!lines) {
        const files = fs.readdirSync(T0.dir).filter((f) => /^TESS_EPH_DEF_.*\.bsp$/.test(f)).sort().map((f) => path.join(T0.dir, f));
        lines = await spkOnGrid((await spkObjectSeries(process.env.SDN_MODULES_ROOT, { files, source: 'ap6-heo', id: 'TESS (-95)', name: T0.name, norad: T0.norad, fromUtc: T0.from, toUtc: T0.to, stride: 1 })).lines, axes);
      }
      return lines.filter((l) => { const t = ms(l.epoch); return t >= a && t <= b; });
    } });
  } else if (group === 'IG' || group === 'GE') {
    for (const s of SRC.mgex({ klass: group === 'IG' ? 'igso' : 'geo' })) {
      if (!keep(s.name)) continue;
      const cutoffs = set === 'pub' ? R.MGEX_CUTOFFS : R.MGEX_CUTOFFS.slice(0, -1).map((t) => t + DAY);
      out.push({ group, name: s.name, norad: s.norad, objectId: s.objectId ?? '', vacuum: false, cutoffs, async series(a, b) { return s.lines.filter((l) => { const t = ms(l.epoch); return t >= a && t <= b; }); } });
    }
  } else if (group === 'DO' || group === 'LS' || group === 'GD') {
    for (const o of R.STATIC.filter((x) => x.group === group)) {
      if (!keep(o.name)) continue;
      const cutoffs = set === 'pub' ? o.cutoffs : o.cutoffs.slice(0, -1).map((t) => t + 2 * DAY);
      let s = null;
      const load = () => (s ??= SRC.chain(o.files()));
      out.push({ group, get name() { return o.name; }, norad: null, objectId: '', vacuum: false, cutoffs, files: o.files, async series(a, b) { const x = load(); this.norad = x.norad; this.objectId = x.objectId ?? ''; return x.lines.filter((l) => { const t = ms(l.epoch); return t >= a && t <= b; }); } });
    }
  } else if (['GN', 'S1', 'P'].includes(group)) {
    for (const o of XM.config.groups[group].objects) {
      if (!keep(o.name)) continue;
      // the comparison's own development windows (2026-01-01 on) before the reserved 2026-03-01: cutoffs whose 7-day forecast ends before it
      const all = every('2026-01-01', '2026-02-21', 1);
      const cutoffs = set === 'pub' ? all.filter((_, i) => i % 4 === 0) : all.filter((_, i) => i % 4 === 2);
      // ap-truth.mjs flew every XM group under NRLMSISE-00 on the as-issued rows (GN included; drag rates are skipped above 2,550 km)
      out.push({ group, name: o.name, norad: o.norad, objectId: o.objectId ?? '', vacuum: false, cutoffs, async series(a, b) { return T.series(o, a, b).lines; } });
    }
  } else throw new Error(`group ${group}`);
  for (const o of out) o.cutoffs = o.cutoffs.filter((t) => !FORBIDDEN(t) && !FORBIDDEN(t + 7 * DAY));
  return out;
}

export const windowKey = (group, name, t) => `${group}|${name}|${iso(t).slice(0, 10)}`;
export const inShard = (key, k, n) => parseInt(crypto.createHash('sha256').update(key).digest('hex').slice(0, 8), 16) % n === k;

/** Lead-day bins of the truth after D0 on the 300 s grid (all-regimes.mjs): { entered, sizes, epochs, truth }. */
export function scoredOf(after, D0, leads = [1, 2, 3, 5, 7]) {
  const stepMs = after.length > 1 ? ms(after[1].epoch) - ms(after[0].epoch) : GRID;
  const gridMs = Math.max(GRID, Math.ceil(GRID / stepMs) * stepMs);
  const minBin = Math.ceil((MIN_BIN_300 / (DAY / GRID)) * (DAY / gridMs));
  const first = after.length ? ms(after[0].epoch) : 0;
  const grid = after.filter((l) => (ms(l.epoch) - first) % gridMs === 0);
  const bins = Object.fromEntries(leads.map((k) => [k, grid.filter((l) => { const t = ms(l.epoch); return t > D0 + (k - 1) * DAY && t <= D0 + k * DAY; })]));
  const entered = leads.filter((k) => bins[k].length >= minBin);
  const scored = entered.flatMap((k) => bins[k]);
  return { entered, sizes: entered.map((k) => bins[k].length), epochs: scored.map((l) => l.epoch), truth: scored.map((l) => ({ r: l.r, v: l.v })), gridMs };
}

/** The arc's states thinned to 300 s (G1), or null under the coverage rule. */
export function arcOf(lines, hours) {
  const coverage = lines.length > 1 ? lines.length / ((hours * 3600) / ((ms(lines[1].epoch) - ms(lines[0].epoch)) / 1000)) : 0;
  return coverage >= MIN_COV ? T.thinned(lines).chosen : null;
}

const mean = (v) => v.reduce((s, x) => s + x, 0) / v.length;
/** Per lead day: 3D RMS e and the R, T, N RMS and means (km). */
export function byDay(err, entered, sizes) {
  const days = {};
  let i = 0;
  entered.forEach((k, j) => {
    const s = err.slice(i, i + sizes[j]);
    i += sizes[j];
    const ric = [0, 1, 2].map((c) => rms(s.map((q) => q[c])));
    days[k] = { e: Math.hypot(...ric), r: ric[0], t: ric[1], n: ric[2], mr: mean(s.map((q) => q[0])), mt: mean(s.map((q) => q[1])), mn: mean(s.map((q) => q[2])),
      mx: Math.max(...s.map((q) => Math.hypot(q[0], q[1], q[2]))), mxr: Math.max(...s.map((q) => Math.abs(q[0]))), mxt: Math.max(...s.map((q) => Math.abs(q[1]))), mxn: Math.max(...s.map((q) => Math.abs(q[2]))) };
  });
  return days;
}
/** One summary over a whole series: 3D RMS and per-axis RMS and means. */
export function overall(err) {
  const ric = [0, 1, 2].map((c) => rms(err.map((q) => q[c])));
  return { e: Math.hypot(...ric), r: ric[0], t: ric[1], n: ric[2], mt: mean(err.map((q) => q[1])) };
}

/** As-issued weather at the cutoff: { spw (AP fit rows to `throughMs`), ffm (FFM driver rows to D0 + 8 d) } or a thrown exclusion. */
export function weatherAt(D0, throughMs = D0) {
  const Rw = W.rowsO(D0 - 72 * HOUR - XM.config.conditions.rowsMarginDays * DAY, D0);
  if (Rw.excluded) throw new Error(Rw.excluded);
  return { spw: fitWeather(Rw.rows, horizonOf(throughMs)), ffm: driverRows(Rw.rows, D0).rows.map((r) => ({ DATE: r.date, F107_OBS: r.f107, F107_OBS_CENTER81: r.c81, AP_AVG: r.ap })) };
}

export const oemOf = (o, lines, start, stop) => S.oemBytes({ frame: 'GCRF', object: { name: o.name, id: o.objectId ?? '', norad: o.norad ?? 0 }, lines, useableStart: start ?? lines[0].epoch, useableStop: stop ?? lines.at(-1).epoch });
export const gridEpochs = (fromMs, toMs, stepMs = GRID) => { const out = []; for (let t = fromMs; t <= toMs; t += stepMs) out.push(new Date(t).toISOString()); return out; };
