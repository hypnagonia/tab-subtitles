/**
 * Chrome's own translator, which runs on this machine once the pair's model has
 * been fetched. Nothing is sent anywhere, which is the only reason translation
 * belongs in this extension at all.
 *
 * Chrome translates one line at a time. A backlog would therefore leave the
 * subtitles showing a translation of what was said a while ago, so lines that
 * pile up behind the limit are dropped: an untranslated line beats a late one.
 */

// The tests run this file straight from source, where Node resolves nothing
// without the extension.
import { NO_TRANSLATION } from '../shared/types.ts';

/** The value a translation setting carries when no translation is wanted. It
 *  belongs with the settings; this module passes it on to its own callers. */
export { NO_TRANSLATION };

export type Availability = 'available' | 'downloadable' | 'downloading' | 'unavailable';

export interface TranslatorInstance {
  translate(text: string): Promise<string>;
  destroy?(): void;
}

export interface TranslatorApi {
  availability(options: { sourceLanguage: string; targetLanguage: string }): Promise<Availability>;
  create(options: {
    sourceLanguage: string;
    targetLanguage: string;
    monitor?: (monitor: EventTarget) => void;
  }): Promise<TranslatorInstance>;
}


/** Lines waiting on the translator before new ones are dropped. */
const MAX_PENDING = 2;

export function translatorApi(): TranslatorApi | null {
  return ((self as unknown as { Translator?: TranslatorApi }).Translator ?? null) as TranslatorApi | null;
}

/** Whether this Chrome can translate at all. */
export function translationSupported(): boolean {
  return translatorApi() !== null;
}

/** Nothing to translate when it is switched off, or into the language already spoken. */
export function wantsTranslation(source: string, target: string): boolean {
  return !!target && target !== NO_TRANSLATION && target !== source;
}

export async function translationAvailability(
  source: string,
  target: string,
  api: () => TranslatorApi | null = translatorApi,
): Promise<Availability> {
  const translator = api();
  if (!translator || !wantsTranslation(source, target)) return 'unavailable';
  try {
    return await translator.availability({ sourceLanguage: source, targetLanguage: target });
  } catch {
    return 'unavailable';
  }
}

/**
 * Fetches the pair's model, reporting progress as it goes. Chrome only allows
 * this from a user gesture, so it belongs in the side panel, on the click that
 * chose the language — never in the offscreen document, which has no gestures.
 */
export async function prepareTranslation(
  source: string,
  target: string,
  onProgress: (progress: number) => void,
  api: () => TranslatorApi | null = translatorApi,
): Promise<boolean> {
  const translator = api();
  if (!translator || !wantsTranslation(source, target)) return false;
  try {
    const instance = await translator.create({
      sourceLanguage: source,
      targetLanguage: target,
      monitor: (monitor) => {
        monitor.addEventListener('downloadprogress', (event) => {
          onProgress(Math.min(1, (event as ProgressEvent).loaded ?? 0));
        });
      },
    });
    instance.destroy?.();
    return true;
  } catch {
    return false;
  }
}

/** One translator, kept for as long as the pair it was made for. */
export class LiveTranslator {
  private instance: TranslatorInstance | null = null;
  private pair = '';
  private opening: Promise<TranslatorInstance | null> | null = null;
  private pending = 0;
  /** Not a constructor parameter property: the tests run through Node's
   *  type stripping, which does not support those. */
  private api: () => TranslatorApi | null;

  constructor(api: () => TranslatorApi | null = translatorApi) {
    this.api = api;
  }

  /** The translated line, or null when there is nothing to do, the translator
   *  is not there, or the line arrived too far behind to be worth translating. */
  async translate(text: string, source: string, target: string): Promise<string | null> {
    if (!text || !wantsTranslation(source, target)) return null;
    if (this.pending >= MAX_PENDING) return null;

    this.pending++;
    try {
      const instance = await this.open(source, target);
      if (!instance) return null;
      const translated = (await instance.translate(text)).trim();
      return translated && translated !== text ? translated : null;
    } catch {
      // One failed line is not worth stopping subtitles over.
      return null;
    } finally {
      this.pending--;
    }
  }

  /** Drops the current translator, e.g. when either language changes. */
  reset(): void {
    this.instance?.destroy?.();
    this.instance = null;
    this.opening = null;
    this.pair = '';
  }

  private open(source: string, target: string): Promise<TranslatorInstance | null> {
    const pair = `${source}>${target}`;
    if (pair !== this.pair) {
      this.reset();
      this.pair = pair;
    }
    if (this.instance) return Promise.resolve(this.instance);

    // Several lines can arrive before the first translator is ready; they all
    // wait on the same one rather than each making another.
    this.opening ??= this.create(source, target).finally(() => {
      this.opening = null;
    });
    return this.opening;
  }

  private async create(source: string, target: string): Promise<TranslatorInstance | null> {
    const api = this.api();
    if (!api) return null;
    try {
      // Without a user gesture Chrome refuses to start a download, so a model
      // that is not there yet is the side panel's job, not ours.
      if ((await api.availability({ sourceLanguage: source, targetLanguage: target })) !== 'available') return null;
      this.instance = await api.create({ sourceLanguage: source, targetLanguage: target });
      return this.instance;
    } catch {
      return null;
    }
  }
}
