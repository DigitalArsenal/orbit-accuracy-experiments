// The windows and truth of PLAN.md (Windows and truth), rebuilt by the source experiments' own code:
//   L1  B2 part 2: E6's variant R products of the test window (copied into the store with their SHA-256), the NSGF orbit
//       chained as truth, the fit input carried back from R's state by propagator/ffm (B2's track);
//   L2  B1 leo-slr and leo-slr-current, N  B1 meo-gnss and meo-gnss-rapid: B1's windows, G1's truth readers, B1's block;
//   I   B2 part 1b: every NASA ISS trajectory file, planned burns excluded, the newer files' first 24 h as truth.
// Each window answers its fit input, its held-out truth (G1's thinning) and its day rule. Every truth reader passes its
// states through harness/truth-gate.mjs (G1's readers and parseIssOem do). Selection and record moving only.
import fs from 'node:fs';
import path from 'node:path';
import { config, store, root, g1Dir, b1Dir, modulesRoot, sha256, iso, ms, DAY, HOUR, write, readJsonl } from '../common.mjs';

const modules = modulesRoot();
const G = (name) => import(path.join(g1Dir, name));
const [FFM, SRC, W, ISSO, ISSW, CONT, TIME] = await Promise.all(['lib/ffm.mjs', 'lib/sources.mjs', 'lib/windows.mjs', 'lib/iss-oem.mjs', 'lib/iss-windows.mjs', 'lib/containers.mjs', 'lib/timeconv.mjs'].map(G));
const THIN_S = config.scoring.thinSeconds, LEAD = config.scoring.leadDays, COVER = config.scoring.minimumCoverage;

/** G1's thinning: one state per THIN_S seconds by the first spacing of the list (lib/baselines.mjs). */
export function thinned(list) {
  const step = list.length > 1 ? (ms(list[1].epoch) - ms(list[0].epoch)) / 1000 : 60;
  const every = Math.max(1, Math.round(THIN_S / step));
  return { chosen: list.filter((_, i) => i % every === 0), every, step };
}
const dayRule = (E) => (t) => { const k = LEAD.find((d) => t > E + (d - 1) * DAY && t <= E + d * DAY); return k ? String(k) : null; };

// ---- L1 -------------------------------------------------------------------------------------------------------------
let ffmContext = null;
async function ffm() {
  if (ffmContext) return ffmContext;
  const g1Context = await FFM.loadEnvironment(modules, { archive: '/opt/data/sdn-archive', store: '/opt/data/sdn-archive/sdn-gp-starlink-ffm-match' });
  const { ffmEnvironment } = await import(path.join(b1Dir, 'lib/environment.mjs'));
  const env = await ffmEnvironment(modules, g1Context);
  const P = g1Context.catalog.prw;
  // E6's force model (B2 part 2): 70 x 70, the Sun and the Moon, radiation pressure, drag, solid tides, relativity
  const forces = { THIRD_BODY_IDS: [10, 301], OCEAN_TIDES: P.pcfOceanTideModel.NONE, EARTH_RADIATION: P.pcfEarthRadiationModel.NONE };
  ffmContext = { g1Context, env, forces };
  return ffmContext;
}

