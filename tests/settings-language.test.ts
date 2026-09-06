import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_SETTINGS, initialLanguage, tagFor } from '../src/shared/types.ts';
import { needsChromeLanguageRestart } from '../src/transcription/config-change.ts';

test('speaker separation is on for a fresh install', () => {
  assert.equal(DEFAULT_SETTINGS.speakers, true);
});

test('Russian resolves to the Chrome and Whisper language values', () => {
  assert.equal(tagFor('ru'), 'ru-RU');
});

test('the spoken language is always a real code, never auto', () => {
  assert.equal(DEFAULT_SETTINGS.language, 'en');
});

test('a fresh install starts on the browser language when it is one we offer', () => {
  assert.equal(initialLanguage('ru-RU'), 'ru');
  assert.equal(initialLanguage('pt_BR'), 'pt');
  assert.equal(initialLanguage('en-GB'), 'en');
  // Languages the picker does not list, and the setting an old install carries.
  assert.equal(initialLanguage('uk'), 'en');
  assert.equal(initialLanguage('auto'), 'en');
  assert.equal(initialLanguage(undefined), 'en');
});

test('changing spoken language restarts a running Chrome recognizer', () => {
  assert.equal(needsChromeLanguageRestart('chrome', 'en-US', 'ru-RU'), true);
  assert.equal(needsChromeLanguageRestart('chrome-local', 'en-US', 'ru-RU'), true);
  assert.equal(needsChromeLanguageRestart('chrome', 'ru-RU', 'ru-RU'), false);
  assert.equal(needsChromeLanguageRestart('whisper', 'en-US', 'ru-RU'), false);
  assert.equal(needsChromeLanguageRestart(null, 'en-US', 'ru-RU'), false);
});
