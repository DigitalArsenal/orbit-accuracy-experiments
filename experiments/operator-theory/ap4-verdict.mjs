// The registered verdicts of AP4.md from stored rows: this build's arms against AP 0.3.0's, by pair. Statistics only; no physics.
//   node experiments/operator-theory/ap4-verdict.mjs truth | truth2 | laser | starlink [--md <file>] [--json <file>]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { SEED, MAX_FAILED, binOf, rand, pct, asc, median, round, compare } from './lib/compare.mjs';

const part = process.argv[2];
const argOf = (name) => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : null; };
const ROOT = '/opt/data/sdn-archive/operator-theory', AP = path.join(ROOT, 'ap'), NEW = path.join(AP, 'b040');
const jsonl = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const rowsIn = (dir) => fs.readdirSync(dir).filter((f) => /^rows-\d+\.jsonl$/.test(f)).flatMap((f) => jsonl(path.join(dir, f)));
const allIn = (store) => fs.readdirSync(store).filter((f) => f.endsWith('.jsonl')).flatMap((f) => jsonl(path.join(store, f)));
const lines = [], out = { registered: 'experiments/operator-theory/AP4.md', part };
const say = (s) => { lines.push(s); console.log(s); };
const LEADS = ['1', '2', '3', '7'], DRAWS = 10000, LEVEL = 0.975, MAXP95 = Math.log(1.1), MAXFAIL = 0.01;
const pctOf = (d) => `${(100 * (Math.exp(d) - 1)).toFixed(1)} %`;

/** Part T's statistics: pairs [{ x, y, cluster }], x null for a failed arm. */
function contrast(tag, pairs) {
  const q = pairs.map((p) => ({ d: p.x === null ? 1e9 : Math.log(p.x / p.y), ax: p.x ?? 1e12, by: p.y, cluster: p.cluster }));
  const failed = pairs.filter((p) => p.x === null).length;
  const clusters = [...new Set(q.map((p) => p.cluster))];
  const random = rand(parseInt(crypto.createHash('sha256').update(`AP4|${tag}|${clusters.length}`).digest('hex').slice(0, 8), 16));
  const by = new Map(clusters.map((c) => [c, q.filter((p) => p.cluster === c)])), meds = [], p95s = [];
  for (let t = 0; t < DRAWS; t += 1) {
    const draw = [];
    for (let i = 0; i < clusters.length; i += 1) draw.push(...by.get(clusters[Math.floor(random() * clusters.length)]));
    meds.push(median(draw.map((p) => p.d)));
    p95s.push(Math.log(pct(draw.map((p) => p.ax).sort(asc), 0.95) / pct(draw.map((p) => p.by).sort(asc), 0.95)));
  }
  meds.sort(asc); p95s.sort(asc);
  return { n: q.length, clusters: clusters.length, failedShare: q.length ? failed / q.length : 1, medianD: median(q.map((p) => p.d)), interval: [pct(meds, 1 - LEVEL), pct(meds, LEVEL)], p95Upper: pct(p95s, LEVEL) };
}
const show = (k, c) => `- day ${k}: ${pctOf(c.medianD)} [${pctOf(c.interval[0])}, ${pctOf(c.interval[1])}], p95 upper ${pctOf(c.p95Upper)}, failed ${(100 * c.failedShare).toFixed(2)} %, n ${c.n}, weeks ${c.clusters}`;
const rule1 = (c) => c.interval[1] < 0, rule23 = (c) => c.p95Upper < MAXP95 && c.failedShare <= MAXFAIL;
const figures = (values) => { const v = values.filter(Number.isFinite).sort(asc); return { n: v.length, median: pct(v, 0.5), p95: pct(v, 0.95) }; };
const cell = (f) => `${round(f.median, 3)} (${round(f.p95, 2)})`;

