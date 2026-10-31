import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const target = JSON.parse(readFileSync(new URL('../publish-target.json', import.meta.url), 'utf8'));
const guardPath = fileURLToPath(new URL('../scripts/verify-publish-target.mjs', import.meta.url));
const zeroSha = '0'.repeat(40);

function runGit(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function createRepo(originRepository = target.repository) {
  const directory = mkdtempSync(join(tmpdir(), 'publish-guard-test-'));
  mkdirSync(directory, { recursive: true });
  runGit(directory, ['init', '--initial-branch=main']);
  runGit(directory, ['config', 'user.name', 'Release Guard Test']);
  runGit(directory, ['config', 'user.email', 'release-guard@example.invalid']);
  runGit(directory, ['remote', 'add', 'origin', `https://github.com/${originRepository}.git`]);
  writeFileSync(join(directory, 'sample.txt'), 'first\n');
  runGit(directory, ['add', 'sample.txt']);
  runGit(directory, ['commit', '-m', 'first']);
  const first = runGit(directory, ['rev-parse', 'HEAD']);
  writeFileSync(join(directory, 'sample.txt'), 'second\n');
  runGit(directory, ['add', 'sample.txt']);
  runGit(directory, ['commit', '-m', 'second']);
  const second = runGit(directory, ['rev-parse', 'HEAD']);
  runGit(directory, ['remote', 'add', target.productionRemote, `https://github.com/${target.repository}.git`]);
  return { directory, first, second };
}

function runPrePush(repo, {
  remoteName = target.productionRemote,
  remoteRepository = target.repository,
  localSha = repo.second,
  localRef = 'refs/heads/main',
  remoteSha = repo.first,
  remoteRef = 'refs/heads/main',
} = {}) {
  return spawnSync(process.execPath, [
    guardPath,
    '--pre-push',
    remoteName,
    `https://github.com/${remoteRepository}.git`,
  ], {
    cwd: repo.directory,
    encoding: 'utf8',
    input: `${localRef}\t${localSha}\t${remoteRef}\t${remoteSha}\n`,
  });
}

test('workflow guard accepts only the configured repository main', () => {
  const good = spawnSync(process.execPath, [guardPath, '--workflow'], {
    encoding: 'utf8',
    env: { ...process.env, GITHUB_REPOSITORY: target.repository, GITHUB_REF: `refs/heads/${target.productionBranch}` },
  });
  assert.equal(good.status, 0, good.stderr);

  const wrongRepo = spawnSync(process.execPath, [guardPath, '--workflow'], {
    encoding: 'utf8',
    env: { ...process.env, GITHUB_REPOSITORY: 'mileschan852/other-repo', GITHUB_REF: `refs/heads/${target.productionBranch}` },
  });
  assert.notEqual(wrongRepo.status, 0);
  assert.match(wrongRepo.stderr, new RegExp(target.repository));

  const wrongBranch = spawnSync(process.execPath, [guardPath, '--workflow'], {
    encoding: 'utf8',
    env: { ...process.env, GITHUB_REPOSITORY: target.repository, GITHUB_REF: 'refs/heads/not-main' },
  });
  assert.notEqual(wrongBranch.status, 0);
  assert.match(wrongBranch.stderr, /main/);
});
test('pre-push accepts a fast-forward to the explicit production remote', (context) => {
  const repo = createRepo();
  context.after(() => rmSync(repo.directory, { recursive: true, force: true }));
  const result = runPrePush(repo);
  assert.equal(result.status, 0, result.stderr);
});

test('pre-push allows a new review branch on the expected repository', (context) => {
  const repo = createRepo();
  context.after(() => rmSync(repo.directory, { recursive: true, force: true }));
  const result = runPrePush(repo, {
    remoteName: 'origin',
    localRef: 'refs/heads/feature',
    remoteRef: 'refs/heads/feature',
    remoteSha: zeroSha,
  });
  assert.equal(result.status, 0, result.stderr);
});

test('pre-push rejects the wrong remote, wrong checkout, or implicit main remote', (context) => {
  const repo = createRepo();
  context.after(() => rmSync(repo.directory, { recursive: true, force: true }));

  const wrongRepository = target.repository === 'mileschan852/WhosNearbyBot'
    ? 'mileschan852/dating-app-backend'
    : 'mileschan852/WhosNearbyBot';
  const wrongRemote = runPrePush(repo, { remoteRepository: wrongRepository });
  assert.notEqual(wrongRemote.status, 0);
  assert.match(wrongRemote.stderr, new RegExp(target.repository));

  const implicitMain = runPrePush(repo, { remoteName: 'origin' });
  assert.notEqual(implicitMain.status, 0);
  assert.match(implicitMain.stderr, new RegExp(target.productionRemote));

  const wrongCheckout = createRepo(wrongRepository);
  context.after(() => rmSync(wrongCheckout.directory, { recursive: true, force: true }));
  const wrongSource = runPrePush(wrongCheckout);
  assert.notEqual(wrongSource.status, 0);
  assert.match(wrongSource.stderr, /origin is not/);
});

test('pre-push rejects main updates from other local refs, deletions, and non-fast-forwards', (context) => {
  const repo = createRepo();
  context.after(() => rmSync(repo.directory, { recursive: true, force: true }));

  const featureRef = runPrePush(repo, { localRef: 'refs/heads/feature' });
  assert.notEqual(featureRef.status, 0);
  assert.match(featureRef.stderr, /only local refs\/heads\/main/);

  const deletion = runPrePush(repo, { localSha: zeroSha });
  assert.notEqual(deletion.status, 0);
  assert.match(deletion.stderr, /deleting/);

  runGit(repo.directory, ['checkout', '--detach', repo.first]);
  writeFileSync(join(repo.directory, 'diverged.txt'), 'diverged\n');
  runGit(repo.directory, ['add', 'diverged.txt']);
  runGit(repo.directory, ['commit', '-m', 'diverged']);
  const divergentSha = runGit(repo.directory, ['rev-parse', 'HEAD']);
  runGit(repo.directory, ['checkout', 'main']);
  const nonFastForward = runPrePush(repo, { remoteSha: divergentSha });
  assert.notEqual(nonFastForward.status, 0);
  assert.match(nonFastForward.stderr, /fast-forward/);
});
