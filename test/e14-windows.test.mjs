// End-to-end check of E14's window guard (experiments/e14-covariance-realism PLAN.md section 7) on real git
// repositories: a test window ('test' and 's1:test') is readable only when config.json (frozen), PLAN.md,
// amendments.json (when present) AND results/e14/selection.json are committed and unchanged; development windows
// always are. Spans and S1 pairs that reach into a test window need the same guard.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { repoRoot } from '../harness/provenance.mjs';
import { SELECTION_FILE, assertWindowReadable, assertSpanReadable, assertPairReadable, s1WindowOfPair, windowOfSpan, config } from '../experiments/e14-covariance-realism/windows.mjs';

const git = (root, ...args) => execFileSync('git', ['-C', root, '-c', 'user.name=e14-test', '-c', 'user.email=e14-test@example.org', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], { encoding: 'utf8' });
const ms = (iso) => Date.parse(iso);

test('the test windows are refused until the frozen files and selection.json are committed and unchanged; dev windows never are', () => {
  fs.mkdirSync(path.join(repoRoot, 'runs'), { recursive: true });
  const root = fs.mkdtempSync(path.join(repoRoot, 'runs', 'e14-windows-'));
  try {
    const dir = path.join(root, 'experiments', 'e14-covariance-realism');
    fs.mkdirSync(dir, { recursive: true });
    git(root, 'init', '-q');
    const frozen = { ...config, frozen: true };
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(frozen));
    fs.writeFileSync(path.join(dir, 'PLAN.md'), '# plan\n');
    const options = { root, dir, cfg: frozen };
    const refuses = (fn, pattern) => assert.throws(fn, pattern);
    const tests = ['test', 's1:test'];
    const devs = ['history', 'devFit', 'devSelect', 's1:devFit', 's1:devSelect'];

    // nothing committed: refused; dev readable
    for (const w of tests) refuses(() => assertWindowReadable(w, options), /not committed|differs from its committed version/);
    for (const w of devs) assertWindowReadable(w, options);
    git(root, 'add', '.');
    git(root, 'commit', '-q', '-m', 'plan and frozen config');

    // committed, no selection: refused for both test windows
    for (const w of tests) refuses(() => assertWindowReadable(w, options), /selection\.json exists/);

    // selection written, then staged: still refused
    fs.mkdirSync(path.join(root, 'results', 'e14'), { recursive: true });
    fs.writeFileSync(path.join(root, SELECTION_FILE), '{"S3": "S3-KC"}\n');
    refuses(() => assertWindowReadable('test', options), /not committed|differs/);
    git(root, 'add', SELECTION_FILE);
    refuses(() => assertWindowReadable('test', options), /not committed|differs/);

    // committed: both open
    git(root, 'commit', '-q', '-m', 'selection');
    for (const w of tests) assertWindowReadable(w, options);

    // the selection edited after its commit: closed until restored
    fs.writeFileSync(path.join(root, SELECTION_FILE), '{"S3": "S3-T"}\n');
    for (const w of tests) refuses(() => assertWindowReadable(w, options), /differs from its committed version/);
    git(root, 'checkout', '-q', '--', SELECTION_FILE);
    assertWindowReadable('test', options);

    // PLAN.md or config.json edited after the freeze: closed
    for (const f of ['PLAN.md', 'config.json']) {
      const file = path.join(dir, f), original = fs.readFileSync(file, 'utf8');
      fs.writeFileSync(file, `${original}\n`);
      refuses(() => assertWindowReadable('test', options), /differs from its committed version/);
      fs.writeFileSync(file, original);
      assertWindowReadable('test', options);
    }

    // an amendments.json that appears is part of the freeze: uncommitted -> closed; committed -> open
    fs.writeFileSync(path.join(dir, 'amendments.json'), '{}\n');
    refuses(() => assertWindowReadable('test', options), /not committed|differs/);
    git(root, 'add', '.');
    git(root, 'commit', '-q', '-m', 'amendments');
    assertWindowReadable('s1:test', options);

    // a configuration that is not frozen keeps the test windows closed, whatever is committed
    const thawed = { ...options, cfg: { ...frozen, frozen: false } };
    for (const w of tests) refuses(() => assertWindowReadable(w, thawed), /locked until config\.json is frozen/);
    for (const w of devs) assertWindowReadable(w, thawed);

    // spans: a dev span is readable when thawed; any span touching the test window (or later truth) is not
    assertSpanReadable(ms('2025-11-01T00:00:00Z'), ms('2025-11-08T00:00:00Z'), thawed);
    refuses(() => assertSpanReadable(ms('2026-04-28T00:00:00Z'), ms('2026-05-02T00:00:00Z'), thawed), /locked/);
    refuses(() => assertSpanReadable(ms('2026-10-02T00:00:00Z'), ms('2026-10-03T00:00:00Z'), thawed), /locked/);
    assertSpanReadable(ms('2026-04-28T00:00:00Z'), ms('2026-05-02T00:00:00Z'), options);
    assert.equal(windowOfSpan(ms('2026-04-28T00:00:00Z'), ms('2026-05-02T00:00:00Z'), frozen), null);
    assert.equal(windowOfSpan(ms('2026-03-01T00:00:00Z'), ms('2026-03-08T00:00:00Z'), frozen), 'devSelect');

    // S1 pairs
    assert.equal(s1WindowOfPair(ms('2026-10-11T00:00:00Z'), ms('2026-10-12T00:00:00Z'), frozen), 's1:devFit');
    assert.equal(s1WindowOfPair(ms('2026-10-12T00:00:00Z'), ms('2026-10-14T00:00:00Z'), frozen), 's1:devSelect');
    assert.equal(s1WindowOfPair(ms('2026-10-14T12:00:00Z'), ms('2026-10-15T12:00:00Z'), frozen), null);
    assert.equal(s1WindowOfPair(ms('2026-10-15T00:00:00Z'), ms('2026-10-16T00:00:00Z'), frozen), 's1:test');
    assert.equal(assertPairReadable(ms('2026-10-11T00:00:00Z'), ms('2026-10-12T00:00:00Z'), thawed), 's1:devFit');
    refuses(() => assertPairReadable(ms('2026-10-15T00:00:00Z'), ms('2026-10-16T00:00:00Z'), thawed), /locked/);
    refuses(() => assertPairReadable(ms('2026-10-14T12:00:00Z'), ms('2026-10-15T12:00:00Z'), thawed), /locked/);
    assert.equal(assertPairReadable(ms('2026-10-15T00:00:00Z'), ms('2026-10-16T00:00:00Z'), options), 's1:test');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
