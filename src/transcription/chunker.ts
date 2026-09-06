import { TRANSCRIPTION as T } from '../audio/config';
import { Resampler16k } from './resampler';

const FRAME = 512; // 32 ms at 16 kHz

/**
 * Turns the live tab audio into 16 kHz mono chunks that end on a pause, so the
 * model rarely has to cut a word in half. Nothing here leaves the device.
 */
export class AudioChunker {
  private buffer = new Float32Array(T.targetSampleRate * (T.maxChunkSeconds + 2));
  private length = 0;
  private resampler = new Resampler16k();
  private trailingSilence = 0;
  private elapsed = 0;
  private chunkStart = 0;
  private frameFill = 0;
  private frameSum = 0;

  constructor(private onChunk: (audio: Float32Array, startTime: number) => void) {}

  reset(): void {
    this.length = 0;
    this.resampler.reset();
    this.trailingSilence = 0;
    this.elapsed = 0;
    this.chunkStart = 0;
    this.frameFill = 0;
    this.frameSum = 0;
  }

  push(block: Float32Array, sampleRate: number): void {
    const resampled = this.resampler.push(block, sampleRate);
    for (let i = 0; i < resampled.length; i++) {
      if (this.length < this.buffer.length) this.buffer[this.length++] = resampled[i];
      this.frameSum += resampled[i] * resampled[i];
      if (++this.frameFill === FRAME) {
        const db = 20 * Math.log10(Math.sqrt(this.frameSum / FRAME) + 1e-9);
        this.trailingSilence = db < T.silenceDb ? this.trailingSilence + FRAME / T.targetSampleRate : 0;
        this.frameFill = 0;
        this.frameSum = 0;
      }
    }
    this.elapsed += resampled.length / T.targetSampleRate;
    this.maybeFlush();
  }

  /** Send whatever is buffered, e.g. when the user stops transcription. */
  flush(): void {
    if (this.length / T.targetSampleRate >= 1) this.emit();
    else this.discard();
  }

  private maybeFlush(): void {
    const seconds = this.length / T.targetSampleRate;
    if (seconds >= T.maxChunkSeconds) return this.emit();
    if (seconds >= T.preferredChunkSeconds && this.trailingSilence >= T.silenceSeconds) return this.emit();
    if (seconds >= T.minChunkSeconds && this.trailingSilence >= T.silenceSeconds * 2) return this.emit();
  }

  private emit(): void {
    const audio = this.buffer.slice(0, this.length);
    const start = this.chunkStart;
    this.discard();
    if (this.loudEnough(audio)) this.onChunk(audio, start);
  }

  private discard(): void {
    this.chunkStart = this.elapsed;
    this.length = 0;
    this.trailingSilence = 0;
  }

  private loudEnough(audio: Float32Array): boolean {
    let sum = 0;
    for (let i = 0; i < audio.length; i++) sum += audio[i] * audio[i];
    const db = 20 * Math.log10(Math.sqrt(sum / audio.length) + 1e-9);
    return db > T.dropBelowDb;
  }

}
