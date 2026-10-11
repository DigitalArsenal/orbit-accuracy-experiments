// Section 10, publication and reproduction: the binaries this site serves,
// hashed in this browser, and a V1 seed run here by the HPOP binary the paper
// names (V1's, served as propagator/hpop-v1), its errors at the six V1
// horizons against the committed results/v1 numbers.
import { formatMeters } from '../../chart.js';
import { sha256Hex } from '../../modules.js';
import { runV1Seed } from '../../runs.js';
import { credits, h, inputs, num, panel, table, tiles } from '../ui.js';
import { scene3d, v3 } from '../scene.js';

const PAPER_HPOP = '473d527175de6606ccf305c45b37218288634fa9de2dcab0d72564a190bdabd1';
const NAMES = { lageos1: 'LAGEOS-1', lageos2: 'LAGEOS-2', etalon1: 'ETALON-1', etalon2: 'ETALON-2' };
const objectName = (o) => NAMES[o] ?? (o.startsWith('gps-') ? `GPS · NORAD ${o.slice(4)}` : o);

export default async function run(ctx) {
  const [seeds, metrics, config, provenance] = await Promise.all([ctx.fetchJson('./data/v1/seeds.json'), ctx.fetchJson('./data/v1/metrics.json'),
    ctx.fetchJson('./data/v1/config.json'), ctx.fetchJson('./provenance.json')]);
  const pick = panel(ctx.root, 'A V1 seed');
  const gpsSeed = seeds.find((s) => s.group === 'GPS');
  const form = inputs(pick, [{ id: 'seed', label: 'Seed', type: 'select', value: gpsSeed.id, wide: true,
    options: seeds.map((s) => [s.id, `${objectName(s.object)} ${s.seedUtc.slice(0, 16).replace('T', ' ')}`]) }], () => reproduce());
  const view = scene3d(ctx, { title: 'V1’s committed errors, recomputed here', caption: 'GCRF, 72 h; the precise orbit and HPOP, every force (E-f)' });
  const rows = panel(ctx.root, 'Each V1 horizon, here and as committed');
  const p = panel(ctx.root, 'Module binaries, hashed here');
  const prov = panel(ctx.root, 'Built from');
  await ctx.run('Hashing the served binaries', async () => {
    const rows = [];
    for (const m of provenance.modules) {
      const bytes = await ctx.fetchBytes(`./modules/${m.path}/module.wasm`);
      const sha = await sha256Hex(bytes);
      const named = m.path === 'propagator/hpop-v1';
      rows.push([{ text: m.path, class: 'left mono' }, `${num(bytes.length)} B`, { text: sha, class: 'wrap mono' },
        named ? h('span', { class: `verdict ${sha === PAPER_HPOP ? 'pass' : 'fail'}` }, sha === PAPER_HPOP ? 'the paper’s' : 'differs') : (sha === m.wasmSha256 ? 'as built' : 'differs')]);
    }
    table(p, ['Module', 'Size', 'SHA-256', 'Check'], rows);
    table(prov, ['Input', 'Value'], [
      ['orbit-accuracy-experiments', { text: provenance.repository.commit ?? '—', class: 'mono wrap' }],
      ['space-data-network-modules', { text: provenance.modulesRepository.commit ?? '—', class: 'mono wrap' }],
      ['propagator/hpop-v1 (V1’s run)', { text: provenance.modules.find((m) => m.path === 'propagator/hpop-v1')?.commit ?? '—', class: 'mono wrap' }],
      ['V1 run', { text: provenance.v1Run, class: 'mono wrap' }],
      ['space-data-module-sdk', provenance.sdk], ['spacedatastandards.org', provenance.spacedatastandards], ['Built', provenance.built],
    ]);
  });
  const [hpop, time] = await Promise.all([ctx.module('propagator/hpop-v1'), ctx.module('foundation/time')]);
  await credits(ctx, ctx.root, ['data/v1/seeds.json', 'data/v1/metrics.json', ...new Set(seeds.map((s) => `data/truth/${s.object}.json`))]);

  async function reproduce() {
    const seed = seeds[Number(form.values().seed)];
    await ctx.run(`propagator/hpop-v1: ${objectName(seed.object)}, E-f, 72 h`, async () => {
      const r = await runV1Seed({ hpop, time, seed, config, metrics, cfgName: 'E-f', onStatus: ctx.status });
      const exact = r.horizons.filter((x) => x.committedM !== null && x.errorM === x.committedM).length;
      table(rows, ['Horizon', 'Error here', 'results/v1', 'Same bits'], r.horizons.map((x) => [`${x.hours} h`, formatMeters(x.errorM, 4),
        x.committedM === null ? '—' : formatMeters(x.committedM, 4), x.committedM === null ? '—' : x.errorM === x.committedM ? 'yes' : 'no']), { existing: rows.querySelector('table') ?? undefined });
      tiles(pick, [['Horizons compared', `${r.compared} of ${r.horizons.length}`], ['Bit for bit', `${exact} of ${r.compared}`],
        ['Largest |here − results/v1|', r.reproduced === null ? '—' : formatMeters(r.reproduced, 3)], ['In this browser', `${r.seconds.toFixed(1)} s`]]);
      const t0 = seed.seedUnixMs;
      const truth = [[0, r.s0.position], ...r.rows.map((x) => [(x.ms - t0) / 1000, x.truth])];
      const path = [[0, r.s0.position], ...r.rows.map((x) => [(x.ms - t0) / 1000, x.hpop])];
      const span = { startMs: t0, stopMs: r.rows.at(-1).ms, format: (ms) => `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC · +${((ms - t0) / 3600e3).toFixed(1)} h` };
      await view.draw((g) => {
        g.earth();
        g.track(truth, { color: 'cyan', width: 2, alpha: 0.7, subdivide: 4 });
        g.track(path, { color: 'accent', width: 1.5, alpha: 0.85, subdivide: 4 });
        g.point(r.s0.position, { color: 'sat', size: 9 });
        // One label per place: horizons a whole number of revolutions apart
        // fall together.
        const places = [{ at: r.s0.position, names: ['Seed'] }];
        for (const x of r.horizons) {
          const same = x.committedM !== null && x.errorM === x.committedM;
          g.point(x.hpop, { color: same ? 'accent' : 'alert', size: 8, outline: 1 });
          const place = places.find((b) => v3.norm(v3.sub(b.at, x.hpop)) < 0.25 * v3.norm(x.hpop));
          if (place) place.names.push(`${x.hours} h`); else places.push({ at: x.hpop, names: [`${x.hours} h`] });
        }
        for (const b of places) g.label(b.at, b.names.join(' · '), { color: 'text' });
        g.moving(r.rows.map((x) => [x.ms, x.hpop]), { color: 'accent', size: 10, trail: false });
        g.view({ preset: '3d' });
      }, { axes: ['x (km)', 'y (km)', 'z (km)'], aspect: 'equal', time: span,
        caption: `GCRF; ${objectName(seed.object)} from ${seed.seedUtc.slice(0, 16).replace('T', ' ')} UTC, 72 h; HPOP ${hpop.provenance.wasmSha256.slice(0, 12)}…, every force (E-f); the six V1 horizons, each checked against results/v1 below; the Earth at 6,378 km`,
        legend: [['cyan', seed.group === 'SLR' ? 'ILRS precise orbit' : 'IGS precise orbit'], ['accent', 'HPOP, and each V1 horizon'], ['sat', 'Seed state', 'dot'], ['earth', 'Earth, 6,378.137 km']] });
      const verdict = r.reproduced === 0 ? `reproduces results/v1 exactly at all ${r.compared} horizons` : r.reproduced === null ? 'has no committed row to compare with' : `differs from results/v1 by up to ${formatMeters(r.reproduced, 3)}`;
      return `${objectName(seed.object)}, E-f: ${formatMeters(r.horizons.find((x) => x.hours === 24)?.errorM)} after a day; this browser ${verdict}.`;
    });
  }
  await reproduce();
}
