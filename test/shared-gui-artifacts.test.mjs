import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createSharedGuiArtifacts,
  validateSharedGuiArtifacts,
} from '../scripts/shared-gui-artifacts.mjs';
import { assertHKMODateLoaderContract } from '../scripts/hkmodate-loader-contract.mjs';

const fixtureIndex = `<!doctype html>
<html>
  <head>
    <link rel="stylesheet" href="./assets/index-e5f6a7b8.css">
  </head>
  <body>
    <script type="module" src="./assets/index-a1b2c3d4.js"></script>
  </body>
</html>`;

async function createBuildDirectory(t, { omit = [] } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'shared-gui-contract-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  const assets = path.join(root, 'assets');
  await mkdir(assets);
  await writeFile(path.join(root, 'index.html'), fixtureIndex);
  if (!omit.includes('javascript')) {
    await writeFile(path.join(assets, 'index-a1b2c3d4.js'), '/* app bundle */\n');
  }
  if (!omit.includes('stylesheet')) {
    await writeFile(path.join(assets, 'index-e5f6a7b8.css'), '/* app styles */\n');
  }
  return root;
}

test('shared GUI marker and wrappers target the current hashed build assets', async (t) => {
  const distRoot = await createBuildDirectory(t);
  const version = await createSharedGuiArtifacts(distRoot);
  const marker = await readFile(path.join(distRoot, 'shared-gui-build.js'), 'utf8');
  const javascriptWrapper = await readFile(path.join(distRoot, 'assets/shared-gui.js'), 'utf8');
  const stylesheetWrapper = await readFile(path.join(distRoot, 'assets/shared-gui.css'), 'utf8');

  assert.equal(version, 'index-a1b2c3d4.js-index-e5f6a7b8.css');
  assert.match(marker, /"version":"index-a1b2c3d4\.js-index-e5f6a7b8\.css"/);
  assert.equal(javascriptWrapper, "import './index-a1b2c3d4.js';\n");
  assert.equal(stylesheetWrapper, "@import url('./index-e5f6a7b8.css');\n");
  assert.deepEqual(await validateSharedGuiArtifacts(distRoot), {
    version,
    javascript: 'index-a1b2c3d4.js',
    stylesheet: 'index-e5f6a7b8.css',
  });
});

test('stale asset references fail the shared GUI build instead of publishing broken wrappers', async (t) => {
  const distRoot = await createBuildDirectory(t, { omit: ['javascript'] });

  await assert.rejects(
    createSharedGuiArtifacts(distRoot),
    /JavaScript asset referenced by index\.html is missing/,
  );
});

test('deployment validation rejects a missing or stale marker and wrappers', async (t) => {
  const distRoot = await createBuildDirectory(t);
  await createSharedGuiArtifacts(distRoot);

  await t.test('missing build marker', async () => {
    await unlink(path.join(distRoot, 'shared-gui-build.js'));
    await assert.rejects(validateSharedGuiArtifacts(distRoot), /marker is missing or malformed/);
    await writeFile(
      path.join(distRoot, 'shared-gui-build.js'),
      'window.__WHOSNEARBY_SHARED_GUI_BUILD__ = {"version":"index-a1b2c3d4.js-index-e5f6a7b8.css"};\n',
    );
  });

  await t.test('stale build marker', async () => {
    await writeFile(
      path.join(distRoot, 'shared-gui-build.js'),
      'window.__WHOSNEARBY_SHARED_GUI_BUILD__ = {"version":"old-build"};\n',
    );
    await assert.rejects(validateSharedGuiArtifacts(distRoot), /build marker is stale/);
  });

  await writeFile(
    path.join(distRoot, 'shared-gui-build.js'),
    'window.__WHOSNEARBY_SHARED_GUI_BUILD__ = {"version":"index-a1b2c3d4.js-index-e5f6a7b8.css"};\n',
  );
  await t.test('wrong JavaScript wrapper import', async () => {
    await writeFile(path.join(distRoot, 'assets/shared-gui.js'), "import './old-app.js';\n");
    await assert.rejects(validateSharedGuiArtifacts(distRoot), /JavaScript wrapper does not import/);
    await writeFile(path.join(distRoot, 'assets/shared-gui.js'), "import './index-a1b2c3d4.js';\n");
  });

  await t.test('missing JavaScript wrapper', async () => {
    await unlink(path.join(distRoot, 'assets/shared-gui.js'));
    await assert.rejects(validateSharedGuiArtifacts(distRoot), /JavaScript wrapper does not import/);
    await writeFile(path.join(distRoot, 'assets/shared-gui.js'), "import './index-a1b2c3d4.js';\n");
  });

  await t.test('wrong stylesheet wrapper import', async () => {
    await writeFile(path.join(distRoot, 'assets/shared-gui.css'), "@import url('./old-style.css');\n");
    await assert.rejects(validateSharedGuiArtifacts(distRoot), /stylesheet wrapper does not import/);
    await writeFile(path.join(distRoot, 'assets/shared-gui.css'), "@import url('./index-e5f6a7b8.css');\n");
  });

  await t.test('missing stylesheet wrapper', async () => {
    await unlink(path.join(distRoot, 'assets/shared-gui.css'));
    await assert.rejects(validateSharedGuiArtifacts(distRoot), /stylesheet wrapper does not import/);
  });
});

test('HKMO Date loader uses the current marker, falls back safely, and shows a visible failure state', async () => {
  const fixturePath = fileURLToPath(new URL('./fixtures/hkmo-date-index.html', import.meta.url));
  const html = await readFile(fixturePath, 'utf8');
  assertHKMODateLoaderContract(html);
});

test('the actual Pages build includes a valid shared GUI contract', async (t) => {
  const distRoot = fileURLToPath(new URL('../dist', import.meta.url));
  try {
    await access(path.join(distRoot, 'index.html'));
  } catch {
    if (process.env.CI === 'true') {
      assert.fail('CI must build the Pages artifact before running the shared GUI checks.');
    }
    t.skip('Run npm run build first to check the deployable dist output.');
    return;
  }

  const output = await validateSharedGuiArtifacts(distRoot);
  assert.equal(
    output.version,
    `${output.javascript}-${output.stylesheet}`,
    'The deployed marker version must be derived from the current hashed JS and CSS assets.',
  );
});
