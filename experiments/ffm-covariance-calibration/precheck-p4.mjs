// C2 pre-check P4 (PLAN.md 3.8): the weather rule part 1a used beyond its last observed day, from B1's environment.json (B2
// config.environment): its space-weather rows after 2026-10-23 (decoded by the SDS PRW bindings), and whether the issued products
// that rule needs are archived for C2's cutoffs (2025-10 to 2026-05). Records only.
//   node experiments/ffm-covariance-calibration/precheck-p4.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { frozen, Opened, writeReceipt } from './common.mjs';
import { b2 } from './lib/precise.mjs';

frozen();
const opened = new Opened();
const B2C = JSON.parse(opened.read(b2('config.json'), 'B2 config'));
const links = B2C.a12.modulesLinks;
const req = createRequire(path.join(fs.realpathSync(path.join(links, 'analysis/od')), 'package.json'));
const P = await import(pathToFileURL(path.join(path.dirname(req.resolve('spacedatastandards.org/package.json')), 'lib/js/PRW/main.js')));
const fb = await import(pathToFileURL(req.resolve('flatbuffers')));
const env = JSON.parse(opened.read(B2C.environment.file, 'B1 environment.json'));
const rows = P.PRW.getSizePrefixedRootAsPRW(new fb.ByteBuffer(new Uint8Array(Buffer.from(env.inputs.space_weather, 'base64')))).unpack().SPACE_WEATHER.ROWS;
const pick = (r) => ({ date: r.DATE, kp: [r.KP1, r.KP2, r.KP3, r.KP4, r.KP5, r.KP6, r.KP7, r.KP8], ap3h: [r.AP1, r.AP2, r.AP3, r.AP4, r.AP5, r.AP6, r.AP7, r.AP8], apDaily: r.AP_AVG, f107: r.F107_OBS, f107Type: r.F107_DATA_TYPE, f107Centred81: r.F107_OBS_CENTER81, f107Last81: r.F107_OBS_LAST81 });
const tail = rows.filter((r) => r.DATE >= '2026-10-21').map(pick);
const swpc = '/opt/data/sdn-archive/hac/noaa-swpc';
const days = fs.readdirSync(opened.add(path.join(swpc, '2026'), 'listing')).filter((d) => /^\d{4}-\d\d-\d\d$/.test(d)).sort();
const outlooks = days.filter((d) => fs.existsSync(path.join(swpc, '2026', d, '27-day-outlook.txt')));
const forecasts = days.filter((d) => fs.existsSync(path.join(swpc, '2026', d, '3-day-forecast.txt')));
const rsga = fs.readdirSync(opened.add(path.join(swpc, 'warehouse'), 'listing')).filter((n) => /RSGA/.test(n));
console.log(writeReceipt('precheck-P4', {
  plan: '3.8 P4', environment: { file: B2C.environment.file, sha256: B2C.environment.sha256, created: env.provenance.createdUtc },
  rowsAfterObserved: tail,
  rule: 'B1 rows end observed on 2026-10-23 (F10.7 type 2 from that day; 3-hourly ap -1 from 2026-10-24). From 2026-10-24: daily Ap and F10.7 that change day by day through 2026-11-02 (the NOAA SWPC 27-day outlook form, observed 81-day means held from 2026-10-25), and 3-hourly Kp from the 3-day forecast, its last day held after it',
  archive: { outlooksArchived: outlooks.length ? [outlooks[0], outlooks.at(-1)] : null, forecastsArchived: forecasts.length ? [forecasts[0], forecasts.at(-1)] : null, rsgaWarehouse: rsga },
  outcome: outlooks.length && outlooks[0] <= '2025-10-01' ? 'O\' reproducible at C2 cutoffs' : 'O\' NOT reproducible at C2 cutoffs (2025-10-03 to 2026-05-31): the 27-day outlooks and 3-day forecasts are archived only from 2026-10; per PLAN.md 3.8 P4 the documented alternative is XM\'s RSGA condition O (RSGA archived yearly). R1/R2 are held for A12 part 2 in any case',
}, opened));