function truth() {
  const fresh = new Map(rowsIn(path.join(NEW, 'truth')).map((r) => [r.key, r]));
  const old = new Map(rowsIn(path.join(AP, 'truth')).map((r) => [r.key, r]));
  const stored = new Map(allIn('/opt/data/sdn-archive/xp2-fit-design/rows').map((r) => [r.key, r]));
  say(`# AP 0.4.0 against precise orbits, Part T: ${fresh.size} windows\n`);
  const eOf = (m, key, a, k) => { const x = m.get(key)?.arms?.[a]; return x?.ok ? x.days?.[k]?.e ?? null : null; };
  const pairsOf = (a, k) => {
    const pairs = [];
    for (const [key, r] of fresh) {
      if (r.error) continue;
      const ee = stored.get(key)?.binEpochs?.[k];
      if (ee !== undefined && ee < 260) continue;
      const y = eOf(old, key, a, k);
      if (y === null) continue;
      const x = eOf(fresh, key, a, k);
      if (x === null && r.arms[a]?.error === 'coverage') continue;
      pairs.push({ x, y, cluster: stored.get(key)?.isoWeek });
    }
    return pairs;
  };
  const cells = {};
  for (const a of ['APRa12', 'AP24']) {
    say(`## ${a}: 0.4.0 against 0.3.0`);
    cells[a] = {};
    for (const k of LEADS) { cells[a][k] = contrast(`T|${a}|${k}`, pairsOf(a, k)); say(show(k, cells[a][k])); }
    say('');
  }
  const passes = (a) => rule1(cells[a]['1']) && LEADS.every((k) => rule23(cells[a][k]));
  const s1 = passes('APRa12'), s2 = s1 && passes('AP24');
  say(`**Statement 1, APRa12 at 0.4.0 beats 0.3.0:** ${s1 ? 'PASS' : 'fail'}`);
  say(`**Statement 2, AP24 at 0.4.0 beats 0.3.0:** ${s1 ? (s2 ? 'PASS' : 'fail') : 'not tested'}\n`);
  say('| Arm | Build | Day 1 | Day 2 | Day 3 | Day 7 |');
  say('|---|---|---:|---:|---:|---:|');
  const arms = {}, arms030 = {};
  for (const a of ['APRa12', 'AP24']) for (const [build, m, into] of [['0.4.0', fresh, arms], ['0.3.0', old, arms030]]) {
    const f = Object.fromEntries(LEADS.map((k) => [k, figures([...fresh.keys()].map((key) => eOf(m, key, a, k) ?? NaN))]));
    into[a] = f;
    say(`| ${a} | ${build} | ${LEADS.map((k) => cell(f[k])).join(' | ')} |`);
  }
  const stormKeys = [...fresh.keys()].filter((key) => (stored.get(key)?.apArc ?? 0) >= 40);
  const storm = { windows: stormKeys.length };
  for (const a of ['APRa12', 'AP24']) storm[a] = Object.fromEntries(LEADS.map((k) => [k, figures(stormKeys.map((key) => eOf(fresh, key, a, k) ?? NaN))]));
  // The shape of AP.md's table, read by the site: `arms` at this build.
  Object.assign(out, { windows: fresh.size, statements: { 1: s1, 2: s2 }, siteArm: 'APRa12', arms, arms030, storm, contrasts: cells });
}

