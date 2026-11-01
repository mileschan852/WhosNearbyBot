import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_ATTEMPTS = 6;
const DEFAULT_RETRY_DELAY_MS = 5_000;

function normalizePageUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch (error) {
    throw new Error('PAGES_URL must be a valid published site URL.', { cause: error });
  }

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('PAGES_URL must use HTTP(S) and must not contain credentials.');
  }
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url;
}

function readAttribute(tag, attribute) {
  const escaped = attribute.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(
    `\\b${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    'i',
  ).exec(tag);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function addSameOriginAsset(assets, rawUrl, type, pageUrl) {
  if (!rawUrl) return;
  const url = new URL(rawUrl, pageUrl);
  if (url.origin !== pageUrl.origin) return;
  assets.push({ type, url });
}

export function findPublishedPageAssets(html, pageUrl) {
  const root = normalizePageUrl(pageUrl);
  const assets = [];

  for (const match of html.matchAll(/<script\b[^>]*>/gi)) {
    const tag = match[0];
    addSameOriginAsset(assets, readAttribute(tag, 'src'), 'JavaScript', root);
  }

  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    const rel = readAttribute(tag, 'rel')?.toLowerCase().split(/\s+/) ?? [];
    if (rel.includes('stylesheet')) {
      addSameOriginAsset(assets, readAttribute(tag, 'href'), 'CSS', root);
    }
  }

  const javascript = assets.filter((asset) => asset.type === 'JavaScript');
  const stylesheets = assets.filter((asset) => asset.type === 'CSS');
  if (javascript.length === 0) {
    throw new Error('Published page does not reference a same-origin JavaScript asset.');
  }
  if (stylesheets.length === 0) {
    throw new Error('Published page does not reference a same-origin stylesheet.');
  }
  return assets;
}

async function requestText(fetchImpl, url, label) {
  const response = await fetchImpl(url.href, {
    headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`${label} request failed (${response.status}): ${url.href}`);
  }
  const body = await response.text();
  if (!body.trim()) throw new Error(`${label} response was empty: ${url.href}`);
  return body;
}

async function verifyAsset(fetchImpl, asset) {
  const response = await fetchImpl(asset.url.href, {
    headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`${asset.type} asset request failed (${response.status}): ${asset.url.href}`);
  }
  const contentType = response.headers?.get?.('content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (contentType === 'text/html' || contentType === 'application/xhtml+xml') {
    throw new Error(`${asset.type} asset returned an HTML page instead of an asset: ${asset.url.href}`);
  }
  const body = await response.arrayBuffer();
  if (body.byteLength === 0) {
    throw new Error(`${asset.type} asset response was empty: ${asset.url.href}`);
  }
}

export async function verifyPublishedPagesAssets({
  pageUrl,
  fetchImpl = fetch,
}) {
  const root = normalizePageUrl(pageUrl);
  const html = await requestText(fetchImpl, root, 'Published page');
  const assets = findPublishedPageAssets(html, root.href);
  await Promise.all(assets.map((asset) => verifyAsset(fetchImpl, asset)));
  return { pageUrl: root.href, assets };
}

export async function checkPublishedPagesAssetsWithRetry({
  attempts = DEFAULT_ATTEMPTS,
  delayMs = DEFAULT_RETRY_DELAY_MS,
  wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  ...options
}) {
  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new Error('Smoke check attempts must be a positive integer.');
  }

  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await verifyPublishedPagesAssets(options);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await wait(delayMs);
    }
  }
  throw new Error(
    `Published Pages smoke check failed after ${attempts} attempts: ${lastError?.message ?? 'unknown error'}`,
    { cause: lastError },
  );
}

async function main() {
  const pageUrl = process.env.PAGES_URL;
  if (!pageUrl) throw new Error('PAGES_URL is required; pass the deploy-pages page_url output.');
  const result = await checkPublishedPagesAssetsWithRetry({ pageUrl });
  console.log(
    `Published Pages smoke check passed: page and ${result.assets.length} same-origin assets loaded.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Published Pages smoke check failed.');
    process.exitCode = 1;
  }
}
