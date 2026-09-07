import assert from 'node:assert/strict';
import test from 'node:test';
import { LiveTranslator, NO_TRANSLATION, wantsTranslation } from '../src/transcription/translator.ts';
import type { Availability, TranslatorApi } from '../src/transcription/translator.ts';

/** A translator that answers only when told to, so a backlog can be staged. */
function fakeApi(availability: Availability = 'available') {
  const calls: string[] = [];
  const waiting: (() => void)[] = [];
  let creates = 0;

  const api: TranslatorApi = {
    availability: async () => availability,
    create: async () => {
      creates++;
      return {
        translate: (text: string) =>
          new Promise<string>((resolve) => {
            calls.push(text);
            waiting.push(() => resolve(`[${text}]`));
          }),
      };
    },
  };

  return {
    api: () => api,
    calls,
    creates: () => creates,
    /** Waits for `count` lines to reach the translator, then answers them. */
    async answer(count: number): Promise<void> {
      for (let i = 0; i < 50 && calls.length < count; i++) await new Promise((r) => setTimeout(r, 0));
      waiting.splice(0).forEach((resolve) => resolve());
    },
  };
}

test('translation is skipped when it is off, or into the language already spoken', () => {
  assert.equal(wantsTranslation('en', NO_TRANSLATION), false);
  assert.equal(wantsTranslation('en', 'en'), false);
  assert.equal(wantsTranslation('en', 'ru'), true);
});

test('lines that pile up behind the translator are dropped, not queued', async () => {
  const fake = fakeApi();
  const translator = new LiveTranslator(fake.api);

  const first = translator.translate('one', 'en', 'ru');
  const second = translator.translate('two', 'en', 'ru');
  // Two are already waiting, so a third would only ever arrive late.
  assert.equal(await translator.translate('three', 'en', 'ru'), null);

  await fake.answer(2);
  assert.equal(await first, '[one]');
  assert.equal(await second, '[two]');
  assert.deepEqual(fake.calls, ['one', 'two']);
});

test('one translator serves a pair, and a new pair gets a new one', async () => {
  const fake = fakeApi();
  const translator = new LiveTranslator(fake.api);

  const first = translator.translate('one', 'en', 'ru');
  await fake.answer(1);
  await first;

  const second = translator.translate('two', 'en', 'ru');
  await fake.answer(2);
  await second;
  assert.equal(fake.creates(), 1);

  const third = translator.translate('three', 'en', 'de');
  await fake.answer(3);
  await third;
  assert.equal(fake.creates(), 2);
});

test('a model that has not been downloaded yet translates nothing, quietly', async () => {
  const fake = fakeApi('downloadable');
  const translator = new LiveTranslator(fake.api);
  assert.equal(await translator.translate('one', 'en', 'ru'), null);
  assert.equal(fake.creates(), 0);
});

test('nothing is translated when Chrome has no translator at all', async () => {
  const translator = new LiveTranslator(() => null);
  assert.equal(await translator.translate('one', 'en', 'ru'), null);
});