function truth2() {
  const fresh = rowsIn(path.join(NEW, 'truth2'));
  const old = new Map(rowsIn(path.join(AP, 'truth2')).map((r) => [r.key, r]));
  const stored = new Map(allIn('/opt/data/sdn-archive/xp-atmosphere-merit/rows').map((r) => [r.key, r]));
  say(`# AP 0.4.0 against precise orbits, Part N: ${fresh.length} windows\n`);
  const armE = (r, a, k) => { const x = r?.arms?.[a]; return x?.ok ? x.days?.[k]?.e ?? null : null; };
  const pE = (key, k) => { const s = stored.get(key); return s?.P?.ok ? s.P.days?.[k]?.rmsKm ?? null : null; };
  const pairsOf = (group, a, ref, k) => {
    const pairs = [];
    for (const r of fresh.filter((q) => q.group === group && !q.error)) {
      if (!(stored.get(r.key)?.entered ?? []).includes(Number(k))) continue;
      const y = ref === 'P' ? pE(r.key, k) : armE(old.get(r.key), ref, k);
      if (y === null) continue;
      const x = armE(r, a, k);
      if (x === null && r.arms[a]?.error === 'coverage') continue;
      pairs.push({ x, y, cluster: stored.get(r.key)?.isoWeek });
    }
    return pairs;
  };
  out.groups = {};
  for (const [group, a, ref, ones] of [['S1', 'AP72', 'P', LEADS], ['GN', 'AP72', 'AP72', ['1', '3']], ['P', 'AP24', 'AP24', []]]) {
    const inG = fresh.filter((r) => r.group === group && !r.error);
    say(`## ${group}: ${inG.length} windows\n`);
    say('| Arm | Day 1 | Day 2 | Day 3 | Day 7 |');
    say('|---|---:|---:|---:|---:|');
    const entered = (key, k) => (stored.get(key)?.entered ?? []).includes(Number(k));
    const fig = (get) => Object.fromEntries(LEADS.map((k) => [k, figures(inG.filter((r) => entered(r.key, k)).map((r) => get(r, k) ?? NaN))]));
    const arms = { AP72: fig((r, k) => armE(r, 'AP72', k)), AP24: fig((r, k) => armE(r, 'AP24', k)), P: fig((r, k) => pE(r.key, k)) };
    const arms030 = { AP72: fig((r, k) => armE(old.get(r.key), 'AP72', k)), AP24: fig((r, k) => armE(old.get(r.key), 'AP24', k)) };
    for (const [name, f] of [['AP72 0.4.0', arms.AP72], ['AP72 0.3.0', arms030.AP72], ['AP24 0.4.0', arms.AP24], ['AP24 0.3.0', arms030.AP24], ['P', arms.P]]) say(`| ${name} | ${LEADS.map((k) => cell(f[k])).join(' | ')} |`);
    say('');
    const cells = {};
    say(`### ${a} at 0.4.0 against ${ref === 'P' ? 'P' : `${ref} at 0.3.0`}`);
    for (const k of LEADS) { cells[k] = contrast(`N|${group}|${a}|${ref}|${k}`, pairsOf(group, a, ref, k)); say(show(k, cells[k])); }
    say('');
    let verdict = null;
    if (ones.length) {
      verdict = ones.every((k) => rule1(cells[k])) && LEADS.every((k) => rule23(cells[k]));
      say(`**${group}, ${a} at 0.4.0 beats ${ref === 'P' ? 'P' : `${ref} at 0.3.0`}:** ${verdict ? 'PASS' : 'fail'}\n`);
    }
    out.groups[group] = { windows: inG.length, arms, arms030, contrasts: cells, verdict };
  }
}

function laser() {
  const rows = rowsIn(path.join(NEW, 'laser', 'forward'));
  const key = (r) => `${r.source}|${r.norad}|${r.olderStart}|${r.newerStart}`;
  const old = new Map(rowsIn(path.join(AP, 'laser', 'forward')).map((r) => [key(r), r]));
  const cheaper = new Map(rowsIn(path.join(ROOT, 'cheaper', 'forward')).map((r) => [key(r), r]));
  const NAV = /^(beidou|compass|galileo|glonass|gps|irnss|qzs)/;
  const groupOf = (r) => (r.source.endsWith('-leo') ? 'low' : NAV.test(r.object) ? 'navigation' : 'geodetic');
  const km = (r, a) => r.arms[a]?.km ?? old.get(key(r))?.arms[a]?.km ?? cheaper.get(key(r))?.arms[a]?.km;
  const random = rand(SEED);
  say(`# AP 0.4.0 on laser-ranging orbits, Part L: ${rows.length} pairs\n`);
  const verdicts = {};
  for (const group of ['low', 'navigation', 'geodetic']) {
    const inGroup = rows.filter((r) => groupOf(r) === group).map((r) => ({ ...r, day: r.olderStart.slice(0, 10) }));
    say(`## ${group}: ${inGroup.length} pairs, ${new Set(inGroup.map((r) => r.norad)).size} objects, ${new Set(inGroup.map((r) => r.day)).size} start days\n`);
    const ffm = group === 'low' ? ['F-full@48', 'F-M40@48'] : ['F-Hfull@48', 'F-H20@48'];
    for (const lead of [24, 72, 120, 168]) {
      const cell_ = inGroup.filter((r) => binOf(r.leadHours) === lead);
      if (!cell_.length) continue;
      say(`### Lead ${lead} h: ${cell_.length} pairs\n`);
      say('| Arm | n | failed | median km | 95th km | 0.4.0 less 0.3.0 at the same fit: median, interval |');
      say('|---|---:|---:|---:|---:|---|');
      for (const a of ['A-APn@48', 'A-AP@48', 'A-APn@72', 'A-AP@72', ...ffm]) {
        const v = cell_.map((r) => km(r, a)).filter(Number.isFinite).sort(asc);
        const ctl = a.startsWith('A-APn') ? a.replace('A-APn', 'A-AP') : null;
        const c = ctl ? compare(cell_.filter((r) => Number.isFinite(km(r, a)) && Number.isFinite(km(r, ctl))).map((r) => ({ d: km(r, a) - km(r, ctl), object: r.norad, day: r.day })), random) : null;
        verdicts[`${group}/${a}/${lead}`] = { c, failed: (cell_.length - v.length) / cell_.length, median: round(pct(v, 0.5), 4), p95: round(pct(v, 0.95), 3) };
        say(`| ${a} | ${v.length} | ${round((cell_.length - v.length) / cell_.length)} | ${round(pct(v, 0.5), 4)} | ${round(pct(v, 0.95), 3)} | ${c ? `${c.median} ${c.interval ? `[${c.interval[0]}, ${c.interval[1]}]` : '(report only)'}` : ''} |`);
      }
      say('');
    }
  }
  const claim = (group, arm, leads) => { const c = leads.map((l) => verdicts[`${group}/${arm}/${l}`]); return c.every((x) => x?.c?.interval) ? (c.every((x) => x.c.interval[1] < 0 && x.failed <= MAX_FAILED) ? 'PASS' : 'fail') : 'report only'; };
  const low = claim('low', 'A-APn@48', [24, 72]), nav = claim('navigation', 'A-APn@72', [72, 168]);
  say(`**Part L, low, 0.4.0 beats 0.3.0 at 48 h fits, at 24 h and 72 h:** ${low}`);
  say(`**Part L, navigation, 0.4.0 beats 0.3.0 at 72 h fits, at 72 h and 168 h:** ${nav}`);
  Object.assign(out, { pairs: rows.length, claims: { low, navigation: nav }, cells: verdicts });
}

