// Part 1a's forecast sample (PLAN.md): config.part1.starlink.forecastSample satellites in SHA-256(`B2|<NORAD>`) order from the registration
// cycle; each one's current SpaceX file fetched once, in memory, requests at least requestSpacingSeconds apart; only its states every
// stepMinutes up to 72 h after its first epoch are kept (EME2000, km, km/s, as the file), with the file's header and SHA-256, under
// <store>/forecast/<NORAD>.json. Re-running skips satellites already kept.
//   --refetch <cycle id> (amendments A1, A10): after the forecast cycle, a sample satellite whose kept file is not that cycle's file is fetched
//   once more, by that file's name as the capture records it (the first fetch kept as <NORAD>.first.json); the fetched file is that file only
//   when its ETag and the SHA-256 of its first 262,144 bytes equal the capture's.
//   node experiments/sdn-ap-mixed-screening/fetch-forecast.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { setTimeout as sleep } from 'node:timers/promises';
import { config, store, frozen, sha256, write, g1Dir } from './common.mjs';

frozen();
const S = config.part1.starlink;
const { parseMeme, memeHeader } = await import(path.join(g1Dir, 'lib/sources.mjs'));
const ROOT = 'https://api.starlink.com/public-files/ephemerides';
const lock = path.join(store, 'fetch.lock');
async function polite(url, { withEtag = false } = {}) {
  for (;;) {
    let last = 0;
    try { last = fs.statSync(lock).mtimeMs; } catch { /* first request */ }
    const wait = last + S.requestSpacingSeconds * 1000 - Date.now();
    if (wait <= 0) break;
    await sleep(wait + Math.random() * 400);
  }
  fs.mkdirSync(store, { recursive: true });
  fs.writeFileSync(lock, String(Date.now()));
  const response = await fetch(url, { signal: AbortSignal.timeout(180000), headers: { 'user-agent': 'orbit-accuracy-experiments/b2 (github.com/DigitalArsenal/orbit-accuracy-experiments)' } });
  if (response.status === 403 || response.status === 429) throw new Error(`HTTP ${response.status}: stop`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  return withEtag ? { bytes, etag: response.headers.get('etag') } : bytes;
}
const cycle = path.join(S.captureRoot, S.registrationCycle);
const norads = fs.readdirSync(cycle).filter((f) => /^\d+\.json\.gz$/.test(f)).map((f) => Number(f.split('.')[0]));
const sample = norads.map((n) => ({ n, key: sha256(Buffer.from(`${S.salt}|${n}`)) })).sort((a, b) => (a.key < b.key ? -1 : 1)).slice(0, S.forecastSample).map((x) => x.n);
const outDir = path.join(store, 'forecast');
fs.mkdirSync(outDir, { recursive: true });
const refetch = process.argv.includes('--refetch') ? process.argv[process.argv.indexOf('--refetch') + 1] : null;
if (!refetch) write(path.join(store, 'forecast-sample.json'), { rule: `SHA-256(${S.salt}|NORAD) order over ${S.registrationCycle}`, candidates: norads.length, sample });
const names = refetch ? [] : (await polite(`${ROOT}/MANIFEST.txt`)).toString('utf8').split('\n').map((l) => l.trim()).filter(Boolean);
let kept = 0, missing = 0;
for (const norad of sample) {
  const out = path.join(outDir, `${norad}.json`);
  if (refetch && fs.existsSync(out)) {
    const kept0 = JSON.parse(fs.readFileSync(out));
    const fc = path.join(S.captureRoot, refetch, `${norad}.json.gz`);
    if (!fs.existsSync(fc)) continue;
    const F = JSON.parse(zlib.gunzipSync(fs.readFileSync(fc))).source;
    if (!kept0.error && Date.parse(kept0.firstEpoch) === Date.parse(F.startUtc)) { kept += 1; continue; }
    if (fs.existsSync(path.join(outDir, `${norad}.first.json`))) continue; // fetched once more already
    fs.renameSync(out, path.join(outDir, `${norad}.first.json`));
    // A10: F by its name, identified by the capture's ETag and the SHA-256 of its first 262,144 bytes
    let got;
    try { got = await polite(F.url ?? `${ROOT}/${F.name}`, { withEtag: true }); } catch (error) { if (/stop/.test(error.message)) throw error; write(out, { norad, name: F.name, error: String(error.message), retrievedUtc: new Date().toISOString() }); continue; }
    const same = got.etag === F.etag && sha256(got.bytes.subarray(0, F.range[1] + 1)) === F.sha256;
    if (!same) { write(out, { norad, name: F.name, error: 'the fetched file is not the captured F (ETag or SHA-256 of its first bytes differ)', etag: got.etag, retrievedUtc: new Date().toISOString() }); continue; }
    const text = got.bytes.toString('utf8'), all = parseMeme(text), t0 = Date.parse(all[0].epoch), step = S.stepMinutes * 60000;
    const states = all.filter((l) => { const t = Date.parse(l.epoch); return (t - t0) % step === 0 && t - t0 <= 72 * 3600e3; });
    write(out, { norad, name: F.name, sha256: sha256(got.bytes), bytes: got.bytes.length, etag: got.etag, identity: 'ETag and first-bytes SHA-256 equal the capture of F (A10)', header: memeHeader(text), retrievedUtc: new Date().toISOString(), frame: 'EME2000', firstEpoch: all[0].epoch, states });
    kept += 1;
    continue;
  }
  if (fs.existsSync(out)) { kept += 1; continue; }
  const name = names.find((f) => f.startsWith(`MEME_${norad}_`));
  if (!name) { missing += 1; write(out, { norad, error: 'not in the manifest', retrievedUtc: new Date().toISOString() }); continue; }
  let bytes;
  try { bytes = await polite(`${ROOT}/${name}`); } catch (error) { if (/stop/.test(error.message)) throw error; write(out, { norad, name, error: String(error.message), retrievedUtc: new Date().toISOString() }); continue; }
  const text = bytes.toString('utf8');
  const header = memeHeader(text);
  const all = parseMeme(text);
  const t0 = Date.parse(all[0].epoch), step = S.stepMinutes * 60000;
  const states = all.filter((l) => { const t = Date.parse(l.epoch); return (t - t0) % step === 0 && t - t0 <= 72 * 3600e3; });
  write(out, { norad, name, sha256: sha256(bytes), bytes: bytes.length, header, retrievedUtc: new Date().toISOString(), frame: 'EME2000', firstEpoch: all[0].epoch, states });
  kept += 1;
  if (kept % 20 === 0) console.error(`forecast: ${kept} of ${sample.length}`);
}
console.error(`forecast: ${kept} kept, ${missing} not in the manifest`);
