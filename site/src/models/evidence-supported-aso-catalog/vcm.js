// Section 17.3: the synthetic VCM, field by field as the adapter reads it into
// an SDS VCM record; propagated 24 h by HPOP with its 7×7 covariance under
// both readings of the B row; written back, and the written message read
// again to measure what the text keeps of the covariance.
import * as flatbuffers from 'flatbuffers';
import { VCM } from 'spacedatastandards.org/lib/js/VCM/main.js';
import { formatMeters } from '../../chart.js';
import { decodePrw, frameOf, out, resampled, runVcm } from '../../runs.js';
import { rtn, rtnCovariance, scene3d, v3 } from '../scene.js';
import { flatten } from '../codec/kvn.js';
import { chart, num, panel, pre, table, tiles, note } from '../ui.js';

const fieldDoc = (schema, path) => {
  const name = path.split('.').at(-1).replace(/\[\d+\]$/, '');
  for (const fields of Object.values(schema.tables)) { const f = fields.find((x) => x.name === name); if (f) return f.doc; }
  return '';
};

export default async function run(ctx) {
  const message = panel(ctx.root, 'The message');
  const fields = panel(ctx.root, 'Every field, as an SDS VCM');
  const sig = panel(ctx.root, 'Sigmas the adapter recomputes');
  const view = scene3d(ctx, { title: 'The two readings of the B row, after a day', caption: '1σ position ellipsoids at 24 h, true scale' });
  const figure = chart(ctx.root, 'Position sigmas along the propagation', 'HPOP’s 7×7 covariance; in-track under both readings of the B row');
  const back = panel(ctx.root, 'Written back');
  const [text, schema] = await Promise.all([ctx.fetchText('./data/vcm/synthetic-vcm.txt'), ctx.fetchJson('./data/sds/VCM.json')]);
  pre(message, text);
  note(message, 'A synthetic message: made-up identifiers, orbit and covariance, written by the adapter (site/synthetic-vcm.mjs). It is not an observation of any object.');
  const [adapter, hpop] = await Promise.all([ctx.module('analysis/vcm-adapter'), ctx.module('propagator/hpop')]);

  await ctx.run('analysis/vcm-adapter read, propagator/hpop 24 h, analysis/vcm-adapter write', async () => {
    const { runs, written } = await runVcm(adapter, hpop, text, { onStatus: ctx.status });
    const vcmBytes = out(runs.fractional.read, 'vcm');
    const record = VCM.getSizePrefixedRootAsVCM(new flatbuffers.ByteBuffer(vcmBytes)).unpack();
    table(fields, [`SDS VCM field (${schema.version})`, 'Value'], flatten(record).map(([k, v]) => [{ text: k, class: 'left mono wrap', title: fieldDoc(schema, k) }, { text: v, class: 'wrap mono' }]));
    note(fields, 'Fields at their schema defaults are not listed; hover a path for its schema documentation.');
    const { report } = runs.fractional;
    const b = (rows) => runs[rows].report.parameterSigmas.find((x) => x.name === 'B');
    table(sig, ['Sigma', 'VCM prints', 'Recomputed'], [
      ...['U radial', 'V in-track', 'W cross-track'].map((a, i) => [a, formatMeters(report.statedUvwSigmasKm[i] * 1000, 1), formatMeters(report.recomputedUvwSigmasKm[i] * 1000, 2)]),
      ['B, row as a fraction', '—', `${num(100 * b('fractional').sigma / b('fractional').value, 3)} % of B`],
      ['B, row as printed', '—', `${num(b('absolute').sigma / b('absolute').value, 3)} × B`],
    ]);
    const last = (rows) => runs[rows].sigmas.at(-1).s;
    figure.draw({ series: [
      { name: 'Radial', color: 'var(--series-muted)', points: runs.fractional.sigmas.map((q) => [q.hours, q.s[0]]), width: 1.5 },
      { name: 'In-track, B as printed', color: 'var(--cyan)', points: runs.absolute.sigmas.map((q) => [q.hours, q.s[1]]), label: true, labelText: 'As printed' },
      { name: 'In-track, B as a fraction', color: 'var(--accent)', points: runs.fractional.sigmas.map((q) => [q.hours, q.s[1]]), label: true, labelText: 'Fraction' },
    ], x: { min: 0, max: 24, ticks: [0, 6, 12, 18, 24], format: (h) => `${h} h` } });
    // Both readings' covariance at 24 h, where HPOP reports it, at true scale,
    // with the last revolution leading there.
    const at24 = (rows) => {
      const sample = runs[rows].result.FINAL_SAMPLE, st = sample.STATE.STATE, n = sample.COVARIANCE.DIMENSION, P = sample.COVARIANCE.VALUES;
      const r = [st.POSITION.X, st.POSITION.Y, st.POSITION.Z].map((x) => x / 1000), v = [st.VELOCITY.X, st.VELOCITY.Y, st.VELOCITY.Z].map((x) => x / 1000);
      return { r, v, Prtn: rtnCovariance(rtn(r, v), [0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => P[i * n + j] / 1e6))) };
    };
    const fraction = at24('fractional'), printed = at24('absolute');
    const epochMs = Date.parse(`${runs.fractional.report.epochUtc}Z`);
    const lastRev = await resampled(hpop, [frameOf('request', runs.fractional.request), frameOf('earth_orientation', out(runs.fractional.read, 'earth_orientation'))],
      Array.from({ length: 100 }, (_, k) => 24 * 3600 - 95 * 60 + k * 57.6));
    const basis = rtn(fraction.r, fraction.v);
    const longest = Math.sqrt(Math.max(printed.Prtn[4], fraction.Prtn[4])), thinnest = Math.sqrt(Math.max(fraction.Prtn[0], fraction.Prtn[8]));
    const thin = Math.max(1, 10 ** Math.round(Math.log10((0.08 * longest) / thinnest)));
    await view.draw((g) => {
      g.track(lastRev.slice(1), { color: 'muted', width: 1.5, alpha: 0.7, frame: false });
      g.covariance(fraction.r, basis, printed.Prtn, 1, { thin: thin, color: 'cyan', alpha: 0.2, outline: true });
      g.covariance(fraction.r, basis, fraction.Prtn, 1, { thin: thin, color: 'accent', alpha: 0.6, outline: true });
      g.axes(fraction.r, basis, longest * 1.25, ['Radial', 'In-track', 'Cross-track'], { color: 'muted' });
      g.label(v3.add(fraction.r, v3.scale(basis[1], -Math.sqrt(printed.Prtn[4]) * 0.7)), `As printed · in-track σ ${formatMeters(Math.sqrt(printed.Prtn[4]) * 1000)}`, { color: 'cyan', size: 11, above: true });
      g.label(v3.add(fraction.r, v3.scale(basis[1], Math.sqrt(fraction.Prtn[4]))), `Fraction · ${formatMeters(Math.sqrt(fraction.Prtn[4]) * 1000)}`, { color: 'accent', size: 11 });
      g.view({ direction: v3.unit(v3.add(v3.add(v3.scale(basis[0], 0.55), v3.scale(basis[2], 0.8)), v3.scale(basis[1], 0.2))), includeEarth: false });
    }, { frame: 'GCRF', epochMs: epochMs + 24 * 3600e3, caption: `GCRF at 24 h; 1σ position ellipsoids, longest axis true scale${thin > 1 ? `, the shorter axes ×${thin}` : ''}`,
      legend: [['accent', 'B row as a fraction', 'solid'], ['cyan', 'B row as printed', 'solid'], ['muted', 'The last revolution']] });
    // Read the written message again: the covariance the text keeps.
    const again = await adapter.invoke('read', [{ portId: 'message', payload: new TextEncoder().encode(written) },
      { portId: 'options', payload: new TextEncoder().encode(JSON.stringify({ ephemerisSource: 'Analytical', arcSeconds: 3600 })) }]);
    const cov = (read) => { const r = decodePrw(out(read, 'request')).EXECUTION_REQUEST; return r.INITIAL_COVARIANCE ?? r.INITIAL.COVARIANCE; };
    const finalCov = runs.fractional.result.FINAL_SAMPLE.COVARIANCE, readBack = cov(again), n = finalCov.DIMENSION;
    let worst = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) worst = Math.max(worst, Math.abs(readBack.VALUES[i * n + j] - finalCov.VALUES[i * n + j]) / Math.sqrt(finalCov.VALUES[i * n + i] * finalCov.VALUES[j * n + j]));
    pre(back, written);
    tiles(back, [['In-track σ, 24 h, fraction', formatMeters(last('fractional')[1])], ['As printed', formatMeters(last('absolute')[1])], ['Round trip, of the sigmas', num(worst, 2)]]);
    return `Read, propagated and written here. The printed U, V, W sigmas come back within ${num(Math.max(...[0, 1, 2].map((i) => Math.abs(report.recomputedUvwSigmasKm[i] / report.statedUvwSigmasKm[i] - 1))) * 100, 2)} %; the written VCM keeps the covariance to ${num(worst, 2)} of its sigmas.`;
  });
}
