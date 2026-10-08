// Shared by E1's steps: configuration, arguments and paths.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { modulesRoot } from '../../harness/modules.mjs';
import { repoRoot } from '../../harness/provenance.mjs';

export const experimentDir = path.dirname(new URL(import.meta.url).pathname);
export const configPath = path.join(experimentDir, 'config.json');
export const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Common flags; a step adds its own in `extra`.
export function cli(extra = {}) {
  const { values } = parseArgs({
    options: {
      window: { type: 'string', default: 'a0' },
      modules: { type: 'string' },
      archive: { type: 'string' },
      reference: { type: 'string' },
      objects: { type: 'string' },  // comma-separated NORAD numbers, for smoke runs
      ...extra,
    },
  });
  const window = config.windows[values.window];
  if (!window) throw new Error(`unknown window ${values.window}; one of ${Object.keys(config.windows).join(', ')}`);
  if (values.window === 'test' && !config.frozen) throw new Error('the test window is locked until config.json is frozen (PLAN.md §1)');
  return {
    values,
    window: { name: values.window, from: window[0], to: window[1] },
    modules: modulesRoot({ flag: values.modules, configured: config.inputs.modules, repoRoot }),
    archive: path.resolve(values.archive ?? process.env.SDN_GP_HISTORY ?? config.inputs.gpHistory),
    reference: path.resolve(values.reference ?? process.env.SDN_REFERENCE_STATES ?? config.inputs.reference),
    objects: values.objects ? new Set(values.objects.split(',').map(Number)) : null,
  };
}
