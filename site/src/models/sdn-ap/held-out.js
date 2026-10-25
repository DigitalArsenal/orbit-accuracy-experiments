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
// Envelopes come from each propagator's covariance, as the build provides it
// (site/build-models.mjs buildSdnAp): FFM's propagated covariance with process
// noise fitted on the other laser-ranged MEO spheres, SGP4's population
// covariance from analysis/gp-error-model, SDN-AP's own propagated covariance.
// Three views follow one clock: the orbit (GCRF), each propagator less the
// truth in the truth's radial, in-track and cross-track axes, and the
// distance from truth with the paper's day medians. Modules compute; this file
// moves records and draws.
import { runV1Seed } from '../../runs.js';
import { credits, panel, table, tiles, inputs, h } from '../ui.js';
import { covarianceAxes, rtn, rtnCovariance, scene3d, toRtn, v3 } from '../scene.js';
import { THEORY, frame, oem, outputsOf, pcf, readOem } from './codec.js';
import { envelopeChart, formatKm } from './envelope-chart.js';

const HOUR = 3600e3, DAY = 24 * HOUR;
const LAGEOS1 = { id: 'lageos1', norad: 8820, objectId: '1976-039A', name: 'LAGEOS-1' };
const dark = () => document.documentElement.getAttribute('data-theme') !== 'light';
// Validated categorical slots (dataviz validator, dark #0b0b0c and light #ffffff
// surfaces): SDN-AP amber, FFM cyan, SGP4-XP magenta; SGP4 in the muted ink.
const COLORS = () => (dark()
  ? { sdnap: '#c47d15', ffm: '#2799c6', sgp4xp: '#d55181', sgp4: '#8e8e93' }
  : { sdnap: '#c77d00', ffm: '#0a84b8', sgp4xp: '#d55181', sgp4: '#6e6e73' });
const NAMES = { sdnap: 'SDN-AP', ffm: 'FFM', sgp4xp: 'SGP4-XP', sgp4: 'SGP4' };
const NAMES_TRUTH = { lageos2: 'LAGEOS-2', etalon1: 'Etalon-1', etalon2: 'Etalon-2' };
const ORDER = ['sdnap', 'ffm', 'sgp4xp', 'sgp4'];

