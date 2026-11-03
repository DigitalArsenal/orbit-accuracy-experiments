// Aggregates the registered store into results/ap-heo-frame-confirm/{metrics.json,README.md}. Statistics only; no physics.
import fs from 'node:fs';
import path from 'node:path';
import { aggregate, render, readRows } from './lib/table-lib.mjs';

const cfg = JSON.parse(fs.readFileSync(new URL('./config.json', import.meta.url), 'utf8'));
const metrics = aggregate(cfg, readRows(cfg.store)), out = new URL('../../results/ap-heo-frame-confirm/', import.meta.url).pathname;
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'metrics.json'), `${JSON.stringify(metrics)}\n`);
fs.writeFileSync(path.join(out, 'README.md'), render(cfg, metrics));
console.error(`${metrics.windows} windows, ${metrics.statements.length} statements -> ${out}`);
