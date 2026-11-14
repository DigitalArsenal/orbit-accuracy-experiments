import fs from 'node:fs';
import path from 'node:path';
import { sha256 } from './config.mjs';

/** Write the weather inputs read by one fit shard, identified by its look. */
export function writeWeatherManifest(config, arm, shard, forecasterSha256, weatherDays) {
  if (!weatherDays.size) return;
  const days = Object.fromEntries([...weatherDays].sort());
  const lines = Object.entries(days).flatMap(([d, files]) => files.map((f) => `${d} ${f.file} ${f.sha256}\n`)).join('');
  const [i, n] = shard.split('/').map(Number);
  const name = n > 1 ? `inputs-weather-${arm}-${i}of${n}.json` : `inputs-weather-${arm}.json`;
  fs.writeFileSync(path.join(config.storeDir, name), JSON.stringify({ kind: 'weather',
    ...(config.look ? { look: config.look.number } : {}), forecasterSha256, days, aggregateSha256: sha256(lines) }, null, 1));
}
