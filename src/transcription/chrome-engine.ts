/**
 * Chrome's own speech recognition, fed the captured tab track directly, so
 * subtitles start the moment you press the button instead of after a 150 MB
 * download. Chrome 147 accepts a MediaStreamTrack in start(); older versions
 * only listen to the microphone, which is no use here, so they are refused.
 *
 * It runs on Google's servers unless Chrome's own on-device model is installed,
 * which is why the panel always says which engine is speaking.
 */

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  processLocally?: boolean;
  start(track?: MediaStreamTrack): void;
  stop(): void;
  abort(): void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
};

type RecognitionCtor = {
  new (): Recognition;
  available?(options: { langs: string[]; processLocally: boolean }): Promise<string>;
  install?(options: { langs: string[] }): Promise<boolean>;
};

function ctor(): RecognitionCtor | null {
  const api = (self as any).SpeechRecognition ?? (self as any).webkitSpeechRecognition;
  // A constructor whose start() ignores arguments would silently listen to the
  // microphone instead of the tab, so require the track-taking signature.
  return api ?? null;
}

export function chromeEngineSupported(): boolean {
  return ctor() !== null;
}

/** 'available' when it can run entirely on this machine right now. */
export async function localAvailability(bcp47: string): Promise<string> {
  const api = ctor();
  if (!api?.available) return 'unavailable';
  try {
    return await api.available({ langs: [bcp47], processLocally: true });
  } catch {
    return 'unavailable';
  }
}

/** Asks Chrome to fetch its on-device model so later sessions stay local. */
export async function installLocal(bcp47: string): Promise<boolean> {
  const api = ctor();
  if (!api?.install) return false;
  try {
    return await api.install({ langs: [bcp47] });
  } catch {
    return false;
  }
}

/** Chrome keeps one utterance open indefinitely while speech continues, so a
 *  line is committed at the first pause, and after this long regardless. */
const PAUSE_MS = 1000;
const MAX_UTTERANCE_MS = 8000;
const WATCHDOG_MS = 350;

export interface ChromeEngineHandlers {
  onInterim(text: string): void;
  onFinal(text: string, startedAt: number, endedAt: number): void;
  onUnavailable(code: 'engineUnsupported' | 'engineNotAllowed' | 'engineNetwork' | 'engineFailed'): void;
}

export class ChromeEngine {
  private recognition: Recognition | null = null;
  private track: MediaStreamTrack | null = null;
  private wanted = false;
  private startedAt = 0;
  private utteranceStart: number | null = null;
  private pending = '';
  private pendingSince = 0;
  private lastChange = 0;
  /** Interim text that has been asked to finalise. If Chrome ends the session
   *  without returning it, it is committed here rather than lost. */
  private awaiting = '';
  private awaitingStart = 0;
  private watchdog: ReturnType<typeof setInterval> | null = null;

  /** True while Chrome is running fully on this machine. */
  local = false;

  constructor(private handlers: ChromeEngineHandlers) {}

  get running(): boolean {
    return this.recognition !== null;
  }

  async start(track: MediaStreamTrack, bcp47: string, origin: number): Promise<boolean> {
    const api = ctor();
    if (!api) {
      this.handlers.onUnavailable('engineUnsupported');
      return false;
    }

    this.local = (await localAvailability(bcp47)) === 'available';
    this.track = track;
    this.wanted = true;
    // Shared with the audio buffer, so a committed line can be matched back to
    // the audio it came from.
    this.startedAt = origin;
    return this.spawn(bcp47);
  }

  stop(): void {
    this.wanted = false;
    const recognition = this.recognition;
    this.recognition = null;
    // Whatever was still being spoken is a line too.
    this.rescue();
    this.utteranceStart = null;
    this.clearPending();
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
    try {
      recognition?.abort();
    } catch {
      // already gone
    }
  }

  private clearPending(): void {
    this.pending = '';
    this.pendingSince = 0;
    this.lastChange = 0;
  }

  /**
   * Ends the current utterance so Chrome commits it. stop() flushes what it has
   * heard and fires a final result; onend then starts the next session.
   */
  private flush(): void {
    const recognition = this.recognition;
    if (!recognition) return;
    this.awaiting = this.pending;
    this.awaitingStart = this.utteranceStart ?? 0;
    this.clearPending();
    try {
      recognition.stop();
    } catch {
      // it had already ended on its own
    }
  }

  /** Commits text Chrome heard but never returned as a final result. */
  private rescue(): void {
    const text = this.awaiting || this.pending;
    if (!text) return;
    const start = this.awaiting ? this.awaitingStart : (this.utteranceStart ?? 0);
    this.awaiting = '';
    this.pending = '';
    this.utteranceStart = null;
    this.handlers.onFinal(text, start, (performance.now() - this.startedAt) / 1000);
    this.handlers.onInterim('');
  }

  private spawn(bcp47: string): boolean {
    const api = ctor();
    if (!api || !this.track) return false;

    let recognition: Recognition;
    try {
      recognition = new api();
      recognition.lang = bcp47;
      recognition.continuous = true;
      recognition.interimResults = true;
      if (this.local) recognition.processLocally = true;
    } catch {
      this.handlers.onUnavailable('engineFailed');
      return false;
    }

    recognition.onresult = (event: any) => {
      const now = (performance.now() - this.startedAt) / 1000;
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = String(result[0]?.transcript ?? '').trim();
        if (!text) continue;
        if (result.isFinal) {
          this.awaiting = '';
          this.clearPending();
          this.handlers.onFinal(text, this.utteranceStart ?? Math.max(0, now - 2), now);
          this.utteranceStart = null;
        } else {
          this.utteranceStart ??= Math.max(0, now - 1);
          interim += `${interim ? ' ' : ''}${text}`;
        }
      }
      if (interim && interim !== this.pending) {
        this.pending = interim;
        this.lastChange = performance.now();
        if (!this.pendingSince) this.pendingSince = this.lastChange;
      } else if (!interim) {
        this.clearPending();
      }
      this.handlers.onInterim(interim);
    };

    recognition.onerror = (event: any) => {
      const error = String(event?.error ?? '');
      if (error === 'no-speech' || error === 'aborted') return;
      if (error === 'not-allowed' || error === 'service-not-allowed') {
        this.rescue();
        this.wanted = false;
        this.handlers.onUnavailable('engineNotAllowed');
      } else if (error === 'network') {
        this.rescue();
        this.wanted = false;
        this.handlers.onUnavailable('engineNetwork');
      }
    };

    // Chrome ends a session on its own every so often; keep it alive.
    recognition.onend = () => {
      if (this.recognition !== recognition) return;
      this.recognition = null;
      // Chrome sometimes ends a session having returned only interim text.
      this.rescue();
      if (this.wanted) this.spawn(bcp47);
    };

    try {
      recognition.start(this.track);
    } catch {
      this.handlers.onUnavailable('engineFailed');
      return false;
    }

    this.recognition = recognition;

    this.watchdog ??= setInterval(() => {
      if (!this.pending || !this.recognition) return;
      const now = performance.now();
      if (now - this.lastChange > PAUSE_MS || now - this.pendingSince > MAX_UTTERANCE_MS) this.flush();
    }, WATCHDOG_MS);

    return true;
  }
}
