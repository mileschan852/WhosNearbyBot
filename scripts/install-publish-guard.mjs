import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const target = JSON.parse(
  readFileSync(new URL('../publish-target.json', import.meta.url), 'utf8'),
);
const scriptRoot = fileURLToPath(new URL('..', import.meta.url));

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function repositorySlug(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return null;
  const value = rawUrl.trim();
  const scpMatch = value.match(/^(?:[^@]+@)?github\.com:([^/]+\/[^/]+?)(?:\.git)?$/i);
  if (scpMatch) return scpMatch[1].toLowerCase();
  try {
    const parsed = new URL(value);
    if (!['github.com', 'github.replit.internal'].includes(parsed.hostname.toLowerCase())) {
      return null;
    }
    const path = parsed.pathname.replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '');
    return path.split('/').length === 2 ? path.toLowerCase() : null;
  } catch {
    return null;
  }
}

let root;
let originUrl;
try {
  root = git(['rev-parse', '--show-toplevel']);
  originUrl = git(['-C', root, 'remote', 'get-url', 'origin']);
} catch {
  console.error(`Publish guard not installed: expected a Git checkout of ${target.repository} with an origin remote.`);
  process.exit(1);
}

if (repositorySlug(originUrl) !== target.repository.toLowerCase()) {
  console.error(`Publish guard not installed: origin is not ${target.repository}; no Git settings were changed.`);
  process.exit(1);
}

const configuredRemotes = git(['-C', root, 'remote']).split(/\r?\n/).filter(Boolean);
if (configuredRemotes.includes(target.productionRemote)) {
  const publishUrl = git(['-C', root, 'remote', 'get-url', target.productionRemote]);
  if (repositorySlug(publishUrl) !== target.repository.toLowerCase()) {
    console.error(`Publish guard not installed: remote "${target.productionRemote}" points to another repository; no Git settings were changed.`);
    process.exit(1);
  }
} else {
  git(['-C', root, 'remote', 'add', target.productionRemote, originUrl]);
}

const hookPath = join(scriptRoot, '.githooks');
git(['-C', root, 'config', '--local', 'core.hooksPath', hookPath]);
git(['-C', root, 'config', '--local', `branch.${target.productionBranch}.pushRemote`, target.productionRemote]);
git(['-C', root, 'config', '--local', 'push.default', 'simple']);

console.log(`Configured ${target.productionRemote} for ${target.repository}/${target.productionBranch}; origin was left unchanged and pre-push checks are installed.`);
