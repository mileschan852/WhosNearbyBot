import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseStarMenuItems, DEFAULT_STAR_MENU_ITEMS } from '../src/config/star-menu.js';

const config = JSON.parse(await readFile(new URL('../public/config.json', import.meta.url), 'utf8'));

test('both public entries configure three external actions separately from the raffle', () => {
  for (const entry of Object.values(config.entries)) {
    assert.equal(entry.starMenuItems.length, 3);
    assert.deepEqual(
      entry.starMenuItems.map(({ id }) => id),
      ['busta', 'tonflip', 'photify'],
    );
    assert.match(entry.chatUrl, /^https:\/\//);
    assert.equal(parseStarMenuItems(entry.starMenuItems, entry.id).length, 3);
  }
});

test('older config files keep the existing three external actions by default', () => {
  assert.deepEqual(parseStarMenuItems(undefined), DEFAULT_STAR_MENU_ITEMS);
});

test('clones can replace, reorder, or remove external menu actions', () => {
  const customized = [
    { id: 'community', label: 'Community', icon: '💬', url: 'https://t.me/example' },
    { id: 'shop', label: 'Shop', icon: '🛍️', url: 'https://shop.example.com' },
  ];

  assert.deepEqual(parseStarMenuItems(customized), customized);
  assert.deepEqual(parseStarMenuItems([]), []);
});

test('unsafe or malformed star-menu configuration fails explicitly', () => {
  assert.throws(() => parseStarMenuItems('not-an-array'), /at most three items/);
  assert.throws(() => parseStarMenuItems(new Array(4).fill(DEFAULT_STAR_MENU_ITEMS[0])), /at most three items/);
  assert.throws(() => parseStarMenuItems([
    { ...DEFAULT_STAR_MENU_ITEMS[0], url: 'javascript:alert(1)' },
  ]), /item 1.*invalid/);
  assert.throws(() => parseStarMenuItems([
    { ...DEFAULT_STAR_MENU_ITEMS[0], url: 'https://user:pass@example.com' },
  ]), /item 1.*invalid/);
  assert.throws(() => parseStarMenuItems([
    DEFAULT_STAR_MENU_ITEMS[0],
    { ...DEFAULT_STAR_MENU_ITEMS[1], id: 'BUSTA' },
  ]), /duplicate item IDs/);
});
