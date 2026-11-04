// The registered arcs, recomputed from the captured tracks.parquet files and the DORIS product NAMES (no truth row is
// read): the survey's build-coverage.py rule for the DORIS class. A night is a session in which the object has a
// publishable identified track whose first and last epoch lie inside one DORIS product's span (from its file name); an
// arc is a run of consecutive nights; its hours run from the first such track's start to the last one's end.
import fs from 'node:fs';
import path from 'node:path';

export const SATNOGS = '/opt/data/sdn-archive/hac/satnogs-optical';
export const DORIS_DIR = '/opt/data/sdn-archive/hac/ids-doris/ssa';
// The survey's DORIS map (build-coverage.py), prefix -> NORAD.
export const DORIS = { cs2: 36508, h2c: 46469, h2d: 48621, ja3: 41240, s3a: 41335, s3b: 43437, s6a: 46984, s6b: 66514, srl: 39086, swo: 54754 };
export const NAMES = { 66514: 'Sentinel-6B', 46984: 'Sentinel-6A', 46469: 'HY-2C', 48621: 'HY-2D', 54754: 'SWOT', 36508: 'CryoSat-2', 41240: 'Jason-3', 41335: 'Sentinel-3A', 43437: 'Sentinel-3B' };
export const HELD = { galileo: [43567, 37847, 41862, 41174, 43055, 41175], swarmGraceFo: [39451, 39452, 39453, 43476, 43477] };
const DORIS_RE = /^ssa(\w{3})\d0\.b(\d\d)(\d{3})\.e(\d\d)(\d{3})/;
const doy = (yy, ddd) => Date.UTC(2000 + yy, 0, 1) + (ddd - 1) * 86400000;

export const generationOf = (session) => {
  const dir = path.join(SATNOGS, `session_date=${session}`, 'generations');
  const gens = fs.readdirSync(dir);
  if (gens.length !== 1) throw new Error(`session ${session}: ${gens.length} generations`);
  return path.join(dir, gens[0]);
};
export const sessions = () => fs.readdirSync(SATNOGS).filter((d) => d.startsWith('session_date=')).map((d) => d.slice(13)).sort();

// DORIS product names (the files, not their rows) -> {norad: [[startMs, endMs, name]]}.
export function dorisSpans(names = fs.readdirSync(DORIS_DIR).filter((b) => b.endsWith('.Z'))) {
  const out = {};
  for (const b of names) {
    const m = DORIS_RE.exec(b);
    if (!m || !(m[1] in DORIS)) continue;
    (out[DORIS[m[1]]] ??= []).push([doy(+m[2], +m[3]), doy(+m[4], +m[5]), b]);
  }
  return out;
}

export async function recomputeArcs({ readParquet, dorisNames } = {}) {
  const truth = dorisSpans(dorisNames);
  const nights = new Map();  // `${norad}|${session}` -> [[start, end]]
  for (const s of sessions()) {
    const p = readParquet(path.join(generationOf(s), 'tracks.parquet'));
    const C = p.columns;
    for (let i = 0; i < p.rows; i += 1) {
      const n = C.object_norad_id[i];
      if (!n || !C.publishable[i] || !(n in truth)) continue;
      const k = `${n}|${C.session[i]}`;
      if (!nights.has(k)) nights.set(k, []);
      nights.get(k).push([Number(C.started_utc[i] / 1000n), Number(C.ended_utc[i] / 1000n)]);
    }
  }
  const arcs = [];
  for (const norad of Object.keys(truth).map(Number).sort((a, b) => a - b)) {
    const iv = truth[norad];
    const truthEnd = Math.max(...iv.map((x) => x[1]));
    const per = [...nights.entries()].filter(([k]) => +k.split('|')[0] === norad).map(([k, t]) => {
      const ok = t.filter(([a, b]) => iv.some(([s, e]) => s <= a && b <= e));
      return { session: k.split('|')[1], first: ok.length ? Math.min(...ok.map((x) => x[0])) : null, last: ok.length ? Math.max(...ok.map((x) => x[1])) : null };
    }).sort((a, b) => a.session.localeCompare(b.session));
    let cur = [];
    const flush = () => {
      if (!cur.length) return;
      const hours = (cur.at(-1).last - cur[0].first) / 3600e3;
      arcs.push({ norad, firstSession: cur[0].session, lastSession: cur.at(-1).session, nights: cur.length, hours: Math.round(hours * 10) / 10,
        firstMs: cur[0].first, lastMs: cur.at(-1).last, truthHoursAfter: Math.round(Math.max(0, (truthEnd - cur.at(-1).last) / 3600e3) * 10) / 10 });
      cur = [];
    };
    for (const x of per) {
      if (x.first === null) { flush(); continue; }
      if (cur.length && (Date.parse(x.session) - Date.parse(cur.at(-1).session)) !== 86400000) flush();
      cur.push(x);
    }
    flush();
  }
  return arcs.filter((a) => a.hours >= 24).map((a) => ({ ...a, id: `${a.norad}-${a.firstSession}-${a.lastSession}`, scorable: a.truthHoursAfter >= 72 }));
}
