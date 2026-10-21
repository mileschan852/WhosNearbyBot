import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');

test('map access does not require a profile photo', () => {
  const handlerStart = appSource.indexOf('const handleToggleMap = async () => {');
  const mapVisibilityUpdate = appSource.indexOf(
    "workerPost('/api/profile', { profile: { map_visible: nextVal } })",
    handlerStart,
  );
  const mapRender = appSource.indexOf('{mapModuleEnabled && (');
  const mapView = appSource.indexOf('<MapView', mapRender);

  assert.ok(handlerStart >= 0);
  assert.ok(mapVisibilityUpdate > handlerStart);
  assert.ok(mapRender >= 0);
  assert.ok(mapView > mapRender);
  assert.doesNotMatch(
    appSource,
    /hasUploadedMainProfileImage|hasMainProfileImage|MAP_PROFILE_PHOTO_REQUIRED_COPY|map-photo-required/,
  );
});
