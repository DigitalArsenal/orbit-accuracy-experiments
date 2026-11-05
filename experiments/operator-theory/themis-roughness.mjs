// THEMIS-ROUGHNESS.md: the roughness of AP's error track on the 12 stored THEMIS windows, per propagator/sdn-ap build and per ablation. Module calls only:
// every state from propagator/sdn-ap, frames by foundation/frames, RTN errors by analysis/gp-error-model; the second differences and spectra are data steps.
//   SDN_MODULES_ROOT=<modules root> node experiments/operator-theory/themis-roughness.mjs --run [--shard k/n] [--arms main,bisect,forces] [--cross a,b] [--only <window key>] [--builds <dir>]
//   node experiments/operator-theory/themis-roughness.mjs --table      (rows to results/ap-truth/themis-roughness/table.json and README.md)
//   node experiments/operator-theory/themis-roughness.mjs --check      (re-derives the table from the rows; the control; the 3.06 m figure)
// Builds come from SDN_MODULES_GIT (a modules clone holding every commit below) by git show, SHA-256 checked, into --builds (a scratch directory).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const STORE = process.env.THEMIS_ROUGHNESS_STORE ?? '/opt/data/sdn-archive/operator-theory/themis-roughness';
const OUT = path.join(ROOT, 'results/ap-truth/themis-roughness');
const STORED = { '0.4.11': '/opt/data/sdn-archive/operator-theory/ap/b0411/regimes-hx', '0.5.1': '/opt/data/sdn-archive/operator-theory/ap/b051/regimes-hx' };
const STEP_S = 300, HOUR = 3600000, DAY = 86400000, ARC_H = 72;
// The published figure (compare examples, stack pin 7632521a72): THEMIS D, cutoff 2013-02-13, AP 0.5.1, fit and forecast spans.
const PUBLISHED = { key: 'HX|THEMIS D|2013-02-13', version: '0.5.1', m: 3.06, within: 0.25 };
/** propagator/sdn-ap builds: version, modules commit, dist SHA-256, and the path its fit and flight take ($OMM before 0.5.0, one $OCM from it). */
const BUILDS = [
  ['0.4.11', 'a0f33bc545d76f47d679c7854c6963fb8efcf799', 'e4edacb03daff4eaba47263010c27009a6d888259c0d8f028605cebf4d655610'],
  ['0.4.12', '0fb671753b08b0a2408cd55e0d1dcfecb29d84d3', 'fef0e72eff4aafb9217c1dd184e1b735ed584c512813541e594958e61bd12085'],
  ['0.4.13', 'c938b91d81f2cbe0bcc886e427379343b2f035bb', '314ac788e71bbf8c8b722ea16d6ef6f9e415cdc34d5674a18a0b2ca4c26fafd5'],
  ['0.4.14', '5e9f42619b753ffcd5e422538dad8b77bbdeedc5', '525d57599048b7d7c178dbb9c01c7ebc1ff47936ab2e7833b6f2228eb8e44646'],
  ['0.4.15', 'd50689f1e6ac5f272a63a31fdbd15d3ca9d92a5d', '2cdec7f54d7b7fa985ea8070b777b36ef71fae200c0106b17a3e5bc8ba6ade79'],
  ['0.4.16', '1ec77920035948f975f16119e890441c33306e34', '544cb58c5eb0bf11520f191f4825da7eee5de86d4743893a6c6c07dce589d3ed'],
  ['0.4.17', '3ae1eb289d0575c8c6b40259c1d41c0303ca7753', '7d4920ee23f4aecd9f29ef933f4abe98d6cc463b561b3dd7c5f12bbff6ff4c6c'],
  ['0.4.18', '6fcce5b3cc117600afcdcf6c019feddc4c6123cc', '225bf936f2ad09e68588c84c29e0f4c6fc58f217c5854f0c09e99cda471e66b1'],
  ['0.5.0', '1f806e4bf6bd1d8b3681813d3242bbee1a91023b', 'fa1e4466a00d5343c2d03ae0fd613558860cff1a926b307cde957d5806a50fd6'],
  ['0.5.1', 'ea824356587f54149f876cd3b2b5d8134af682d3', 'd29acd2b5d921446f7da8dbf51f45ba53d59dc7685e677616dcd81944981efdb'],
  ['0.6.0', '895b6b38de29bc284b4b50a02425a6c3a5fe81a2', '0b5280f05176fc755dbfb859fd8028fc495759d7537024c53043f498c91faa63'],
].map(([version, commit, sha256]) => ({ version, commit, sha256, api: /^0\.4\./.test(version) ? 'omm' : 'ocm' }));
const byVersion = Object.fromEntries(BUILDS.map((b) => [b.version, b]));
const MAIN = ['0.4.11', '0.5.1', '0.6.0'];
/** The arms: label, fit build, flight build, FORCES (tesseral d, zonal z; null for XP's stock forces). */
function arms(sets) {
  const out = [];
  const ap = (fit, fly, d = 31, z = 20, tag = 'AP') => out.push({ arm: `${tag}(${d},${z})@${fit}${fly !== fit ? `>${fly}` : ''}`, set: 'x', fit, fly, d, z });
  if (sets.includes('main')) for (const v of MAIN) { ap(v, v); out.push({ arm: `XP@${v}`, set: 'main', fit: v, fly: v, d: null, z: null }); }
  if (sets.includes('bisect')) for (const b of BUILDS) if (!MAIN.includes(b.version)) ap(b.version, b.version);
  if (sets.includes('forces')) for (const v of ['0.5.1', '0.6.0']) { for (const d of [0, 4, 8, 12]) ap(v, v, d, 20); ap(v, v, 31, 0); }
  if (args.cross) { const [a, b] = args.cross.split(','); ap(a, b); ap(b, a); }
  for (const a of out) a.set = a.d === null ? 'main' : MAIN.includes(a.fit) && a.fit === a.fly && a.d === 31 && a.z === 20 ? 'main' : a.fit !== a.fly ? 'cross' : a.d === 31 && a.z === 20 ? 'bisect' : 'forces';
  return out;
}

