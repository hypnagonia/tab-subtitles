/** Development harness: proves the recognisers return text, inside the
 *  extension's own origin where the real thing runs. */
import { ChromeEngine, chromeEngineSupported, localAvailability } from '../transcription/chrome-engine';
import { Resampler16k } from '../transcription/resampler';
import { RollingAudio } from '../transcription/rolling-audio';
import { TranscriptionController } from '../transcription/controller';
import { serialize } from '../lib/export';
import type { Segment } from '../shared/types';
import { SAMPLE_SPEECH_WAV } from './sample-speech';

const results: Record<string, unknown> = {};
(window as any).__results = results;

function exportTest() {
  const segments: Segment[] = [
    { id: 'a', time: 0, end: 2.5, text: 'First line.', speaker: 0 },
    { id: 'b', time: 2.6, end: 5.25, text: 'Second speaker answers.', speaker: 1 },
  ];
  results.exports = {
    txt: serialize(segments, 'txt', true),
    srt: serialize(segments, 'srt', true),
    vtt: serialize(segments, 'vtt', true),
  };
}

async function speechTrack(ctx: AudioContext, loops: number) {
  const bytes = await (await fetch(SAMPLE_SPEECH_WAV)).arrayBuffer();
  const buffer = await ctx.decodeAudioData(bytes);
  const destination = ctx.createMediaStreamDestination();
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = loops > 1;
  source.connect(destination);
  source.start();
  return { track: destination.stream.getAudioTracks()[0], seconds: buffer.duration, destination, source };
}

async function chromeTest() {
  const ctx = new AudioContext();
  const { track, seconds } = await speechTrack(ctx, 2);
  const events: string[] = [];
  const finals: string[] = [];

  results.chrome = { supported: chromeEngineSupported(), localAvailability: await localAvailability('en-US') };

  const engine = new ChromeEngine({
    onInterim: (text) => {
      if (text) events.push(`interim: ${text}`);
    },
    onFinal: (text) => {
      finals.push(text);
      events.push(`final: ${text}`);
    },
    onUnavailable: (reason) => events.push(`unavailable: ${reason}`),
  });

  const started = await engine.start(track, 'en-US', performance.now());
  await new Promise((r) => setTimeout(r, (seconds + 4) * 1000));
  engine.stop();

  results.chrome = {
    ...(results.chrome as object),
    started,
    local: engine.local,
    finals,
    events: events.slice(-8),
  };
}

async function whisperTest() {
  const ctx = new AudioContext();
  const { track, seconds } = await speechTrack(ctx, 1);
  const segments: string[] = [];
  const notes: string[] = [];

  const controller = new TranscriptionController({
    onSegment: (segment) => segments.push(`${segment.time.toFixed(1)}s [${segment.speaker}] ${segment.text}`),
    onProgress: (progress) => {
      (results as any).whisperProgress = Math.round(progress * 100);
    },
    onPreparing: () => undefined,
    onReady: () => notes.push('ready'),
    onError: (error, fatal) => notes.push(`${fatal ? 'fatal' : 'soft'}: ${error}`),
  });
  controller.configure('en', true);
  controller.start();

  // Feed the same audio the tap would deliver.
  const source = ctx.createMediaStreamSource(new MediaStream([track]));
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  source.connect(processor);
  processor.connect(ctx.destination);
  processor.onaudioprocess = (event) => controller.push(new Float32Array(event.inputBuffer.getChannelData(0)), ctx.sampleRate);

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline && segments.length < 2 && !notes.some((n) => n.startsWith('fatal'))) {
    await new Promise((r) => setTimeout(r, 1000));
  }
  processor.disconnect();
  controller.dispose();

  results.whisper = { seconds: Number(seconds.toFixed(1)), notes, segments };
}

/** Chrome transcribes, the voice model colours: two alternating speakers. */
async function speakerTest() {
  const ctx = new AudioContext();
  const { track, seconds } = await speechTrack(ctx, 1);
  const recent = new RollingAudio();
  const resampler = new Resampler16k();
  const sessionStart = performance.now();

  const source = ctx.createMediaStreamSource(new MediaStream([track]));
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  source.connect(processor);
  processor.connect(ctx.destination);
  processor.onaudioprocess = (event) => {
    const samples = resampler.push(new Float32Array(event.inputBuffer.getChannelData(0)), ctx.sampleRate);
    if (samples.length) recent.append(samples, (performance.now() - sessionStart) / 1000);
  };

  const lines: unknown[] = [];
  const controller = new TranscriptionController({
    onSegment: () => undefined,
    onProgress: () => undefined,
    onPreparing: () => undefined,
    onReady: () => undefined,
    onError: (error) => lines.push({ error }),
  });
  controller.configure('en', true);
  controller.prepareSpeakers();

  const engine = new ChromeEngine({
    onInterim: () => undefined,
    onFinal: (text, from, to) => {
      const audio = recent.slice(from, to);
      if (!audio) return void lines.push({ text: text.slice(0, 34), speaker: 'no audio' });
      void controller.identifyAudio(audio, audio.length / 16000).then((speaker) => {
        lines.push({ text: text.slice(0, 34), speaker, seconds: Number((to - from).toFixed(1)) });
      });
    },
    onUnavailable: (reason) => lines.push({ unavailable: reason }),
  });

  await engine.start(track, 'en-US', sessionStart);
  await new Promise((r) => setTimeout(r, (seconds + 10) * 1000));
  engine.stop();
  processor.disconnect();
  controller.dispose();
  results.speakers = lines;
}

// These slower manual checks are kept callable from DevTools without running
// automatically every time the harness opens.
void chromeTest;
void whisperTest;
void speakerTest;

/**
 * Regression test: loading the voice model must not report progress through the
 * speech model's channel. It once did, which showed a "downloading offline
 * model" bar that climbed to 99% and could never finish.
 */
async function progressChannelTest() {
  const events: string[] = [];
  const controller = new TranscriptionController({
    onSegment: () => undefined,
    onProgress: (progress) => events.push(`speech-progress:${Math.round(progress * 100)}`),
    onPreparing: () => events.push('speech-preparing'),
    onReady: () => events.push('speech-ready'),
    onError: (error) => events.push(`error:${error}`),
  });
  controller.configure('en', true);
  controller.prepareSpeakers();
  await new Promise((r) => setTimeout(r, 25_000));
  controller.dispose();
  results.progressChannel = { speechModelEvents: events, expected: 'none' };
  results.done = true;
}

async function main() {
  exportTest();
  await progressChannelTest();
}

void main();
