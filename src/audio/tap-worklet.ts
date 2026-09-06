/**
 * Listens to the captured tab and hands mono blocks to the main thread while
 * subtitles are running. It does nothing at all when they are not.
 */
declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: unknown);
  process(inputs: Float32Array[][], outputs: Float32Array[][], params: Record<string, Float32Array>): boolean;
}
declare function registerProcessor(name: string, ctor: typeof AudioWorkletProcessor): void;

const BLOCK_FRAMES = 3072; // ~64 ms at 48 kHz

class TapProcessor extends AudioWorkletProcessor {
  private capture = false;
  private buffer = new Float32Array(BLOCK_FRAMES);
  private filled = 0;

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent) => {
      if (event.data?.type === 'capture') {
        this.capture = event.data.enabled === true;
        this.filled = 0;
      }
    };
  }

  process(inputs: Float32Array[][]): boolean {
    if (!this.capture) return true;

    const channels = inputs[0];
    const frames = channels?.[0]?.length ?? 0;

    for (let i = 0; i < frames; i++) {
      let sample = 0;
      if (channels && channels.length) {
        for (let c = 0; c < channels.length; c++) sample += channels[c][i];
        sample /= channels.length;
      }
      this.buffer[this.filled++] = sample;

      if (this.filled === BLOCK_FRAMES) {
        this.filled = 0;
        const block = this.buffer.slice();
        this.port.postMessage({ type: 'audio', block, sampleRate }, [block.buffer]);
      }
    }
    return true;
  }
}

registerProcessor('an-tap', TapProcessor);
export {};
