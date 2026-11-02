// COMPARE.md: the measured error spread behind each worked example's ellipsoids. For each arm and each lead, the root mean square of its radial, in-track and cross-track errors over
// every forecast of that example's satellite (precise orbits) or provider and regime (next prediction). It is what the forecasts did, not a filter's formal covariance. Statistics only.
//   node experiments/operator-theory/compare-sigma.mjs --examples <dir of example descriptions> --out results/ap-truth/compare/sigma.json
import fs from 'node:fs';
import path from 'node:path';
import { binOf } from './lib/compare.mjs';
import { GROUPS } from './lib/regimes.mjs';

const argOf = (name) => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : null; };
const ROOT = '/opt/data/sdn-archive/operator-theory', AP = path.join(ROOT, 'ap'), NEW = path.join(AP, 'b040');
const jsonl = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const rowsIn = (dir, re = /^rows-\d+\.jsonl$/) => fs.readdirSync(dir).filter((f) => re.test(f)).flatMap((f) => jsonl(path.join(dir, f)));
const rms = (v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0) / v.length);
const DAY_HOURS = { 1: 12, 2: 36, 3: 60, 7: 156 };
const ARMS = ['AP', 'XP', 'SGP4', 'FFM'];

const dir = argOf('--examples');
const examples = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json').map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
const out = {};

// Precise orbits: from the cutoff.
const ap1 = rowsIn(path.join(NEW, 'truth')), ap2 = rowsIn(path.join(NEW, 'truth2')), cmp1 = new Map(rowsIn(path.join(NEW, 'compare-truth')).map((r) => [r.key, r])), cmp2 = new Map(rowsIn(path.join(NEW, 'compare-truth2')).map((r) => [r.key, r]));
const regimes = rowsIn(path.join(NEW, 'regimes'));
const FIVE = { 'Strong drag, 2025': [ap1, cmp1, null], 'Strong drag, 2026': [ap2, cmp2, 'P'], 'Near 700 km': [ap2, cmp2, 'S1'], 'Medium Earth orbit': [ap2, cmp2, 'GN'] };
const code = { AP: 'AP', XP: 'XP', SGP4: 'S', FFM: 'F' };
const sixGroup = Object.fromEntries(Object.entries(GROUPS).map(([g, v]) => [v.label, g]));
for (const e of examples.filter((x) => x.reference === 'truth')) {
  const five = FIVE[e.regime];
  const arc = e.fitHours;
  let windows, read;
  if (five) {
    const [ap, cmp, group] = five;
    windows = ap.filter((r) => !r.error && r.name === e.satellite && (!group || r.group === group));
    read = (w, arm) => (arm === 'AP' ? w.arms[`AP${arc}`] : cmp.get(w.key)?.arms[`${code[arm]}${arc}`]);
  } else {
    const g = sixGroup[e.regime];
    windows = regimes.filter((r) => !r.error && r.group === g && r.name === e.satellite);
    read = (w, arm) => w.arms[`${code[arm]}${arc}`];
  }
  const arms = {};
  for (const arm of ARMS) {
    const row = { r: [], t: [], n: [], count: [] };
    let ok = true;
    for (const day of ['1', '2', '3', '7']) {
      const days = windows.map((w) => read(w, arm)?.days?.[day]).filter((d) => d && Number.isFinite(d.r));
      if (days.length < 3) { ok = false; break; }
      row.r.push(rms(days.map((d) => d.r))); row.t.push(rms(days.map((d) => d.t))); row.n.push(rms(days.map((d) => d.n))); row.count.push(days.length);
    }
    if (ok) arms[arm] = row;
  }
  out[e.id] = { from: 'fitEnd', hours: Object.values(DAY_HOURS), arms };
}

// The next prediction: from the file's start, by lead.
const key = (r) => `${r.source}|${r.norad}|${r.olderStart}|${r.newerStart}`;
const load = (d) => new Map(rowsIn(d).map((r) => [key(r), r]));
const laser = rowsIn(path.join(NEW, 'laser', 'forward')), xp = load(path.join(AP, 'laser', 'forward')), ffm = load(path.join(ROOT, 'cheaper', 'forward')), sg = [load(path.join(NEW, 'laser-sgp4')), load(path.join(NEW, 'laser-sgp4-high'))];
const NAV = /^(beidou|compass|galileo|glonass|gps|irnss|qzs)/;
const regimeOf = (r) => (r.source.endsWith('-leo') ? 'Low orbit' : NAV.test(r.object) ? 'Navigation' : 'Geodetic');
const LEADS = [12, 24, 36, 48, 60, 72, 96, 120, 144, 168];
const providerRows = fs.existsSync(path.join(NEW, 'providers')) ? rowsIn(path.join(NEW, 'providers'), /^rows(-iss)?-\d+\.jsonl$/) : [];
const PROVIDER = { starlink: 'SpaceX', iss: 'NASA ISS', css: 'China Space Station', planet: 'Planet', gps: 'ESA ultra-rapid', glonass: 'ESA ultra-rapid', intelsat: 'Intelsat', ses: 'SES' };
for (const e of examples.filter((x) => x.reference === 'next')) {
  const fromProviders = Object.values(PROVIDER).includes(e.provider);
  const cell = fromProviders ? providerRows.filter((r) => PROVIDER[r.source] === e.provider && !r.error) : laser.filter((r) => regimeOf(r) === e.regime && r.source.split('-')[1] === e.provider);
  const leo = e.regime === 'Low orbit';
  const read = (r, arm) => {
    if (fromProviders) return r.arms[{ AP: `A-APn@${e.fitHours}`, XP: `A-XP@${e.fitHours}`, SGP4: `S@${e.fitHours}`, FFM: `F-M40@${e.fitHours}` }[arm]];
    return { AP: r.arms['A-APn@48'], XP: xp.get(key(r))?.arms['A-XP@48'], SGP4: sg.map((s) => s.get(key(r))?.arms['S@48']).find((a) => a && Number.isFinite(a.r)), FFM: ffm.get(key(r))?.arms[leo ? 'F-M40@48' : 'F-H20@48'] }[arm];
  };
  const arms = {}, hours = [];
  for (const lead of LEADS) {
    const inBin = cell.filter((r) => binOf(r.leadHours) === lead);
    if (inBin.length < 3) continue;
    hours.push(lead);
    for (const arm of ARMS) {
      const v = inBin.map((r) => read(r, arm)).filter((a) => a && Number.isFinite(a.r));
      const row = arms[arm] ?? (arms[arm] = { r: [], t: [], n: [], count: [] });
      row.r.push(v.length ? rms(v.map((a) => a.r)) : null); row.t.push(v.length ? rms(v.map((a) => a.t)) : null); row.n.push(v.length ? rms(v.map((a) => a.n)) : null); row.count.push(v.length);
    }
  }
  for (const arm of Object.keys(arms)) if (arms[arm].r.some((x) => x === null)) delete arms[arm];
  out[e.id] = { from: 'start', hours, arms };
}
fs.writeFileSync(argOf('--out'), `${JSON.stringify(out)}\n`);
console.log('examples', Object.keys(out).length, 'with spread for every arm', Object.values(out).filter((v) => Object.keys(v.arms).length === 4).length, 'none', Object.entries(out).filter(([, v]) => !Object.keys(v.arms).length).map(([k]) => k).slice(0, 8));
