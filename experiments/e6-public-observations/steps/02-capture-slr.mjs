// Captures the ILRS inputs of E6's laser-ranging arm from the EUROLAB Data
// Center (EDC, DGFI-TUM; no login): the daily CRD normal-point files of each
// target over the arm's span, and the weekly ILRS combined station
// solutions (ilrsa.pos+eop SINEX). Files go under config.inputs.ilrs with
// provenance.jsonl. Capture only.
//   node experiments/e6-public-observations/steps/02-capture-slr.mjs
import { cli, config, days, home } from '../common.mjs';
import { capture } from '../fetch.mjs';

cli();
const S = config.sources.ilrs;
const http = capture({ root: home(config.inputs.ilrs), userAgent: config.sources.userAgent, minIntervalMs: S.minIntervalMs });
let files = 0, missing = 0;
// EDC keeps a month's CRD v2 normal points in <target>_<YYYYMM>.np2 (the v1
// directory holds only the stations that still send v1); a file EDC does
// not hold comes back as an HTML page with status 200.
const notCrd = (bytes) => (/^\s*<(html|!doctype)/i.test(bytes.subarray(0, 64).toString('latin1')) ? 'HTML page' : null);
for (const target of Object.keys(config.slr.targets)) {
  const months = [...new Set(days(S.span[0], S.span[1]).map((d) => d.slice(0, 7)))];
  for (const month of months) {
    const ym = month.replace('-', '');
    try { await http.get(`${S.normalPoints}${target}/${month.slice(0, 4)}/${target}_${ym}.np2`, `npt_crd_v2/${target}/${target}_${ym}.np2`, { reject: notCrd }); ++files; }
    catch (e) { if (!/HTTP 404/.test(e.message)) throw e; ++missing; }
  }
}
// Weekly solutions: the directory names are the solutions' YYMMDD.
for (const year of new Set(days(S.span[0], S.span[1]).map((d) => d.slice(0, 4)))) {
  const listing = (await http.get(`${S.weeklySinex}${year}/`, `pos+eop/weekly-${year}-${new Date().toISOString().slice(0, 10)}.html`)).bytes.toString('latin1');
  for (const yymmdd of [...new Set([...listing.matchAll(/\b(\d{6})\//g)].map((m) => m[1]))]) {
    const day = `20${yymmdd.slice(0, 2)}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`;
    if (day < S.span[0] || day > S.span[1]) continue;
    const name = `ilrsa.pos+eop.${yymmdd}.v90.snx.gz`;
    try { await http.get(`${S.weeklySinex}${year}/${yymmdd}/${name}`, `pos+eop/${name}`); ++files; }
    catch (e) { if (!/HTTP 404/.test(e.message)) throw e; ++missing; }
  }
}
console.log(JSON.stringify({ files, missing }));
