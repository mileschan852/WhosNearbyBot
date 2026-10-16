import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSharedGuiArtifacts } from './shared-gui-artifacts.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const distRoot = path.join(projectRoot, 'dist');
const buildVersion = await createSharedGuiArtifacts(distRoot);

console.log(`Published shared GUI wrappers and build version ${buildVersion}.`);
