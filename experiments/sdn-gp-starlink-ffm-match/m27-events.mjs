// Amendment A14, M27: the outage windows of the GPS NANUs and the QZSS NAQUs, from the local archive (hac/gnss-notices/), to results/sdn-gp-starlink-ffm-match/gnss-notice-events.json: the forecast delta-V outages with
// their actual (summary) intervals, and the other outage notices (maintenance and unusable intervals) as windows. Times, types, satellites and notice numbers only; no notice text.
//   node experiments/sdn-gp-starlink-ffm-match/m27-events.mjs
import fs from 'node:fs';
import path from 'node:path';
import { write, results, sha256 } from './common.mjs';
import { NOTICES, readNanus, readNaqu, deltaVOutages } from './lib/gnss-notices.mjs';

const iso = (ms) => (ms === null || ms === undefined ? null : new Date(ms).toISOString());
const win = (w) => (w ? { start: iso(w.startMs), stop: iso(w.stopMs) } : null);
const other = (notices) => notices.filter((n) => ['FCSTMX', 'UNUSABLE'].includes(n.type) && n.startMs !== null && n.svn).map((n) => ({ number: n.number, type: n.type, svn: Number(n.svn), prn: Number(n.prn), start: iso(n.startMs), stop: iso(n.stopMs ?? n.startMs) }));
const shaOf = (dir, ext) => { const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(ext)).sort() : []; return { files: files.length, setSha256: sha256(JSON.stringify(files.map((f) => [f, sha256(fs.readFileSync(path.join(dir, f)))]))) }; };

const nanus = readNanus(2026), naqu = readNaqu();
const typeCounts = (list) => list.reduce((a, n) => { a[n.type] = (a[n.type] ?? 0) + 1; return a; }, {});
const out = {
  generatedFrom: 'the GPS NANUs of 2026 (NAVCEN archive) and the QZSS NAQU page (retrieved 2026-10-24); times, types, satellites and numbers only',
  gps: { source: shaOf(path.join(NOTICES, 'navcen-gps-nanu/2026'), '.nnu'), notices: nanus.length, types: typeCounts(nanus), lastNumber: nanus.at(-1)?.number ?? null,
    deltaV: deltaVOutages(nanus).map((e) => ({ number: e.number, svn: Number(e.svn), prn: Number(e.prn), forecast: win(e.forecast), actual: win(e.actual), rescheduled: e.rescheduled })), other: other(nanus) },
  qzss: { source: shaOf(path.join(NOTICES, 'qzss-naqu'), '.html'), notices: naqu.length, types: typeCounts(naqu),
    deltaV: deltaVOutages(naqu).map((e) => ({ number: e.number, svn: Number(e.svn), prn: Number(e.prn), signal: e.signal, forecast: win(e.forecast), actual: win(e.actual), rescheduled: e.rescheduled })), other: other(naqu) },
  beidou: { note: 'no orbit notices held: the CSNO test and assessment center (www.csno-tarc.cn) does not answer from this host; en.beidou.gov.cn carries only upgrade and maintenance advisories' },
};
write(path.join(results, 'gnss-notice-events.json'), out);
console.log(`GPS ${out.gps.notices} NANUs (${out.gps.deltaV.length} delta-V outages, ${out.gps.deltaV.filter((e) => e.actual).length} with a summary), QZSS ${out.qzss.notices} NAQUs (${out.qzss.deltaV.length}, ${out.qzss.deltaV.filter((e) => e.actual).length})`);