/** E6's R products of the test window, copied once into <store>/inputs (B2 read them from its own runs/). */
function e6Products() {
  const L = config.groups.L1;
  const file = path.join(store, 'inputs/e6-products.jsonl');
  if (!fs.existsSync(file)) {
    const rows = fs.readdirSync(L.e6Products).filter((d) => d.startsWith(L.e6ProductsPattern)).flatMap((d) => readJsonl(path.join(L.e6Products, d, 'products.jsonl')));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(`${file}.tmp`, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
    fs.renameSync(`${file}.tmp`, file);
  }
  return readJsonl(file).filter((p) => p.variant === L.e6Variant && Date.parse(p.cutoff) >= Date.parse(L.window[0]) && Date.parse(p.cutoff) < Date.parse(L.window[1]))
    .sort((x, y) => x.norad - y.norad || Date.parse(x.cutoff) - Date.parse(y.cutoff));
}

const nsgf = new Map();
function nsgfTruth(target) {
  if (nsgf.has(target)) return nsgf.get(target);
  const dirs = fs.readdirSync(SRC.referenceRootDir).filter((d) => d.startsWith(`nsgf.orb.${target}.26`)).sort();
  const files = dirs.map((d) => path.join(SRC.referenceDir(d), fs.readdirSync(SRC.referenceDir(d)).find((f) => f.endsWith('.oem')))).filter(Boolean);
  const series = SRC.chain(files);
  const object = W.withT({ source: `nsgf-${target}`, id: target, norad: series.norad, name: series.name || target, frame: 'GCRF', timeSystem: 'UTC', lines: series.lines });
  nsgf.set(target, object);
  return object;
}

function l1Windows() {
  const e6 = JSON.parse(fs.readFileSync(path.join(root, 'experiments/e6-public-observations/config.json'), 'utf8')).slr.targets;
  const targetOf = (norad) => config.groups.L1.targets.find((t) => e6[t].norad === norad);
  return e6Products().map((p) => {
    const T = Date.parse(p.cutoff), target = targetOf(p.norad);
    const truth = nsgfTruth(target);
    const held = W.slice(truth, T + 1, T + Math.max(...LEAD) * DAY);
    const { chosen, every, step } = thinned(held);
    const minPerDay = Math.floor((COVER * 86400) / step);
    return {
      group: 'L1', key: `L1|${p.norad}|${p.cutoff}`, source: 'B2 part 2', id: target, norad: p.norad, cluster: String(p.norad), E: T,
      axes: 'GCRF', object: { frame: 'GCRF', name: target, norad: p.norad }, truth: chosen, dayOf: dayRule(T), keep: (n) => n * every >= minPerDay,
      fitSpacingSeconds: config.groups.L1.trackStepSeconds, truthSpacingSeconds: step * every,
      sphere: p.norad,
      /** The fit input over the `hours` before T: FFM carried back from R's state (km, km/s, GCRF), at 60 s. */
      async input(hours = config.groups.L1.trackHours) {
        const { g1Context, env, forces } = await ffm();
        const step = config.groups.L1.trackStepSeconds;
        const epochs = Array.from({ length: (hours * 3600) / step + 1 }, (_, j) => T - hours * HOUR + j * step * 1000);
        const ctx = { ...g1Context, inputs: env.inputsFor(T - hours * HOUR - DAY, T + 4 * DAY) };
        // propagator/ffm takes at most 10,000 sample epochs a request: longer tracks are carried from R's state in parts
        const out = [];
        for (let at = 0; at < epochs.length; at += 5000) {
          const back = await FFM.propagate(modules, ctx, { epoch: iso(T), state: p.state, cdAm: p.parameters?.[0]?.value, crAm: p.fixed?.agom, epochs: epochs.slice(at, at + 5000), forces });
          out.push(...back.samples.map((s) => ({ epoch: iso(s.ms), r: s.state.slice(0, 3).map((x) => x / 1000), v: s.state.slice(3, 6).map((x) => x / 1000) })));
        }
        return out;
      },
    };
  });
}

// ---- L2 and N -------------------------------------------------------------------------------------------------------
let b1 = null;
async function b1Context() {
  if (b1) return b1;
  const { collectWindows, countCheck } = await import(path.join(b1Dir, 'lib/windows.mjs'));
  const { truthLoader } = await import(path.join(b1Dir, 'lib/truth.mjs'));
  const containers = await CONT.openContainers(modules), time = await TIME.openTime(modules);
  b1 = { all: collectWindows(), loader: truthLoader({ modules, containers, time }), close: async () => { await containers.destroy?.(); await time.destroy?.(); } };
  return b1;
}

/** B1's earthWindow (lib/arms.mjs): the window's truth lines, from its start to three days after the fit end. */
function earthWindow(object, w) {
  const startMs = ms(w.startUtc), stopFit = startMs + w.fitSeconds * 1000;
  const lines = W.slice(object, startMs, stopFit + Math.max(...LEAD) * DAY);
  const gaps = lines.slice(1, 60).map((l, i) => ms(l.epoch) - ms(lines[i].epoch)).sort((a, c) => a - c);
  const stepSeconds = gaps[Math.floor(gaps.length / 2)] / 1000;
  return { startMs, stopFit, lines, stepSeconds, minStatesPerDay: Math.floor((COVER * 86400) / stepSeconds) };
}

async function b1Windows(group) {
  const { all, loader } = await b1Context();
  const regimes = config.groups[group].regimes;
  const list = all.filter((w) => regimes[w.regime] !== undefined);
  for (const [regime, n] of Object.entries(regimes)) { const got = list.filter((w) => w.regime === regime).length; if (got !== n) throw new Error(`${group} ${regime}: ${got} windows, ${n} registered`); }
  return list.map((w) => ({
    group, key: `${group}|${w.key}`, source: `B1 ${w.regime}`, regime: w.regime, id: w.id, norad: w.norad, cluster: String(w.norad || w.id), E: ms(w.startUtc) + w.fitSeconds * 1000,
    async load() {
      const t = await loader.get(w);
      const win = earthWindow(t.object, w);
      const held = win.lines.filter((l) => ms(l.epoch) > win.stopFit);
      const { chosen, every } = thinned(held);
      Object.assign(this, {
        axes: t.object.frame === 'EME2000' ? 'EME2000' : 'GCRF', object: { frame: t.object.frame, name: t.object.name, norad: t.object.norad, id: t.object.objectId ?? '' },
        truth: chosen, dayOf: dayRule(win.stopFit), keep: (n) => n * every >= win.minStatesPerDay, fitSpacingSeconds: win.stepSeconds, truthSpacingSeconds: win.stepSeconds * every,
        block: { lines: win.lines, useableStart: win.lines[0].epoch, useableStop: iso(win.stopFit) }, fitLines: win.lines.filter((l) => ms(l.epoch) <= win.stopFit),
      });
      return this;
    },
  }));
}

// ---- I --------------------------------------------------------------------------------------------------------------
let headers = null;
function issHeaders() {
  if (headers) return headers;
  const file = path.join(store, 'inputs/iss-headers.json');
  if (fs.existsSync(file)) headers = JSON.parse(fs.readFileSync(file, 'utf8'));
  else { headers = ISSW.archiveHeaders(); write(file, headers); }
  return headers;
}
const issCache = new Map();
function issStates(i) {
  if (!issCache.has(i)) { if (issCache.size > 24) issCache.delete(issCache.keys().next().value); issCache.set(i, ISSO.parseIssOem(fs.readFileSync(issHeaders()[i].file, 'utf8')).states); }
  return issCache.get(i);
}

function iWindows() {
  const I = config.groups.I;
  const hs = issHeaders();
  const burns = ISSW.burnClusters(hs).flatMap((c) => c.members.map((m) => m.tigMs));
  const starts = hs.map((h) => h.header.startMs);
  const lineOf = (s) => ({ epoch: iso(s.ms), r: s.r, v: s.v });
  const out = [];
  for (let i = 0; i < hs.length; i += 1) {
    const start = starts[i], E = start + I.trackHours * HOUR;
    if (!Number.isFinite(start)) continue;
    if (burns.find((t) => t >= start && t <= E + 72 * HOUR)) continue;
    const newer = starts.map((s, j) => ({ s, j })).filter(({ s }) => s > E && s <= E + 72 * HOUR).sort((x, y) => x.s - y.s);
    if (!newer.length) continue;
    out.push({
      group: 'I', key: `I|${hs[i].date}`, source: 'B2 part 1b', id: hs[i].date, norad: 25544, cluster: new Date(E).toISOString().slice(0, 7), E, file: hs[i].date,
      async load() {
        const truthBy = new Map();
        for (const { s, j } of newer) for (const st of issStates(j)) if (st.ms >= s && st.ms <= s + I.truthHours * HOUR && st.ms <= E + 72 * HOUR) truthBy.set(st.ms, lineOf(st));
        const truth = [...truthBy.entries()].sort((a, b) => a[0] - b[0]).map(([, l]) => l);
        const track = issStates(i).filter((s) => s.ms >= start && s.ms <= E).map(lineOf);
        const binOf = (t) => { const h = (t - E) / HOUR; const b = I.binsHours.findIndex(([lo, hi]) => h > lo && h <= hi); return b < 0 ? null : String(b + 1); };
        Object.assign(this, {
          axes: 'EME2000', object: { frame: 'EME2000', name: 'ISS', norad: 25544, originator: 'NASA JSC FOD (ISS trajectory archive)' }, truth, dayOf: binOf, keep: () => true,
          fitSpacingSeconds: 240, truthSpacingSeconds: 240, block: { lines: track, useableStart: track[0]?.epoch, useableStop: iso(E) }, fitLines: track,
        });
        return this;
      },
      /** Part D: the track over the `hours` before E, each epoch from the newest file that starts at or before it; null when a
       *  planned burn lies in [E - hours, E + 72 h] or the track holds under 90 % of its 240 s epochs. */
      longTrack(hours) {
        if (burns.find((t) => t >= E - hours * HOUR && t <= E + 72 * HOUR)) return { error: 'a planned burn in [E - span, E + 72 h]' };
        const from = E - hours * HOUR;
        const order = starts.map((s, j) => ({ s, j })).filter((x) => Number.isFinite(x.s) && x.s <= E).sort((a, b) => a.s - b.s);
        const lines = [];
        for (let k = 0; k < order.length; k += 1) {
          const lo = Math.max(from, order[k].s), hi = k + 1 < order.length ? order[k + 1].s : E + 1;  // the file's own epochs until the next file starts
          if (hi <= from) continue;
          for (const st of issStates(order[k].j)) if (st.ms >= lo && st.ms < hi && st.ms <= E) lines.push(lineOf(st));
        }
        lines.sort((a, b) => ms(a.epoch) - ms(b.epoch));
        if (lines.length < COVER * ((hours * 3600) / 240)) return { error: `the track holds ${lines.length} of ${(hours * 3600) / 240} epochs` };
        return { lines };
      },
    });
  }
  if (out.length !== I.windows) throw new Error(`I: ${out.length} windows, ${I.windows} registered`);
  return out;
}

/** The registered windows of a group, in a fixed order. */
export async function windowsOf(group) {
  if (group === 'L1') { const w = l1Windows(); if (w.length !== config.groups.L1.windows) throw new Error(`L1: ${w.length} cutoffs, ${config.groups.L1.windows} registered`); return w; }
  if (group === 'L2' || group === 'N') return b1Windows(group);
  if (group === 'I') return iWindows();
  throw new Error(`no group ${group}`);
}
export async function closeGroups() { await b1?.close(); }
export const inputsProvenance = () => {
  const f = path.join(store, 'inputs/e6-products.jsonl');
  return fs.existsSync(f) ? { e6Products: sha256(fs.readFileSync(f)) } : {};
};
