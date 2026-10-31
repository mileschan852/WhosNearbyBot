import { readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';

const target = JSON.parse(
  readFileSync(new URL('../publish-target.json', import.meta.url), 'utf8'),
);
const productionRef = `refs/heads/${target.productionBranch}`;

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
    const segments = path.split('/');
    return segments.length === 2 ? path.toLowerCase() : null;
  } catch {
    return null;
  }
}

function refuse(message) {
  console.error(`Refusing ${target.product} release: ${message}`);
  process.exit(1);
}

function verifyWorkflowTarget() {
  const actualRepository = process.env.GITHUB_REPOSITORY ?? '';
  const actualRef = process.env.GITHUB_REF ?? '';
  if (actualRepository.toLowerCase() !== target.repository.toLowerCase()) {
    refuse(`expected repository ${target.repository}, received ${actualRepository || '(unset)'}.`);
  }
  if (actualRef !== productionRef) {
    refuse(`expected ${target.repository}/${target.productionBranch}, received ref ${actualRef || '(unset)'}.`);
  }
  console.log(`Verified ${target.product} release target ${target.repository}/${target.productionBranch}.`);
}

function verifyPrePushTarget() {
  const [remoteName, remoteUrl] = process.argv.slice(3);
  if (!remoteName || !remoteUrl) {
    refuse('Git did not provide a remote name and URL to the pre-push guard.');
  }

  let originUrl;
  try {
    originUrl = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
  } catch {
    refuse(`this checkout has no readable origin; expected source ${target.repository}.`);
  }

  if (repositorySlug(originUrl) !== target.repository.toLowerCase()) {
    refuse(`this checkout's origin is not ${target.repository}; no push was sent.`);
  }
  if (repositorySlug(remoteUrl) !== target.repository.toLowerCase()) {
    refuse(`remote "${remoteName}" is not ${target.repository}; no push was sent.`);
  }

  const input = readFileSync(0, 'utf8').trim();
  const updates = input ? input.split(/\r?\n/) : [];
  for (const line of updates) {
    const [localRef, localSha, remoteRef, remoteSha] = line.trim().split(/\s+/);
    if (!localSha || !localRef || !remoteSha || !remoteRef) {
      refuse('Git supplied an invalid ref update to the pre-push guard.');
    }

    if (remoteRef === productionRef) {
      if (remoteName !== target.productionRemote) {
        refuse(`production pushes must use remote "${target.productionRemote}" for ${target.repository}/${target.productionBranch}; no push was sent.`);
      }
      if (localRef !== productionRef) {
        refuse(`only local ${productionRef} may update production ${productionRef}; no push was sent.`);
      }
    } else if (remoteName === target.productionRemote) {
      refuse(`remote "${target.productionRemote}" is reserved for ${productionRef}; no push was sent.`);
    }

    const isZeroSha = (sha) => /^0+$/.test(sha);
    if (isZeroSha(localSha)) {
      refuse(`deleting ${remoteRef} is blocked; no push was sent.`);
    }
    if (remoteRef.startsWith('refs/tags/')) {
      if (!isZeroSha(remoteSha)) {
        refuse(`replacing an existing tag (${remoteRef}) is blocked; no push was sent.`);
      }
      continue;
    }
    if (!remoteRef.startsWith('refs/heads/')) {
      refuse(`unsupported destination ref ${remoteRef}; no push was sent.`);
    }
    if (!isZeroSha(remoteSha)) {
      const ancestry = spawnSync('git', ['merge-base', '--is-ancestor', remoteSha, localSha], {
        encoding: 'utf8',
      });
      if (ancestry.status !== 0) {
        refuse(`cannot prove ${remoteRef} is a fast-forward; fetch the destination first. Force-pushes are blocked.`);
      }
    }
  }

  console.log(`Verified push target ${target.repository} via "${remoteName}".`);
}

const mode = process.argv[2];
if (mode === '--workflow') {
  verifyWorkflowTarget();
} else if (mode === '--pre-push') {
  verifyPrePushTarget();
} else {
  refuse('unknown guard mode; use --workflow or --pre-push.');
}
