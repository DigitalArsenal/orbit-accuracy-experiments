// The windows of a group: cutoffs at 00:00 UTC, an explicit `dates` list or `from`..`to` every `everyDays` days, and the window key AP6 uses. Pure functions; no data is read.
const DAY = 86400000;
export const dayStr = (t) => new Date(t).toISOString().slice(0, 10);
export const every = (from, to, days) => { const out = []; for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += days * DAY) out.push(t); return out; };
export const cutoffsOf = (c) => (c.dates ? c.dates.map((d) => Date.parse(`${d}T00:00:00Z`)) : every(c.from, c.to, c.everyDays));
export const windowKey = (group, name, t) => `${group}|${name}|${dayStr(t)}`;
