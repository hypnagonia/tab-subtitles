import { DEFAULT_SETTINGS, type Settings } from './types';

const KEY_SETTINGS = 'settings';
const KEY_MODEL_READY = 'modelReady';

export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(KEY_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...(stored[KEY_SETTINGS] as Partial<Settings> | undefined) };
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
