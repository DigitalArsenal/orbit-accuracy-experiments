// xp2-fit-design's windows, store and settings for this experiment's runners (AP5, AP6, the compare examples), and its S fit (lib/sgp4fit.mjs, the same
// calls). xp2-fit-design/common.mjs pins XM's whole directory at its commit, and XM's sds.mjs and modules.mjs moved to the one-$OCM path on 2026-11-04, so
// its import refuses; this file pins only what these runners read of XM's: the truth and the weather (lib/truth.mjs, lib/weather.mjs, config.json at XP2F's
// XM commit) and XM3's directory. XM's modules keep XM's current pins (build.json), never XP2F's modules commit. XP2F_CONTROL=1 as there: XM's own store.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../xp2-fit-design');
export const root = path.resolve(here, '../..');
export const config = JSON.parse(fs.readFileSync(path.join(here, 'config.json')));
export const control = process.env.XP2F_CONTROL === '1';
export const store = process.env.XP2F_STORE ?? config.store;
const git = (...a) => execFileSync('git', ['-C', root, ...a], { maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] });
for (const [commit, paths] of [[config.xm.commit, ['lib/truth.mjs', 'lib/weather.mjs', 'config.json'].map((f) => `${config.xm.dir}/${f}`)], [config.xm3.commit, [config.xm3.dir]]]) {
  try { git('diff', '--quiet', commit, '--', ...paths); } catch { throw new Error(`${paths.join(', ')} differ from ${commit}`); }
}
if (control) delete process.env.XM_STORE; else process.env.XM_STORE = store;
export const XM = await import(path.join(root, config.xm.dir, 'common.mjs'));
if (!control) {
  XM.config.public.creationDays = config.public.creationDays;
  XM.config.spaceWeather.rsgaDirs = [path.join(store, 'rsga/normalized')];
}
export const { DAY, HOUR, iso, ms, dateOf, daysOf, isoWeek, rms, median, sha256 } = XM;

const OBJECTS = new Map(config.objects.map((o) => [o.norad, o]));
export const objectOf = (norad) => OBJECTS.get(Number(norad));
/** Every registered window of a span: { key, span, o, date, cutoffMs }. */
export function windows(span) {
  const s = config.spans[span], out = [];
  for (const t of daysOf(s.from, s.to)) for (const n of s.objects) out.push({ key: `P|${n}|${dateOf(t)}`, span, o: objectOf(n), date: dateOf(t), cutoffMs: t });
  return out;
}

/** xp2-fit-design/lib/sgp4fit.mjs's S fit: analysis/gp-error-model fit_elements at XM's pin, a fresh harness per call. */
export async function openSgp4Fit() {
  const modules = XM.modulesRoot();
  const { bytes, manifest } = XM.pinned(modules, 'analysis/gp-error-model');
  const { createBrowserModuleHarness } = await import(pathToFileURL(createRequire(path.join(modules, 'analysis/gp-error-model/package.json')).resolve('space-data-module-sdk/host/browser-module')).href);
  const erm = await import(pathToFileURL(path.join(modules, 'analysis/gp-error-model/scripts/erm-codec.mjs')).href);
  const S = await import(path.join(root, config.xm.dir, 'lib/sds.mjs'));
  return {
    /** One fit of an $OEM: { fr: the module's fit report, el: the elements as XM's propagateSgp4 takes them, bstar }. Throws when the fit does not converge. */
    async fit(oem, options, identity) {
      const h = await createBrowserModuleHarness({ wasmSource: bytes, manifest, surface: 'direct' });
      try {
        const r = await h.invoke({ methodId: 'fit_elements', inputs: [{ portId: 'ephemeris', typeRef: S.TYPE('OEM'), payload: oem }, erm.frame('options', 'fitOptions', { closure: false, ...options })] });
        if (r.statusCode !== 0) throw new Error(`fit_elements: ${r.errorCode ?? r.statusCode}: ${String(r.errorMessage).slice(0, 200)}`);
        const out = {};
        for (const o of r.outputs) out[o.portId] = Buffer.from(o.payload);
        const fr = erm.decode(out.report).fits?.[0];
        if (!fr || !fr.converged) throw new Error(fr?.error ?? 'not converged');
        const u = S.OMM.OMM.getSizePrefixedRootAsOMM(new S.flatbuffers.ByteBuffer(new Uint8Array(out.elements))).unpack();
        const el = { epoch: u.EPOCH, objectName: identity.name, objectId: identity.objectId ?? '', elements: { MEAN_MOTION: u.MEAN_MOTION, ECCENTRICITY: u.ECCENTRICITY, INCLINATION: u.INCLINATION, RA_OF_ASC_NODE: u.RA_OF_ASC_NODE, ARG_OF_PERICENTER: u.ARG_OF_PERICENTER, MEAN_ANOMALY: u.MEAN_ANOMALY, BSTAR: u.BSTAR, MEAN_MOTION_DOT: u.MEAN_MOTION_DOT, MEAN_MOTION_DDOT: u.MEAN_MOTION_DDOT } };
        return { fr, el, bstar: u.BSTAR };
      } finally { await h.destroy(); }
    },
  };
}
