// The registered verdicts of AP.md from stored rows. Statistics only; no physics.
//   node experiments/operator-theory/ap-verdict.mjs truth | laser | starlink [--md <file>]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { SEED, MAX_FAILED, binOf, rand, pct, asc, median, round, compare } from './lib/compare.mjs';

const part = process.argv[2];
const mdAt = process.argv.indexOf('--md'), mdFile = mdAt > 0 ? process.argv[mdAt + 1] : null;
const ROOT = '/opt/data/sdn-archive/operator-theory', AP = process.env.AP_ROOT ?? path.join(ROOT, 'ap');
const jsonl = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const rowsIn = (dir, re = /^rows-\d+\.jsonl$/) => fs.readdirSync(dir).filter((f) => re.test(f)).flatMap((f) => jsonl(path.join(dir, f)));
const lines = [];
const say = (s) => { lines.push(s); console.log(s); };
const finish = () => { if (mdFile) fs.writeFileSync(mdFile, lines.join('\n')); process.exit(0); };

function truth() {
  const rows = rowsIn(path.join(AP, 'truth'));
  const store = '/opt/data/sdn-archive/xp2-fit-design/rows';
  const stored = new Map(fs.readdirSync(store).filter((f) => f.endsWith('.jsonl')).flatMap((f) => jsonl(path.join(store, f))).map((r) => [r.key, r]));
  const LEADS = ['1', '2', '3', '7'], DRAWS = 10000, LEVEL = 0.975, MAXP95 = Math.log(1.1), MAXFAIL = 0.01;
  const day = (r, a, k) => {
    if (a === 'P') return stored.get(r.key)?.P?.ok ? stored.get(r.key).P.days[k] : null;
    const x = r.arms[a] ?? stored.get(r.key)?.arms[a];
    return x?.ok ? x.days?.[k] ?? null : null;
  };
  const windowsIn = (filter) => rows.filter((r) => !r.error && filter(r));
  function contrast(a, b, k, filter = () => true) {
    const pairs = [];
    let failed = 0;
    for (const r of windowsIn(filter)) {
      const ee = stored.get(r.key)?.binEpochs?.[k];
      if (ee !== undefined && ee < 260) continue;
      const x = day(r, a, k), y = day(r, b, k);
      if (!y) continue;
      if (!x) failed += 1;
      pairs.push({ d: x ? Math.log(x.e / y.e) : Infinity, ax: x?.e ?? Infinity, by: y.e, cluster: stored.get(r.key)?.isoWeek });
    }
    const ordered = [...pairs].sort((p, q) => p.d - q.d);
    const m = median(pairs.map((p) => (Number.isFinite(p.d) ? p.d : 1e9)));
    const clusters = [...new Set(pairs.map((p) => p.cluster))];
    const seed = parseInt(crypto.createHash('sha256').update(`AP|${a}/${b}|${k}|${clusters.length}`).digest('hex').slice(0, 8), 16);
    const random = rand(seed), meds = [], p95s = [];
    const byCluster = new Map(clusters.map((c) => [c, pairs.filter((p) => p.cluster === c)]));
    for (let t = 0; t < DRAWS; t += 1) {
      const draw = [];
      for (let i = 0; i < clusters.length; i += 1) draw.push(...byCluster.get(clusters[Math.floor(random() * clusters.length)]));
      meds.push(median(draw.map((p) => (Number.isFinite(p.d) ? p.d : 1e9))));
      p95s.push(Math.log(pct(draw.map((p) => p.ax).sort(asc), 0.95) / pct(draw.map((p) => p.by).sort(asc), 0.95)));
    }
    meds.sort(asc); p95s.sort(asc);
    return { n: pairs.length, clusters: clusters.length, failedShare: pairs.length ? failed / pairs.length : 1, medianD: m, interval: [pct(meds, 1 - LEVEL), pct(meds, LEVEL)], p95Upper: pct(p95s, LEVEL), ordered: ordered.length };
  }
  const pctOf = (d) => `${(100 * (Math.exp(d) - 1)).toFixed(1)} %`;
  const row = (c) => `${pctOf(c.medianD)} [${pctOf(c.interval[0])}, ${pctOf(c.interval[1])}], p95 upper ${pctOf(c.p95Upper)}, failed ${(100 * c.failedShare).toFixed(2)} %, n ${c.n}, weeks ${c.clusters}`;
  say(`# AP against precise orbits: ${rows.length} windows, ${rows.filter((r) => r.error).length} with no entry\n`);
  const cells = {};
  for (const [a, b] of [['AP24', 'P'], ['AP24', 'RFa12'], ['APRa12', 'AP24'], ['APRa12', 'P'], ['AP24', 'X2'], ['APRa12', 'RFa12']]) {
    say(`## ${a} against ${b}`);
    for (const k of LEADS) { const c = contrast(a, b, k); cells[`${a}/${b}/${k}`] = c; say(`- day ${k}: ${row(c)}`); }
    say('');
  }
  const r1 = (a, b, ks) => ks.every((k) => cells[`${a}/${b}/${k}`].interval[1] < 0);
  const s1 = r1('AP24', 'P', LEADS) && LEADS.every((k) => cells[`AP24/P/${k}`].p95Upper < MAXP95 && cells[`AP24/P/${k}`].failedShare <= MAXFAIL);
  const s2 = s1 && r1('AP24', 'RFa12', ['1', '2']);
  const s3 = s2 && r1('APRa12', 'AP24', ['1', '2']);
  say(`**Statement 1, AP24 beats P:** ${s1 ? 'PASS' : 'fail'}`);
  say(`**Statement 2, AP24 beats RFa12 at days 1 and 2:** ${s1 ? (s2 ? 'PASS' : 'fail') : 'not tested'}`);
  say(`**Statement 3, APRa12 beats AP24 at days 1 and 2:** ${s2 ? (s3 ? 'PASS' : 'fail') : 'not tested'}`);
  say(`**The site's figures come from:** ${s3 ? 'APRa12' : 'AP24'}\n`);
  const med = (a, k, filter) => { const v = windowsIn(filter).map((r) => day(r, a, k)?.e).filter(Number.isFinite).sort(asc); return { m: round(pct(v, 0.5), 3), p95: round(pct(v, 0.95), 2), n: v.length }; };
  const groups = { pool: () => true, primary: (r) => stored.get(r.key)?.span === 'primary', extension: (r) => stored.get(r.key)?.span === 'extension',
    'Swarm A+C': (r) => stored.get(r.key)?.cluster === 'Swarm A+C', 'Swarm B': (r) => stored.get(r.key)?.cluster === 'Swarm B', 'GRACE-FO': (r) => stored.get(r.key)?.cluster === 'GRACE-FO',
    'Ap at least 40': (r) => (stored.get(r.key)?.apArc ?? 0) >= 40 };
  for (const [name, f] of Object.entries(groups)) {
    say(`### ${name}: median km (95th) at days 1, 2, 3, 7`);
    say('| Arm | n | Day 1 | Day 2 | Day 3 | Day 7 |');
    say('|---|---:|---:|---:|---:|---:|');
    for (const a of ['AP24', 'APRa12', 'RFa12', 'X2', 'P']) { const c = LEADS.map((k) => med(a, k, f)); say(`| ${a} | ${c[0].n} | ${c.map((x) => `${x.m} (${x.p95})`).join(' | ')} |`); }
    say('');
  }
}

