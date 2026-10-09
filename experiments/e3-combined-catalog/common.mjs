// Shared by E3's steps: configuration, the window lock, and paths.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { modulesRoot } from '../../harness/modules.mjs';
import { repoRoot } from '../../harness/provenance.mjs';

export const experimentDir = path.dirname(new URL(import.meta.url).pathname);
export const configPath = path.join(experimentDir, 'config.json');
export const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const DAY_MS = 86400000;

// Common flags; a step adds its own in `extra`. The test window is refused
// while config.json is not frozen (README rule 2).
export function cli(extra = {}) {
  const { values } = parseArgs({
    options: {
      window: { type: 'string', default: 'train' },
      modules: { type: 'string' },
      archive: { type: 'string' },
      reference: { type: 'string' },
      days: { type: 'string' },  // limit to the first N issue days, for smoke runs
      ...extra,
    },
  });
  const window = config.windows[values.window];
  if (!window) throw new Error(`unknown window ${values.window}; one of ${Object.keys(config.windows).join(', ')}`);
  if (values.window === 'test' && !config.frozen) throw new Error('the test window is locked until config.json is frozen (PLAN.md section 1)');
  let issueTimes = [];
  for (let t = Date.parse(`${window[0]}T${config.issueTimeUtc}Z`); t <= Date.parse(`${window[1]}T${config.issueTimeUtc}Z`); t += DAY_MS) issueTimes.push(t);
  if (values.days) issueTimes = issueTimes.slice(0, Number(values.days));
  return {
    values,
    window: { name: values.window, from: window[0], to: window[1] },
    issueTimes,
    modules: modulesRoot({ flag: values.modules, configured: config.inputs.modules, repoRoot }),
    archive: path.resolve(values.archive ?? process.env.SDN_GP_HISTORY ?? config.inputs.gpHistory),
    reference: path.resolve(values.reference ?? process.env.SDN_REFERENCE_STATES ?? config.inputs.reference),
  };
}
