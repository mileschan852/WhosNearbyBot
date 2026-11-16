import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  checkPublishedHkmoAssetsWithRetry,
  formatGitHubSummary,
  verifyPublishedHkmoAssets,
  writeGitHubSummary,
} from '../scripts/check-hkmodate-published-assets.mjs';

const version = 'index-ab12cd34.js-index-ef56gh78.css';
const base = 'https://mileschan852.github.io/WhosNearbyBot';
const shell = `
  <script>
    const sharedGuiBase = '${base}';
    const fallbackVersion = "older-fallback";
  </script>`;
const marker = `window.__WHOSNEARBY_SHARED_GUI_BUILD__ = ${JSON.stringify({ version })};`;

function mockFetch(overrides = {}) {
  const calls = [];
  const fetchImpl = async (input) => {
    const url = String(input);
    calls.push(url);
    const response = Object.hasOwn(overrides, url)
      ? overrides[url]
      : url.includes('https://mileschan852.github.io/HKMODate/')
        ? shell
        : url.includes('/shared-gui-build.js?')
          ? marker
          : url.includes('/assets/shared-gui.js?')
            ? "import './index-ab12cd34.js';\n"
            : url.includes('/assets/shared-gui.css?')
              ? "@import url('./index-ef56gh78.css');\n"
              : 'asset';
    if (response instanceof Error) throw response;
    const status = typeof response === 'object' ? response.status : 200;
    const body = typeof response === 'object' ? response.body : response;
    return { ok: status >= 200 && status < 300, status, text: async () => body };
  };
  return { fetchImpl, calls };
}

test('published HKMO shell, current and fallback wrappers, and assets agree with the build', async () => {
  const { fetchImpl, calls } = mockFetch();
  const result = await verifyPublishedHkmoAssets({ expectedVersion: version, fetchImpl });

  assert.equal(result.publishedVersion, version);
  assert.equal(result.fallbackVersion, 'older-fallback');
  assert.equal(result.fallbackWrappersVerified, true);
  assert.equal(result.javascriptAsset, 'index-ab12cd34.js');
  assert.equal(result.stylesheetAsset, 'index-ef56gh78.css');
  assert.equal(calls.length, 8);
  assert.ok(calls.includes(`${base}/assets/shared-gui.js?v=older-fallback`));
  assert.ok(calls.includes(`${base}/assets/shared-gui.css?v=older-fallback`));
});

test('published smoke check fails when the marker points at a stale build', async () => {
  const { fetchImpl } = mockFetch({
    'https://mileschan852.github.io/WhosNearbyBot/shared-gui-build.js?refresh=1780000000000':
      `window.__WHOSNEARBY_SHARED_GUI_BUILD__ = ${JSON.stringify({ version: 'stale.js-stale.css' })};`,
  });
  const stableFetch = async (input, options) => {
    const url = String(input).replace(/refresh=\d+/, 'refresh=1780000000000');
    return fetchImpl(url, options);
  };

  await assert.rejects(
    verifyPublishedHkmoAssets({ expectedVersion: version, fetchImpl: stableFetch }),
    /Published shared GUI marker is stale/,
  );
});

test('published smoke check fails when a referenced hashed asset is missing', async () => {
  const { fetchImpl } = mockFetch({
    [`${base}/assets/index-ab12cd34.js`]: { status: 404, body: 'private response data' },
  });

  await assert.rejects(
    checkPublishedHkmoAssetsWithRetry({
      expectedVersion: version,
      fetchImpl,
      attempts: 1,
      wait: async () => {},
    }),
    (error) => {
      assert.match(error.message, /Shared GUI JavaScript asset index-ab12cd34\.js request failed \(404\)/);
      const summary = formatGitHubSummary({ expectedVersion: version, error });
      assert.match(summary, /Expected build: `index-ab12cd34\.js-index-ef56gh78\.css`/);
      assert.match(summary, /Observed build: `index-ab12cd34\.js-index-ef56gh78\.css`/);
      assert.match(summary, /https:\/\/mileschan852\.github\.io\/WhosNearbyBot\/assets\/index-ab12cd34\.js> \(HTTP 404\)/);
      assert.doesNotMatch(summary, /private response data|refresh=|v=index/);
      return true;
    },
  );
});

test('published smoke check fails when the fallback wrapper points to a stale bundle', async () => {
  const { fetchImpl } = mockFetch({
    [`${base}/assets/shared-gui.js?v=older-fallback`]: "import './removed-old-build.js';\n",
  });

  await assert.rejects(
    verifyPublishedHkmoAssets({ expectedVersion: version, fetchImpl }),
    /Published fallback JavaScript wrapper does not import index-ab12cd34\.js/,
  );
});

test('GitHub summary reports successful and stale-marker checks without leaking query values', async () => {
  const successful = formatGitHubSummary({
    expectedVersion: version,
    result: { publishedVersion: version, fallbackWrappersVerified: true },
  });
  assert.match(successful, /Result: \*\*Passed\*\*/);
  assert.match(successful, /Fallback GUI wrappers: \*\*Passed\*\*/);
  assert.match(successful, /Expected build: `index-ab12cd34\.js-index-ef56gh78\.css`/);
  assert.match(successful, /Observed build: `index-ab12cd34\.js-index-ef56gh78\.css`/);
  assert.doesNotMatch(successful, /Failing public URL/);

  const staleError = Object.assign(new Error('stale'), {
    observedVersion: 'old.js-old.css',
    publicUrl: `${base}/shared-gui-build.js?refresh=secret-value`,
    httpStatus: 200,
  });
  const failed = formatGitHubSummary({ expectedVersion: version, error: staleError });
  assert.match(failed, /Result: \*\*Failed\*\*/);
  assert.match(failed, /Observed build: `old.js-old.css`/);
  assert.match(failed, /shared-gui-build\.js> \(HTTP 200\)/);
  assert.doesNotMatch(failed, /secret-value/);
});

test('GitHub summary writer appends summaries for both outcomes', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'hkmo-summary-'));
  const summaryPath = path.join(directory, 'summary.md');
  try {
    await writeGitHubSummary(summaryPath, {
      expectedVersion: version,
      result: { publishedVersion: version },
    });
    await writeGitHubSummary(summaryPath, {
      expectedVersion: version,
      error: Object.assign(new Error('failed'), {
        observedVersion: 'old.js-old.css',
        publicUrl: `${base}/shared-gui-build.js`,
        httpStatus: 200,
      }),
    });
    const summary = await readFile(summaryPath, 'utf8');
    assert.equal((summary.match(/## HKMO Date published asset check/g) ?? []).length, 2);
    assert.match(summary, /Result: \*\*Passed\*\*/);
    assert.match(summary, /Result: \*\*Failed\*\*/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('published smoke check retries a stale CDN marker after deployment', async () => {
  let markerReads = 0;
  const { fetchImpl } = mockFetch();
  const retryingFetch = async (input, options) => {
    if (String(input).includes('/shared-gui-build.js?')) {
      markerReads += 1;
      if (markerReads === 1) {
        return {
          ok: true,
          status: 200,
          text: async () => 'window.__WHOSNEARBY_SHARED_GUI_BUILD__ = {"version":"old.js-old.css"};',
        };
      }
    }
    return fetchImpl(input, options);
  };
  const result = await checkPublishedHkmoAssetsWithRetry({
    expectedVersion: version,
    fetchImpl: retryingFetch,
    attempts: 2,
    delayMs: 0,
    wait: async () => {},
  });

  assert.equal(result.publishedVersion, version);
  assert.equal(markerReads, 2);
});
