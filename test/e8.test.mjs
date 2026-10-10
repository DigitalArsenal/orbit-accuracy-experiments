// End-to-end checks of E8's information cutoff (experiments/e8-omm-density
// PLAN.md section 2): in forecast mode nothing released after the cutoff may
// enter. On the real archive; skipped, and reported as skipped, without it.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { config, DAY_MS, isoDay, setIndices } from '../experiments/e8-omm-density/common.mjs';

const haveDrivers = fs.existsSync(config.inputs.solfsmy) && config.inputs.rsga.every((p) => fs.existsSync(p));
const haveArchive = fs.existsSync(config.inputs.gpHistory);

test('E8 operational JB2008 rows at a cutoff: released values before its day, the RSGA issued before it after', { skip: !haveDrivers && 'SET or SWPC files absent' }, async () => {
  const { operationalJb2008Rows, rsga } = await import('../experiments/e8-omm-density/drivers.mjs');
  const { sol, dtc } = setIndices();
  for (const day of ['2026-01-20', '2026-04-05', '2026-07-01']) {
    const t0 = Date.parse(`${day}T00:00:00Z`);
    const rows = operationalJb2008Rows(t0, isoDay(t0 - 8 * DAY_MS), isoDay(t0 + 9 * DAY_MS));
    const report = rsga().reports.filter((r) => r.issuedMs < t0).at(-1);
    assert.ok(report && t0 - report.issuedMs <= DAY_MS, `the RSGA of the evening before ${day}`);
    const prior = sol.get(isoDay(t0 - DAY_MS));
    for (const r of rows) {
      const t = Date.parse(`${r.DATE}T00:00:00Z`);
      if (t < t0) {
        // Released: SET's daily values and hourly DTC as published.
        for (const k of ['F10', 'S10', 'M10', 'Y10']) assert.equal(r[k], sol.get(r.DATE)[k], `${day}: ${r.DATE} ${k}`);
        assert.deepEqual(r.DTC_HOURLY_K, dtc.get(r.DATE));
      } else {
        // After the cutoff: S10, M10 and Y10 held at the last released day,
        // F10 and DTC from the RSGA's three predicted days, then held.
        for (const k of ['S10', 'M10', 'Y10']) assert.equal(r[k], prior[k], `${day}: ${r.DATE} ${k} held`);
        const ap = report.predictedAp.filter((x) => x.day <= t).at(-1).value;
        const { intercept, sqrtApSlope } = config.drivers.operational.dtcFromAp;
        assert.ok(r.DTC_HOURLY_K.every((v) => Math.abs(v - (intercept + sqrtApSlope * Math.sqrt(ap))) < 1e-9), `${day}: ${r.DATE} DTC`);
        const f = report.predictedF107.filter((x) => x.day <= t).at(-1);
        const scale = sol.get(isoDay(report.observedF107.day)).F10 / report.observedF107.value;
        assert.ok(Math.abs(r.F10 - f.value * scale) < 1e-9, `${day}: ${r.DATE} F10`);
      }
    }
  }
});

test('E8 element sets at a cutoff: of each epoch, the latest version created before it, nothing created after', { skip: !haveArchive && `no archive at ${config.inputs.gpHistory}` }, async () => {
  const { asOf, scanCreationDays } = await import('../experiments/e8-omm-density/omm.mjs');
  // Two creation days of rocket bodies near 400-500 km: every version kept.
  const objects = scanCreationDays('2026-04-04', '2026-04-05', (n, g) => g.OBJECT_TYPE === 'ROCKET BODY' && +g.PERIAPSIS > 400 && +g.PERIAPSIS < 500);
  const t0 = Date.parse('2026-04-05T12:00:00Z');
  let checked = 0, later = 0;
  for (const o of objects.values()) {
    const sets = asOf(o.rows, t0 - 3 * DAY_MS, t0, t0);
    for (const r of sets) assert.ok(r[1] !== null && r[1] < t0, `${o.norad}: a set created at ${new Date(r[1]).toISOString()}`);
    later += o.rows.filter((r) => r[0] < t0 && r[1] >= t0).length;
    // Each kept set is the latest version of its epoch created before t0.
    for (const r of sets) {
      const versions = o.rows.filter((x) => Math.abs(x[0] - r[0]) <= 1000 && x[1] !== null && x[1] < t0);
      assert.equal(r[1], Math.max(...versions.map((x) => x[1])));
    }
    checked += sets.length;
  }
  assert.ok(checked > 100, `${checked} sets checked`);
  assert.ok(later > 0, 'some sets with epochs before the cutoff were created after it (and were left out)');
});
