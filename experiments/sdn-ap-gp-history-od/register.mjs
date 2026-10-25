// Registration step: the window list of PLAN.md section 3, written to windows.json before any window is fitted or scored.
// It reads only the identities of the section 12.3 windows (source, object, NORAD id, start) from the local G1 row files and
// the Starlink truth descriptors; no row's score or fit result is read or written.
//   node experiments/sdn-ap-gp-history-od/register.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const here = path.dirname(new URL(import.meta.url).pathname);
const config = JSON.parse(fs.readFileSync(path.join(here, 'config.json'), 'utf8'));
const store = process.env.G1_STORE ?? config.g1Store;
const FIT_SECONDS = config.window.fitSeconds;
const archiveStartMs = Date.parse(config.gp.firstCreationUtc);

const windows = [];
for (const regime of config.regimes) {
  for (const file of regime.rows ?? []) {
    for (const line of fs.readFileSync(path.join(store, 'rows', `${file}.jsonl`), 'utf8').split('\n').filter(Boolean)) {
      const row = JSON.parse(line);
      if (row.fitSeconds !== FIT_SECONDS) continue;
      windows.push({ regime: regime.id, source: row.source, id: row.id, norad: row.norad, startUtc: row.startUtc });
    }
  }
}
// Starlink: one window per fitted satellite, from the start of its FFM-propagated truth
for (const name of fs.readdirSync(path.join(store, 'truth')).filter((n) => /^\d+\.json$/.test(n)).sort((a, b) => parseInt(a) - parseInt(b))) {
  const meta = JSON.parse(fs.readFileSync(path.join(store, 'truth', name), 'utf8'));
  windows.push({ regime: 'leo-starlink', source: 'starlink-ffm', id: `STARLINK (${meta.norad})`, norad: meta.norad, startUtc: new Date(Date.parse(`${meta.truth.epochUtc.replace(/Z?$/, 'Z')}`)).toISOString() });
}
const kept = windows.filter((w) => Date.parse(w.startUtc) + FIT_SECONDS * 1000 >= archiveStartMs + config.gp.minimumHistoryDays * 86400e3);
const dropped = windows.length - kept.length;
kept.sort((a, b) => (a.regime < b.regime ? -1 : a.regime > b.regime ? 1 : a.norad - b.norad || (a.startUtc < b.startUtc ? -1 : a.startUtc > b.startUtc ? 1 : 0)));
const counts = {};
for (const w of kept) { counts[w.regime] ??= { windows: 0, objects: new Set() }; counts[w.regime].windows += 1; counts[w.regime].objects.add(w.norad); }
const summary = Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, { windows: v.windows, objects: v.objects.size }]));
const body = { experiment: config.experiment, registeredUtc: config.registeredUtc, windows: kept };
fs.writeFileSync(path.join(here, 'windows.json'), `${JSON.stringify(body)}\n`);
console.log(JSON.stringify({ registered: kept.length, droppedBeforeGpHistory: dropped, byRegime: summary, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(here, 'windows.json'))).digest('hex') }, null, 1));
