import { SPEAKERS, TRANSCRIPTION } from '../audio/config';
import type { Segment } from '../shared/types';
import { AudioChunker } from './chunker';
import { SpeakerCluster } from './speaker-cluster';

export interface TranscriptionHandlers {
  onSegment(segment: Segment): void;
  onProgress(progress: number): void;
  onPreparing(): void;
  onReady(): void;
  onError(code: string, fatal: boolean): void;
}

/** Longest backlog of audio chunks kept while the model is busy. */
const MAX_QUEUE = 3;
/** If the download stops moving for this long, it is stuck, not slow. */
const STALL_MS = 90_000;

export class TranscriptionController {
  private worker: Worker | null = null;
  private chunker: AudioChunker;
  private queue: { id: number; audio: Float32Array; start: number; seconds: number }[] = [];
  private inflight = new Map<number, { start: number; seconds: number }>();
  private embeds = new Map<number, (embedding: Float32Array | null) => void>();
  private busy = false;
  private nextId = 1;
  private language = 'en';
  private speakers = false;

  private speakerCluster = new SpeakerCluster(SPEAKERS);
  /** Chrome can return several voice prints out of order. Classification is
   *  chained in request order so `lastSpeaker` still means the previous line. */
  private identificationTail: Promise<void> = Promise.resolve();
  private voiceGeneration = 0;

  running = false;
  segments: Segment[] = [];

