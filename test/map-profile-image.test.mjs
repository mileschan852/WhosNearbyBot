import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const mapSource = await readFile(new URL('../src/components/MapView.tsx', import.meta.url), 'utf8');

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

test('Map ignores activity responses from an old account or hidden view', () => {
  assert.match(mapSource, /const activityRequestIdRef = useRef\(0\)/);
  assert.match(mapSource, /isActive\(\) && activityRequestIdRef\.current === requestId/);
  assert.match(mapSource, /if \(!isCurrentRequest\(\)\) return/);
  assert.match(mapSource, /activityRequestIdRef\.current \+= 1/);
  assert.match(
    mapSource,
    /\[isVisible,\s*userId,\s*location\.lat,\s*location\.lng,\s*refreshActivities\]/,
  );
});
