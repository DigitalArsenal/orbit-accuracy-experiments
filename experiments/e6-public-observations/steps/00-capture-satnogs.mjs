// Captures SatNOGS Network observation metadata for E6's objects (one API
// window per UTC day, every page), the SatNOGS DB transmitters of each
// object, and the waterfall image of every observation that may show the
// signal. Files go under config.inputs.satnogs with provenance.jsonl.
// Capture only: nothing here reads a waterfall's content.
//   node experiments/e6-public-observations/steps/00-capture-satnogs.mjs [--waterfalls] [--norad 25544] [--cached] [--from ISO] [--to ISO]
import path from 'node:path';
import { cli, config, days } from '../common.mjs';
import { capture } from '../fetch.mjs';

const { values, satnogs } = cli({ waterfalls: { type: 'boolean' }, norad: { type: 'string' }, cached: { type: 'boolean' }, from: { type: 'string' }, to: { type: 'string' } });
const s = config.sources.satnogs;
const http = capture({ root: satnogs, userAgent: config.sources.userAgent, minIntervalMs: s.minIntervalMs });
const nextOf = (link) => /<([^>]+)>;\s*rel="next"/.exec(link ?? '')?.[1] ?? null;

let pages = 0, observations = 0, images = 0;
for (const [norad, object] of Object.entries(s.objects)) {
  if (values.norad && values.norad !== norad) continue;
  await http.get(`${s.transmitters}?satellite__norad_cat_id=${norad}`, `db/transmitters-${norad}.json`);
  const all = [];
  for (const [from, to] of object.spans) {
    for (const day of days(from, to)) {
      let url = `${s.api}?norad_cat_id=${norad}&start=${day}T00:00:00Z&end=${day}T23:59:59Z`;
      for (let k = 0; url; ++k) {
        // --cached: only the pages already captured (no API request).
        if (values.cached && !http.has(`observations/${norad}/${day}-p${k}.json`)) break;
        const page = await http.get(url, `observations/${norad}/${day}-p${k}.json`);
        ++pages;
        const list = JSON.parse(page.bytes);
        all.push(...list.filter((o) => String(o.norad_cat_id) === norad));
        url = nextOf(page.link);
      }
    }
  }
  observations += all.length;
  console.log(`${norad} ${object.name}: ${all.length} observations`);
  if (!values.waterfalls) continue;
  for (const o of all) {
    if (values.from && o.start < values.from) continue;
    if (values.to && o.start >= values.to) continue;
    if (!o.waterfall || !(o.status === 'good' || o.waterfall_status === 'with-signal') || !(o.max_altitude >= 15)) continue;
    const name = path.basename(new URL(o.waterfall).pathname);
    const got = await http.get(o.waterfall, `waterfalls/${norad}/${name}`);
    if (!got.cached) ++images;
    if (images && images % 100 === 0 && !got.cached) console.log(`  ${images} waterfalls`);
  }
}
console.log(JSON.stringify({ pages, observations, newWaterfalls: images }));
