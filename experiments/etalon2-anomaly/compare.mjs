// Every ILRS combined weekly orbit (ilrsa) on this machine against the analysis centers' orbits of the same satellite and week, epoch by epoch,
// in the SP3 files' own Earth-fixed frame (km): for each day, the largest distance between the combination and the median of the centers, and
// the largest distance between any two centers. A day is wrong in the combination when the centers agree within agreeKm and the combination
// lies more than wrongKm from them. Reading and subtraction only.
//   node experiments/etalon2-anomaly/compare.mjs <products directory>... > findings.json
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const AGREE_KM = 0.01, WRONG_KM = 1;
const read = (file) => {
  const out = new Map();
  let t = null;
  for (const line of zlib.gunzipSync(fs.readFileSync(file)).toString('latin1').split('\n')) {
    if (line.startsWith('*')) { const p = line.trim().split(/\s+/); t = `${p[1]}-${p[2].padStart(2, '0')}-${p[3].padStart(2, '0')}T${p[4].padStart(2, '0')}:${p[5].padStart(2, '0')}:${String(Math.round(Number(p[6]))).padStart(2, '0')}Z`; }
    else if (line.startsWith('P') && t) { const p = line.trim().split(/\s+/); const v = p.slice(1, 4).map(Number); if (v.every(Number.isFinite)) out.set(t, v); }
  }
  return out;
};
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const median = (v) => { const a = [...v].sort((x, y) => x - y); return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2; };
const weeks = new Map();
for (const dir of process.argv.slice(2)) {
  for (const f of fs.readdirSync(dir)) {
    const m = /^([a-z]+)\.orb\.([a-z0-9]+)\.(\d{6})\.(v\d+)\.sp3\.gz$/.exec(f);
    if (!m) continue;
    const key = `${m[2]}|${m[3]}`;
    if (!weeks.has(key)) weeks.set(key, {});
    weeks.get(key)[m[1]] ??= path.join(dir, f);
  }
}
const report = { rule: { agreeKm: AGREE_KM, wrongKm: WRONG_KM, frame: 'the SP3 files\' Earth-fixed frame' }, weeksCompared: 0, wrongDays: [], weeks: [] };
for (const [key, centers] of [...weeks.entries()].sort()) {
  if (!centers.ilrsa || Object.keys(centers).length < 3) continue;
  const [satellite, week] = key.split('|');
  const il = read(centers.ilrsa);
  const others = Object.fromEntries(Object.entries(centers).filter(([c]) => c !== 'ilrsa').map(([c, f]) => [c, read(f)]));
  const byDay = {};
  for (const [t, a] of il) {
    const pts = Object.values(others).map((o) => o.get(t)).filter(Boolean);
    if (pts.length < 2) continue;
    const day = t.slice(0, 10), d = median(pts.map((p) => dist(a, p)));
    let spread = 0;
    for (const p of pts) for (const q of pts) spread = Math.max(spread, dist(p, q));
    const e = (byDay[day] ??= { epochs: 0, maxKm: 0, centerSpreadKm: 0, wrong: [] });
    e.epochs += 1; e.maxKm = Math.max(e.maxKm, d); e.centerSpreadKm = Math.max(e.centerSpreadKm, spread);
    if (d > WRONG_KM) e.wrong.push({ epoch: t, km: Number(d.toFixed(3)), zeroAxes: ['X', 'Y', 'Z'].filter((_, k) => a[k] === 0) });
  }
  report.weeksCompared += 1;
  const days = Object.values(byDay);
  report.weeks.push({ satellite, week, centers: Object.keys(others).sort(), epochs: days.reduce((x, e) => x + e.epochs, 0), maxKm: Number(Math.max(...days.map((e) => e.maxKm)).toFixed(4)), centerSpreadKm: Number(Math.max(...days.map((e) => e.centerSpreadKm)).toFixed(4)) });
  for (const [day, e] of Object.entries(byDay)) if (e.maxKm > WRONG_KM && e.centerSpreadKm < AGREE_KM) report.wrongDays.push({ satellite, week, day, maxKm: Number(e.maxKm.toFixed(3)), centerSpreadKm: Number(e.centerSpreadKm.toFixed(4)), centers: Object.keys(others).length, wrongEpochs: e.wrong, epochsOfDay: e.epochs });
}
process.stdout.write(`${JSON.stringify(report, null, 1)}\n`);
