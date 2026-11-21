import assert from 'node:assert/strict';
import test from 'node:test';
import { hasJpgMainProfileImage } from '../src/utils/profile-image.js';

test('swipe requires an HTTPS main profile image with a JPG suffix', () => {
  assert.equal(hasJpgMainProfileImage('https://images.example/profile.jpg'), true);
  assert.equal(hasJpgMainProfileImage('https://images.example/profile.JPG?size=large'), true);
  assert.equal(hasJpgMainProfileImage('https://images.example/profile.jpeg'), false);
  assert.equal(hasJpgMainProfileImage('https://images.example/profile.png'), false);
  assert.equal(hasJpgMainProfileImage('http://images.example/profile.jpg'), false);
  assert.equal(hasJpgMainProfileImage('not-a-url.jpg'), false);
  assert.equal(hasJpgMainProfileImage(''), false);
});