function laser() {
  const rows = rowsIn(path.join(AP, 'laser', 'forward'));
  const cheaper = new Map(rowsIn(path.join(ROOT, 'cheaper', 'forward')).map((r) => [`${r.source}|${r.norad}|${r.olderStart}|${r.newerStart}`, r]));
  const NAV = /^(beidou|compass|galileo|glonass|gps|irnss|qzs)/;
  const groupOf = (r) => (r.source.endsWith('-leo') ? 'low' : NAV.test(r.object) ? 'navigation' : 'geodetic');
  const random = rand(SEED);
  const km = (r, a) => r.arms[a]?.km ?? cheaper.get(`${r.source}|${r.norad}|${r.olderStart}|${r.newerStart}`)?.arms[a]?.km;
  say(`# AP on laser-ranging orbits: ${rows.length} pairs\n`);
  const verdicts = {};
  for (const group of ['low', 'navigation', 'geodetic']) {
    const inGroup = rows.filter((r) => groupOf(r) === group).map((r) => ({ ...r, day: r.olderStart.slice(0, 10) }));
    say(`## ${group}: ${inGroup.length} pairs, ${new Set(inGroup.map((r) => r.norad)).size} objects, ${new Set(inGroup.map((r) => r.day)).size} start days\n`);
    const extra = group === 'low' ? ['F-full@48', 'F-M40@48', 'F-M20@48'] : ['F-Hfull@48', 'F-H20@48'];
    for (const lead of [72, 120, 168]) {
      const cell = inGroup.filter((r) => binOf(r.leadHours) === lead);
      if (!cell.length) continue;
      say(`### Lead ${lead} h: ${cell.length} pairs\n`);
      say('| Arm | n | failed | median km | 95th km | less XP at the same fit: median, interval |');
      say('|---|---:|---:|---:|---:|---|');
      for (const a of ['A-AP@48', 'A-XP@48', 'A-AP@72', 'A-XP@72', ...extra]) {
        const v = cell.map((r) => km(r, a)).filter(Number.isFinite).sort(asc);
        const fit = a.split('@')[1], ctl = `A-XP@${fit}`;
        const c = a === ctl ? null : compare(cell.filter((r) => Number.isFinite(km(r, a)) && Number.isFinite(km(r, ctl))).map((r) => ({ d: km(r, a) - km(r, ctl), object: r.norad, day: r.day })), random);
        verdicts[`${group}/${a}/${lead}`] = { c, failed: (cell.length - v.length) / cell.length };
        say(`| ${a} | ${v.length} | ${round((cell.length - v.length) / cell.length)} | ${round(pct(v, 0.5), 4)} | ${round(pct(v, 0.95), 3)} | ${c ? `${c.median} ${c.interval ? `[${c.interval[0]}, ${c.interval[1]}]` : '(report only)'}` : ''} |`);
      }
      say('');
    }
  }
  const low = [72, 168].map((l) => verdicts[`low/A-AP@48/${l}`]);
  const claim = low.every((x) => x?.c?.interval && x.c.interval[1] < 0 && x.failed <= MAX_FAILED);
  say(`**Part L, AP beats XP at 48 h fits, at 72 h and 168 h:** ${low.every((x) => x?.c?.interval) ? (claim ? 'PASS' : 'fail') : 'report only'}`);
  const margins = { 72: 0.005, 168: 0.02 };
  const nav = [72, 168].map((l) => ({ l, x: verdicts[`navigation/A-AP@72/${l}`] }));
  const keeps = nav.every(({ l, x }) => x?.c?.interval && x.c.interval[1] <= margins[l] && x.failed <= MAX_FAILED);
  say(`**Part H, AP does not lose to XP on navigation at 72 h fits:** ${nav.every(({ x }) => x?.c?.interval) ? (keeps ? 'PASS' : 'fail') : 'report only'}`);
}