const STYLE = `.env-legend{display:flex;flex-wrap:wrap;gap:6px 16px;margin:0 0 8px;font-size:13px;color:var(--muted)}
.env-key{display:inline-flex;align-items:center;gap:6px}.env-swatch{display:inline-block;width:12px;height:3px;border-radius:2px;vertical-align:middle;margin-right:4px}
.env-dot{width:11px;height:11px;border-radius:50%;box-sizing:border-box}.env-svg .gridline{stroke:var(--border);stroke-width:1}.env-svg text{fill:var(--muted);font-size:11px}
.env-svg text.direct{fill:var(--text);font-size:12px}.env-chart{position:relative}.env-tip{position:absolute;top:36px;pointer-events:none;background:var(--panel-solid,#161617);
border:1px solid var(--border);border-radius:8px;padding:8px 10px;font-size:12px;line-height:1.5;color:var(--text);min-width:180px}
.ho-play{display:inline-flex;align-items:center;gap:8px;margin:4px 0 12px;padding:8px 16px 8px 12px;border:1px solid var(--border-strong);border-radius:999px;background:var(--accent-soft);color:var(--text);font:600 14px/1 var(--sans);cursor:pointer}
.ho-play:hover{border-color:var(--accent)}.ho-play:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.ho-play svg{width:14px;height:14px;color:var(--accent)}`;
const PLAY_MS = 15000;  // the 72 h in 15 s
const ICON = { play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/></svg>' };

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
    options: covered.map((s) => [String(s.index), `${s.seedUtc.slice(0, 16).replace('T', ' ')} UTC`]) },
  { id: 'shown', label: 'Error view shows', type: 'select', value: 'all', options: [['all', 'Every propagator'], ['close', 'SDN-AP and FFM']] }], () => one());
  // Play: the three views and the chart's cursor follow one clock over the 72 h.
  const play = h('button', { type: 'button', class: 'ho-play', 'data-playing': 'false', 'aria-pressed': 'false' });
  p.append(play);
  let playing = null;
  const setPlay = (on) => {
    play.innerHTML = `${on ? ICON.pause : ICON.play}<span>${on ? 'Pause' : 'Play the 72 hours'}</span>`;
    play.dataset.playing = String(on);
    play.setAttribute('aria-pressed', String(on));
  };
  setPlay(false);
  const stop = () => { if (playing) cancelAnimationFrame(playing.frame); playing = null; setPlay(false); };
  play.addEventListener('click', () => {
    if (playing || epochMs === null) { stop(); return; }
    const now = ctx.time.get() ?? epochMs;
    const from = now >= epochMs + 72 * HOUR - 1 ? epochMs : now;
    playing = { start: performance.now() - ((from - epochMs) / (72 * HOUR)) * PLAY_MS };
    setPlay(true);
    const step = (t) => {
      if (!playing) return;
      const f = Math.min(1, (t - playing.start) / PLAY_MS);
      ctx.time.set(epochMs + f * 72 * HOUR);
      if (f < 1) playing.frame = requestAnimationFrame(step); else stop();
    };
    playing.frame = requestAnimationFrame(step);
  });
  const orbit = scene3d(ctx, { title: 'LAGEOS-1 and each prediction', caption: 'GCRF (km): the ILRS precise orbit and each propagator for 72 h' });
  const apart = scene3d(ctx, { title: 'Each propagator − the precise orbit', caption: 'Radial, in-track and cross-track of the precise orbit (km); ellipsoids: the 1σ position covariance of FFM and SDN-AP' });
  const card = h('figure', { class: 'chart-card' }, h('figcaption', {}, h('strong', {}, 'Distance from the precise orbit'),
    h('span', {}, `Hours since the prediction began; markers: the paper’s medians (${built.paper.row}, ${built.paper.windows} windows); dashed and dotted: 1σ and 3σ of √trace of each position covariance, FFM’s with white acceleration noise fitted on ${built.ffmNoise.objects.map((o) => NAMES_TRUTH[o] ?? o).join(', ')} (q = ${built.ffmNoise.psdM2s3.toExponential(2)} m²/s³), SGP4’s the population covariance of element sets in its regime and age (analysis/gp-error-model); drag to move the views above in time`)));
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
    stop();
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
      chart = envelopeChart(plot, { series, markers: [{ name: `SDN-AP, paper 12.3 (median of each day’s RMS)`, color: colors.sdnap, points: paperPoints }],
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
      await orbit.draw((s) => {
        s.track(heldIds.map((i) => [truth.epochsUnixMs[i], at(i)]), { color: 'text', width: 3, alpha: 0.6 });
        for (const k of present) s.track(tracks[k].map((r, j) => [truth.epochsUnixMs[heldIds[j]], r]).filter((q) => q[1]), { color: colors[k], width: 2 });
      }, { axes: ['x (km)', 'y (km)', 'z (km)'], aspect: 'equal', time: timeSpec,
        legend: [['text', 'ILRS precise orbit'], ...present.map((k) => [colors[k], NAMES[k]])] });
      // Each covariance's 1σ ellipsoid about its own prediction, in the
      // precise orbit's radial, in-track and cross-track axes, every hour.
      const shown = form.values().shown === 'close' ? present.filter((k) => k === 'sdnap' || k === 'ffm') : present;
      const ellipsoids = shown.filter((k) => envelopes[k]?.position).map((k) => [k, envelopes[k].position.map(([hr, P]) => {
        const j = hours.findIndex((x) => Math.abs(x - hr) < 1e-9);
        return j < 0 || !offsets[k][j] ? null : [truth.epochsUnixMs[heldIds[j]], offsets[k][j], covarianceAxes(rtnCovariance(bases[j], P))];
      }).filter(Boolean)]);
      await apart.draw((s) => {
        s.point([0, 0, 0], { color: 'text', label: 'precise orbit' });
        for (const k of shown) s.track(offsets[k].map((q, j) => [truth.epochsUnixMs[heldIds[j]], q]).filter((q) => q[1]), { color: colors[k], width: 2 });
        for (const [k, samples] of ellipsoids) if (samples.length) s.movingEllipsoid(samples, { color: colors[k], alpha: 0.35 });
      }, { axes: ['radial (km)', 'in-track (km)', 'cross-track (km)'], aspect: 'normal', time: timeSpec,
        legend: shown.map((k) => [colors[k], `${NAMES[k]}${envelopes[k]?.position ? ', with its 1σ ellipsoid' : ''}`]) });
      ctx.time.set(epochMs + 72 * HOUR);
      return `Day 3 RMS: ${present.map((k) => `${NAMES[k]} ${formatKm(dayRms(k, 3))}`).join(', ')}.`;
    });
  }
  await one();
}
