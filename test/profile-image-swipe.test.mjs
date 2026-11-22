import assert from 'node:assert/strict';
import test from 'node:test';
import { hasUploadedMainProfileImage } from '../src/utils/profile-image.js';

test('Swipe accepts a validated Telegram profile-photo URL regardless of file suffix', () => {
  assert.equal(hasUploadedMainProfileImage('https://images.example/profile.jpg'), true);
  assert.equal(hasUploadedMainProfileImage('https://images.example/profile.webp?size=large'), true);
  assert.equal(hasUploadedMainProfileImage('https://images.example/file?id=telegram-photo'), true);
  assert.equal(hasUploadedMainProfileImage('https://images.example/'), true);
  assert.equal(hasUploadedMainProfileImage('http://images.example/profile.jpg'), false);
  assert.equal(hasUploadedMainProfileImage('not-a-url.jpg'), false);
  assert.equal(hasUploadedMainProfileImage(''), false);
  assert.equal(hasUploadedMainProfileImage(null), false);
});
