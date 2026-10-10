// Amendment A6: an operator file's objects as the ephemeris fitter takes
// them, and the derived-record layout. Reading only. The frame and time-scale
// conversions are the modules' (harness/ephemeris-fit.mjs for MEME and OEM;
// step 10's conversion through files/orbit-products for the Earth-fixed and
// SP3 files).
import fs from 'node:fs';
import path from 'node:path';
import { sha256 } from '../../harness/modules.mjs';
import { repoRoot } from '../../harness/provenance.mjs';
import { config } from './common.mjs';
import { readIssEvents, readMeme, readOem, unzipMembers } from './operators.mjs';
import { productContext } from './products.mjs';
import { sp3Context } from './sp3.mjs';
import { OperatorFiles, catalogNames } from './a5.mjs';

const iso = (ms) => new Date(ms).toISOString();

// Derived records of one object of one file version, E11's layout:
// <root>/<provider>/<norad>/<version>/ocm-<segment>.fbs, omm.fbs, stats.json.
export const derivedRoot = path.join(repoRoot, 'runs', 'cache', 'e4-a6-derived');
export const derivedDir = (provider, norad, file) => path.join(derivedRoot, provider, String(norad), file);

// A provider's operator files (role ephemeris, then a5-extra; capture order)
// and a reader of their objects: [{object {norad, name}, frame, timeScale,
// issued, events, states [{epoch, position m, velocity m/s}], raw {epochs,
// states, covariances} in the file's own frame}].
export function operatorInputs({ provider, inputs, archive, modules, run }) {
  const spec = config.providers[provider];
  const record = JSON.parse(fs.readFileSync(path.join(inputs, provider, 'inputs.json'), 'utf8'));
  const files = record.files.filter((f) => f.role === 'ephemeris' || f.role === 'a5-extra')
    .sort((a, b) => (a.role === b.role ? 0 : a.role === 'ephemeris' ? -1 : 1) || a.captured.localeCompare(b.captured) || a.file.localeCompare(b.file));
  const readInput = (f) => {
    const bytes = fs.readFileSync(path.join(inputs, provider, f.file));
    if (sha256(bytes) !== f.sha256) throw new Error(`${f.file}: bytes differ from inputs.json`);
    run.addInputs('operator', { [`${provider}/${f.file}`]: f.sha256 });
    return bytes;
  };
  let ctx = null, sp3 = null, ops = null;
  const opsFor = async () => {
    if (ops) return ops;
    ctx = await productContext(modules, run);
    ops = new OperatorFiles({ provider, inputs, readInput, ctx, sp3Ctx: async () => (sp3 ??= await sp3Context(modules, run, config.inputs.eopFinals)),
      sinex: fs.readFileSync(config.inputs.satelliteMetadata), gpNames: ['intelsat-ecf', 'ses-i11'].includes(spec.format) ? catalogNames(provider, record.files, archive) : null });
    return ops;
  };
  async function objectsOf(f) {
    const fmt = spec.format;
    if (fmt === 'meme') {
      const p = readMeme(readInput(f).toString('latin1'));
      const norad = Number(/MEME_(\d+)_/.exec(f.file)[1]);
      return [{ object: { norad, name: '' }, frame: 'EME2000', timeScale: 'UTC', issued: p.created, events: [],
        states: p.epochs.map((e, k) => ({ epoch: e, position: p.states[k].slice(0, 3), velocity: p.states[k].slice(3) })) }];
    }
    if (fmt === 'ccsds-oem' || fmt === 'ccsds-oem-zip') {
      const bytes = readInput(f);
      const texts = fmt === 'ccsds-oem' ? [bytes.toString('latin1')] : unzipMembers(bytes).filter((m) => !m.name.endsWith('/')).map((m) => m.bytes.toString('latin1'));
      return texts.map((text) => {
        const p = readOem(text);
        if (!['EME2000', 'J2000', 'GCRF'].includes(p.frame) || p.timeScale !== 'UTC') throw new Error(`${f.file}: ${p.frame}/${p.timeScale}`);
        const events = provider === 'iss' ? readIssEvents(text).filter((e) => !/_Launch$/i.test(e.label)) : [];
        return { object: { norad: spec.norad, name: p.name ?? '' }, frame: p.frame, timeScale: 'UTC', issued: p.created ?? f.captured, events,
          states: p.epochTexts.map((e, k) => ({ epoch: e, position: p.states[k].slice(0, 3), velocity: p.states[k].slice(3) })) };
      });
    }
    if (fmt === 'planet-states') return [];
    const o = await opsFor();
    const out = [];
    for (const [norad, t] of await o.load(f)) {
      const states = [];
      for (let k = 0; k < t.epochs.length; ++k) { const s = await t.state(k); states.push({ epoch: iso(t.epochs[k]), position: s.slice(0, 3), velocity: s.slice(3) }); }
      out.push({ object: { norad, name: '' }, frame: 'GCRF', timeScale: 'UTC', issued: iso(t.issueMs), events: [], states });
    }
    return out;
  }
  return {
    spec, record, files, readInput, objectsOf,
    async destroy() { if (ctx) await ctx.destroy(); if (sp3) await sp3.destroy(); },
  };
}