const median = (v) => { const s = v.filter(Number.isFinite).sort((a, b) => a - b); if (!s.length) return null; const k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
const rms = (v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0) / v.length);
const jsonl = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const rowsOf = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^rows-\d+\.jsonl$/.test(f)).sort().flatMap((f) => jsonl(path.join(dir, f))) : []);

/**
 * The statistic on one error track: tMs (grid epochs, ms), ric ([R, I, C] m). Second difference e(t+h) - 2 e(t) + e(t-h) over consecutive grid samples,
 * its Euclidean norm, median; per axis; per lead day (the middle sample's day). With the day's 3D RMS error and its R, I, C RMS.
 */
export function roughness(tMs, ric, cutoffMs) {
  const d2 = [];
  for (let i = 1; i + 1 < tMs.length; i += 1) {
    if (tMs[i] - tMs[i - 1] !== STEP_S * 1000 || tMs[i + 1] - tMs[i] !== STEP_S * 1000) continue;
    const v = [0, 1, 2].map((c) => ric[i + 1][c] - 2 * ric[i][c] + ric[i - 1][c]);
    d2.push({ i, day: Math.ceil((tMs[i] - cutoffMs) / DAY), v, n: Math.hypot(...v) });
  }
  const stat = (list) => ({ rough: median(list.map((x) => x.n)), roughR: median(list.map((x) => Math.abs(x.v[0]))), roughI: median(list.map((x) => Math.abs(x.v[1]))), roughC: median(list.map((x) => Math.abs(x.v[2]))), triples: list.length });
  const days = {};
  for (let k = 1; k <= 7; k += 1) {
    const at = tMs.map((t, i) => i).filter((i) => tMs[i] > cutoffMs + (k - 1) * DAY && tMs[i] <= cutoffMs + k * DAY);
    if (!at.length) continue;
    const axis = [0, 1, 2].map((c) => rms(at.map((i) => ric[i][c])));
    days[k] = { e: Math.hypot(...axis), r: axis[0], i: axis[1], c: axis[2], samples: at.length, ...stat(d2.filter((x) => x.day === k)) };
  }
  return { ...stat(d2), days, d2 };
}

