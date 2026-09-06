import { TRANSCRIPTION } from '../audio/config';

const RATE = TRANSCRIPTION.targetSampleRate;
const KEEP_SECONDS = 45;

/**
 * The last three quarters of a minute of tab audio at 16 kHz, addressable by
 * time. Chrome's recogniser hands back a line and the seconds it covers but not
 * the audio itself, so this is where the voice print for that line comes from.
 */
export class RollingAudio {
  private data = new Float32Array(RATE * KEEP_SECONDS);
  private length = 0;
  /** Absolute index, in samples, of data[0] since the session began. */
  private offset = 0;
  private origin: number | null = null;

  reset(): void {
    this.length = 0;
    this.offset = 0;
    this.origin = null;
  }

  /** `endTime` is when the last sample of this block was heard, in session seconds. */
  append(samples: Float32Array, endTime: number): void {
    if (!samples.length) return;
    this.origin ??= Math.max(0, endTime - samples.length / RATE);

    if (this.length + samples.length > this.data.length) {
      // Drop the oldest audio, keeping the buffer contiguous.
      const keep = Math.max(0, this.data.length - samples.length);
      const from = this.length - keep;
      this.data.copyWithin(0, from, this.length);
      this.offset += from;
      this.length = keep;
    }

    this.data.set(samples, this.length);
    this.length += samples.length;
  }

  /** Audio between two session times, or null if it has already scrolled away. */
  slice(from: number, to: number): Float32Array | null {
    if (this.origin === null) return null;
    const start = Math.round((from - this.origin) * RATE) - this.offset;
    const end = Math.round((to - this.origin) * RATE) - this.offset;
    const a = Math.max(0, Math.min(this.length, start));
    const b = Math.max(0, Math.min(this.length, end));
    if (b - a < RATE * 0.5) return null;
    return this.data.slice(a, b);
  }
}
