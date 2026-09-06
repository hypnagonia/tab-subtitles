import type { ActiveEngine, AppState, Engine, ErrorCode, Segment, Settings } from './types';

/** Side panel → service worker. */
export type PanelCommand =
  | { type: 'state:get' }
  | { type: 'subtitles:start'; tabId: number }
  | { type: 'subtitles:stop' }
  | { type: 'settings:set'; patch: Partial<Settings> }
  | { type: 'model:download' }
  | { type: 'transcript:get' }
  | { type: 'transcript:clear' };

/** Service worker → offscreen document. */
export type OffscreenCommand =
  | { type: 'status:get' }
  | {
      type: 'audio:start';
      streamId: string;
      language: string;
      tag: string;
      speakers: boolean;
      engine: Engine;
    }
  | { type: 'audio:stop' }
  | { type: 'config'; language: string; tag: string; speakers: boolean }
  | { type: 'model:download'; speakers: boolean }
  | { type: 'transcript:get' }
  | { type: 'transcript:clear' };

/** Offscreen document → service worker. */
export type OffscreenEvent =
  | { type: 'audio:ended'; reason: string }
  | { type: 'model:progress'; progress: number }
  | { type: 'model:ready' }
  | { type: 'model:error'; error: ErrorCode }
  | { type: 'model:preparing' }
  | { type: 'transcription:status'; status: 'starting' | 'running' | 'off' | 'error'; error?: ErrorCode }
  | { type: 'transcript:segment'; segment: Segment }
  | { type: 'transcript:interim'; text: string }
  | { type: 'transcript:speaker'; id: string; speaker: number }
  | { type: 'engine:active'; active: ActiveEngine }
  | { type: 'engine:unavailable'; code: ErrorCode };

/** Service worker → side panel port. */
export type PanelEvent =
  | { type: 'state'; state: AppState }
  | { type: 'transcript:segment'; segment: Segment }
  | { type: 'transcript:interim'; text: string }
  | { type: 'transcript:speaker'; id: string; speaker: number }
  | { type: 'transcript:reset' };

export type Envelope<T> = T & { target: 'sw' | 'offscreen' };

export const PANEL_PORT = 'tab-subtitles:panel';

/** Messages the side panel waits on a reply for. */
export const PANEL_COMMANDS = new Set<PanelCommand['type']>([
  'state:get',
  'subtitles:start',
  'subtitles:stop',
  'settings:set',
  'model:download',
  'transcript:get',
  'transcript:clear',
]);

export function toSw<T extends object>(msg: T): Envelope<T> {
  return { ...msg, target: 'sw' };
}

export function toOffscreen<T extends object>(msg: T): Envelope<T> {
  return { ...msg, target: 'offscreen' };
}
