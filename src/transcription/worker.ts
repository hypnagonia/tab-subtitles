/// <reference lib="webworker" />
import { AutoModel, AutoProcessor, env, pipeline } from '@huggingface/transformers';
import { MODEL_ID, SPEAKER_MODEL_ID } from '../audio/config';

// MV3 pages may not pull scripts from a CDN, so onnxruntime's binaries are
// served from inside the extension (copied into dist/ort at build time).
env.allowLocalModels = false;
const wasmBackend = env.backends?.onnx?.wasm;
if (wasmBackend) {
  wasmBackend.wasmPaths = new URL('/ort/', self.location.origin).href;
  wasmBackend.numThreads = 1; // no cross-origin isolation, so no wasm threads
}

type Attempt = { device: 'webgpu' | 'wasm'; dtype: unknown };

const ATTEMPTS: Attempt[] = [
  { device: 'webgpu', dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' } },
  { device: 'wasm', dtype: { encoder_model: 'q8', decoder_model_merged: 'q8' } },
  { device: 'wasm', dtype: 'q8' },
];

let asr: any = null;
let speakerModel: any = null;
let speakerProcessor: any = null;
let device: 'webgpu' | 'wasm' | null = null;
let loading: Promise<void> | null = null;
let announced = false;

const files = new Map<string, { loaded: number; total: number }>();
const speakerFiles = new Map<string, { loaded: number; total: number }>();
let lastProgressPost = 0;
let lastProgressAt = Date.now();
let preparingPosted = false;

/** No progress for this long means the attempt is wedged, not slow. */
const STALL_MS = 45_000;

function post(message: unknown, transfer: Transferable[] = []): void {
  (self as unknown as Worker).postMessage(message, transfer);
}

function onProgress(event: { status: string; file?: string; loaded?: number; total?: number }): void {
  if (event.status === 'progress' && event.file && event.total) {
    files.set(event.file, { loaded: event.loaded ?? 0, total: event.total });
  } else if (event.status === 'done' && event.file) {
    const entry = files.get(event.file);
    if (entry) entry.loaded = entry.total;
  } else {
    return;
  }

  lastProgressAt = Date.now();

  let loaded = 0;
  let total = 0;
  for (const entry of files.values()) {
    loaded += entry.loaded;
    total += entry.total;
  }

  // Everything is downloaded but the session still has to be built, which for a
  // big encoder takes a while. Saying "downloading 99%" through all of that is
  // just wrong.
  if (total > 0 && loaded >= total && !preparingPosted) {
    preparingPosted = true;
    post({ type: 'preparing' });
    return;
  }

  const now = Date.now();
  if (now - lastProgressPost < 200) return;
  lastProgressPost = now;
  if (total > 0) post({ type: 'progress', progress: Math.min(0.99, loaded / total) });
}

/** Gives up on an attempt that has stopped making progress, so a wedged WebGPU
 *  session falls through to WASM instead of hanging forever. */
function withStallTimeout<T>(work: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setInterval(() => {
      if (settled) return clearInterval(timer);
      if (Date.now() - lastProgressAt < STALL_MS) return;
      clearInterval(timer);
      settled = true;
      reject(new Error('stalled'));
    }, 5_000);
    work.then(
      (value) => {
        settled = true;
        clearInterval(timer);
        resolve(value);
      },
      (error) => {
        settled = true;
        clearInterval(timer);
        reject(error);
      },
    );
  });
}

async function webgpuAvailable(): Promise<boolean> {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    if (!gpu) return false;
    return (await gpu.requestAdapter()) !== null;
  } catch {
    return false;
  }
}

function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/out of memory|allocation failed|OOM/i.test(message)) return 'modelMemory';
  if (/stalled/i.test(message)) return 'modelStalled';
  if (/network|fetch|Failed to load|ERR_|Unexpected token/i.test(message)) return 'modelNetwork';
  if (/404|not found/i.test(message)) return 'modelMissing';
  return 'modelFailed';
}

/** wespeaker's output key has changed between releases; take whatever float
 *  tensor comes back. */
function firstTensor(output: unknown): Float32Array | null {
  for (const value of Object.values((output ?? {}) as Record<string, unknown>)) {
    const data = (value as { data?: unknown })?.data;
    if (data instanceof Float32Array) return Float32Array.from(data);
  }
  return null;
}

let loadingSpeaker: Promise<void> | null = null;

async function loadSpeakerModel(): Promise<void> {
  if (speakerModel) return;
  if (loadingSpeaker) return loadingSpeaker;
  loadingSpeaker = loadSpeakerModelOnce().finally(() => {
    loadingSpeaker = null;
  });
  return loadingSpeaker;
}

