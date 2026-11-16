import { appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const DEFAULT_HKMO_DATE_URL = 'https://mileschan852.github.io/HKMODate/';
const EXPECTED_SHARED_GUI_BASE = 'https://mileschan852.github.io/WhosNearbyBot';
const BUILD_MARKER_PATTERN =
  /^window\.__WHOSNEARBY_SHARED_GUI_BUILD__ = (.+);$/m;

function publicUrl(value) {
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function errorWithDetails(message, details = {}, options) {
  return Object.assign(new Error(message, options), details);
}

function addErrorDetails(error, details) {
  for (const [key, value] of Object.entries(details)) {
    if (error[key] === undefined) error[key] = value;
  }
  return error;
}

function safeInline(value) {
  return String(value ?? 'Not available')
    .replace(/[\r\n`]/g, ' ')
    .slice(0, 200);
}

export function formatGitHubSummary({ expectedVersion, result, error }) {
  const diagnostic = error?.cause ?? error;
  const observedVersion = result?.publishedVersion ?? diagnostic?.observedVersion;
  const failingUrl = publicUrl(diagnostic?.publicUrl);
  const status = Number.isInteger(diagnostic?.httpStatus)
    ? ` (HTTP ${diagnostic.httpStatus})`
    : '';
  const lines = [
    '## HKMO Date published asset check',
    '',
    `- Result: **${error ? 'Failed' : 'Passed'}**`,
    `- Expected build: \`${safeInline(expectedVersion)}\``,
    `- Observed build: \`${safeInline(observedVersion)}\``,
  ];

  if (result?.fallbackWrappersVerified) {
    lines.push('- Fallback GUI wrappers: **Passed**');
  }

  if (error) {
    lines.push(
      `- Failing public URL: ${failingUrl ? `<${failingUrl}>${status}` : 'Not identified'}`,
    );
  }
  return `${lines.join('\n')}\n`;
}

function readVersion(markerContents, label) {
  const match = BUILD_MARKER_PATTERN.exec(markerContents);
  if (!match) throw new Error(`${label} shared GUI build marker is missing or malformed.`);
  let marker;
  try {
    marker = JSON.parse(match[1]);
  } catch (error) {
    throw new Error(`${label} shared GUI build marker is invalid JSON.`, { cause: error });
  }
  if (typeof marker.version !== 'string' || !marker.version) {
    throw new Error(`${label} shared GUI build marker has no version.`);
  }
  return marker.version;
}

async function fetchText(fetchImpl, url, label, details = {}) {
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw errorWithDetails(`${label} request failed: network error`, {
      publicUrl: publicUrl(url),
      ...details,
    }, { cause: error });
  }
  if (!response.ok) {
    throw errorWithDetails(`${label} request failed (${response.status}): ${url}`, {
      publicUrl: publicUrl(url),
      httpStatus: response.status,
      ...details,
    });
  }
  return { text: await response.text(), status: response.status, publicUrl: publicUrl(url) };
}

export async function verifyPublishedHkmoAssets({
  fetchImpl = fetch,
  expectedVersion,
  hkmoDateUrl = DEFAULT_HKMO_DATE_URL,
}) {
  if (!expectedVersion) throw new Error('Expected shared GUI build version is required.');

  const shellUrl = new URL(hkmoDateUrl);
  shellUrl.searchParams.set('refresh', String(Date.now()));
  const shellResponse = await fetchText(fetchImpl, shellUrl, 'HKMO Date shell');
  const html = shellResponse.text;
  const sharedGuiMatch = html.match(/const sharedGuiBase\s*=\s*['"]([^'"]+)['"]/);
  if (!sharedGuiMatch) {
    throw errorWithDetails('HKMO Date shell does not configure the shared GUI host.', {
      publicUrl: shellResponse.publicUrl,
      httpStatus: shellResponse.status,
    });
  }
  const sharedGuiBase = sharedGuiMatch[1].replace(/\/+$/, '');
  if (sharedGuiBase !== EXPECTED_SHARED_GUI_BASE) {
    throw errorWithDetails('HKMO Date points at an unexpected shared GUI host.', {
      publicUrl: shellResponse.publicUrl,
      httpStatus: shellResponse.status,
    });
  }
  const fallbackMatch = html.match(/const fallbackVersion\s*=\s*['"]([^'"]+)['"]/);
  if (!fallbackMatch?.[1]) {
    throw errorWithDetails('HKMO Date shell has no fallback build version.', {
      publicUrl: shellResponse.publicUrl,
      httpStatus: shellResponse.status,
    });
  }

  const markerUrl = new URL(`${sharedGuiBase}/shared-gui-build.js`);
  markerUrl.searchParams.set('refresh', String(Date.now()));
  const markerResponse = await fetchText(fetchImpl, markerUrl, 'Published shared GUI marker');
  let publishedVersion;
  try {
    publishedVersion = readVersion(markerResponse.text, 'Published');
  } catch (error) {
    throw addErrorDetails(error, {
      publicUrl: markerResponse.publicUrl,
      httpStatus: markerResponse.status,
    });
  }
  if (publishedVersion !== expectedVersion) {
    throw errorWithDetails(
      `Published shared GUI marker is stale: expected ${expectedVersion}, received ${publishedVersion}.`,
      {
        expectedVersion,
        observedVersion: publishedVersion,
        publicUrl: markerResponse.publicUrl,
        httpStatus: markerResponse.status,
      },
    );
  }

  const versionParts = /^(.+\.js)-(.+\.css)$/.exec(publishedVersion);
  if (!versionParts) {
    throw errorWithDetails(`Shared GUI build version is malformed: ${publishedVersion}.`, {
      expectedVersion,
      observedVersion: publishedVersion,
      publicUrl: markerResponse.publicUrl,
      httpStatus: markerResponse.status,
    });
  }
  const [, javascriptAsset, stylesheetAsset] = versionParts;
  const encodedVersion = encodeURIComponent(publishedVersion);
  const publishedBuildDetails = { expectedVersion, observedVersion: publishedVersion };
  const javascriptWrapperUrl =
    `${sharedGuiBase}/assets/shared-gui.js?v=${encodedVersion}`;
  const stylesheetWrapperUrl =
    `${sharedGuiBase}/assets/shared-gui.css?v=${encodedVersion}`;
  const [javascriptWrapper, stylesheetWrapper] = await Promise.all([
    fetchText(fetchImpl, javascriptWrapperUrl, 'Shared GUI JavaScript wrapper', publishedBuildDetails),
    fetchText(fetchImpl, stylesheetWrapperUrl, 'Shared GUI stylesheet wrapper', publishedBuildDetails),
  ]);

  if (javascriptWrapper.text.trim() !== `import './${javascriptAsset}';`) {
    throw errorWithDetails(`Published JavaScript wrapper does not import ${javascriptAsset}.`, {
      expectedVersion,
      observedVersion: publishedVersion,
      publicUrl: javascriptWrapper.publicUrl,
      httpStatus: javascriptWrapper.status,
    });
  }
  if (stylesheetWrapper.text.trim() !== `@import url('./${stylesheetAsset}');`) {
    throw errorWithDetails(`Published stylesheet wrapper does not import ${stylesheetAsset}.`, {
      expectedVersion,
      observedVersion: publishedVersion,
      publicUrl: stylesheetWrapper.publicUrl,
      httpStatus: stylesheetWrapper.status,
    });
  }

  const fallbackVersion = fallbackMatch[1];
  const encodedFallbackVersion = encodeURIComponent(fallbackVersion);
  const fallbackJavascriptWrapperUrl =
    `${sharedGuiBase}/assets/shared-gui.js?v=${encodedFallbackVersion}`;
  const fallbackStylesheetWrapperUrl =
    `${sharedGuiBase}/assets/shared-gui.css?v=${encodedFallbackVersion}`;
  const [fallbackJavascriptWrapper, fallbackStylesheetWrapper] = await Promise.all([
    fetchText(
      fetchImpl,
      fallbackJavascriptWrapperUrl,
      'Published fallback JavaScript wrapper',
      publishedBuildDetails,
    ),
    fetchText(
      fetchImpl,
      fallbackStylesheetWrapperUrl,
      'Published fallback stylesheet wrapper',
      publishedBuildDetails,
    ),
  ]);

  if (fallbackJavascriptWrapper.text.trim() !== `import './${javascriptAsset}';`) {
    throw errorWithDetails(
      `Published fallback JavaScript wrapper does not import ${javascriptAsset}.`,
      {
        expectedVersion,
        observedVersion: publishedVersion,
        publicUrl: fallbackJavascriptWrapper.publicUrl,
        httpStatus: fallbackJavascriptWrapper.status,
      },
    );
  }
  if (fallbackStylesheetWrapper.text.trim() !== `@import url('./${stylesheetAsset}');`) {
    throw errorWithDetails(
      `Published fallback stylesheet wrapper does not import ${stylesheetAsset}.`,
      {
        expectedVersion,
        observedVersion: publishedVersion,
        publicUrl: fallbackStylesheetWrapper.publicUrl,
        httpStatus: fallbackStylesheetWrapper.status,
      },
    );
  }

  const assetUrls = [
    new URL(`assets/${javascriptAsset}`, `${sharedGuiBase}/`).toString(),
    new URL(`assets/${stylesheetAsset}`, `${sharedGuiBase}/`).toString(),
  ];
  await Promise.all([
    fetchText(
      fetchImpl,
      assetUrls[0],
      `Shared GUI JavaScript asset ${javascriptAsset}`,
      publishedBuildDetails,
    ),
    fetchText(
      fetchImpl,
      assetUrls[1],
      `Shared GUI stylesheet asset ${stylesheetAsset}`,
      publishedBuildDetails,
    ),
  ]);

  return {
    expectedVersion,
    publishedVersion,
    fallbackVersion,
    fallbackWrappersVerified: true,
    sharedGuiBase,
    javascriptAsset,
    stylesheetAsset,
  };
}

export async function checkPublishedHkmoAssetsWithRetry({
  attempts = 6,
  delayMs = 10_000,
  wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  ...options
}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await verifyPublishedHkmoAssets(options);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await wait(delayMs);
    }
  }
  throw errorWithDetails(
    `Published HKMO Date smoke check failed after ${attempts} attempts: ${lastError?.message ?? 'unknown error'}`,
    {
      expectedVersion: options.expectedVersion,
      observedVersion: lastError?.observedVersion,
      publicUrl: lastError?.publicUrl,
      httpStatus: lastError?.httpStatus,
    },
    { cause: lastError },
  );
}

