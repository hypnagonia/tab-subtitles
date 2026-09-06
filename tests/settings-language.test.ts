import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_SETTINGS, tagFor } from '../src/shared/types.ts';
import { needsChromeLanguageRestart } from '../src/transcription/config-change.ts';

test('speaker separation is disabled for a fresh install', () => {
  assert.equal(DEFAULT_SETTINGS.speakers, false);
});

test('Russian resolves to the Chrome and Whisper language values', () => {
  assert.equal(tagFor('ru'), 'ru-RU');
});

test('changing spoken language restarts a running Chrome recognizer', () => {
  assert.equal(needsChromeLanguageRestart('chrome', 'en-US', 'ru-RU'), true);
  assert.equal(needsChromeLanguageRestart('chrome-local', 'en-US', 'ru-RU'), true);
  assert.equal(needsChromeLanguageRestart('chrome', 'ru-RU', 'ru-RU'), false);
  assert.equal(needsChromeLanguageRestart('whisper', 'en-US', 'ru-RU'), false);
  assert.equal(needsChromeLanguageRestart(null, 'en-US', 'ru-RU'), false);
});