/**
 * The voice model has its own progress, which must not be reported through the
 * speech model's channel — doing so showed a "downloading offline model" bar
 * that could never finish, because the speech model was not loading at all.
 */
function onSpeakerProgress(event: { status: string; loaded?: number; total?: number; file?: string }): void {
  if (event.status === 'progress' && event.file && event.total) {
    speakerFiles.set(event.file, { loaded: event.loaded ?? 0, total: event.total });
  } else if (event.status !== 'done') {
    return;
  }
  let loaded = 0;
  let total = 0;
  for (const entry of speakerFiles.values()) {
    loaded += entry.loaded;
    total += entry.total;
  }
  if (total > 0) post({ type: 'speaker-progress', progress: Math.min(1, loaded / total) });
}

async function loadSpeakerModelOnce(): Promise<void> {
  if (speakerModel) return;
  const preferred = device ?? ((await webgpuAvailable()) ? 'webgpu' : 'wasm');
  for (const attempt of preferred === 'webgpu' ? (['webgpu', 'wasm'] as const) : (['wasm'] as const)) {
    try {
      speakerProcessor = await AutoProcessor.from_pretrained(SPEAKER_MODEL_ID, {
        progress_callback: onSpeakerProgress,
      } as any);
      speakerModel = await AutoModel.from_pretrained(SPEAKER_MODEL_ID, {
        device: attempt,
        dtype: attempt === 'webgpu' ? 'fp32' : 'q8',
        progress_callback: onSpeakerProgress,
      } as any);
      return;
    } catch {
      speakerModel = null;
      speakerProcessor = null;
    }
  }
  // Separating voices is a nicety; subtitles still work without it.
}

async function load(speakers: boolean): Promise<void> {
  if (loading) await loading;
  if (!asr) {
    loading = (async () => {
      const skipWebgpu = !(await webgpuAvailable());
      const attempts = ATTEMPTS.filter((attempt) => !(attempt.device === 'webgpu' && skipWebgpu));
      let lastError: unknown = null;

      for (const attempt of attempts) {
        try {
          files.clear();
          lastProgressAt = Date.now();
          preparingPosted = false;
          asr = await withStallTimeout(
            pipeline('automatic-speech-recognition', MODEL_ID, {
              device: attempt.device,
              dtype: attempt.dtype,
              progress_callback: onProgress,
            } as any),
          );
          device = attempt.device;
          return;
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError ?? new Error('unknown');
    })();

    try {
      await loading;
    } finally {
      loading = null;
    }
  }

  if (speakers) await loadSpeakerModel();
  if (!announced) {
    announced = true;
    post({ type: 'progress', progress: 1 });
    post({ type: 'ready' });
  }
}

async function embedOnly(id: number, audio: Float32Array): Promise<void> {
  await loadSpeakerModel();
  let embedding: Float32Array | null = null;
  if (speakerModel && speakerProcessor) {
    try {
      const inputs = await speakerProcessor(audio);
      embedding = firstTensor(await speakerModel(inputs));
    } catch {
      embedding = null;
    }
  }
  post({ type: 'embedding', id, embedding }, embedding ? [embedding.buffer] : []);
}

async function transcribe(id: number, audio: Float32Array, language: string | null, speakers: boolean): Promise<void> {
  await load(speakers);

  const options: Record<string, unknown> = { task: 'transcribe', return_timestamps: false, max_new_tokens: 160 };
  if (language) options.language = language;

  const output = await asr(audio, options);
  const text = (Array.isArray(output) ? output[0]?.text : output?.text) ?? '';

  let embedding: Float32Array | null = null;
  if (speakers && speakerModel && speakerProcessor) {
    try {
      const inputs = await speakerProcessor(audio);
      embedding = firstTensor(await speakerModel(inputs));
    } catch {
      embedding = null; // one failed embedding is not worth stopping subtitles
    }
  }

  post(
    { type: 'result', id, text: String(text).trim(), embedding },
    embedding ? [embedding.buffer] : [],
  );
}

self.onmessage = async (event: MessageEvent) => {
  const message = event.data;
  try {
    if (message.type === 'load') {
      await load(message.speakers === true);
    } else if (message.type === 'load-speaker') {
      await loadSpeakerModel();
      post({ type: 'speaker-ready', ok: speakerModel !== null });
    } else if (message.type === 'embed') {
      await embedOnly(message.id, message.audio);
    } else if (message.type === 'transcribe') {
      await transcribe(message.id, message.audio, message.language, message.speakers === true);
    }
  } catch (error) {
    if (message.type === 'embed') post({ type: 'embedding', id: message.id, embedding: null });
    else post({ type: 'error', id: message.id, error: describeError(error), fatal: message.type === 'load' });
  }
};

export {};
