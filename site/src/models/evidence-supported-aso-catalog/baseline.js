// Section 17.5: the HPOP binary the paper names is the one this site serves.
// The page hashes every module binary it serves, in this browser, and
// compares HPOP's with the paper's SHA-256.
import { formatMeters } from '../../chart.js';
import { sha256Hex } from '../../modules.js';
import { h, num, panel, table } from '../ui.js';
import { resampled, runOrekitCase } from '../../runs.js';
import { scene3d, v3 } from '../scene.js';

const PAPER_HPOP = '473d527175de6606ccf305c45b37218288634fa9de2dcab0d72564a190bdabd1';

export default async function run(ctx) {
  const p = panel(ctx.root, 'Module binaries, hashed here');
  const view = scene3d(ctx, { title: 'An orbit from the hashed binary', caption: 'The first Orekit case, propagated here by the HPOP above' });
  const prov = panel(ctx.root, 'Built from');
  await ctx.run('Hashing the served binaries', async () => {
    const provenance = await ctx.fetchJson('./provenance.json');
    const rows = [];
    let hpopMatch = false;
    for (const m of provenance.modules) {
      const bytes = await ctx.fetchBytes(`./modules/${m.path}/module.wasm`);
      const sha = await sha256Hex(bytes);
      const isHpop = m.path === 'propagator/hpop';
      if (isHpop) hpopMatch = sha === PAPER_HPOP;
      rows.push([{ text: m.path, class: 'left mono' }, `${num(bytes.length)} B`, { text: sha, class: 'wrap mono' },
        isHpop ? h('span', { class: `verdict ${hpopMatch ? 'pass' : 'fail'}` }, hpopMatch ? 'the paper’s' : 'differs') : (sha === m.wasmSha256 ? 'as built' : 'differs')]);
    }
    table(p, ['Module', 'Size', 'SHA-256', 'Check'], rows);
    table(prov, ['Input', 'Value'], [
      ['orbit-accuracy-experiments', { text: provenance.repository.commit ?? '—', class: 'mono wrap' }],
      ['space-data-network-modules', { text: provenance.modulesRepository.commit ?? '—', class: 'mono wrap' }],
      ['V1 run', { text: provenance.v1Run, class: 'mono wrap' }],
      ['space-data-module-sdk', provenance.sdk], ['spacedatastandards.org', provenance.spacedatastandards], ['Built', provenance.built],
    ]);
    // What the binary computes: the first HPOP-against-Orekit case, here.
    const [cases, hpop] = await Promise.all([ctx.fetchJson('./data/orekit/cases.json'), ctx.module('propagator/hpop')]);
    const c = cases[0];
    const r = await runOrekitCase(hpop, c);
    const track = await resampled(hpop, r.inputs, Array.from({ length: 720 }, (_, k) => (k + 1) * 120));
    const orekit = c.samples.map(([, x, y, z]) => [x / 1000, y / 1000, z / 1000]);
    await view.draw((g) => {
      g.track(track, { color: 'accent', width: 2, subdivide: 2 });
      orekit.forEach((p) => g.point(p, { color: 'cyan', size: 6, outline: 1 }));
      g.point(track[0][1], { color: 'sat', size: 9 });
      g.view({ normal: v3.cross(orekit[0], v3.sub(orekit[1], orekit[0])) });
    }, { frame: 'GCRF', epochMs: Date.parse(`${r.samples[0].epoch.replace(/Z$/, '')}Z`) - 3600e3,
      caption: `GCRF, ${c.orbit} ${c.forces}, 24 h; within ${formatMeters(r.worst, 3)} of Orekit 13.1 at every hour`,
      legend: [['accent', `propagator/hpop ${provenance.modules.find((m) => m.path === 'propagator/hpop').wasmSha256.slice(0, 12)}…`], ['cyan', 'Orekit 13.1, hourly', 'dot']] });
    return hpopMatch ? `propagator/hpop hashes to ${PAPER_HPOP.slice(0, 16)}…, the binary section 17.5 names.` : 'propagator/hpop here differs from the binary section 17.5 names.';
  });
}
