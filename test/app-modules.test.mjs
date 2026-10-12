import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_APP_MODULES,
  getDefaultDiscoveryView,
  parseAppModules,
} from '../src/config/app-modules.js';

test('existing configurations keep every module enabled by default', () => {
  assert.deepEqual(parseAppModules(undefined), DEFAULT_APP_MODULES);
  assert.equal(getDefaultDiscoveryView(parseAppModules(undefined)), 'grid');
});

test('module flags can be changed independently', () => {
  const modules = parseAppModules({ map: false, starRaffle: false });

  assert.deepEqual(modules, {
    gridFilter: true,
    map: false,
    starRaffle: false,
    flyingMessage: true,
  });
  assert.equal(getDefaultDiscoveryView(modules), 'grid');
});

test('map becomes the start view when grid and filters are disabled', () => {
  const modules = parseAppModules({ gridFilter: false });

  assert.equal(modules.map, true);
  assert.equal(getDefaultDiscoveryView(modules), 'map');
});

test('no discovery view is selected when both grid and map are disabled', () => {
  assert.equal(getDefaultDiscoveryView(parseAppModules({
    gridFilter: false,
    map: false,
  })), null);
});

test('invalid or misspelled module settings fail explicitly', () => {
  assert.throws(() => parseAppModules(null), /must be an object/);
  assert.throws(() => parseAppModules({ map: 'off' }), /must be true or false/);
  assert.throws(() => parseAppModules({ starMenu: false }), /Unknown app module/);
});