/** The five largest local peaks of the power of the second-difference track (R, I, C summed), cycles per day, by a direct DFT on the uniform run. */
export function peaks(d2, meanMotionRevDay) {
  const N = d2.length, cpd = 86400 / STEP_S, power = [];
  for (let k = 1; k < N / 2; k += 1) {
    let p = 0;
    for (let c = 0; c < 3; c += 1) {
      let re = 0, im = 0;
      for (let j = 0; j < N; j += 1) { const a = (-2 * Math.PI * k * j) / N; re += d2[j].v[c] * Math.cos(a); im += d2[j].v[c] * Math.sin(a); }
      p += re * re + im * im;
    }
    power.push({ cpd: (k * cpd) / N, p });
  }
  const total = power.reduce((s, x) => s + x.p, 0);
  const local = power.filter((x, i) => i > 0 && i + 1 < power.length && x.p >= power[i - 1].p && x.p >= power[i + 1].p).sort((a, b) => b.p - a.p).slice(0, 5);
  return local.map((x) => ({ cyclesPerDay: x.cpd, share: x.p / total, perRev: meanMotionRevDay ? x.cpd / meanMotionRevDay : null }));
}

/** The share of the second-difference track's power (R, I, C summed) at frequencies up to `limit` times the mean motion. */
export function shareBelow(d2, meanMotionRevDay, limit) {
  const N = d2.length, cpd = 86400 / STEP_S;
  let below = 0, total = 0;
  for (let k = 1; k < N / 2; k += 1) {
    let p = 0;
    for (let c = 0; c < 3; c += 1) {
      let re = 0, im = 0;
      for (let j = 0; j < N; j += 1) { const a = (-2 * Math.PI * k * j) / N; re += d2[j].v[c] * Math.cos(a); im += d2[j].v[c] * Math.sin(a); }
      p += re * re + im * im;
    }
    total += p;
    if ((k * cpd) / N <= limit * meanMotionRevDay) below += p;
  }
  return below / total;
}

