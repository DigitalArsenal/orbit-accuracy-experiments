// LEO-PL truth: Planet's per-satellite CCSDS OEMs at ephemerides.planet-labs.com (<hwid>_oem.txt: EME2000, UTC, 60 s
// states over about five days, a covariance block after the states), each replaced in place every few hours, so only the
// current version can be read. Amendment A4: the version is the one with the latest start at or before the target among
// those read; here, the current one when it starts at or before the target. planet_mc.tle crosswalks the hardware id to
// the NORAD number (identity only). The states are read by files/orbit-products read_container (WASM) from a prefix of the
// file (Range GET) that reaches past the target's window.
import { readContainer } from '../../../supgp-omm/lib/readers/container.mjs';
import { summarizeOem } from '../../../supgp-omm/lib/records.mjs';
import { config } from '../windows.mjs';
import { eachLimit, isoZ, itemOf, sha256 } from './common.mjs';

export const id = 'planet';
export const regime = 'LEO-PL';
export const live = true;
const BASE = 'https://ephemerides.planet-labs.com/';
const FIRST = 24000;   // about 3.5 h of states and the header

async function crosswalk(http) {
  const res = await http.get(`${BASE}planet_mc.tle`);
  if (res.status !== 200 || !res.body) throw new Error(`planet_mc.tle: HTTP ${res.status} ${res.error ?? ''}`);
  const lines = res.body.toString('utf8').split(/\r?\n/);
  const hwid = new Map();
  for (let i = 0; i + 1 < lines.length; ++i) if (lines[i].startsWith('0 ') && lines[i + 1].startsWith('1 ')) hwid.set(Number(lines[i + 1].slice(2, 7)), lines[i].trim().split(/\s+/).at(-1).toLowerCase());
  return { hwid, lastModified: res.headers.lastModified };
}

// A prefix of the file, cut to whole lines, read by the module.
async function readPrefix(http, readers, url, bytes) {
  const res = await http.get(url, { range: [0, bytes - 1] });
  if (res.status !== 200 && res.status !== 206) return { error: `HTTP ${res.status}` };
  const cut = res.body.lastIndexOf(0x0a);
  const body = cut > 0 ? res.body.subarray(0, cut + 1) : res.body;
  const orbitProducts = await readers.module('files/orbit-products');
  const { ephemeris } = await readContainer(orbitProducts, body, { kvn: true });
  return { oem: ephemeris, summary: summarizeOem(ephemeris), res, bytes: res.body.length };
}

export async function acquire({ http, readers, log, targetMs, wanted }) {
  const tolMs = config.targetToleranceSeconds * 1000;
  const { hwid, lastModified } = await crosswalk(http);
  const items = [];
  const coverage = { truth: id, regime, targetUtc: isoZ(targetMs), crosswalk: { satellites: hwid.size, lastModified }, wanted: 0, startsAfterTarget: 0, readFailures: 0, items: 0, missing: 0 };
  const jobs = [...hwid].filter(([norad]) => !wanted || wanted.has(norad));
  coverage.wanted = jobs.length;
  await eachLimit(jobs, 4, async ([norad, hw]) => {
    const url = `${BASE}${hw}_oem.txt`;
    try {
      let got = await readPrefix(http, readers, url, FIRST);
      if (got.error) { ++coverage.readFailures; return; }
      if (got.summary.firstMs > targetMs) { ++coverage.startsAfterTarget; items.push({ norad, regime, missing: `the current version starts at ${isoZ(got.summary.firstMs)}, after the target`, truth: { source: id, url } }); return; }
      if (got.summary.lastMs < targetMs + tolMs) {
        // Longer prefix: the states per byte of the first one, to the window's end and a margin.
        const perState = (got.bytes - 2000) / Math.max(1, got.summary.states);
        const need = Math.ceil(2000 + ((targetMs + tolMs - got.summary.firstMs) / ((got.summary.stepSeconds ?? 60) * 1000) + 20) * perState);
        got = await readPrefix(http, readers, url, need);
        if (got.error) { ++coverage.readFailures; return; }
      }
      items.push(itemOf({ norad, regime, oem: got.oem, name: hw, targetMs, truth: { source: id, version: `${hw}_oem.txt@${isoZ(got.summary.firstMs)}`, url, startUtc: isoZ(got.summary.firstMs), publishedUtc: isoZ(Date.parse(got.res.headers.lastModified)), bytes: got.bytes, sha256: sha256(got.res.body) } }));
    } catch (e) {
      ++coverage.readFailures;
      log(`planet ${hw}: ${String(e.message).slice(0, 160)}`);
    }
  });
  coverage.items = items.filter((x) => !x.missing).length;
  coverage.missing = items.filter((x) => x.missing).length;
  log(`planet ${coverage.targetUtc}: ${coverage.items} satellites with truth of ${coverage.wanted}; ${coverage.startsAfterTarget} versions start after the target; ${coverage.readFailures} failures`);
  return { items, coverage };
}
