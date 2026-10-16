// Repository-to-wire rename check: source tree, the site's real module list,
// and the resident PRW bytes produced by the production harness.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));
// Assemble the retired spelling so this check also scans its own source.
const retired = ['h', 'pop'].join('');
const retiredPattern = new RegExp(retired, 'i');
const cidPattern = new RegExp(`\\bbafy[a-z2-7]*${retired}[a-z2-7]*\\b`, 'g');

function sourceFiles(relative = '.') {
  return fs.readdirSync(path.join(repo, relative), { withFileTypes: true }).flatMap((entry) => {
    const name = path.posix.join(relative, entry.name);
    if (entry.name === '.git' || entry.name === 'node_modules'
      || ['results', 'site/dist', 'site/generated'].includes(name)) return [];
    // Do not follow links out of this worktree.
    if (entry.isSymbolicLink()) return [];
    return entry.isDirectory() ? sourceFiles(name) : [name];
  });
}

test('FFM rename reaches the source tree, site module list and resident PRW identity', async (t) => {
  const files = sourceFiles().sort();
  const hits = files.filter((name) => retiredPattern.test(name));
  for (let start = 0; start < files.length; start += 100) {
    const scan = spawnSync('grep', ['-nHi', '--', retired, ...files.slice(start, start + 100)], {
      cwd: repo, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    });
    assert.ifError(scan.error);
    assert.ok(scan.status === 0 || scan.status === 1, scan.stderr || `grep exited ${scan.status}`);
    for (const line of scan.stdout.split('\n').filter(Boolean)) {
      if (retiredPattern.test(line.replace(cidPattern, ''))) hits.push(line);
    }
  }
  assert.deepEqual(hits, [], `Retired propagator spelling remains:\n${hits.join('\n')}`);
  t.diagnostic(`Source grep: ${files.length} files; zero retired-name hits outside the permitted CID exception.`);

  const { moduleList } = await import('../site/module-list.mjs');
  assert.ok(moduleList.includes('propagator/ffm'));
  assert.ok(moduleList.every((name) => !retiredPattern.test(name)));
  t.diagnostic('Site module list imports without running the build and names propagator/ffm.');

  if (!fs.existsSync(path.join(repo, 'node_modules'))) {
    const source = fs.readFileSync(path.join(repo, 'harness/prw.mjs'), 'utf8');
    assert.match(source, /MODULE_ID:\s*['"]com\.orbpro\.ffm['"]/);
    t.diagnostic('node_modules absent: PRW byte decoding was NOT run; source-string MODULE_ID assertion passed (weaker verification).');
    return;
  }

  const [prw, flatbuffers, P] = await Promise.all([
    import('../harness/prw.mjs'),
    import('flatbuffers'),
    import('spacedatastandards.org/lib/js/PRW/main.js'),
  ]);
  const epoch = '2026-10-16T00:00:00.000000Z';
  const { identity, frames } = prw.residentIngestFrames('ffm-rename-e2e', 1, [{
    handle: 1, norad: 1, epoch, position: [7000, 0, 0], velocity: [0, 7.5, 0],
  }]);
  assert.equal(frames.length, 1);
  const decode = (frame) => P.PRW.getSizePrefixedRootAsPRW(new flatbuffers.ByteBuffer(frame.payload)).unpack();
  assert.equal(decode(frames[0]).RESIDENT_STATE.INSTANCE.MODULE_ID, 'com.orbpro.ffm');
  const request = prw.residentRequestFrame(identity, epoch, [1]);
  assert.equal(decode(request).RESIDENT_REQUEST.INSTANCE.MODULE_ID, 'com.orbpro.ffm');
  t.diagnostic('Decoded production resident state and request bytes with the SDS PRW binding: MODULE_ID = com.orbpro.ffm.');
});
