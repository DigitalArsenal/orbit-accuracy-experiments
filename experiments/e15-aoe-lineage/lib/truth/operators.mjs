// Operator truth read through the SupGP pass's sources (experiments/supgp-omm/sources), in memory:
// - ISS: NASA's OEM (one file, replaced in place). PLAN.md section 3 gives it Starlink's rule: a version published
//   (its CREATION_DATE, amendment A4) at or before t whose start is within 1 h of t.
// - CSS: CMSE's weekly OEM ZIP; the station's core and its two modules fly one orbit, so the one ephemeris is the truth
//   of all three catalog numbers.
// - GEO: Intelsat's and SES's IESS-412 eleven-parameter files, evaluated by files/orbit-products and taken from the
//   Earth-fixed frame to GCRF by analysis/reference-states with IERS EOP. The satellites are named in the files; CelesTrak's
//   SupGP rows (collector archive) crosswalk the names to NORAD numbers (identity only).
// Amendment A4: where several versions can be read, the one with the latest start at or before the target.
import * as iss from '../../../supgp-omm/sources/iss.mjs';
import * as css from '../../../supgp-omm/sources/css.mjs';
import * as intelsat from '../../../supgp-omm/sources/intelsat.mjs';
import * as ses from '../../../supgp-omm/sources/ses.mjs';
import { readSnapshot } from '../../../supgp-omm/lib/supgp.mjs';
import { summarizeOem, unpackOem } from '../../../supgp-omm/lib/records.mjs';
import { PATHS } from '../../settings.mjs';
import { config } from '../windows.mjs';
import { isoZ, itemOf, sha256 } from './common.mjs';

const loaderFor = (readers) => (rel) => readers.module(rel);
async function ecefReaders(readers) {
  return { orbitProducts: await readers.module('files/orbit-products'), ecef: { referenceStates: await readers.module('analysis/reference-states'), rows: (await readers.eop()).rows } };
}

export const issTruth = {
  id: 'iss', regime: 'ISS', live: true,
  async acquire({ http, readers, log, targetMs }) {
    const rule = config.regimes.ISS.rule;
    const coverage = { truth: 'iss', regime: 'ISS', targetUtc: isoZ(targetMs), items: 0, missing: 0 };
    const ctx = await iss.prepare({ http });
    const { oem } = await iss.read({ readers: { orbitProducts: await readers.module('files/orbit-products') }, bytes: ctx.body });
    const header = unpackOem(oem);
    const s = summarizeOem(oem);
    const createdMs = Date.parse(`${String(header.CREATION_DATE ?? '').replace(/Z?$/, 'Z')}`);
    const truth = { source: 'iss', version: `ISS.OEM_J2K_EPH.txt@${header.CREATION_DATE}`, url: iss.URL_OEM, startUtc: isoZ(s.firstMs), publishedUtc: isoZ(createdMs), lastModified: ctx.provenance.lastModified, bytes: ctx.body.length, sha256: ctx.provenance.sha256 };
    coverage.version = truth;
    let item;
    if (!(s.firstMs <= targetMs && s.firstMs >= targetMs - rule.maxStartAgeSeconds * 1000)) item = { norad: iss.NORAD, regime: 'ISS', missing: `the version starts at ${isoZ(s.firstMs)}, not within the hour before the target`, truth };
    else if (rule.publishedAtOrBefore && !(createdMs <= targetMs)) item = { norad: iss.NORAD, regime: 'ISS', missing: `the version was created at ${isoZ(createdMs)}, after the target`, truth };
    else item = itemOf({ norad: iss.NORAD, regime: 'ISS', oem, name: 'ISS', targetMs, truth });
    coverage.items = item.missing ? 0 : 1;
    coverage.missing = item.missing ? 1 : 0;
    log(`iss ${coverage.targetUtc}: ${item.missing ?? 'truth'}`);
    return { items: [item], coverage };
  },
};

