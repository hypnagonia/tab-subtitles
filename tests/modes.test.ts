import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_SETTINGS,
  defaultTranslationTarget,
  engineFor,
  isMode,
  translationTarget,
} from '../src/shared/types.ts';

test('a fresh install starts on quick captions', () => {
  assert.equal(DEFAULT_SETTINGS.mode, 'quick');
});

test('only the private mode pins the recogniser to the offline model', () => {
  assert.equal(engineFor('private'), 'whisper');
  assert.equal(engineFor('quick'), 'auto');
  assert.equal(engineFor('translate'), 'auto');
});

test('a translation target is only asked for by the translating mode', () => {
  const settings = { ...DEFAULT_SETTINGS, translateTo: 'ru' };
  assert.equal(translationTarget({ ...settings, mode: 'translate' }), 'ru');
  // The choice is kept while the mode is elsewhere, so coming back remembers it.
  assert.equal(translationTarget({ ...settings, mode: 'quick' }), 'none');
  assert.equal(translationTarget({ ...settings, mode: 'private' }), 'none');
});

test('a translation target is never the language being spoken', () => {
  assert.equal(defaultTranslationTarget('en', 'ru'), 'ru');
  assert.equal(defaultTranslationTarget('ru', 'ru'), 'en');
  // An interface language the subtitles do not offer falls back to English.
  assert.equal(defaultTranslationTarget('de', 'xx'), 'en');
  assert.notEqual(defaultTranslationTarget('en', 'en'), 'en');
});

test('a mode is only ever one of the three', () => {
  assert.equal(isMode('translate'), true);
  assert.equal(isMode('whisper'), false);
  assert.equal(isMode(undefined), false);
});
