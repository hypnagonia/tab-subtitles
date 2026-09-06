import { TRANSCRIPTION } from '../audio/config';

/**
 * Box-average decimation to 16 kHz: cheap, and it low-passes enough to avoid
 * aliasing. State is carried between blocks so the stream stays continuous.
 */
export class Resampler16k {
  private residual = new Float32Array(0);
  private position = 0;

  reset(): void {
    this.residual = new Float32Array(0);
    this.position = 0;
  }

  push(block: Float32Array, sampleRate: number): Float32Array {
    if (sampleRate === TRANSCRIPTION.targetSampleRate) return block;

    const source = new Float32Array(this.residual.length + block.length);
    source.set(this.residual, 0);
    source.set(block, this.residual.length);

    const ratio = sampleRate / TRANSCRIPTION.targetSampleRate;
    const out = new Float32Array(Math.ceil(source.length / ratio) + 1);
    let count = 0;
    let pos = this.position;

    while (pos + ratio <= source.length) {
      const from = Math.floor(pos);
      const to = Math.max(from + 1, Math.floor(pos + ratio));
      let sum = 0;
      for (let i = from; i < to; i++) sum += source[i];
      out[count++] = sum / (to - from);
      pos += ratio;
    }

    const consumed = Math.floor(pos);
    this.residual = source.slice(consumed);
    this.position = pos - consumed;
    return out.subarray(0, count);
  }
}
