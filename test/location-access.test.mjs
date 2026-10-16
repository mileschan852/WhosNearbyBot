import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  isLocationSaveConfirmed,
  requestLocationAccess,
} from '../src/utils/request-location.js';

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');

test('location access fails closed when geolocation is unavailable or denied', async () => {
  assert.equal(await requestLocationAccess(null), null);
  assert.equal(await requestLocationAccess({
    getCurrentPosition(_success, error) {
      error({ code: 1 });
    },
  }), null);
});

test('location access returns only valid coordinates from a successful GPS response', async () => {
  let requestedOptions;
  const location = await requestLocationAccess({
    getCurrentPosition(success, _error, options) {
      requestedOptions = options;
      success({ coords: { latitude: 22.3193, longitude: 114.1694 } });
    },
  });

  assert.deepEqual(location, { lat: 22.3193, lng: 114.1694 });
  assert.equal(requestedOptions.maximumAge, 60_000);
  assert.equal(requestedOptions.enableHighAccuracy, false);
});

test('invalid coordinates and a WebView that never answers both deny entry', async () => {
  assert.equal(await requestLocationAccess({
    getCurrentPosition(success) {
      success({ coords: { latitude: 91, longitude: 0 } });
    },
  }), null);

  assert.equal(await requestLocationAccess({
    getCurrentPosition() {},
  }, {
    positionTimeoutMs: 5,
    watchdogTimeoutMs: 10,
  }), null);
});

test('app entry requires the Worker to confirm the requested location was saved', () => {
  const requested = { lat: 22.3193, lng: 114.1694 };
  assert.equal(isLocationSaveConfirmed({
    updated: true,
    profile: requested,
  }, requested), true);
  assert.equal(isLocationSaveConfirmed({
    updated: false,
    profile: requested,
  }, requested), false);
  assert.equal(isLocationSaveConfirmed({
    updated: true,
    profile: { lat: 22.5, lng: 114.5 },
  }, requested), false);
  assert.equal(isLocationSaveConfirmed({
    updated: true,
    profile: { lat: requested.lat, lng: null },
  }, requested), false);
});

test('the app persists a successful location before allowing profile setup or app entry', () => {
  const requestIndex = appSource.indexOf(
    'const fix = await requestLocationAccess(navigator.geolocation);',
  );
  const deniedIndex = appSource.indexOf('if (!fix) {', requestIndex);
  const saveIndex = appSource.indexOf(
    "const locationSaveResult = await workerPost('/api/profile', {",
    requestIndex,
  );
  const confirmIndex = appSource.indexOf(
    'if (!isLocationSaveConfirmed(locationSaveResult, fix)) {',
    saveIndex,
  );
  const setupIndex = appSource.indexOf('setShowProfileSetup(true)', confirmIndex);
  const readyProfileIndex = appSource.indexOf('setCurrentUser(myProfile)', confirmIndex);

  assert.ok(requestIndex >= 0);
  assert.ok(deniedIndex > requestIndex);
  assert.ok(saveIndex > deniedIndex);
  assert.ok(confirmIndex > saveIndex);
  assert.ok(setupIndex > confirmIndex);
  assert.ok(readyProfileIndex > confirmIndex);
  assert.match(appSource, /const currentLoc = fix;/);
  assert.doesNotMatch(appSource, /const currentLoc = fix \?\?/);
  assert.match(appSource, /data-testid="button-location-retry"/);
});
