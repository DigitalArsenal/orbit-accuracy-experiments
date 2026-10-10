// Captures the SeeSat-L monthly archives E6 reads (hypermail pages at
// satobs.org): each month's date index and every message page whose subject
// it lists. Files go under config.inputs.seesat with provenance.jsonl.
// Capture only.
//   node experiments/e6-public-observations/steps/01-capture-seesat.mjs
import { cli, config } from '../common.mjs';
import { capture } from '../fetch.mjs';

const { seesat } = cli();
const s = config.sources.seesat;
const http = capture({ root: seesat, userAgent: config.sources.userAgent, minIntervalMs: s.minIntervalMs });
let messages = 0;
for (const month of s.months) {
  // The current month's index changes: it is captured under the capture day.
  const current = month === new Date().toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }) + '-' + new Date().getUTCFullYear();
  const indexName = current ? `${month}/date-${new Date().toISOString().slice(0, 10)}.html` : `${month}/date.html`;
  const index = (await http.get(`${s.base}${month}/date.html`, indexName)).bytes.toString('latin1');
  const pages = [...new Set([...index.matchAll(/href="(\d{4})\.html"/g)].map((m) => m[1]))].sort();
  for (const p of pages) { await http.get(`${s.base}${month}/${p}.html`, `${month}/${p}.html`); ++messages; }
  console.log(`${month}: ${pages.length} messages`);
}
console.log(JSON.stringify({ messages }));