  private modelReady = false;
  private lastProgress = 0;
  private stallTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private handlers: TranscriptionHandlers) {
    this.chunker = new AudioChunker((audio, start) => this.enqueue(audio, start));
  }

  configure(language: string, speakers: boolean): void {
    this.language = language;
    if (this.speakers !== speakers) this.resetVoices();
    this.speakers = speakers;
  }

  /** Loads only the 7 MB voice model, without waiting for Whisper. */
  prepareSpeakers(): void {
    if (this.speakers) this.ensureWorker().postMessage({ type: 'load-speaker' });
  }

  /**
   * Voice print for audio the other engine transcribed. Returns the speaker
   * index, sharing the same voices as the offline path so the colours agree.
   */
  async identifyAudio(audio: Float32Array, seconds: number): Promise<number | null> {
    if (!this.speakers) return null;
    const id = this.nextId++;
    const generation = this.voiceGeneration;
    let speaker: number | null = null;
    const classification = this.identificationTail.then(async () => {
      if (generation !== this.voiceGeneration) return;
      const worker = this.ensureWorker();
      const embedding = await new Promise<Float32Array | null>((resolve) => {
        this.embeds.set(id, resolve);
        worker.postMessage({ type: 'embed', id, audio }, [audio.buffer]);
        // Never leave a subtitle uncoloured forever if the model never answers.
        setTimeout(() => {
          if (this.embeds.delete(id)) resolve(null);
        }, 15_000);
      });
      if (generation === this.voiceGeneration) speaker = this.speakerCluster.identify(embedding, seconds);
    });
    this.identificationTail = classification.catch(() => undefined);
    await classification;
    return speaker;
  }

  async download(): Promise<void> {
    this.watchLoad();
    this.ensureWorker().postMessage({ type: 'load', speakers: this.speakers });
  }

  /**
   * A download that is merely slow keeps reporting progress. One that has
   * stopped reporting has stalled, and saying so beats a bar that never fills.
   */
  private watchLoad(): void {
    if (this.modelReady || this.stallTimer) return;
    this.lastProgress = Date.now();
    this.stallTimer = setInterval(() => {
      if (this.modelReady) return this.clearWatch();
      if (Date.now() - this.lastProgress < STALL_MS) return;
      this.clearWatch();
      this.handlers.onError('modelStalled', true);
    }, 15_000);
  }

  private clearWatch(): void {
    if (this.stallTimer) clearInterval(this.stallTimer);
    this.stallTimer = null;
  }

  start(): void {
    this.watchLoad();
    this.ensureWorker().postMessage({ type: 'load', speakers: this.speakers });
    this.chunker.reset();
    this.queue = [];
    this.inflight.clear();
    this.resetVoices();
    this.running = true;
  }

  stop(): void {
    this.running = false;
    this.queue = [];
    this.inflight.clear();
    this.chunker.reset();
    this.resetVoices();
  }

  clear(): void {
    this.segments = [];
  }

  /** Text produced by Chrome's recogniser, kept in the same transcript. */
  addExternal(segment: Segment): void {
    this.segments.push(segment);
  }

  dispose(): void {
    this.stop();
    this.clearWatch();
    this.worker?.terminate();
    this.worker = null;
    this.busy = false;
  }

  push(block: Float32Array, sampleRate: number): void {
    if (this.running) this.chunker.push(block, sampleRate);
  }

  private resetVoices(): void {
    for (const resolve of this.embeds.values()) resolve(null);
    this.embeds.clear();
    this.speakerCluster.reset();
    this.voiceGeneration++;
    this.identificationTail = Promise.resolve();
  }

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (event) => this.onWorkerMessage(event.data);
      this.worker.onerror = () => this.handlers.onError('modelFailed', true);
    }
    return this.worker;
  }

  private enqueue(audio: Float32Array, start: number): void {
    const id = this.nextId++;
    this.queue.push({ id, audio, start, seconds: audio.length / TRANSCRIPTION.targetSampleRate });
    // Never let the backlog grow: dropping the oldest chunk keeps the subtitles
    // close to real time instead of falling further behind.
    while (this.queue.length > MAX_QUEUE) this.queue.shift();
    this.pump();
  }

  private pump(): void {
    if (this.busy || !this.queue.length || !this.worker) return;
    const next = this.queue.shift()!;
    this.busy = true;
    this.inflight.set(next.id, { start: next.start, seconds: next.seconds });
    this.worker.postMessage(
      { type: 'transcribe', id: next.id, audio: next.audio, language: this.language, speakers: this.speakers },
      [next.audio.buffer],
    );
  }

  private onWorkerMessage(message: any): void {
    switch (message.type) {
      case 'embedding': {
        const resolve = this.embeds.get(message.id);
        this.embeds.delete(message.id);
        resolve?.(message.embedding ?? null);
        break;
      }
      case 'speaker-progress':
      case 'speaker-ready':
        // The voice model is small and loads alongside; it has no bearing on
        // the speech model's state.
        break;
      case 'progress':
        this.lastProgress = Date.now();
        this.handlers.onProgress(message.progress);
        break;
      case 'preparing':
        this.lastProgress = Date.now();
        this.handlers.onPreparing();
        break;
      case 'ready':
        this.modelReady = true;
        this.clearWatch();
        this.handlers.onReady();
        break;
      case 'result': {
        this.busy = false;
        const timing = this.inflight.get(message.id);
        this.inflight.delete(message.id);
        // A worker inference cannot be cancelled. If capture stopped (or a new
        // session replaced it) while it was running, discard the stale line
        // instead of mixing it into the current subtitles at 00:00.
        if (!timing) {
          this.pump();
          break;
        }
        const text = cleanText(message.text);
        if (text) {
          const segment: Segment = {
            id: `s${message.id}`,
            time: timing.start,
            end: timing.start + timing.seconds,
            text,
            speaker: this.speakers ? this.speakerCluster.identify(message.embedding ?? null, timing.seconds) : null,
          };
          this.segments.push(segment);
          this.handlers.onSegment(segment);
        }
        this.pump();
        break;
      }
      case 'error':
        this.busy = false;
        if (message.fatal) this.clearWatch();
        this.handlers.onError(message.error, message.fatal === true);
        if (!message.fatal) this.pump();
        break;
    }
  }
}

/** Whisper emits bracketed noise tags and lone punctuation on silence. */
function cleanText(raw: string): string {
  const text = String(raw ?? '')
    .replace(/\[[^\]]*\]|\([^)]*\)|\*[^*]*\*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return /[\p{L}\p{N}]/u.test(text) ? text : '';
}
