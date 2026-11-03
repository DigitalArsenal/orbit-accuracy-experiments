// Record bytes consumed by synchronous archive readers before returning them.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
// AP5's GN fitter uses XM's spent-window control store and weather configuration.
if (process.argv[process.argv.indexOf('--method') + 1] === 'gn') process.env.XP2F_CONTROL = '1';
const read = fs.readFileSync.bind(fs);
const config = JSON.parse(read(new URL('./config.json', import.meta.url)));
const seen = new Map();
fs.readFileSync = function(file, ...args) {
  const p = file instanceof URL ? fileURLToPath(file) : String(file);
  const norad = /\/(\d+)\.oem$/.exec(p)?.[1];
  if (norad && config.EXCLUDE_NORADS.includes(Number(norad))) throw new Error('excluded NORAD before read');
  if (p.includes('/opt/data/') && /starlink|\.secrets/i.test(p)) throw new Error('excluded archive path');
  const bytes = read(file, ...args);
  if (p.startsWith('/opt/data/') && !p.includes('/ap-gap/') && !seen.has(p)) {
    seen.set(p, {path:p, sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
  }
  return bytes;
};
export function writeAudit(out, shard) {
  fs.writeFileSync(`${out}/inputs-${shard}.json`, JSON.stringify([...seen.values()],null,2)+'\n');
}

export async function pinFile(file) {
  if(seen.has(file))return;
  const h=crypto.createHash('sha256');
  for await(const chunk of fs.createReadStream(file))h.update(chunk);
  seen.set(file,{path:file,sha256:h.digest('hex')});
}