/** Table: per arm, the median over windows of the roughness and of each day's 3D error; the control; the published figure. */
function table(rows) {
  const ok = rows.filter((r) => r.ok);
  const armsSeen = [...new Set(ok.map((r) => r.arm))];
  const per = armsSeen.map((arm) => {
    const rs = ok.filter((r) => r.arm === arm), first = rs[0];
    const day = (k, f) => median(rs.map((r) => r.days[k]?.[f]));
    return {
      arm, set: first.set, fit: first.fit, fly: first.fly, d: first.d, z: first.z, windows: rs.length,
      rough: median(rs.map((r) => r.rough)), roughR: median(rs.map((r) => r.roughR)), roughI: median(rs.map((r) => r.roughI)), roughC: median(rs.map((r) => r.roughC)),
      roughMax: Math.max(...rs.map((r) => r.rough)),
      byDay: Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((k) => [k, { roughM: day(k, 'rough'), errorM: day(k, 'e'), ratio: median(rs.map((r) => (r.days[k] ? r.days[k].rough / r.days[k].e : NaN))) }])),
      inner: median(rs.map((r) => r.byRadius?.inner)), outer: median(rs.map((r) => r.byRadius?.outer)),
      bySatellite: Object.fromEntries([...new Set(rs.map((r) => r.name))].map((n) => [n, median(rs.filter((r) => r.name === n).map((r) => r.rough))])),
    };
  });
  // Control: this run's day 1, 2, 3, 7 3D RMS on the stored bins against the stored AP72 and XP72 rows.
  const control = [];
  for (const [version, dir] of Object.entries(STORED)) {
    const stored = new Map(rowsOf(dir).filter((r) => r.group === 'HX' && /^THEMIS/.test(r.name)).map((r) => [r.key, r]));
    for (const r of ok.filter((x) => x.fit === version && x.fly === version && (x.d === null || (x.d === 31 && x.z === 20)))) {
      const s = stored.get(r.key)?.arms?.[r.d === null ? 'XP72' : 'AP72'];
      if (!s?.ok) { control.push({ key: r.key, arm: r.arm, missing: true }); continue; }
      const diffs = Object.entries(s.days).map(([k, v]) => Math.abs((r.control?.[k] ?? NaN) - v.e) * 1e6);
      control.push({ key: r.key, arm: r.arm, worstMm: Math.max(...diffs.map((x) => (Number.isFinite(x) ? x : Infinity))) });
    }
  }
  // Amendment 1 (b): what the tesseral terms add to the flown track on 0.5.1, AP(31,20) minus AP(0,20), its second difference's spectrum per window.
  const trackOf = (key, arm) => { const f = path.join(STORE, 'tracks', `${crypto.createHash('sha256').update(`${key}#${arm}`).digest('hex').slice(0, 16)}.f32`); if (!fs.existsSync(f)) return null; const b = fs.readFileSync(f); return new Float32Array(b.buffer, b.byteOffset, b.length / 4); };
  const tesseral = [];
  for (const r of ok.filter((x) => x.arm === 'AP(31,20)@0.5.1')) {
    const a = trackOf(r.key, r.arm), b = trackOf(r.key, 'AP(0,20)@0.5.1'), mm = r.peaks?.find((p) => p.perRev)?.cyclesPerDay / r.peaks?.find((p) => p.perRev)?.perRev;
    if (!a || !b || a.length !== b.length) continue;
    const n = a.length / 3, d2 = [];
    for (let i = 1; i + 1 < n; i += 1) { const v = [0, 1, 2].map((c) => (a[3 * (i + 1) + c] - b[3 * (i + 1) + c]) - 2 * (a[3 * i + c] - b[3 * i + c]) + (a[3 * (i - 1) + c] - b[3 * (i - 1) + c])); d2.push({ v, n: Math.hypot(...v) }); }
    tesseral.push({ key: r.key, rough: median(d2.map((x) => x.n)), meanMotionRevDay: mm || null, shareUpTo34n: mm ? shareBelow(d2, mm, 34) : null, peaks: peaks(d2, mm || null) });
  }
  const pub = ok.find((r) => r.key === PUBLISHED.key && r.fit === PUBLISHED.version && r.fly === PUBLISHED.version && r.d === 31 && r.z === 20);
  return { per, control, tesseral, published: { ...PUBLISHED, measuredM: pub?.rough ?? null } };
}

/** The registered verdict rule on the table: the release where roughness rises, the ablation that returns it, whether that term moves the error. */
export function verdict(t) {
  const at = (arm) => t.per.find((p) => p.arm === arm);
  const base = at('AP(31,20)@0.4.11')?.rough;
  const rise = BUILDS.map((b) => at(`AP(31,20)@${b.version}`)).find((p) => p && p.rough > 2 * base);
  const back = t.per.filter((p) => p.set === 'forces' && p.fit === '0.5.1' && p.rough <= 2 * base);
  const full = at('AP(31,20)@0.5.1');
  const moves = back.map((p) => ({ arm: p.arm, rough: p.rough, day3: p.byDay[3].errorM / full.byDay[3].errorM - 1, day7: p.byDay[7].errorM / full.byDay[7].errorM - 1 }));
  return { baseM: base, riseAt: rise?.fit ?? null, riseM: rise?.rough ?? null, returnedBy: moves, named: !!(rise && moves.length), movesError: moves.some((x) => Math.abs(x.day3) > 0.1 || Math.abs(x.day7) > 0.1) };
}
const f3 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? '-' : x.toFixed(3));
const f1 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? '-' : x.toFixed(1));
function readme(doc) {
  const v = verdict(doc), row = (p) => `| ${p.arm} | ${p.windows} | ${f3(p.rough)} | ${f3(p.roughR)} / ${f3(p.roughI)} / ${f3(p.roughC)} | ${f3(p.inner)} / ${f3(p.outer)} | ${f1(p.byDay[1].errorM)} | ${f1(p.byDay[3].errorM)} | ${f1(p.byDay[7].errorM)} | ${f3(p.byDay[3].ratio * 1000)} |`;
  const head = '| Arm | Windows | Roughness (m) | R / I / C (m) | inside / outside median radius (m) | Day 1 error (m) | Day 3 error (m) | Day 7 error (m) | Day 3 roughness per km of error (m) |\n| --- | --: | --: | --: | --: | --: | --: | --: | --: |';
  const sets = (s) => doc.per.filter((p) => p.set === s).map(row).join('\n');
  const peaksLine = (list) => (list ?? []).map((x) => `${x.cyclesPerDay.toFixed(2)}/d${x.perRev ? ` (${x.perRev.toFixed(2)} n)` : ''}`).join(', ');
  return `# THEMIS track roughness

Registration: experiments/operator-theory/THEMIS-ROUGHNESS.md. 12 windows (THEMIS A, D, E; cutoffs 2013-02-11 to 17; 72 h fits, vacuum), each arm
fitted and flown on the propagator/sdn-ap build named, 7 days at 300 s. Roughness: the median of |e(t+h) - 2 e(t) + e(t-h)|, e the RIC error
(forecast minus reference, m), h = 300 s; per arm the median over windows. Errors: 3D RMS per lead day, median over windows. Report only.

Control: ${doc.control.filter((c) => c.worstMm <= 1).length} of ${doc.control.length} rows on 0.4.11 and 0.5.1 equal the stored HX rows (days 1, 2, 3, 7) within 1 mm.
Published figure: THEMIS D 2013-02-13 on 0.5.1, ${f3(doc.published.measuredM)} m over the forecast (3.06 m published, fit and forecast spans).

## Builds
${head}
${sets('main')}

## Release bisection (AP (31, 20))
${head}
${sets('bisect')}

## FORCES on 0.5.1 and 0.6.0 (tesseral cap, zonal cap)
${head}
${sets('forces')}
${doc.per.some((p) => p.set === 'cross') ? `\n## Fit against flight (fit@build>flight build)\n${head}\n${sets('cross')}\n` : ''}
## What the tesseral terms add on 0.5.1 (AP(31,20) minus AP(0,20))
| Window | Roughness of the difference (m) | Power share at or below 34 n | Largest peaks of its second difference |
| --- | --: | --: | --- |
${doc.tesseral.map((x) => `| ${x.key.replace(/\|/g, ' ')} | ${f3(x.rough)} | ${f3(x.shareUpTo34n)} | ${peaksLine(x.peaks)} |`).join('\n')}

## Verdict
${doc.verdict ?? ''}
Rule: roughness on 0.4.11 ${f3(v.baseM)} m; first release above twice that: ${v.riseAt ?? 'none'} (${f3(v.riseM)} m). FORCES arms on 0.5.1 back within twice
0.4.11's: ${v.returnedBy.length ? v.returnedBy.map((x) => `${x.arm} ${f3(x.rough)} m (day 3 error ${x.day3 >= 0 ? '+' : ''}${(100 * x.day3).toFixed(1)} %, day 7 ${x.day7 >= 0 ? '+' : ''}${(100 * x.day7).toFixed(1)} % against AP(31,20))`).join('; ') : 'none'}.
Term named: ${v.named ? 'yes' : 'no (inconclusive)'}; moves the error by more than 10 %: ${v.movesError ? 'yes' : 'no'}.
`;
}

if (args.check || args.table) {
  const rows = rowsOf(STORE);
  const t = table(rows);
  const fails = [];
  const bad = t.control.filter((c) => c.missing || !(c.worstMm <= 1));
  if (!t.control.length) fails.push('no control rows');
  if (bad.length) fails.push(`control: ${bad.length} of ${t.control.length} rows off the stored figures by more than 1 mm (${bad.slice(0, 3).map((c) => `${c.key} ${c.arm} ${c.worstMm ?? 'missing'}`).join('; ')})`);
  const pubOk = t.published.measuredM !== null && Math.abs(t.published.measuredM / PUBLISHED.m - 1) <= PUBLISHED.within;
  if (!pubOk) fails.push(`published figure: ${t.published.measuredM} m against ${PUBLISHED.m} m`);
  if (args.table) {
    fs.mkdirSync(OUT, { recursive: true });
    const doc = { registration: 'experiments/operator-theory/THEMIS-ROUGHNESS.md', stepSeconds: STEP_S, builds: BUILDS, rows: rows.length, ...t, verdict: args.verdict ? fs.readFileSync(args.verdict, 'utf8').trim() : null };
    fs.writeFileSync(path.join(OUT, 'table.json'), `${JSON.stringify(doc, null, 1)}\n`);
    fs.writeFileSync(path.join(OUT, 'README.md'), readme(doc));
    console.log('table.json written');
  } else {
    const have = JSON.parse(fs.readFileSync(path.join(OUT, 'table.json'), 'utf8'));
    if (JSON.stringify(have.per) !== JSON.stringify(t.per)) fails.push('table.json per-arm figures differ from the rows');
    if (JSON.stringify(have.control) !== JSON.stringify(t.control)) fails.push('table.json control differs from the rows');
    if (JSON.stringify(have.tesseral) !== JSON.stringify(t.tesseral)) fails.push('table.json tesseral spectra differ from the tracks');
    if (fs.readFileSync(path.join(OUT, 'README.md'), 'utf8') !== readme({ ...have, ...t })) fails.push('README.md differs from the rows');
  }
  const main = (v) => t.per.find((p) => p.arm === `AP(31,20)@${v}`)?.rough;
  const line = `AP roughness median over ${t.per.find((p) => p.arm === 'AP(31,20)@0.5.1')?.windows ?? 0} windows: 0.4.11 ${main('0.4.11')?.toFixed(3)} m, 0.5.1 ${main('0.5.1')?.toFixed(3)} m, 0.6.0 ${main('0.6.0')?.toFixed(3)} m; published THEMIS D 2013-02-13 on 0.5.1 ${t.published.measuredM?.toFixed(3)} m (figure ${PUBLISHED.m} m); control ${t.control.length - bad.length}/${t.control.length} within 1 mm`;
  if (fails.length) { console.log(`THEMIS ROUGHNESS CHECK FAIL: ${fails.join('; ')}; ${line}`); process.exit(1); }
  console.log(`THEMIS ROUGHNESS CHECK PASS: ${line}`);
  process.exit(0);
}

if (!args.run) throw new Error('--run, --table or --check');
// ---- flight ----
const { pathToFileURL } = await import('node:url');
const { createRequire } = await import('node:module');
const { config, root, iso, ms, XM } = await import('./lib/xp2.mjs');
const { apForces, fitPcf } = await import('./lib/ap.mjs');
const { openAxes } = await import('./lib/host.mjs');
const { HX, windowKey } = await import('./lib/regimes.mjs');
const { modulesRoot } = await import('../xp-atmosphere-merit/common.mjs');
const S = await import(path.join(root, config.xm.dir, 'lib/sds.mjs'));
const T = await import(path.join(root, config.xm.dir, 'lib/truth.mjs'));
const { openModules } = await import(path.join(root, config.xm.dir, 'lib/modules.mjs'));
const { spkObjectSeries } = await import(pathToFileURL(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/spk-sources.mjs')).href);
const GIT = process.env.SDN_MODULES_GIT ?? modulesRoot(), SCRATCH = args.builds ?? path.join(STORE, 'builds');
const [SHARD, SHARDS] = (args.shard ?? '0/1').split('/').map(Number);
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const MIN_COV = XM.config.fit.minimumCoverage, MIN_BIN = XM.config.scoring.binMinimumEpochs, LEADS = XM.config.scoring.leadDays;
if (XM.config.scoring.gridSeconds !== STEP_S) throw new Error(`XM's grid is ${XM.config.scoring.gridSeconds} s, registered ${STEP_S} s`);

/** A build's wasm and manifest by git show at its commit, SHA-256 checked. */
function buildFile(b) {
  const dir = path.join(SCRATCH, b.commit), file = path.join(dir, 'module.wasm');
  if (!fs.existsSync(file) || sha256(fs.readFileSync(file)) !== b.sha256) {
    const show = (p) => execFileSync('git', ['-C', GIT, 'show', `${b.commit}:propagator/sdn-ap/${p}`], { maxBuffer: 1 << 28 });
    const bytes = show('dist/isomorphic/module.wasm');
    if (sha256(bytes) !== b.sha256) throw new Error(`sdn-ap ${b.version} at ${b.commit} is ${sha256(bytes)}, registered ${b.sha256}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'plugin-manifest.json'), show('plugin-manifest.json'));
    fs.writeFileSync(file, bytes);
  }
  return file;
}
const entry = createRequire(path.join(modulesRoot(), 'propagator/sdn-ap/package.json')).resolve('space-data-module-sdk/testing/isomorphic');
const { createStandaloneHarness } = await import(pathToFileURL(entry).href);
const harnesses = new Map();
async function open(version) {
  if (harnesses.has(version)) return harnesses.get(version);
  const b = byVersion[version], h = await createStandaloneHarness('browser', buildFile(b), { surface: 'direct' });
  const call = async (methodId, inputs) => {
    const r = await h.invoke({ methodId, inputs });
    if (r.statusCode !== 0) throw new Error(`${methodId}: ${r.errorCode}: ${String(r.errorMessage).slice(0, 200)}`);
    return r.outputs;
  };
  const port = (outs, id) => new Uint8Array(outs.find((o) => o.portId === id).payload);
  const api = b.api === 'ocm' ? {
    fit: async (oem, pcf) => port(await call('fit', [{ portId: 'ephemeris', typeRef: S.TYPE('OEM'), payload: oem }, { portId: 'configuration', typeRef: S.TYPE('PCF'), payload: pcf }]), 'elements'),
    fly: async (set, epochs) => S.oemLines(port(await call('propagate', [{ portId: 'ocm', typeRef: S.TYPE('OCM'), payload: set }, { portId: 'configuration', typeRef: S.TYPE('PCF'), payload: S.flightPcfBytes(epochs) }]), 'ephemeris')),
    meanMotion: (set) => S.readFitOcm(set).o.MEAN_ELEMENTS?.MEAN_MOTION ?? null,
  } : {
    fit: async (oem, pcf) => port(await call('fit', [{ portId: 'ephemeris', typeRef: S.TYPE('OEM'), payload: oem }, { portId: 'configuration', typeRef: S.TYPE('PCF'), payload: pcf }]), 'elements'),
    fly: async (set, epochs, pcf) => S.oemLines(port(await call('propagate', [{ portId: 'omm', typeRef: S.TYPE('OMM'), payload: set }, { portId: 'grid', typeRef: S.TYPE('OEM'), payload: S.gridBytes(epochs) }, { portId: 'configuration', typeRef: S.TYPE('PCF'), payload: pcf }]), 'ephemeris')),
    meanMotion: () => null,
  };
  harnesses.set(version, api);
  return api;
}
/** The fit's $PCF on each path: all-regimes.mjs's PCF_AP_VACUUM and PCF_XP now (one $OCM) and before 0.5.0 (the $OMM path, no ATMOSPHERE_MODEL stated). */
const pcfOf = (api, d, z) => (d === null
  ? (api === 'ocm' ? fitPcf({ forces: {}, fit: null }) : S.pcfBytes({ forces: {}, fit: null }))
  : (api === 'ocm' ? fitPcf({ forces: apForces({ tesseral: d, zonal: z, atmosphere: false }), fit: null }) : S.pcfBytes({ forces: apForces({ tesseral: d, zonal: z, atmosphere: false }), fit: null })));

const m = await openModules();
const ARMS = arms((args.arms ?? 'main,bisect,forces').split(','));
fs.mkdirSync(STORE, { recursive: true });
const outFile = path.join(STORE, `rows-${SHARD}.jsonl`);
const done = new Set(rowsOf(STORE).map((r) => `${r.key}#${r.arm}`));
const inShard = (key) => (!args.only || key === args.only) && parseInt(crypto.createHash('sha256').update(key).digest('hex').slice(0, 8), 16) % SHARDS === SHARD;
const axes = await openAxes();
for (const h of HX.filter((x) => /^THEMIS/.test(x.name))) {
  const keys = h.cutoffs.map((t) => windowKey('HX', h.name, t)).filter(inShard);
  if (!keys.some((k) => ARMS.some((a) => !done.has(`${k}#${a.arm}`)))) continue;
  // all-regimes.mjs spkOnGrid: the kernel's states on the 300 s grid, whole seconds, EME2000 to GCRF by foundation/frames.
  const s = await spkObjectSeries(process.env.SDN_MODULES_ROOT, { files: [h.file], source: 'ap6-heo', id: h.id, name: h.name, norad: h.norad, fromUtc: h.from, toUtc: h.to, stride: 1 });
  const norm = s.lines.map((l) => ({ ...l, epoch: new Date(Date.parse(/Z$/.test(l.epoch) ? l.epoch : `${l.epoch}Z`)).toISOString() }));
  const first = Math.round(ms(norm[0].epoch) / 1000) * 1000;
  const lines = await axes.convert(norm.filter((l) => (Math.round(ms(l.epoch) / 1000) * 1000 - first) % (STEP_S * 1000) === 0).map((l) => ({ ...l, epoch: new Date(Math.round(ms(l.epoch) / 1000) * 1000).toISOString() })), 'EME2000', 'GCRF');
  const times = lines.map((l) => ms(l.epoch));
  const between = (a, b) => lines.filter((_, i) => times[i] >= a && times[i] <= b);
  for (const D0 of h.cutoffs) {
    const key = windowKey('HX', h.name, D0);
    if (!inShard(key)) continue;
    const after = between(D0 + 1, D0 + 7 * DAY), f0 = ms(after[0].epoch);
    const grid = after.filter((l) => (ms(l.epoch) - f0) % (STEP_S * 1000) === 0);
    const epochs = grid.map((l) => l.epoch), tMs = epochs.map(ms), truth = grid.map((l) => ({ r: l.r, v: l.v }));
    const bins = Object.fromEntries(LEADS.map((k) => [k, tMs.map((t, i) => i).filter((i) => tMs[i] > D0 + (k - 1) * DAY && tMs[i] <= D0 + k * DAY)]));
    const raw = between(D0 - ARC_H * HOUR, D0);
    const coverage = raw.length > 1 ? raw.length / ((ARC_H * 3600) / ((ms(raw[1].epoch) - ms(raw[0].epoch)) / 1000)) : 0;
    const thin = coverage >= MIN_COV ? T.thinned(raw).chosen : null;
    const oem = thin && S.oemBytes({ frame: 'GCRF', object: { name: h.name, id: h.objectId, norad: h.norad }, lines: thin, useableStart: thin[0].epoch, useableStop: iso(D0) });
    const sets = new Map();
    for (const a of ARMS) {
      if (done.has(`${key}#${a.arm}`)) continue;
      const row = { key, name: h.name, cutoff: iso(D0), arm: a.arm, set: a.set, fit: a.fit, fly: a.fly, d: a.d, z: a.z, fitSha256: byVersion[a.fit].sha256, flySha256: byVersion[a.fly].sha256, ok: false };
      const t0 = Date.now();
      try {
        if (!oem) throw new Error('coverage');
        const F = await open(a.fit), P = await open(a.fly);
        if (byVersion[a.fit].api !== byVersion[a.fly].api) throw new Error('fit and flight on different record paths');
        const pcf = pcfOf(byVersion[a.fit].api, a.d, a.z);
        const sk = `${a.fit}|${a.d}|${a.z}`;
        if (!sets.has(sk)) sets.set(sk, await F.fit(oem, pcf));
        const set = sets.get(sk);
        const flown = await P.fly(set, epochs, pcf);
        if (flown.length !== epochs.length) throw new Error(`flight returned ${flown.length} of ${epochs.length} states`);
        const ric = (await m.rtn(await m.toAxes(flown, epochs, 'GCRF'), truth)).map((q) => q.map((x) => x * 1000));
        const st = roughness(tMs, ric, D0);
        // Where on the orbit: the roughness of the triples whose middle sample lies inside and outside the window's median reference radius.
        const radius = truth.map((x) => Math.hypot(...x.r)), mid = median(radius), pick = (inner) => median(st.d2.filter((x) => (radius[x.i] < mid) === inner).map((x) => x.n));
        row.byRadius = { medianRadiusKm: mid, inner: pick(true), outer: pick(false) };
        // The control: the stored rule's bins (at least MIN_BIN epochs), 3D RMS in km.
        row.control = Object.fromEntries(LEADS.filter((k) => bins[k].length >= MIN_BIN).map((k) => [k, Math.hypot(...[0, 1, 2].map((c) => rms(bins[k].map((i) => ric[i][c] / 1000))))]));
        const { d2, ...rest } = st;
        Object.assign(row, rest, { ok: true, states: epochs.length });
        if (a.set === 'main' || a.arm.startsWith('AP(0,20)')) row.peaks = peaks(d2, F.meanMotion(set));
        fs.mkdirSync(path.join(STORE, 'tracks'), { recursive: true });
        fs.writeFileSync(path.join(STORE, 'tracks', `${crypto.createHash('sha256').update(`${key}#${a.arm}`).digest('hex').slice(0, 16)}.f32`), Buffer.from(Float32Array.from(ric.flat()).buffer));
      } catch (error) { row.error = String(error?.message ?? error).slice(0, 200); }
      row.seconds = (Date.now() - t0) / 1000;
      fs.appendFileSync(outFile, `${JSON.stringify(row)}\n`);
      console.error(`${key} ${a.arm}: ${row.ok ? `rough ${row.rough.toFixed(3)} m, day 3 ${row.days[3]?.e.toFixed(1)} m` : row.error} (${row.seconds.toFixed(1)} s)`);
    }
  }
}
await axes.close();
await m.close();
console.error(`shard ${SHARD}/${SHARDS}: done`);
process.exit(0);
