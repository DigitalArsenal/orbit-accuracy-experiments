// The full-force environment of one FFM-1 arc (V1c3's, with the weather and Earth orientation of V1c4's registered files):
// the DE440 kernel, IERS finals2000A observed rows through data-source/eop-parser, and the GFZ/NOAA space-weather rows.
// Selection of rows only; nothing is computed here.
import fs from 'node:fs';
import path from 'node:path';
import { loadModule } from '../../harness/modules.mjs';
import { finalsRecords, eopFrame } from '../../harness/eop.mjs';
import { readGfzKp, spwRows, spaceWeatherFrame } from '../../harness/full-force.mjs';
import { observedFinals } from '../e3-combined-catalog/eop-finals.mjs';
import { bindings } from '../v1c-console-ffm-path/modules.mjs';

export async function environmentOf({ runtime, run, config }) {
  const b = await bindings(runtime), parser = await loadModule(runtime, 'data-source/eop-parser');
  run.modules[parser.provenance.path] = parser.provenance;
  const w = config.environment;
  const finals = await finalsRecords(parser, observedFinals(run.input('eop', w.eopFinals).toString('latin1'))); await parser.destroy();
  const kernel = { portId: 'kernel', typeRef: b.catalog.TYPE, payload: b.catalog.kernelRecord(run.input('kernel', path.join(runtime, w.kernel))) };
  // Daily drivers: the archived GFZ history (to its last day), then the archived GFZ nowcast for the later days.
  const gfz = readGfzKp(w.gfzHistory); run.input('weather', w.gfzHistory);
  const last = [...gfz.days.keys()].sort().at(-1);
  const nowcast = readGfzKp(w.gfzNowcast); run.input('weather', w.gfzNowcast);
  for (const [date, row] of nowcast.days) if (date > last && row.kp.every(k => k >= 0) && row.f107obs > 0) gfz.days.set(date, row);
  const forecast = run.input('weather', w.noaaForecast).toString().split('45-DAY F10.7 CM FLUX FORECAST')[1];
  if (!forecast) throw new Error('45-day F10.7 forecast missing');
  for (const match of forecast.matchAll(/(\d{2})([A-Za-z]{3})(\d{2})\s+(\d{3})/g)) {
    const date = new Date(`${match[1]} ${match[2]} 20${match[3]} 00:00:00 UTC`).toISOString().slice(0, 10);
    if (!(gfz.days.get(date)?.f107obs > 0)) gfz.days.set(date, { ...(gfz.days.get(date) ?? {}), f107obs: +match[4], f107adj: +match[4] });
  }
  return (first, lastMs) => [kernel, eopFrame(finals.records, Math.floor(first / 86400000) + 40586, Math.floor(lastMs / 86400000) + 40589),
    spaceWeatherFrame(spwRows(gfz, first - 86400000, lastMs + 2 * 86400000))];
}
