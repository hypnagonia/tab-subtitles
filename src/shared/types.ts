export type CaptureStatus = 'idle' | 'starting' | 'active' | 'error';

export interface TabInfo {
  id: number;
  title: string;
  host: string;
  audible: boolean;
}

export type FontChoice = 'sans' | 'grotesk' | 'serif' | 'mono';
export type ColorChoice = 'white' | 'yellow' | 'cyan' | 'green';

/** Which recogniser does the work. Chosen for the user by the mode, never
 *  by the user: nobody opens a subtitle panel wanting a recogniser. */
export type Engine = 'auto' | 'chrome' | 'whisper';

/** What the user came here for. The mode is the only choice the panel asks
 *  them to make, and everything else — recogniser, translation — follows. */
export type Mode = 'quick' | 'private' | 'translate';

export const MODES: Mode[] = ['quick', 'private', 'translate'];

const MODE_VALUES = new Set<string>(MODES);

export function isMode(value: unknown): value is Mode {
  return typeof value === 'string' && MODE_VALUES.has(value);
}

/** The offline model is the only recogniser that never reaches a server, so it
 *  is what privacy means here. The other modes take whichever is quicker. */
export function engineFor(mode: Mode): Engine {
  return mode === 'private' ? 'whisper' : 'auto';
}

/** The language to translate into, which only the translating mode asks for.
 *  The others keep the choice; they simply do not act on it. */
export function translationTarget(settings: Settings): string {
  return settings.mode === 'translate' ? settings.translateTo : NO_TRANSLATION;
}

/** The value translation settings carry when no translation is wanted. */
export const NO_TRANSLATION = 'none';

export interface Settings {
  mode: Mode;
  /** Interface language: a code, or 'auto' to follow the browser. */
  uiLanguage: string;
  /** The language being spoken, as a code from LANGUAGES. */
  language: string;
  /** A code from LANGUAGES to translate the subtitles into, or 'none'. Only
   *  the translating mode acts on it. */
  translateTo: string;
  font: FontChoice;
  /** Subtitle size in px. */
  fontSize: number;
  color: ColorChoice;
  timestamps: boolean;
  /** Tell voices apart and colour them separately. */
  speakers: boolean;
  /** Also show the current line over the page itself, television style. */
  overlay: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  mode: 'quick',
  uiLanguage: 'auto',
  language: 'en',
  translateTo: 'none',
  font: 'sans',
  fontSize: 17,
  color: 'white',
  timestamps: true,
  speakers: true,
  overlay: false,
};

