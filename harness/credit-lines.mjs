#!/usr/bin/env node
// Credit lines owed by published analysis (data/licenses.json): ESA's "© ESA"
// and "Data provided by the European Space Agency (ESA)", the Navigation
// Support Office's © mark, the Copernicus notice, and the Space-Track
// citation. Writes (or refreshes) a "Credits" section between markers at the
// end of every README.md and REPORT.md under results/, for the experiment the
// directory belongs to. Reports and READMEs that a step regenerates lose the
// section; run this again after regenerating them.
//
//   node harness/credit-lines.mjs          # update in place
//   node harness/credit-lines.mjs --check  # exit 1 if any file lacks the current section
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { creditsFor, repoRoot, source } from './data-licenses.mjs';

const REQUIRED = ['esa-earth-observation', 'esa-navigation-office', 'esa-navigation-office-pod', 'copernicus-sentinel', 'space-track'];
const EXPERIMENT = { v1: 'V1', e1: 'E1', e2: 'E2', e2b: 'E2b', e3: 'E3', e4: 'E4', e5: 'E5', e6: 'E6', e7: 'E7', e10: 'E10' };
const BEGIN = '<!-- credits:begin (harness/credit-lines.mjs) -->', END = '<!-- credits:end -->';

export function creditSection(experiment, docs = 'docs/data-licenses.md') {
  const owed = creditsFor(experiment);
  const lines = REQUIRED.map(source).map((s) => s.credit).filter((c) => owed.includes(c));
  if (!lines.length) return null;
  const esa = lines.some((c) => /European Space Agency/.test(c));
  return [BEGIN, '', '## Credits', '', ...lines.map((c) => `- ${c}`), '',
    ...(esa ? ['ESA data and the information analysed from it are marked as ESA asks: © ESA 2026; Data provided by the European Space Agency (ESA).', ''] : []),
    `Every source and its terms: [docs/data-licenses.md](${docs}#credits-by-experiment).`, '', END].join('\n');
}

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
export function targets() {
  const root = path.join(repoRoot, 'results');
  return walk(root).filter((f) => /(^|\/)(README|REPORT)\.md$/.test(f) && !/\/data\//.test(f)).map((f) => ({ file: f, experiment: EXPERIMENT[path.relative(root, f).split(path.sep)[0]] })).filter((t) => t.experiment);
}

const docsFrom = (file) => path.relative(path.dirname(file), path.join(repoRoot, 'docs/data-licenses.md'));
export function apply(file, experiment) {
  const section = creditSection(experiment, docsFrom(file));
  if (!section) return false;
  const body = fs.readFileSync(file, 'utf8');
  const at = body.indexOf(BEGIN);
  const next = `${(at >= 0 ? body.slice(0, at) : body).replace(/\s*$/, '\n')}\n${section}\n`;
  if (next === body) return false;
  fs.writeFileSync(file, next);
  return true;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  let changed = 0;
  for (const { file, experiment } of targets()) {
    if (check) {
      const section = creditSection(experiment, docsFrom(file));
      if (section && !fs.readFileSync(file, 'utf8').includes(section)) { console.log(`missing: ${path.relative(repoRoot, file)}`); changed++; }
    } else if (apply(file, experiment)) { console.log(`credits: ${path.relative(repoRoot, file)} (${experiment})`); changed++; }
  }
  if (check) process.exit(changed ? 1 : 0);
  console.log(`${changed} files updated`);
}
