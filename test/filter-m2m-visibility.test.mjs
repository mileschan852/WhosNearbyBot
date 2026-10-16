import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');

test('M2M preference matcher visibility uses the signed-in profile, not draft form values', () => {
  assert.match(
    appSource,
    /const currentUserIsM2M = currentUser\?\.gender === 'man' && currentUser\?\.seeking === 'men';/,
  );
  assert.match(
    appSource,
    /\{currentUserIsM2M && \(<div data-testid="filter-m2m-preference-matcher"/,
  );
  assert.doesNotMatch(appSource, /isManSeekingManInput/);
});
