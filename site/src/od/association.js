// Observations associated with the catalog. analysis/observation-simulator
// makes radar, optical and RF observations of the IGS orbits (with false
// alarms, and of two satellites the catalog withholds); analysis/association
// gates each against every catalog prediction and assigns scan by scan. The
// page draws the module's report: the measured lines of sight, the predicted
// positions with their gates, and the uncorrelated tracks.
import { chart, h, inputs, num, panel, table, tiles, note } from '../models/ui.js';
import { covarianceAxes, magnification, scene3d, v3 } from '../models/scene.js';
import { associate, loadScenario, simulate } from './scenario.js';
import { utcMs } from './codec.js';

const KIND = { RDO: 'Radar', EOO: 'Optical', RFO: 'RF' };
const OBJECT_COLORS = ['#f5a524', '#59d9ff', '#7ee787', '#d2a8ff', '#ffa198', '#e3b341', '#79c0ff', '#56d4bc'];
const BIN_MS = 10 * 60e3;

export default async function run(ctx) {
  const intro = panel(ctx.root, 'Observations and catalog');
  const controls = panel(ctx.root, 'Scan');
  const view = scene3d(ctx, { title: 'Gates and lines of sight', caption: '' });
  const scanTable = panel(ctx.root, 'Observations in this interval');
  const pChart = chart(ctx.root, 'Covariance realism: p-values of the correct associations', 'Sorted p-values against their rank: a chi-square-distributed d² puts them on the diagonal');
  const summary = panel(ctx.root, 'Against the simulation’s truth');

  let sc, sim, report;
  await ctx.run('analysis/observation-simulator: radar, optical and RF observations of the IGS orbits', async () => {
    sc = await loadScenario(ctx);
    sim = await simulate(ctx, sc);
  });
  await ctx.run('analysis/association: gating every observation against the catalog', async () => {
    report = await associate(ctx, sc, sim);
  });
  if (!report) return;

  const obs = report.observations.map((o, i) => ({ ...o, truth: sim.records[i].truth, ms: utcMs(o.time) }));
  const withheld = new Set(sc.scenario.withheld);
  const counts = { right: 0, wrong: 0, wrongFlagged: 0, alarmsUct: 0, alarmsAssociated: 0, withheldUct: 0, withheldAssociated: 0, missed: 0 };
  for (const o of obs) {
    if (!o.truth) { counts[o.status === 'uct' ? 'alarmsUct' : 'alarmsAssociated']++; continue; }
    if (withheld.has(o.truth)) { counts[o.status === 'uct' ? 'withheldUct' : 'withheldAssociated']++; continue; }
    if (o.status === 'uct') { counts.missed++; continue; }
    if (o.object.norad_cat_id === o.truth) counts.right++;
    else counts[o.ambiguous ? 'wrongFlagged' : 'wrong']++;
  }
  const byType = (t) => obs.filter((o) => o.type === t).length;
  tiles(intro, [
    ['Observations', `${num(obs.length)} (radar ${byType('RDO')}, optical ${byType('EOO')}, RF ${byType('RFO')})`],
    ['Catalog', `${report.counts.predictions} GPS predictions`],
    ['Associated', num(report.counts.associated)], ['Uncorrelated (UCT)', num(report.counts.ucts)], ['Ambiguous', num(report.counts.ambiguous)],
    ['Gate', `P = ${report.options.gate_probability}`],
  ]);
  note(intro, `GPS on ${sc.scenario.day}, ${sc.scenario.simulation.from.slice(11, 16)}–${sc.scenario.simulation.to.slice(11, 16)} UTC. Truth: the IGS final orbits (${sc.scenario.truthProduct}). `
    + `Sensors at three IGS sites: ${sc.scenario.sensors.map((s) => `${s.id} (${s.models.map((m) => m[0].toLowerCase().replace(/_/g, ' ')).join(', ')})`).join('; ')}. `
    + `Catalog: each satellite’s IGS state at ${sc.scenario.catalog.epoch.slice(0, 19)} UTC propagated by propagator/hpop with a covariance; NORAD ${[...withheld].join(' and ')} withheld. `
    + 'Each observation’s gate is the chi-square quantile of its dimension; a scan’s observations are assigned jointly (Hungarian), and leaving one unassigned costs its gate.');

  // Scan intervals.
  const t0 = Math.min(...obs.map((o) => o.ms)), t1 = Math.max(...obs.map((o) => o.ms));
  const bins = Math.ceil((t1 - t0 + 1) / BIN_MS);
  const label = (k) => `${new Date(t0 + k * BIN_MS).toISOString().slice(11, 16)}–${new Date(t0 + (k + 1) * BIN_MS).toISOString().slice(11, 16)} UTC`;
  const firstUct = obs.findIndex((o) => o.status === 'uct');
  const form = inputs(controls, [
    { id: 'bin', label: 'Interval', type: 'select', value: Math.max(0, Math.floor((obs[firstUct >= 0 ? firstUct : 0].ms - t0) / BIN_MS)), options: Array.from({ length: bins }, (_, k) => [k, label(k)]) },
  ], () => draw());

  const objectColor = new Map();
  const colorOf = (key) => {
    if (!objectColor.has(key)) objectColor.set(key, OBJECT_COLORS[objectColor.size % OBJECT_COLORS.length]);
    return objectColor.get(key);
  };
  const gateK = Math.sqrt(report.gate_thresholds['3']);
  const sites = Object.fromEntries(sc.scenario.sites.map((s) => [s.id, s]));
  const sensorSite = Object.fromEntries(sc.scenario.sensors.map((s) => [s.id, s.host]));

  async function draw() {
    const k = Number(form.values().bin);
    const inBin = obs.filter((o) => o.ms >= t0 + k * BIN_MS && o.ms < t0 + (k + 1) * BIN_MS)
      .sort((a, b) => a.ms - b.ms || a.sensor.localeCompare(b.sensor));
    const mid = t0 + (k + 0.5) * BIN_MS;
    table(scanTable, ['Time', 'Sensor', 'Status', 'Object', 'd² / dof', 'p-value', 'Posterior', 'Truth'], inBin.map((o) => ({
      class: o.status === 'uct' ? 'highlight' : '',
      cells: [o.time.slice(11, 19), o.sensor, o.status === 'uct' ? `UCT (${o.reason})` : o.ambiguous ? 'associated, ambiguous' : 'associated',
        o.object ? o.object.object_name || o.object.key : '—', o.d2 !== undefined ? `${num(o.d2, 3)} / ${o.dof}` : '—', o.p_value !== undefined ? num(o.p_value, 3) : '—',
        o.posterior !== undefined ? num(o.posterior, 3) : '—', o.truth ? (withheld.has(o.truth) ? `${o.truth} (withheld)` : String(o.truth)) : 'false alarm'],
    })), { existing: scanTable.querySelector('table') ?? undefined });
    // Gate ellipsoids: the candidates' predicted position covariance at the
    // 3-D quantile of the gate probability, magnified.
    const gates = [];
    for (const o of inBin) for (const c of o.candidates.filter((c) => c.in_gate)) gates.push({ o, c, axes: covarianceAxes(c.position_covariance_km2).map((a) => v3.scale(a, gateK)) });
    const sizes = gates.flatMap((g) => g.axes.map((a) => v3.norm(a)));
    const mag = magnification(sizes.length ? Math.max(...sizes) : 0.1, 900);
    await view.draw((g) => {
      for (const id of new Set(inBin.map((o) => sensorSite[o.sensor]))) g.point(g.fromFixed(sites[id].itrfKm), { color: 'text', size: 7, label: sites[id].id });
      for (const { o, c, axes } of gates) {
        const key = c.object.key;
        g.ellipsoid(c.position_gcrf_km, axes.map((a) => v3.scale(a, mag.k)), { color: colorOf(key), alpha: 0.22, outline: true, frame: false });
        g.point(c.position_gcrf_km, { color: colorOf(key), size: 6, outline: 1 });
      }
      for (const o of inBin) {
        const assigned = o.status === 'associated' ? o.candidates.find((c) => c.object.key === o.object.key) : null;
        const col = assigned ? colorOf(assigned.object.key) : 'alert';
        const start = o.sensor_gcrf_km;
        let end;
        if (o.line_of_sight_gcrf) {
          const reach = o.measured.range_km ?? (assigned ? v3.norm(v3.sub(assigned.position_gcrf_km, start)) : 24000);
          end = v3.add(start, v3.scale(o.line_of_sight_gcrf, reach));
        } else if (assigned) end = assigned.position_gcrf_km;
        if (!end) { g.point(start, { color: 'alert', size: 9 }); continue; }
        g.line([start, end], { color: col, width: o.status === 'uct' ? 2.5 : 1.5, dash: o.ambiguous || !o.line_of_sight_gcrf, alpha: 0.9, frame: false });
        if (o.status === 'uct') g.point(end, { color: 'alert', size: 8, outline: 1 });
      }
      const center = gates.length ? gates[0].c.position_gcrf_km : [0, 0, 0];
      g.view(gates.length ? { center: [0, 0, 0], radius: Math.max(27000, v3.norm(center) * 1.05) } : {});
    }, {
      frame: 'GCRF', epochMs: mid,
      caption: `${label(k)} · GCRF · gates at the ${report.options.gate_probability} probability of three dimensions, ${mag.label}`,
      legend: [['text', 'Sensor site', 'dot'], ['accent', 'Associated line of sight (one colour per object)'], ['alert', 'Uncorrelated track'],
        ['accent', 'Gate around a predicted position', 'solid'], ['muted', 'RF (no direction) or ambiguous', 'dash']],
    });
    return `${inBin.length} observations in ${label(k)}: ${inBin.filter((o) => o.status === 'associated').length} associated, ${inBin.filter((o) => o.status === 'uct').length} uncorrelated.`;
  }
  await ctx.run('Drawing the interval', draw);

  // Calibration: a correct association's d² is chi-square with its dof when
  // the covariance is right, so its p-value is uniform.
  const correct = obs.filter((o) => o.truth && !withheld.has(o.truth) && o.status === 'associated' && o.object.norad_cat_id === o.truth);
  const series = ['RDO', 'EOO', 'RFO'].map((t, i) => {
    const p = correct.filter((o) => o.type === t).map((o) => o.p_value).sort((a, b) => a - b);
    return { name: KIND[t], color: ['var(--accent)', 'var(--cyan)', 'var(--series-muted)'][i], points: p.map((v, j) => [(j + 0.5) / p.length, Math.max(v, 1e-6)]), label: true };
  });
  pChart.draw({
    series: [{ name: 'Uniform', color: 'var(--series-muted)', dash: true, points: [[0, 0], [1, 1]] }, ...series],
    x: { min: 0, max: 1, ticks: [0, 0.25, 0.5, 0.75, 1], format: (v) => `${v}` },
    y: { scale: 'linear', min: 0, max: 1, ticks: [0, 0.25, 0.5, 0.75, 1], format: (v) => `${v}`, value: (v) => num(v, 3) },
  });
  const mean = (t) => { const v = correct.filter((o) => o.type === t).map((o) => o.d2 / o.dof); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN; };
  tiles(summary, [
    ['Correct', num(counts.right)], ['Wrong, unflagged', num(counts.wrong)], ['Wrong, flagged ambiguous', num(counts.wrongFlagged)],
    ['False alarms → UCT', `${counts.alarmsUct} of ${counts.alarmsUct + counts.alarmsAssociated}`], ['Withheld satellites → UCT', `${counts.withheldUct} of ${counts.withheldUct + counts.withheldAssociated}`],
    ['Catalogued, missed', num(counts.missed)],
  ]);
  table(summary, ['Sensor', 'Mean d² / dof (1 if calibrated)'], ['RDO', 'EOO', 'RFO'].map((t) => [KIND[t], num(mean(t), 3)]));
  note(summary, 'Truth is what the simulator observed: its records carry the satellite (false alarms carry none); the association never sees it. '
    + 'Mean d²/dof below 1 means the catalog covariance is larger than the prediction error it describes: conservative gates.');
  ctx.status(`${counts.right} of ${counts.right + counts.wrong + counts.wrongFlagged + counts.missed} catalogued observations associated correctly; ${counts.alarmsUct + counts.withheldUct} of ${counts.alarmsUct + counts.alarmsAssociated + counts.withheldUct + counts.withheldAssociated} uncorrelated by construction found uncorrelated.`);
}
