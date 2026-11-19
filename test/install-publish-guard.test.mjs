import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const installGuardPath = fileURLToPath(
  new URL('../scripts/install-publish-guard.mjs', import.meta.url),
);

test('publish-guard setup skips cleanly in Git checkouts without an origin remote', (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'publish-guard-install-test-'));
  context.after(() => rmSync(directory, { recursive: true, force: true }));

  const init = spawnSync('git', ['init', '--initial-branch=main'], {
    cwd: directory,
    encoding: 'utf8',
  });
  assert.equal(init.status, 0, init.stderr);

  const result = spawnSync(process.execPath, [installGuardPath], {
    cwd: directory,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Skipping publish guard setup: this Git checkout has no origin remote/);
  assert.doesNotMatch(result.stdout, /Configured gui-publish/);
});
