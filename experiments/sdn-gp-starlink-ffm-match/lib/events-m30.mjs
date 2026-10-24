// Amendment A11c, M30 (controlled deorbits), the part the build covers: `reentry` on the SDN-AP set fitted to the first 24 h of each Starlink with B_eff above 0.5 m2/kg (the 19 of A9d), in the build's default
// and the two named lowering variants of A9d ("rule": B_eff above 0.5 replaced by tau0, "free": B_eff free). The prediction is frozen in the row (issued time, REENTRY_EPOCH, sigma, window); it is scored later
// against the TIP and decay messages the archiver collects (the 19 have no TIP message in the snapshot of 2026-10-24).
import fs from 'node:fs';
import path from 'node:path';
import { read, store } from '../common.mjs';
import { reentry as sdngpReentry } from './sdngp-events.mjs';
import { g1Fit } from './events-score.mjs';
import { readTruthFlat, t0Of } from './events.mjs';
import { iso } from './windows.mjs';

const VARIANTS = [['default', undefined], ['rule', 0.5], ['free', Infinity]];

export function loweringSatellites() {
  const dir = path.join(store, 'truth');
  return fs.readdirSync(dir).filter((n) => /^\d+\.json$/.test(n)).map((n) => read(path.join(dir, n))).filter((m) => !m.fit.bEffAtZeroBound && m.fit.bEffM2Kg > 0.5).sort((a, c) => a.norad - c.norad);
}

export async function scoreLowering({ b, sink }) {
  const metas = loweringSatellites();
  for (const [variant, limit] of VARIANTS) { // the default pass first: the toggles below persist in an instance
    for (const meta of metas) {
      if (!sink.mine()) continue;
      const id = `STARLINK (${meta.norad}) ${variant}`, startUtc = iso(t0Of(meta));
      if (sink.has(`m30|${id}|${startUtc}|86400`)) continue;
      if (limit !== undefined) b.sdngp.setLoweringLimit(limit);
      const fit = await g1Fit(b, meta, readTruthFlat(meta));
      const row = { source: 'm30', id, norad: meta.norad, variant, startUtc, fitSeconds: 86400, bEffFfm: meta.fit.bEffM2Kg, issuedUtc: new Date().toISOString(), build: b.sdngp.provenance.wasmSha256.slice(0, 12) };
      if (!fit.ok) { sink.append({ ...row, fit: { ok: false, error: fit.error } }); continue; }
      row.fit = { ok: true, fitRmsKm: fit.fitRmsKm, bEff: Number(fit.params.SDNGP_B_EFF), lowering: Number(fit.params.SDNGP_LOWERING ?? 0), tau0: Number(fit.params.SDNGP_TAU0), meanMotion: fit.unpacked.MEAN_MOTION, eccentricity: fit.unpacked.ECCENTRICITY };
      const re = await sdngpReentry(b.sdngp, { omm: fit.omm, weatherTable: b.weatherTable });
      if (!re.ok) { sink.append({ ...row, reentry: { ok: false, error: re.error } }); continue; }
      const r = re.rdm;
      sink.append({ ...row, reentry: { ok: true, epoch: r.REENTRY_EPOCH, uncHours: r.REENTRY_EPOCH_UNC, windowStart: r.REENTRY_WINDOW_START, windowEnd: r.REENTRY_WINDOW_END, orbitLifetimeDays: r.ORBIT_LIFETIME, ballisticCoeff: r.BALLISTIC_COEFF, comment: r.COMMENT ?? null } });
    }
  }
}