export const FONTS: { value: FontChoice; label: string; stack: string }[] = [
  { value: 'sans', label: 'sans', stack: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, system-ui, sans-serif" },
  { value: 'grotesk', label: 'grotesk', stack: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  { value: 'serif', label: 'serif', stack: "Georgia, 'Times New Roman', Times, serif" },
  { value: 'mono', label: 'mono', stack: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" },
];

export const COLORS: { value: ColorChoice; label: string; hex: string }[] = [
  { value: 'white', label: 'white', hex: '#ffffff' },
  { value: 'yellow', label: 'yellow', hex: '#f2e14c' },
  { value: 'cyan', label: 'cyan', hex: '#7fe3ff' },
  { value: 'green', label: 'green', hex: '#8fe08a' },
];

/** Speaker 1 keeps the chosen subtitle colour; everyone else gets one of these. */
export const SPEAKER_COLORS = ['#f2e14c', '#7fe3ff', '#8fe08a', '#ffa5c0', '#c0a9ff'];

/** The first speaker keeps the chosen subtitle colour; subsequent speakers
 *  use the shared palette in both the panel and the on-page overlay. */
export function speakerColor(speaker: number | null, color: ColorChoice): string {
  const base = COLORS.find((option) => option.value === color)?.hex ?? '#ffffff';
  if (speaker === null || speaker === 0) return base;
  const alternatives = SPEAKER_COLORS.filter((candidate) => candidate.toLowerCase() !== base.toLowerCase());
  return alternatives[(speaker - 1) % alternatives.length];
}

export const FONT_SIZE = { min: 13, max: 28 } as const;

/** Languages offered in the picker. Whisper handles far more; these are the
 *  ones worth putting in a list this small. */
export const LANGUAGES: { code: string; label: string; tag: string; flag: string }[] = [
  { code: 'en', label: 'English', tag: 'en-US' , flag: '🇺🇸' },
  { code: 'ru', label: 'Русский', tag: 'ru-RU' , flag: '🇷🇺' },
  { code: 'de', label: 'Deutsch', tag: 'de-DE' , flag: '🇩🇪' },
  { code: 'fr', label: 'Français', tag: 'fr-FR' , flag: '🇫🇷' },
  { code: 'es', label: 'Español', tag: 'es-ES' , flag: '🇪🇸' },
  { code: 'pt', label: 'Português', tag: 'pt-PT' , flag: '🇵🇹' },
  { code: 'it', label: 'Italiano', tag: 'it-IT' , flag: '🇮🇹' },
  { code: 'nl', label: 'Nederlands', tag: 'nl-NL' , flag: '🇳🇱' },
  { code: 'pl', label: 'Polski', tag: 'pl-PL' , flag: '🇵🇱' },
  { code: 'tr', label: 'Türkçe', tag: 'tr-TR' , flag: '🇹🇷' },
  { code: 'sv', label: 'Svenska', tag: 'sv-SE' , flag: '🇸🇪' },
  { code: 'cs', label: 'Čeština', tag: 'cs-CZ' , flag: '🇨🇿' },
  { code: 'ar', label: 'العربية', tag: 'ar-SA' , flag: '🇸🇦' },
  { code: 'hi', label: 'हिन्दी', tag: 'hi-IN' , flag: '🇮🇳' },
  { code: 'ja', label: '日本語', tag: 'ja-JP' , flag: '🇯🇵' },
  { code: 'ko', label: '한국어', tag: 'ko-KR' , flag: '🇰🇷' },
  { code: 'zh', label: '中文', tag: 'zh-CN' , flag: '🇨🇳' },
];

export function tagFor(code: string | null): string {
  return LANGUAGES.find((language) => language.code === code)?.tag ?? 'en-US';
}

export const LANGUAGE_CODES = new Set(LANGUAGES.map((language) => language.code));

/** The spoken language a fresh install starts on: the browser's own language
 *  when it is one we offer, else English. */
export function initialLanguage(browserLanguage: string | undefined | null): string {
  const code = (browserLanguage ?? '').trim().toLowerCase().split(/[-_]/)[0];
  return LANGUAGE_CODES.has(code) ? code : 'en';
}

/** A translation target that is not the language being spoken: the interface
 *  language when it differs, else English, else anything else on the list. */
export function defaultTranslationTarget(spoken: string, uiLanguage: string): string {
  const preferred = [uiLanguage, 'en', ...LANGUAGES.map((language) => language.code)];
  return preferred.find((code) => LANGUAGE_CODES.has(code) && code !== spoken) ?? NO_TRANSLATION;
}

export type ModelStatus = 'absent' | 'downloading' | 'preparing' | 'ready' | 'error';

/** Anything that can go wrong, named rather than written out, so the panel can
 *  say it in the interface language. */
export type ErrorCode =
  | 'notInvoked'
  | 'inUse'
  | 'notCapturable'
  | 'captureFailed'
  | 'tabClosed'
  | 'chromeStopped'
  | 'modelMemory'
  | 'modelNetwork'
  | 'modelMissing'
  | 'modelFailed'
  | 'modelStalled'
  | 'engineUnsupported'
  | 'engineNotAllowed'
  | 'engineNetwork'
  | 'engineFailed';
export type TranscriptionStatus = 'off' | 'starting' | 'running' | 'error';

/** Which recogniser is actually producing text right now. */
export type ActiveEngine = 'chrome' | 'chrome-local' | 'whisper' | null;

export interface TranscriptionState {
  status: TranscriptionStatus;
  active: ActiveEngine;
  model: ModelStatus;
  /** 0 – 1 while downloading. */
  progress: number;
  error: ErrorCode | null;
}

export interface CaptureState {
  status: CaptureStatus;
  tab: TabInfo | null;
  error: ErrorCode | null;
}

export interface AppState {
  capture: CaptureState;
  activeTab: TabInfo | null;
  /** Whether Chrome has granted activeTab for the current tab. Without it,
   *  tab capture is refused no matter which permissions are granted. */
  activeTabInvoked: boolean;
  settings: Settings;
  transcription: TranscriptionState;
}

export interface Segment {
  id: string;
  /** Seconds since subtitles started. */
  time: number;
  end: number;
  text: string;
  /** 0-based speaker index, or null when voices are not being separated. */
  speaker: number | null;
  /** The same line in the translation language, once Chrome has translated it.
   *  The original is what the transcript keeps and what exports carry. */
  translation?: string;
}

export const DEFAULT_TRANSCRIPTION: TranscriptionState = {
  status: 'off',
  active: null,
  model: 'absent',
  progress: 0,
  error: null,
};
