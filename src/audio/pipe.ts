/**
 * Capturing a tab silences it, so the audio has to be played back here. Nothing
 * is done to it on the way through — this is a listening post, not a processor.
 *
 *   tab audio ─┬─ speakers (untouched)
 *              └─ tap ─ mono blocks ─ transcription
 */
export interface PipeHandlers {
  onAudio(block: Float32Array, sampleRate: number): void;
  onEnded(reason: string): void;
}

export class AudioPipe {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private tap: AudioWorkletNode | null = null;

  constructor(private handlers: PipeHandlers) {}

  get running(): boolean {
    return this.ctx !== null;
  }

  /** The captured track, which Chrome's own recogniser can listen to directly. */
  get track(): MediaStreamTrack | null {
    return this.stream?.getAudioTracks()[0] ?? null;
  }

  async start(stream: MediaStream): Promise<void> {
    await this.stop();
    this.stream = stream;

    const ctx = new AudioContext({ latencyHint: 'playback' });
    this.ctx = ctx;
    await ctx.audioWorklet.addModule(chrome.runtime.getURL('tap-worklet.js'));
    if (ctx.state === 'suspended') await ctx.resume();

    const source = ctx.createMediaStreamSource(stream);
    source.connect(ctx.destination);

    // The tap only listens; a muted branch keeps it pulled by the graph.
    this.tap = new AudioWorkletNode(ctx, 'an-tap', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    const silent = ctx.createGain();
    silent.gain.value = 0;
    source.connect(this.tap).connect(silent).connect(ctx.destination);
    this.tap.port.onmessage = (event) => {
      const data = event.data as { type: string; block?: Float32Array; sampleRate?: number };
      if (data.type === 'audio' && data.block && data.sampleRate) {
        this.handlers.onAudio(data.block, data.sampleRate);
      }
    };

    for (const track of stream.getTracks()) {
      track.addEventListener('ended', () => this.handlers.onEnded('capture-ended'));
    }
    stream.addEventListener('inactive', () => this.handlers.onEnded('capture-ended'));
  }

  async stop(): Promise<void> {
    if (this.tap) this.tap.port.onmessage = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    if (this.ctx) await this.ctx.close().catch(() => undefined);
    this.ctx = null;
    this.stream = null;
    this.tap = null;
  }

  setTapEnabled(enabled: boolean): void {
    this.tap?.port.postMessage({ type: 'capture', enabled });
  }
}
