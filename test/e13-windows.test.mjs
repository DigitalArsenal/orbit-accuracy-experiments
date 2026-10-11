// End-to-end check of E13's test-split guard (experiments/e13-open-dca PLAN.md sections 7 and 9, Deviation D1) on real git repositories: a test split is
// readable only when config.json (frozen), PLAN.md, amendments.json AND results/e13/selection.json are committed and unchanged; the dev split always is.
// The guard is the one every step that reads a test split calls (Planet arcs, Swarm and GRACE-FO densities and orbits, scoring).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { repoRoot } from '../harness/provenance.mjs';
import { SELECTION_FILE, assertWindowReadable } from '../experiments/e13-open-dca/windows.mjs';

const git = (root, ...args) => execFileSync('git', ['-C', root, '-c', 'user.name=e13-test', '-c', 'user.email=e13-test@example.org', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], { encoding: 'utf8' });

test('a test split is refused without a committed, unchanged selection.json (and without the frozen files); the dev split never is', () => {
  fs.mkdirSync(path.join(repoRoot, 'runs'), { recursive: true });
  const root = fs.mkdtempSync(path.join(repoRoot, 'runs', 'e13-windows-'));
  try {
    const dir = path.join(root, 'experiments', 'e13-open-dca');
    fs.mkdirSync(dir, { recursive: true });
    git(root, 'init', '-q');
    const frozenConfig = { frozen: true };
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(frozenConfig));
    fs.writeFileSync(path.join(dir, 'PLAN.md'), '# plan\n');
    fs.writeFileSync(path.join(dir, 'amendments.json'), '{}\n');
    const options = { root, dir, cfg: frozenConfig };
    const refuses = (split, pattern, o = options) => assert.throws(() => assertWindowReadable(split, o), pattern, `${split} should be refused (${pattern})`);

    // nothing committed yet: the freeze is missing
    assertWindowReadable('dev', options);
    refuses('testA', /differs from its committed version|not committed/);
    git(root, 'add', '.');
    git(root, 'commit', '-q', '-m', 'freeze');

    // the freeze is committed, the selection does not exist: refused for both test splits (this is the gap of Deviation D1)
    refuses('testA', /selection\.json \(step 40\) exists/);
    refuses('testB', /selection\.json \(step 40\) exists/);
    assertWindowReadable('dev', options);

    // the selection exists but is not committed
    fs.mkdirSync(path.join(root, 'results', 'e13'), { recursive: true });
    fs.writeFileSync(path.join(root, SELECTION_FILE), '{"solver": "x"}\n');
    refuses('testA', /differs from its committed version|not committed/);
    git(root, 'add', SELECTION_FILE);
    refuses('testA', /differs from its committed version|not committed/);       // staged is not committed

    // committed: both test splits open
    git(root, 'commit', '-q', '-m', 'selection');
    assertWindowReadable('testA', options);
    assertWindowReadable('testB', options);

    // the selection changed after its commit: closed again
    fs.writeFileSync(path.join(root, SELECTION_FILE), '{"solver": "y"}\n');
    refuses('testA', /differs from its committed version/);
    git(root, 'checkout', '-q', '--', SELECTION_FILE);
    assertWindowReadable('testA', options);

    // the plan, the amendments or the configuration changed after the freeze: closed
    for (const f of ['PLAN.md', 'amendments.json', 'config.json']) {
      const file = path.join(dir, f), original = fs.readFileSync(file, 'utf8');
      fs.writeFileSync(file, `${original}\nedited\n`);
      refuses('testA', /differs from its committed version/);
      fs.writeFileSync(file, original);
      assertWindowReadable('testA', options);
    }

    // a configuration that is not frozen is closed whatever is committed
    refuses('testA', /locked until config\.json is frozen/, { ...options, cfg: { frozen: false } });
    assertWindowReadable('dev', { ...options, cfg: { frozen: false } });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
