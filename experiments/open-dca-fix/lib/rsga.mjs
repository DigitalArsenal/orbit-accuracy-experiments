// Amendment A3: the RSGA bulletins as every row of this experiment reads them. The reader is xp2-fit-design's, taken by git show at its registered commit with its SHA-256 checked; XM's parser,
// unchanged, reads what it writes. Data preparation only: dates and values, no physics.
import fs from 'node:fs';
import path from 'node:path';
import { config, root, store, git, sha256, writeJson } from '../common.mjs';

export const weatherStore = path.join(store, 'weather-a3');
export const normalizedDir = path.join(weatherStore, 'rsga/normalized');
const recordFile = path.join(weatherStore, 'normalization.json');

async function reader() {
  const c = config.weather.reader, bytes = git(root, 'show', `${c.commit}:${c.path}`);
  if (sha256(bytes) !== c.sha256) throw new Error(`${c.path} at ${c.commit} is ${sha256(bytes)}, registered ${c.sha256}`);
  const file = path.join(store, 'build', `rsga-reader-${c.sha256.slice(0, 16)}.mjs`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
  return import(file);
}
/** One hash over the normalized bulletins of a span: each name and its text's SHA-256. */
const hashOf = (records, from, to) => sha256(records.filter((r) => r.name >= from && r.name <= to).map((r) => `${r.name} ${r.sha256Normalized}\n`).join(''));
const nameOf = (day) => `${day}RSGA.txt`;

/** Writes the normalized bulletins and their record from the registered bundles. Returns the counts of the bundles and of this experiment's span, and any bulletin left unresolved or unparsed. */
export async function prepareWeather(parseRsga) {
  const { prepareRsga, countsOf } = await reader(), records = prepareRsga({ bundles: config.weather.bundles, store: weatherStore, parseRsga }), [from, to] = config.weather.span.map(nameOf);
  const counts = { bundles: countsOf(records, nameOf('00000000'), nameOf('99999999')), span: countsOf(records, from, to), spanHash: hashOf(records, from, to) };
  const stopped = records.filter((r) => !r.parsed || r.actions.some((a) => a.unresolved)).map((r) => r.name);
  writeJson(recordFile, { reader: config.weather.reader, bundles: config.weather.bundles, counts, stopped, records });
  return { counts, stopped, rewritten: records.filter((r) => r.actions.length).map((r) => ({ name: r.name, actions: r.actions })) };
}
/** The store holds what the registered reader writes: its counts and hash as registered, every bulletin's bytes as recorded, each one read by XM's parser. */
export async function verifyWeather(parseRsga) {
  await reader();
  const saved = JSON.parse(fs.readFileSync(recordFile)), { span, spanHash } = saved.counts, [from, to] = config.weather.span.map(nameOf);
  if (JSON.stringify(span) !== JSON.stringify(config.weather.counts) || spanHash !== config.weather.spanHash || hashOf(saved.records, from, to) !== spanHash) throw new Error('the normalized bulletins are not the registered ones');
  for (const r of saved.records) {
    const bytes = fs.readFileSync(path.join(normalizedDir, r.name));
    if (sha256(bytes) !== r.sha256Normalized || !parseRsga(bytes.toString('utf8'))) throw new Error(`${r.name} is not as recorded`);
  }
}