export const cssTruth = {
  id: 'css', regime: 'CSS', live: true,
  async acquire({ http, readers, log, targetMs }) {
    const coverage = { truth: 'css', regime: 'CSS', targetUtc: isoZ(targetMs), items: 0, missing: 0 };
    const ctx = await css.prepare({ http, log });
    const { oem } = await css.read({ readers: { orbitProducts: await readers.module('files/orbit-products') }, bytes: ctx.body });
    const s = summarizeOem(oem);
    const truth = { source: 'css', version: ctx.url.split('/').at(-1), url: ctx.url, startUtc: isoZ(s.firstMs), publishedUtc: ctx.provenance.lastModified ? isoZ(Date.parse(ctx.provenance.lastModified)) : null, bytes: ctx.body.length, sha256: ctx.provenance.sha256 };
    coverage.version = truth;
    const items = config.regimes.CSS.objects.map((norad) => (s.firstMs > targetMs
      ? { norad, regime: 'CSS', missing: `the weekly file starts at ${isoZ(s.firstMs)}, after the target`, truth }
      : itemOf({ norad, regime: 'CSS', oem, name: 'CSS', targetMs, truth })));
    coverage.items = items.filter((x) => !x.missing).length;
    coverage.missing = items.length - coverage.items;
    log(`css ${coverage.targetUtc}: ${coverage.items} of ${items.length} with truth (${truth.version}, start ${truth.startUtc})`);
    return { items, coverage };
  },
};

// One SupGP row per NORAD number (the post-manoeuvre "[PM]" rows repeat a satellite).
function supgpRows(group) {
  const snap = readSnapshot(group, { root: PATHS.supgp });
  const byNorad = new Map();
  for (const r of snap.rows) if (!byNorad.has(r.norad) || / \[PM\]$/.test(byNorad.get(r.norad).name)) byNorad.set(r.norad, r);
  return { stamp: snap.stamp, rows: [...byNorad.values()] };
}

export const geoTruth = {
  id: 'geo', regime: 'GEO', live: true,
  async acquire({ http, readers, log, targetMs, wanted }) {
    const coverage = { truth: 'geo', regime: 'GEO', targetUtc: isoZ(targetMs), intelsat: {}, ses: {}, items: 0, missing: 0 };
    const items = [];
    const rd = await ecefReaders(readers);
    for (const [name, source, group] of [['intelsat', intelsat, 'intelsat'], ['ses', ses, 'ses']]) {
      let ctx, snap;
      try {
        snap = supgpRows(group);
        ctx = await source.prepare({ http, log, snapshot: snap, loadReader: loaderFor(readers) });
      } catch (e) { coverage[name] = { error: String(e.message).slice(0, 200) }; log(`geo ${name}: ${e.message}`); continue; }
      const c = coverage[name] = { crosswalk: `supgp ${group} ${snap.stamp}`, satellites: 0, noFile: 0, startsAfterTarget: 0, readFailures: 0 };
      for (const row of snap.rows) {
        if (wanted && !wanted.has(row.norad)) continue;
        ++c.satellites;
        const cands = (source.candidates(ctx, row) ?? []).filter((x) => x.startMs !== undefined);
        const before = cands.filter((x) => x.startMs <= targetMs).sort((a, b) => b.startMs - a.startMs);
        if (!cands.length) { ++c.noFile; continue; }
        if (!before.length) { ++c.startsAfterTarget; items.push({ norad: row.norad, regime: 'GEO', missing: 'every file read starts after the target', truth: { source: name } }); continue; }
        const cand = before[0];
        const held = source.held(ctx, cand);
        try {
          const { oem } = await source.read({ readers: rd, bytes: held.body, row });
          items.push(itemOf({ norad: row.norad, regime: 'GEO', oem, name: row.name, targetMs, truth: { source: name, version: cand.id, url: cand.url, startUtc: isoZ(cand.startMs), publishedUtc: held.provenance?.lastModified ? isoZ(Date.parse(held.provenance.lastModified)) : null, bytes: held.body.length, sha256: sha256(held.body) } }));
        } catch (e) { ++c.readFailures; log(`geo ${name} ${row.norad}: ${String(e.message).slice(0, 160)}`); }
      }
    }
    coverage.items = items.filter((x) => !x.missing).length;
    coverage.missing = items.filter((x) => x.missing).length;
    log(`geo ${coverage.targetUtc}: ${coverage.items} satellites with truth (${JSON.stringify(coverage.intelsat)} ${JSON.stringify(coverage.ses)})`);
    return { items, coverage };
  },
};
