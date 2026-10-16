import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { hasUploadedMainProfileImage } from '../src/utils/profile-image.js';

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');

test('only an HTTPS JPEG Telegram profile photo satisfies the map image requirement', () => {
  assert.equal(hasUploadedMainProfileImage('https://t.me/i/userpic/123.jpeg'), true);
  assert.equal(hasUploadedMainProfileImage('https://t.me/i/userpic/123.jpg?size=320'), true);
  assert.equal(hasUploadedMainProfileImage(''), false);
  assert.equal(hasUploadedMainProfileImage('   '), false);
  assert.equal(hasUploadedMainProfileImage('https://t.me/i/userpic/123.svg'), false);
  assert.equal(hasUploadedMainProfileImage('http://example.com/photo.jpeg'), false);
  assert.equal(hasUploadedMainProfileImage('not-a-url'), false);
});

test('map opening and map rendering are both blocked without a main profile photo', () => {
  const handlerStart = appSource.indexOf('const handleToggleMap = async () => {');
  const photoGuard = appSource.indexOf(
    'if (nextVal && !hasMainProfileImage) {',
    handlerStart,
  );
  const mapVisibilityUpdate = appSource.indexOf(
    "workerPost('/api/profile', { profile: { map_visible: nextVal } })",
    handlerStart,
  );
  const mapRender = appSource.indexOf('{mapModuleEnabled && (');
  const renderGate = appSource.indexOf('!hasMainProfileImage ? (', mapRender);

  assert.ok(handlerStart >= 0);
  assert.ok(photoGuard > handlerStart);
  assert.ok(mapVisibilityUpdate > photoGuard);
  assert.ok(renderGate > mapRender);
  assert.match(appSource, /data-testid="map-photo-required"/);
});
