import { assertHKMODateLoaderContract } from './hkmodate-loader-contract.mjs';

const sourceUrl = 'https://raw.githubusercontent.com/mileschan852/HKMODate/main/docs/index.html';
const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(15000) });
if (!response.ok) {
  throw new Error(`Could not read the current HKMO Date loader (${response.status}).`);
}

const result = assertHKMODateLoaderContract(await response.text());
console.log(
  `HKMO Date loader contract passed for ${result.sharedGuiBase}; fallback ${result.fallbackVersion}.`,
);
