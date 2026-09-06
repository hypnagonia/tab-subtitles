import type { ActiveEngine } from '../shared/types';

/** Chrome fixes the recognition language when a recognition session starts.
 * Whisper reads its language for every queued chunk, so only Chrome needs a
 * restart after the user changes the spoken-language setting. */
export function needsChromeLanguageRestart(active: ActiveEngine, previousTag: string, nextTag: string): boolean {
  return (active === 'chrome' || active === 'chrome-local') && previousTag !== nextTag;
}