export async function writeGitHubSummary(summaryPath, details) {
  if (!summaryPath) return;
  await appendFile(summaryPath, formatGitHubSummary(details));
}

export async function runPublishedHkmoAssetCheck({
  summaryPath = process.env.GITHUB_STEP_SUMMARY,
} = {}) {
  let expectedVersion;
  let result;
  let error;
  try {
    const buildMarker = await readFile(
      path.join(projectRoot, 'dist', 'shared-gui-build.js'),
      'utf8',
    );
    expectedVersion = readVersion(buildMarker, 'Built');
    result = await checkPublishedHkmoAssetsWithRetry({ expectedVersion });
  } catch (caught) {
    error = caught;
  }

  if (summaryPath) {
    try {
      await writeGitHubSummary(summaryPath, { expectedVersion, result, error });
    } catch (summaryError) {
      if (!error) throw summaryError;
      console.error('Unable to write the GitHub Actions summary.');
    }
  }

  if (error) throw error;
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await runPublishedHkmoAssetCheck();
    console.log(
      `Published HKMO Date shell, fallback wrappers, and shared GUI assets match ${result.publishedVersion}.`,
    );
  } catch (error) {
    console.error(`Published HKMO Date smoke check failed: ${error.message}`);
    process.exitCode = 1;
  }
}