function starlink() {
  const rows = rowsIn(path.join(AP, 'starlink'));
  const stored = new Map(rowsIn(path.join(ROOT, 'confirm')).map((r) => [`${r.norad}|${r.olderStart}|${r.newerStart}`, r]));
  const random = rand(SEED);
  const km = (r, a) => r.arms[a]?.km ?? stored.get(`${r.norad}|${r.olderStart}|${r.newerStart}`)?.arms[a]?.km;
  say(`# AP on Starlink: ${rows.length} pairs, ${new Set(rows.map((r) => r.norad)).size} satellites\n`);
  const verdicts = {};
  for (const lead of [24, 36, 48, 72]) {
    const cell = rows.filter((r) => binOf(r.leadHours) === lead).map((r) => ({ ...r, day: r.olderStart.slice(0, 10) }));
    if (!cell.length) continue;
    say(`## Lead ${lead} h: ${cell.length} pairs, ${new Set(cell.map((r) => r.day)).size} start days\n`);
    say('| Arm | n | failed | median km | 95th km | less XP: median, interval |');
    say('|---|---:|---:|---:|---:|---|');
    for (const a of ['A-AP', 'X0@16', 'X2@16', 'F-NRLMSISE00@16', 'F-lite', 'RFz']) {
      const v = cell.map((r) => km(r, a)).filter(Number.isFinite).sort(asc);
      const c = a === 'X0@16' ? null : compare(cell.filter((r) => Number.isFinite(km(r, a)) && Number.isFinite(km(r, 'X0@16'))).map((r) => ({ d: km(r, a) - km(r, 'X0@16'), object: r.norad, day: r.day })), random);
      verdicts[`${a}/${lead}`] = { c, failed: (cell.length - v.length) / cell.length };
      say(`| ${a} | ${v.length} | ${round((cell.length - v.length) / cell.length)} | ${round(pct(v, 0.5), 3)} | ${round(pct(v, 0.95), 2)} | ${c ? `${c.median} ${c.interval ? `[${c.interval[0]}, ${c.interval[1]}]` : '(report only)'}` : ''} |`);
    }
    say('');
  }
  const cells = [24, 48].map((l) => verdicts[`A-AP/${l}`]);
  const ready = cells.every((x) => x?.c?.interval);
  say(`**Part S, AP beats XP at 24 h:** ${cells[0]?.c?.interval ? (cells[0].c.interval[1] < 0 && cells[0].failed <= MAX_FAILED ? 'interval below zero' : 'not below zero') : 'report only'}`);
  say(`**Part S, AP beats XP at both 24 h and 48 h:** ${ready ? (cells.every((x) => x.c.interval[1] < 0 && x.failed <= MAX_FAILED) ? 'PASS' : 'fail') : 'report only'}`);
}

({ truth, laser, starlink }[part] ?? (() => { throw new Error('truth, laser or starlink'); }))();
finish();
