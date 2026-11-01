import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkPublishedPagesAssetsWithRetry,
  findPublishedPageAssets,
  verifyPublishedPagesAssets,
} from '../scripts/check-published-pages-assets.mjs';

const pageUrl = 'https://mileschan852.github.io/WhosNearbyBot/';
const html = `<!doctype html>
  <html><head><title>Text may change freely</title>
    <link rel="stylesheet" href="./assets/site-abc.css">
  </head><body>
    <script type="module" src="./assets/site-def.js"></script>
  </body></html>`;

function response(body, status = 200) {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

test('published page smoke check resolves and fetches assets under the Pages base path', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url) === pageUrl) return response(html);
    if (String(url) === `${pageUrl}assets/site-abc.css`) return response('body { color: white; }');
    if (String(url) === `${pageUrl}assets/site-def.js`) return response('console.log("loaded");');
    return response('not found', 404);
  };

  const result = await verifyPublishedPagesAssets({ pageUrl, fetchImpl });
  assert.equal(result.assets.length, 2);
  assert.deepEqual(
    calls.slice(1).sort(),
    [`${pageUrl}assets/site-abc.css`, `${pageUrl}assets/site-def.js`].sort(),
  );
});

test('asset discovery ignores external scripts but requires local JS and CSS assets', () => {
  const assets = findPublishedPageAssets(
    `<script src="https://telegram.org/js/telegram-web-app.js"></script>${html}`,
    pageUrl,
  );
  assert.equal(assets.length, 2);
  assert.ok(assets.every((asset) => asset.url.pathname.startsWith('/WhosNearbyBot/assets/')));
  assert.throws(
    () => findPublishedPageAssets('<html><body>Unchanged copy</body></html>', pageUrl),
    /same-origin JavaScript asset/,
  );
});

test('published smoke check fails when a referenced asset is missing', async () => {
  const fetchImpl = async (url) =>
    String(url) === `${pageUrl}assets/site-def.js`
      ? response('not found', 404)
      : response(html);

  await assert.rejects(
    verifyPublishedPagesAssets({ pageUrl, fetchImpl }),
    /JavaScript asset request failed \(404\)/,
  );
});

test('post-deploy smoke check retries transient page failures', async () => {
  let pageReads = 0;
  const fetchImpl = async (url) => {
    if (String(url) === pageUrl && pageReads++ === 0) return response('temporary error', 503);
    if (String(url) === pageUrl) return response(html);
    return response('asset content');
  };

  const result = await checkPublishedPagesAssetsWithRetry({
    pageUrl,
    fetchImpl,
    attempts: 2,
    delayMs: 0,
    wait: async () => {},
  });
  assert.equal(result.assets.length, 2);
  assert.equal(pageReads, 2);
});

test('smoke check rejects a page URL with embedded credentials', async () => {
  await assert.rejects(
    verifyPublishedPagesAssets({ pageUrl: 'https://user:pass@example.com/WhosNearbyBot/' }),
    /must use HTTP\(S\) and must not contain credentials/,
  );
});
