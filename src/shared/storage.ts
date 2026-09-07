import {
  DEFAULT_SETTINGS,
  LANGUAGE_CODES,
  NO_TRANSLATION,
  initialLanguage,
  isMode,
  type Engine,
  type Settings,
} from './types';

const KEY_SETTINGS = 'settings';
const KEY_MODEL_READY = 'modelReady';

export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(KEY_SETTINGS);
  const saved = stored[KEY_SETTINGS] as (Partial<Settings> & { engine?: Engine }) | undefined;
  const settings = { ...DEFAULT_SETTINGS, ...saved };
  // Spoken language used to have an 'auto' setting that only ever guessed. An
  // install carrying it, or anything else we no longer offer, starts from the
  // browser's own language instead.
  if (!LANGUAGE_CODES.has(settings.language)) {
    settings.language = initialLanguage(chrome.i18n?.getUILanguage?.());
  }
  // Settings used to name a recogniser. An install carrying one keeps what it
  // was after, rather than what it had picked to get there.
  if (!isMode(settings.mode)) {
    settings.mode =
      saved?.engine === 'whisper'
        ? 'private'
        : settings.translateTo !== NO_TRANSLATION
          ? 'translate'
          : 'quick';
  }
  // Translating into nothing, or into the language already being spoken, is
  // just captions.
  if (settings.mode === 'translate' && (settings.translateTo === NO_TRANSLATION || settings.translateTo === settings.language)) {
    settings.mode = 'quick';
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
