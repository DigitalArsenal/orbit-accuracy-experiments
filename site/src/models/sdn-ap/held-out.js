// SDN-AP whitepaper, section 12.3, held-out accuracy: each propagator from the
// same epoch against a laser-ranged satellite's precise orbit (ILRS), for the
// three days after a 24 h fit.
//   SDN-AP and SGP4-XP: propagator/sdn-ap fits its own theory and the SGP4-XP
//     theory to the 24 h of truth before the epoch (fit, $PCF THEORY SDNAP or
//     SGP4XP) and propagates each set to every truth epoch of the next 72 h.
//   SGP4: analysis/gp-error-model's fit_elements on the same 24 h, run by the
//     site build (data/sdn-ap/held-out.json), propagated here by propagator/sdn-ap.
//   FFM: propagator/ffm from the precise state at the epoch, every modeled
//     force (the catalog paper's precise-orbits model, the V1 configuration).
// Envelopes come from each propagator's covariance, as the build provides it.
// Three views follow one clock: the orbit (GCRF), each propagator less the
// truth in the truth's radial, in-track and cross-track axes, and the
// distance from truth with the paper's day medians. Modules compute; this file
// moves records and draws.
import { runV1Seed } from '../../runs.js';
import { credits, panel, table, tiles, inputs, h } from '../ui.js';
import { rtn, scene3d, toRtn, v3 } from '../scene.js';
import { THEORY, frame, oem, outputsOf, pcf, readOem } from './codec.js';
import { envelopeChart, formatKm } from './envelope-chart.js';

const HOUR = 3600e3, DAY = 24 * HOUR;
const LAGEOS1 = { id: 'lageos1', norad: 8820, objectId: '1976-039A', name: 'LAGEOS-1' };
const dark = () => document.documentElement.getAttribute('data-theme') !== 'light';
// Validated categorical slots (dataviz validator, dark #0b0b0c and light #ffffff
// surfaces): SDN-AP amber, FFM cyan, SGP4-XP magenta; SGP4 in the muted ink.
const COLORS = () => (dark()
  ? { sdnap: '#c47d15', ffm: '#2799c6', sgp4xp: '#d55181', sgp4: '#8e8e93', paper: '#f5f5f7' }
  : { sdnap: '#c77d00', ffm: '#0a84b8', sgp4xp: '#d55181', sgp4: '#6e6e73', paper: '#1d1d1f' });
const NAMES = { sdnap: 'SDN-AP', ffm: 'FFM', sgp4xp: 'SGP4-XP', sgp4: 'SGP4' };
const ORDER = ['sdnap', 'ffm', 'sgp4xp', 'sgp4'];

const STYLE = `.env-legend{display:flex;flex-wrap:wrap;gap:6px 16px;margin:0 0 8px;font-size:13px;color:var(--muted)}
.env-key{display:inline-flex;align-items:center;gap:6px}.env-swatch{display:inline-block;width:12px;height:3px;border-radius:2px;vertical-align:middle;margin-right:4px}
.env-dot{width:9px;height:9px;border-radius:50%}.env-svg .gridline{stroke:var(--border);stroke-width:1}.env-svg text{fill:var(--muted);font-size:11px}
.env-svg text.direct{fill:var(--text);font-size:12px}.env-chart{position:relative}.env-tip{position:absolute;top:36px;pointer-events:none;background:var(--panel-solid,#161617);
border:1px solid var(--border);border-radius:8px;padding:8px 10px;font-size:12px;line-height:1.5;color:var(--text);min-width:180px}`;

