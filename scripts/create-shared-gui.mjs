import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const distRoot = path.join(projectRoot, 'dist');
const html = await readFile(path.join(distRoot, 'index.html'), 'utf8');

function assetFromHtml(expression, label) {
  const match = expression.exec(html);
  if (!match) throw new Error(`Vite build output did not include the ${label} asset.`);

  const assetUrl = new URL(match[1], 'https://build.invalid/');
  const relativePath = decodeURIComponent(assetUrl.pathname).replace(/^\/+/, '');
  if (!relativePath.startsWith('assets/')) {
    throw new Error(`Unexpected ${label} asset location: ${match[1]}`);
  }
  return path.join(distRoot, relativePath);
}

const javascript = assetFromHtml(/<script\b[^>]*\bsrc=["']((?:\.\/)?assets\/[^"']+\.js)["'][^>]*>/i, 'JavaScript');
const stylesheet = assetFromHtml(/<link\b[^>]*\bhref=["']((?:\.\/)?assets\/[^"']+\.css)["'][^>]*>/i, 'stylesheet');
const sharedDirectory = path.join(distRoot, 'assets');

await Promise.all([
  writeFile(
    path.join(sharedDirectory, 'shared-gui.js'),
    `import './${path.basename(javascript)}';\n`,
  ),
  writeFile(
    path.join(sharedDirectory, 'shared-gui.css'),
    `@import url('./${path.basename(stylesheet)}');\n`,
  ),
]);

console.log('Published stable shared GUI entry wrappers into dist/assets.');
