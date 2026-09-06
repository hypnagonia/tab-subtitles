import { AudioPipe } from '../audio/pipe';
import { TRANSCRIPTION } from '../audio/config';
import { ChromeEngine, chromeEngineSupported } from '../transcription/chrome-engine';
import { needsChromeLanguageRestart } from '../transcription/config-change';
import { Resampler16k } from '../transcription/resampler';
import { RollingAudio } from '../transcription/rolling-audio';
import { TranscriptionController } from '../transcription/controller';
import { toSw, type OffscreenCommand, type OffscreenEvent } from '../shared/messages';
import type { ActiveEngine, Engine, ErrorCode } from '../shared/types';

let language: string | null = null;
let tag = 'en-US';
let speakers = false;
let engine: Engine = 'auto';
let active: ActiveEngine = null;
let chromeSequence = 0;
let sessionStart = 0;

/** Chrome's recogniser returns text but not the audio behind it, so a copy is
 *  kept here to take a voice print from. */
const recent = new RollingAudio();
const resampler = new Resampler16k();

function emit(event: OffscreenEvent): void {
  chrome.runtime.sendMessage(toSw(event)).catch(() => undefined);
}

function setActive(next: ActiveEngine): void {
  if (active === next) return;
  active = next;
  emit({ type: 'engine:active', active });
}

const transcription = new TranscriptionController({
  onSegment: (segment) => emit({ type: 'transcript:segment', segment }),
  onProgress: (progress) => emit({ type: 'model:progress', progress }),
  onPreparing: () => emit({ type: 'model:preparing' }),
  onReady: () => emit({ type: 'model:ready' }),
  onError: (raw, fatal) => {
    if (!fatal) return;
    const error = raw as ErrorCode;
    emit({ type: 'model:error', error });
    if (active === 'whisper' || active === null) {
      // Fall back to Chrome rather than leaving the panel with nothing.
      if (engine !== 'whisper' && pipe.running) void startChrome();
      else emit({ type: 'transcription:status', status: 'error', error: error as ErrorCode });
    }
  },
});

const chromeEngine = new ChromeEngine({
  onInterim: (text) => emit({ type: 'transcript:interim', text }),
  onFinal: (text, startedAt, endedAt) => {
    const segment = { id: `c${++chromeSequence}`, time: startedAt, end: endedAt, text, speaker: null };
    transcription.addExternal(segment);
    emit({ type: 'transcript:segment', segment });
    emit({ type: 'transcript:interim', text: '' });
    // The line is on screen already; its colour catches up a moment later.
    void colourSpeaker(segment, startedAt, endedAt);
  },
  onUnavailable: (code) => {
    emit({ type: 'engine:unavailable', code });
    if (engine === 'chrome') {
      emit({ type: 'transcription:status', status: 'error', error: code });
      setActive(null);
      return;
    }
    if (active !== 'whisper' && pipe.running) {
      transcription.start();
      setActive('whisper');
    }
  },
});

async function colourSpeaker(
  segment: { id: string; speaker: number | null },
  startedAt: number,
  endedAt: number,
): Promise<void> {
  if (!speakers) return;
  const audio = recent.slice(startedAt, endedAt);
  if (!audio) return;

  const speaker = await transcription.identifyAudio(audio, audio.length / TRANSCRIPTION.targetSampleRate);
  if (speaker === null) return;
  segment.speaker = speaker;
  emit({ type: 'transcript:speaker', id: segment.id, speaker });
}

const pipe = new AudioPipe({
  onAudio: (block, sampleRate) => {
    // Only one engine transcribes at a time, so the two never double up — but
    // the voice buffer is filled either way.
    if (active === 'whisper') transcription.push(block, sampleRate);
    if (speakers && active !== 'whisper') {
      const samples = resampler.push(block, sampleRate);
      if (samples.length) recent.append(samples, (performance.now() - sessionStart) / 1000);
    }
  },
  onEnded: (reason) => {
    void teardown();
    emit({ type: 'audio:ended', reason });
  },
});

async function startChrome(): Promise<boolean> {
  const track = pipe.track;
  if (!track || !chromeEngineSupported()) return false;
  const started = await chromeEngine.start(track, tag, sessionStart);
  if (started) {
    setActive(chromeEngine.local ? 'chrome-local' : 'chrome');
    // Voices are told apart by the audio, not by the recogniser, so Chrome gets
    // the same colours as the offline engine.
    transcription.prepareSpeakers();
  }
  return started;
}

async function teardown(): Promise<void> {
  pipe.setTapEnabled(false);
  chromeEngine.stop();
  transcription.stop();
  recent.reset();
  resampler.reset();
  await pipe.stop();
  setActive(null);
}

async function startAudio(streamId: string): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId,
      },
    },
  } as unknown as MediaStreamConstraints);
  sessionStart = performance.now();
  recent.reset();
  resampler.reset();
  await pipe.start(stream);
  // Both the voice buffer and the offline model are fed from the tap, so it
  // runs for the whole session whichever engine is transcribing.
  pipe.setTapEnabled(true);

  // Chrome's recogniser is quicker off the mark and reads speech better, so it
  // leads. The offline model is only started when Chrome cannot do the job, or
  // when it was asked for by name.
  const chromeStarted = engine !== 'whisper' ? await startChrome() : false;

  if (!chromeStarted) {
    if (engine !== 'chrome') {
      transcription.start();
      setActive('whisper');
    } else {
      setActive(null);
    }
  }
}

chrome.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
  const message = raw as OffscreenCommand & { target?: string };
  if (message?.target !== 'offscreen') return undefined;

  (async () => {
    switch (message.type) {
      case 'status:get':
        sendResponse({ ok: true, capturing: pipe.running, transcribing: active !== null, active });
        break;

      case 'audio:start':
        language = message.language;
        tag = message.tag;
        speakers = message.speakers;
        engine = message.engine;
        transcription.configure(language, speakers);
        await startAudio(message.streamId);
        emit({ type: 'transcription:status', status: 'running' });
        sendResponse({ ok: true });
        break;

      case 'audio:stop':
        await teardown();
        emit({ type: 'transcription:status', status: 'off' });
        sendResponse({ ok: true });
        break;

      case 'config':
        const restartChrome = needsChromeLanguageRestart(active, tag, message.tag);
        language = message.language;
        tag = message.tag;
        speakers = message.speakers;
        transcription.configure(language, speakers);
        if (restartChrome) {
          chromeEngine.stop();
          await startChrome();
        }
        sendResponse({ ok: true });
        break;

      case 'model:download':
        speakers = message.speakers;
        transcription.configure(language, speakers);
        await transcription.download();
        sendResponse({ ok: true });
        break;

      case 'transcript:get':
        sendResponse({ ok: true, segments: transcription.segments });
        break;

      case 'transcript:clear':
        transcription.clear();
        sendResponse({ ok: true });
        break;

      default:
        sendResponse({ ok: false });
    }
  })().catch((error: unknown) => {
    sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
  });

  return true;
});