function starlink() {
  const rows = rowsIn(path.join(NEW, 'starlink'));
  const key = (r) => `${r.norad}|${r.olderStart}|${r.newerStart}`;
  const old = new Map(rowsIn(path.join(AP, 'starlink')).map((r) => [key(r), r]));
  const confirm = new Map(rowsIn(path.join(ROOT, 'confirm')).map((r) => [key(r), r]));
  const km = (r, a) => r.arms[a]?.km ?? old.get(key(r))?.arms[a]?.km ?? confirm.get(key(r))?.arms[a]?.km;
  const random = rand(SEED);
  say(`# AP 0.4.0 on Starlink, Part S, report only: ${rows.length} pairs, ${new Set(rows.map((r) => r.norad)).size} satellites\n`);
  for (const lead of [24, 36, 48, 72]) {
    const c = rows.filter((r) => binOf(r.leadHours) === lead).map((r) => ({ ...r, day: r.olderStart.slice(0, 10) }));
    if (!c.length) continue;
    say(`## Lead ${lead} h: ${c.length} pairs, ${new Set(c.map((r) => r.day)).size} start days\n`);
    say('| Arm | n | median km | 95th km | less 0.3.0: median, interval | less XP: median, interval |');
    say('|---|---:|---:|---:|---|---|');
    for (const a of ['A-APn', 'A-AP', 'X0@16', 'F-NRLMSISE00@16']) {
      const v = c.map((r) => km(r, a)).filter(Number.isFinite).sort(asc);
      const less = (ctl) => { if (a === ctl) return ''; const q = compare(c.filter((r) => Number.isFinite(km(r, a)) && Number.isFinite(km(r, ctl))).map((r) => ({ d: km(r, a) - km(r, ctl), object: r.norad, day: r.day })), random); return `${q.median} ${q.interval ? `[${q.interval[0]}, ${q.interval[1]}]` : '(report only)'}`; };
      say(`| ${a} | ${v.length} | ${round(pct(v, 0.5), 3)} | ${round(pct(v, 0.95), 2)} | ${a === 'A-APn' ? less('A-AP') : ''} | ${less('X0@16')} |`);
    }
    say('');
  }
}

({ truth, truth2, laser, starlink }[part] ?? (() => { throw new Error('truth, truth2, laser or starlink'); }))();
if (argOf('--md')) fs.writeFileSync(argOf('--md'), lines.join('\n'));
if (argOf('--json')) fs.writeFileSync(argOf('--json'), JSON.stringify(out, null, 1));
process.exit(0);
