/** Speech-to-text. Multilingual Whisper, ~150 MB, fetched once. */
export const MODEL_ID = 'onnx-community/whisper-base';

/** Speaker embeddings for telling voices apart. Tiny next to Whisper. */
export const SPEAKER_MODEL_ID = 'onnx-community/wespeaker-voxceleb-resnet34-LM';

export const TRANSCRIPTION = {
  targetSampleRate: 16000,
  /** Chunks are kept short: subtitles should trail the audio by a couple of
   *  seconds, not by a paragraph. */
  minChunkSeconds: 1.2,
  /** Flush at a pause once the chunk is at least this long. */
  preferredChunkSeconds: 2.5,
  /** Hard flush, even mid-sentence. */
  maxChunkSeconds: 6,
  /** A gap this long counts as a sentence boundary. */
  silenceSeconds: 0.3,
  silenceDb: -50,
  /** Chunks quieter than this everywhere are dropped without inference. */
  dropBelowDb: -55,
} as const;

export const SPEAKERS = {
  /** Cosine similarity above which two chunks are the same voice. Same speaker
   *  usually lands near 0.7, different speakers near 0.3. */
  sameVoiceThreshold: 0.55,
  /** Scores in this middle band are inconclusive. Assign the nearest known
   *  voice, but do not let one uncertain chunk create another speaker. */
  differentVoiceThreshold: 0.35,
  /** Once a conversation already has two voices, require repeated evidence
   *  before adding another. This prevents music and short noisy lines from
   *  turning into speakers 3, 4, 5, and 6. */
  newVoiceConfirmations: 3,
  /** Shorter than this and the embedding is too unreliable to cluster on, so
   *  the chunk keeps whoever spoke last. */
  minSeconds: 1,
  /** More than this and it is a crowd, not a conversation. */
  maxSpeakers: 6,
} as const;
