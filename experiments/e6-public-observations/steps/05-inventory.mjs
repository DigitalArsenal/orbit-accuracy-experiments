// Inventory (PLAN.md §3): what the captured public observations cover, and
// where they meet public truth. Metadata and counts only: no measurement is
// extracted here. Writes results/e6/inventory.json.
//   node experiments/e6-public-observations/steps/05-inventory.mjs
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { cli, config, home, windowOf } from '../common.mjs';
import { repoRoot } from '../../../harness/provenance.mjs';
import { messageText, parseIod, statedSites } from '../iod.mjs';
import { issCaptures, truthLines } from '../truth.mjs';

const { satnogs, seesat, nodes } = cli();
const out = { generated: new Date().toISOString(), satnogs: {}, seesat: {}, truth: {} };
const count = (map, key) => { map[key] = (map[key] ?? 0) + 1; };

// SatNOGS: every captured observation, by object, status, waterfall status, mode, window.
for (const norad of Object.keys(config.sources.satnogs.objects)) {
  const dir = path.join(satnogs, 'observations', norad);
  if (!fs.existsSync(dir)) continue;
  const byId = new Map();
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) for (const o of JSON.parse(fs.readFileSync(path.join(dir, f)))) if (String(o.norad_cat_id) === norad) byId.set(o.id, o);
  const obs = [...byId.values()];
  const s = { observations: obs.length, days: [...new Set(obs.map((o) => o.start.slice(0, 10)))].sort(), stations: new Set(obs.map((o) => o.ground_station)).size, byStatus: {}, byWaterfall: {}, byMode: {}, byWindow: {}, waterfallsCaptured: 0 };
  s.days = s.days.length ? [s.days[0], s.days.at(-1), s.days.length] : [];
  for (const o of obs) {
    count(s.byStatus, o.status); count(s.byWaterfall, o.waterfall_status); count(s.byMode, `${o.transmitter_mode} ${o.transmitter_downlink_low}`); count(s.byWindow, windowOf(Date.parse(o.start)) ?? 'outside');
    if (o.waterfall && fs.existsSync(path.join(satnogs, 'waterfalls', norad, path.basename(new URL(o.waterfall).pathname)))) ++s.waterfallsCaptured;
  }
  out.satnogs[norad] = s;
}

// SeeSat-L: IOD lines (deduplicated) by object and station; stated sites.
const lines = new Map(), sites = new Map();
for (const month of config.sources.seesat.months) {
  const dir = path.join(seesat, month);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter((n) => /^\d{4}\.html$/.test(n))) {
    const text = messageText(fs.readFileSync(path.join(dir, f), 'latin1'));
    for (const l of text.split('\n')) { const o = parseIod(l); if (o) lines.set(o.raw, o); }
    for (const s of statedSites(text)) sites.set(s.station, s);
  }
}
const iod = [...lines.values()];
out.seesat = {
  lines: iod.length, objects: new Set(iod.map((o) => o.norad)).size, stations: Object.fromEntries(Object.entries(iod.reduce((a, o) => (count(a, o.station), a), {})).sort((a, b) => b[1] - a[1])),
  stationsWithStatedCoordinates: [...sites.keys()].sort(), epochCodes: iod.reduce((a, o) => (count(a, o.epochCode), a), {}), angleFormats: iod.reduce((a, o) => (count(a, o.angleFormat), a), {}),
  sigmaDeg: iod.reduce((a, o) => (count(a, o.sigmaDeg), a), {}),
};

// Truth objects: precise-orbit reference products, ISS OEM, and which of
// them the public observations cover.
const truthObjects = new Map();
const ref = config.inputs.reference;
for (const p of fs.readdirSync(ref)) {
  const f = path.join(ref, p, 'index.json');
  if (!fs.existsSync(f)) continue;
  for (const o of JSON.parse(fs.readFileSync(f)).objects) {
    const family = p.replace(/_\d{11}_.*$/, '').replace(/\.\d{6}\.v\d+$/, '');
    if (!truthObjects.has(o.norad)) truthObjects.set(o.norad, { products: new Set(), from: o.start, to: o.stop });
    const t = truthObjects.get(o.norad);
    t.products.add(family); if (o.start < t.from) t.from = o.start; if (o.stop > t.to) t.to = o.stop;
  }
}
const iss = truthLines(issCaptures({ nodes, archive: home(config.inputs.issOemArchive) }));
out.truth.iss = iss.spans.map((s) => ({ from: new Date(s.from).toISOString(), to: new Date(s.to).toISOString(), captured: s.captured, window: windowOf(s.from) }));
out.truth.referenceObjects = truthObjects.size;
const optical = config.inventory.opticalTruth;
// Counts only (the lines are the observers'; SeeSat-L states no license).
const opticalTruthLines = iod.filter((o) => optical[o.norad] && o.time >= optical[o.norad].from && o.time <= `${optical[o.norad].to}T23:59:59Z`);
out.truth.opticalTruthByObject = Object.fromEntries(Object.entries(opticalTruthLines.reduce((a, o) => {
  const k = optical[o.norad].name; a[k] ??= { lines: 0, stations: new Set(), days: new Set(), truth: optical[o.norad].truth }; a[k].lines++; a[k].stations.add(o.station); a[k].days.add(o.time.slice(0, 10)); return a;
}, {})).map(([k, v]) => [k, { lines: v.lines, stations: v.stations.size, days: v.days.size, first: [...v.days].sort()[0], last: [...v.days].sort().at(-1), truth: v.truth }]));
out.truth.h4 = { lines: opticalTruthLines.length, threshold: config.acceptance.h4.minimumLines, verdict: opticalTruthLines.length >= config.acceptance.h4.minimumLines ? 'supported' : 'not supported' };
out.truth.observedOpticallyReferenceProducts = iod.filter((o) => truthObjects.has(o.norad) || o.norad === 25544 || o.norad === 48274).length;
// Optical observations of objects named STARLINK/FLOCK in the catalogue
// after operator ephemerides were captured (2026-09-09).
const names = new Map();
const gp = path.join(config.inputs.gpHistory, '2026');
for (const f of fs.readdirSync(gp).filter((n) => n.startsWith('2026-09-1')).slice(0, 2)) for (const g of JSON.parse(gunzipSync(fs.readFileSync(path.join(gp, f))))) names.set(Number(g.NORAD_CAT_ID), g.OBJECT_NAME);
out.seesat.operatorObjectsSince20260909 = iod.filter((o) => o.time >= '2026-09-09' && /STARLINK|FLOCK|SKYSAT/.test(names.get(o.norad) ?? '')).length;
out.seesat.byFamily = Object.fromEntries(Object.entries(iod.reduce((a, o) => (count(a, (names.get(o.norad) ?? 'not in the sampled catalogue days').replace(/[-\s]\d.*$/, '').replace(/ R\/B.*/, ' R/B')), a), {})).sort((a, b) => b[1] - a[1]).slice(0, 20));

const file = path.join(repoRoot, 'results/e6/inventory.json');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, `${JSON.stringify(out, null, 1)}\n`);
console.log(JSON.stringify({ satnogs: Object.fromEntries(Object.entries(out.satnogs).map(([k, v]) => [k, { n: v.observations, waterfalls: v.waterfallsCaptured, byWaterfall: v.byWaterfall }])), seesat: { lines: out.seesat.lines, objects: out.seesat.objects, truthHits: out.truth.observedOpticallyReferenceProducts, opticalTruth: out.truth.opticalTruthByObject, h4: out.truth.h4, operatorObjects: out.seesat.operatorObjectsSince20260909 } }, null, 1));
