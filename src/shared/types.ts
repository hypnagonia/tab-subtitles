export type CaptureStatus = 'idle' | 'starting' | 'active' | 'error';

export interface TabInfo {
  id: number;
  title: string;
  host: string;
  audible: boolean;
}

export type FontChoice = 'sans' | 'grotesk' | 'serif' | 'mono';
export type ColorChoice = 'white' | 'yellow' | 'cyan' | 'green';

/** Which recogniser does the work. */
export type Engine = 'auto' | 'chrome' | 'whisper';

export interface Settings {
  engine: Engine;
  /** Interface language: a code, or 'auto' to follow the browser. */
  uiLanguage: string;
  /** A Whisper language code, or 'auto' to work it out. */
  language: string;
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
  engine: 'auto',
  uiLanguage: 'auto',
  language: 'auto',
  font: 'sans',
  fontSize: 17,
  color: 'white',
  timestamps: true,
  speakers: false,
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
  { code: 'en', label: 'english', tag: 'en-US' , flag: '🇺🇸' },
  { code: 'ru', label: 'русский', tag: 'ru-RU' , flag: '🇷🇺' },
  { code: 'de', label: 'deutsch', tag: 'de-DE' , flag: '🇩🇪' },
  { code: 'fr', label: 'français', tag: 'fr-FR' , flag: '🇫🇷' },
  { code: 'es', label: 'español', tag: 'es-ES' , flag: '🇪🇸' },
  { code: 'pt', label: 'português', tag: 'pt-PT' , flag: '🇵🇹' },
  { code: 'it', label: 'italiano', tag: 'it-IT' , flag: '🇮🇹' },
  { code: 'nl', label: 'nederlands', tag: 'nl-NL' , flag: '🇳🇱' },
  { code: 'pl', label: 'polski', tag: 'pl-PL' , flag: '🇵🇱' },
  { code: 'tr', label: 'türkçe', tag: 'tr-TR' , flag: '🇹🇷' },
  { code: 'sv', label: 'svenska', tag: 'sv-SE' , flag: '🇸🇪' },
  { code: 'cs', label: 'čeština', tag: 'cs-CZ' , flag: '🇨🇿' },
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
  /** What 'auto' resolved to: the page's language, else the browser's. Null
   *  means neither said anything and the model will detect it itself. */
  detected: string | null;
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
}

export const DEFAULT_TRANSCRIPTION: TranscriptionState = {
  status: 'off',
  active: null,
  model: 'absent',
  progress: 0,
  error: null,
  detected: null,
};
