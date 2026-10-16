import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const JAVASCRIPT_ASSET = /<script\b[^>]*\bsrc=["']((?:\.\/)?assets\/[^"']+\.js)["'][^>]*>/i;
const STYLESHEET_ASSET = /<link\b[^>]*\bhref=["']((?:\.\/)?assets\/[^"']+\.css)["'][^>]*>/i;
const BUILD_MARKER_PATTERN =
  /^window\.__WHOSNEARBY_SHARED_GUI_BUILD__ = (.+);$/m;

function getAsset(html, expression, label) {
  const match = expression.exec(html);
  if (!match) {
    throw new Error(`Vite build output did not include the ${label} asset.`);
  }

  const assetUrl = new URL(match[1], 'https://build.invalid/');
  const relativePath = decodeURIComponent(assetUrl.pathname).replace(/^\/+/, '');
  if (path.posix.dirname(relativePath) !== 'assets' || path.posix.basename(relativePath) === '') {
    throw new Error(`Unexpected ${label} asset location: ${match[1]}`);
  }

  return {
    filename: path.posix.basename(relativePath),
    path: path.join('assets', path.posix.basename(relativePath)),
  };
}

async function readBuildAssets(distRoot) {
  const html = await readFile(path.join(distRoot, 'index.html'), 'utf8');
  const javascript = getAsset(html, JAVASCRIPT_ASSET, 'JavaScript');
  const stylesheet = getAsset(html, STYLESHEET_ASSET, 'stylesheet');

  for (const [asset, label] of [
    [javascript, 'JavaScript'],
    [stylesheet, 'stylesheet'],
  ]) {
    try {
      await access(path.join(distRoot, asset.path));
    } catch (error) {
      throw new Error(
        `Shared GUI ${label} asset referenced by index.html is missing: ${asset.path}`,
        { cause: error },
      );
    }
  }

  return {
    javascript,
    stylesheet,
    version: `${javascript.filename}-${stylesheet.filename}`,
  };
}

function readBuildMarker(contents) {
  const match = BUILD_MARKER_PATTERN.exec(contents);
  if (!match) {
    throw new Error('Shared GUI build marker is missing or malformed.');
  }

  try {
    return JSON.parse(match[1]);
  } catch (error) {
    throw new Error('Shared GUI build marker does not contain valid JSON.', { cause: error });
  }
}

export async function createSharedGuiArtifacts(distRoot) {
  const { javascript, stylesheet, version } = await readBuildAssets(distRoot);
  const assetDirectory = path.join(distRoot, 'assets');

  await Promise.all([
    writeFile(
      path.join(assetDirectory, 'shared-gui.js'),
      `import './${javascript.filename}';\n`,
    ),
    writeFile(
      path.join(assetDirectory, 'shared-gui.css'),
      `@import url('./${stylesheet.filename}');\n`,
    ),
    writeFile(
      path.join(distRoot, 'shared-gui-build.js'),
      `window.__WHOSNEARBY_SHARED_GUI_BUILD__ = ${JSON.stringify({ version })};\n`,
    ),
  ]);

  await validateSharedGuiArtifacts(distRoot);
  return version;
}

export async function validateSharedGuiArtifacts(distRoot) {
  const { javascript, stylesheet, version } = await readBuildAssets(distRoot);
  const [markerContents, javascriptWrapper, stylesheetWrapper] = await Promise.all([
    readFile(path.join(distRoot, 'shared-gui-build.js'), 'utf8').catch(() => ''),
    readFile(path.join(distRoot, 'assets', 'shared-gui.js'), 'utf8').catch(() => ''),
    readFile(path.join(distRoot, 'assets', 'shared-gui.css'), 'utf8').catch(() => ''),
  ]);
  const marker = readBuildMarker(markerContents);

  if (marker.version !== version) {
    throw new Error(
      `Shared GUI build marker is stale: expected ${version}, received ${String(marker.version)}.`,
    );
  }
  if (javascriptWrapper !== `import './${javascript.filename}';\n`) {
    throw new Error(`Shared GUI JavaScript wrapper does not import ${javascript.filename}.`);
  }
  if (stylesheetWrapper !== `@import url('./${stylesheet.filename}');\n`) {
    throw new Error(`Shared GUI stylesheet wrapper does not import ${stylesheet.filename}.`);
  }

  return { version, javascript: javascript.filename, stylesheet: stylesheet.filename };
}
