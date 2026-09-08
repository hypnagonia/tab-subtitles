import { DEFAULT_SETTINGS, LANGUAGE_CODES, initialLanguage, type Settings } from './types';

const KEY_SETTINGS = 'settings';
const KEY_MODEL_READY = 'modelReady';

export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(KEY_SETTINGS);
  const saved = stored[KEY_SETTINGS] as (Partial<Settings> & { mode?: string }) | undefined;
  const { mode, ...rest } = saved ?? {};
  const settings = { ...DEFAULT_SETTINGS, ...rest };
  // Settings briefly named what the captions were for instead of a recogniser.
  // An install carrying one of those gets the engine its mode implied, and no
  // translation: a mode kept a target language whether or not it was
  // translating, so the language it carries says nothing about what was wanted.
  // Translation starts from none, the same as a fresh install.
  if (mode !== undefined) {
    settings.engine = mode === 'private' ? 'whisper' : 'auto';
    settings.translateTo = DEFAULT_SETTINGS.translateTo;
  }
  // Spoken language used to have an 'auto' setting that only ever guessed. An
  // install carrying it, or anything else we no longer offer, starts from the
  // browser's own language instead.
  if (!LANGUAGE_CODES.has(settings.language)) {
    settings.language = initialLanguage(chrome.i18n?.getUILanguage?.());
  }
  return settings;
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [KEY_SETTINGS]: settings });
}

export async function isModelReady(): Promise<boolean> {
  const stored = await chrome.storage.local.get(KEY_MODEL_READY);
  return stored[KEY_MODEL_READY] === true;
}

export async function setModelReady(ready: boolean): Promise<void> {
  await chrome.storage.local.set({ [KEY_MODEL_READY]: ready });
}