export default async function run(ctx) {
  document.head.append(h('style', {}, STYLE));
  const [truth, seeds, config, metrics, built] = await Promise.all([
    ctx.fetchJson('./data/truth/lageos1.json'), ctx.fetchJson('./data/v1/seeds.json'), ctx.fetchJson('./data/v1/config.json'),
    ctx.fetchJson('./data/v1/metrics.json'), ctx.fetchJson('./data/sdn-ap/held-out.json'),
  ]);
  const covered = seeds.map((s, i) => ({ ...s, index: i })).filter((s) => s.object === LAGEOS1.id
    && s.seedUnixMs - DAY >= truth.epochsUnixMs[0] && s.seedUnixMs + 3 * DAY <= truth.epochsUnixMs.at(-1));
  const p = panel(ctx.root, 'The epoch');
  const form = inputs(p, [{ id: 'seed', label: 'Prediction starts', type: 'select', value: String(covered[0].index),
    options: covered.map((s) => [String(s.index), `${s.seedUtc.slice(0, 16).replace('T', ' ')} UTC`]) }], () => one());
  const orbit = scene3d(ctx, { title: 'LAGEOS-1 and each prediction', caption: 'GCRF (km): the ILRS precise orbit and each propagator for 72 h' });
  const apart = scene3d(ctx, { title: 'Each propagator − the precise orbit', caption: 'Radial, in-track and cross-track of the precise orbit (km); ellipsoids: each covariance, 1σ' });
  const card = h('figure', { class: 'chart-card' }, h('figcaption', {}, h('strong', {}, 'Distance from the precise orbit'),
    h('span', {}, `Hours since the prediction began; markers: the paper’s medians (${built.paper.row}); drag to move the views above in time`)));
  const plot = h('div', { class: 'env-chart', 'data-chart': 'distance' });
  card.append(plot);
  ctx.root.append(card);
  const numbers = panel(ctx.root, 'The same numbers');
  await credits(ctx, ctx.root, ['data/truth/lageos1.json', 'data/sdn-ap/held-out.json']);
  const [ap, ffm, time] = await Promise.all([ctx.module('propagator/sdn-ap'), ctx.module('propagator/ffm-v1'), ctx.module('foundation/time')]);

  let epochMs = null;
  ctx.time.on((ms) => { if (epochMs !== null) chart?.cursor((ms - epochMs) / HOUR); });
  let chart = null;

  async function one() {
    const seed = seeds[Number(form.values().seed)];
    await ctx.run(`propagator/sdn-ap: fit and propagate SDN-AP and SGP4-XP; propagator/ffm: 72 h; ${LAGEOS1.name}`, async () => {
      epochMs = seed.seedUnixMs;
      const at = (i) => truth.position.slice(3 * i, 3 * i + 3);
      const fitIds = truth.epochsUnixMs.map((t, i) => [t, i]).filter(([t]) => t > epochMs - DAY && t <= epochMs).map(([, i]) => i);
      const heldIds = truth.epochsUnixMs.map((t, i) => [t, i]).filter(([t]) => t > epochMs && t <= epochMs + 3 * DAY).map(([, i]) => i);
      const fitBytes = oem(LAGEOS1, fitIds.map((i) => truth.epochsUnixMs[i]), fitIds.flatMap(at), fitIds.flatMap((i) => truth.velocity.slice(3 * i, 3 * i + 3)));
      const grid = oem(LAGEOS1, heldIds.map((i) => truth.epochsUnixMs[i]), null, null);
      const predict = async (ommBytes) => readOem(outputsOf(await ap.invoke('propagate', [frame('omm', 'OMM', ommBytes), frame('configuration', 'PCF', pcf(THEORY.UNSPECIFIED)), frame('grid', 'OEM', grid)]), 'ephemeris')[0]).lines;
      const tracks = {};
      for (const [key, theory] of [['sdnap', THEORY.SDNAP], ['sgp4xp', THEORY.SGP4XP]]) {
        const fit = await ap.invoke('fit', [frame('ephemeris', 'OEM', fitBytes), frame('configuration', 'PCF', pcf(theory))]);
        tracks[key] = (await predict(outputsOf(fit, 'elements')[0])).map((l) => l.r);
      }
      const sgp4 = built.windows.find((w) => w.seedUnixMs === epochMs)?.sgp4;
      if (sgp4) tracks.sgp4 = (await predict(Uint8Array.from(atob(sgp4.omm), (c) => c.charCodeAt(0)))).map((l) => l.r);
      const v1 = await runV1Seed({ ffm, time, seed, config, metrics, cfgName: 'E-f', onStatus: ctx.status });
      const ffmAt = new Map(v1.rows.map((r) => [r.ms, r.ffm]));
      tracks.ffm = heldIds.map((i) => ffmAt.get(truth.epochsUnixMs[i]) ?? null);

      // Distances (km) at every truth epoch, and each propagator less the
      // truth in the truth's radial, in-track and cross-track axes.
      const hours = heldIds.map((i) => (truth.epochsUnixMs[i] - epochMs) / HOUR);
      const bases = heldIds.map((i) => rtn(at(i), truth.velocity.slice(3 * i, 3 * i + 3)));
      const present = ORDER.filter((k) => tracks[k]);
      const distance = Object.fromEntries(present.map((k) => [k, tracks[k].map((r, j) => (r ? v3.norm(v3.sub(r, at(heldIds[j]))) : null))]));
      const offsets = Object.fromEntries(present.map((k) => [k, tracks[k].map((r, j) => (r ? toRtn(bases[j], v3.sub(r, at(heldIds[j]))) : null))]));
      const colors = COLORS();
      const envelopes = built.windows.find((w) => w.seedUnixMs === epochMs)?.envelopes ?? {};
      const series = present.map((k) => ({ id: k, name: NAMES[k], color: colors[k],
        points: hours.map((hr, j) => [hr, distance[k][j]]).filter((q) => q[1] !== null),
        envelope: envelopes[k] ?? null }));
      const paperPoints = built.paper.days.map((d) => [24 * d.day - 12, d.km]);
      chart = envelopeChart(plot, { series, markers: [{ name: `SDN-AP, paper 12.3 (median of each day’s RMS)`, color: colors.paper, points: paperPoints }],
        x: { max: 72, ticks: [0, 12, 24, 36, 48, 60, 72] }, onCursor: (hr) => ctx.time.set(epochMs + hr * HOUR) });

      const dayRms = (k, day) => {
        const e = distance[k].filter((v, j) => v !== null && hours[j] > 24 * (day - 1) && hours[j] <= 24 * day);
        return Math.sqrt(e.reduce((s, v) => s + v * v, 0) / e.length);
      };
      tiles(p, present.map((k) => [`${NAMES[k]}, day 3`, formatKm(dayRms(k, 3))]));
      table(numbers, ['Propagator', 'Day 1 RMS', 'Day 2 RMS', 'Day 3 RMS', 'At 72 h'], [
        ...present.map((k) => ({ cells: [NAMES[k], formatKm(dayRms(k, 1)), formatKm(dayRms(k, 2)), formatKm(dayRms(k, 3)), formatKm(distance[k].at(-1))] })),
        { class: 'highlight', cells: ['SDN-AP, paper 12.3 median', ...built.paper.days.map((d) => formatKm(d.km)), '—'] },
      ], { existing: numbers.querySelector('table') });

      const timeSpec = { startMs: epochMs, stopMs: epochMs + 3 * DAY, ms: ctx.time.get() ?? epochMs, format: (ms) => `${((ms - epochMs) / HOUR).toFixed(1)} h` };
      orbit.draw((s) => {
        s.track(heldIds.map((i) => [truth.epochsUnixMs[i], at(i)]), { color: 'text', width: 3, alpha: 0.6 });
        for (const k of present) s.track(tracks[k].map((r, j) => [truth.epochsUnixMs[heldIds[j]], r]).filter((q) => q[1]), { color: colors[k], width: 2 });
      }, { axes: ['x (km)', 'y (km)', 'z (km)'], aspect: 'equal', time: timeSpec,
        legend: [['text', 'ILRS precise orbit'], ...present.map((k) => [colors[k], NAMES[k]])] });
      apart.draw((s) => {
        s.point([0, 0, 0], { color: 'text', label: 'precise orbit' });
        for (const k of present) s.track(offsets[k].map((q, j) => [truth.epochsUnixMs[heldIds[j]], q]).filter((q) => q[1]), { color: colors[k], width: 2 });
      }, { axes: ['radial (km)', 'in-track (km)', 'cross-track (km)'], aspect: 'normal', time: timeSpec,
        legend: present.map((k) => [colors[k], NAMES[k]]) });
      ctx.time.set(epochMs + 72 * HOUR);
      return `Day 3 RMS: ${present.map((k) => `${NAMES[k]} ${formatKm(dayRms(k, 3))}`).join(', ')}.`;
    });
  }
  await one();
}
