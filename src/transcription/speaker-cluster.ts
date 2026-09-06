export interface SpeakerClusteringOptions {
  readonly sameVoiceThreshold: number;
  readonly differentVoiceThreshold: number;
  readonly newVoiceConfirmations: number;
  readonly minSeconds: number;
  readonly maxSpeakers: number;
}

/** Stateful online clustering for normalized speaker embeddings. Kept free of
 * browser APIs so its noisy-edge behavior can be covered by unit tests. */
export class SpeakerCluster {
  private voices: { centroid: Float32Array; count: number }[] = [];
  private candidate: { centroid: Float32Array; count: number } | null = null;
  private lastSpeaker: number | null = null;
  private options: SpeakerClusteringOptions;

  constructor(options: SpeakerClusteringOptions) {
    this.options = options;
  }

  reset(): void {
    this.voices = [];
    this.candidate = null;
    this.lastSpeaker = null;
  }

  identify(embedding: Float32Array | null, seconds: number): number | null {
    if (!embedding || seconds < this.options.minSeconds) return this.lastSpeaker;

    const vector = normalize(embedding);
    let best = -1;
    let bestScore = -Infinity;

    this.voices.forEach((voice, index) => {
      const score = dot(voice.centroid, vector);
      if (score > bestScore) {
        bestScore = score;
        best = index;
      }
    });

    if (best >= 0 && bestScore >= this.options.sameVoiceThreshold) {
      const voice = this.voices[best];
      for (let i = 0; i < voice.centroid.length; i++) {
        voice.centroid[i] = (voice.centroid[i] * voice.count + vector[i]) / (voice.count + 1);
      }
      voice.centroid = normalize(voice.centroid);
      voice.count++;
      this.candidate = null;
      this.lastSpeaker = best;
      return best;
    }

    // Establish the baseline and a clearly different second voice promptly.
    // Later voices require confirmation because background sound and short
    // utterances produce occasional outlier embeddings.
    if (this.voices.length === 0 || (this.voices.length === 1 && bestScore < this.options.differentVoiceThreshold)) {
      this.voices.push({ centroid: vector, count: 1 });
      this.candidate = null;
      this.lastSpeaker = this.voices.length - 1;
      return this.lastSpeaker;
    }

    // An inconclusive sample keeps the nearest known identity without
    // contaminating its centroid or inventing a permanent speaker number.
    if (bestScore >= this.options.differentVoiceThreshold) {
      this.candidate = null;
      this.lastSpeaker = best;
      return best;
    }

    if (this.voices.length >= this.options.maxSpeakers) {
      this.lastSpeaker = best;
      return best;
    }

    const candidateScore = this.candidate ? dot(this.candidate.centroid, vector) : -Infinity;
    if (!this.candidate || candidateScore < this.options.sameVoiceThreshold) {
      this.candidate = { centroid: vector, count: 1 };
      this.lastSpeaker = best;
      return best;
    }

    for (let i = 0; i < this.candidate.centroid.length; i++) {
      this.candidate.centroid[i] =
        (this.candidate.centroid[i] * this.candidate.count + vector[i]) / (this.candidate.count + 1);
    }
    this.candidate.centroid = normalize(this.candidate.centroid);
    this.candidate.count++;
    if (this.candidate.count < this.options.newVoiceConfirmations) {
      this.lastSpeaker = best;
      return best;
    }

    this.voices.push(this.candidate);
    this.candidate = null;
    this.lastSpeaker = this.voices.length - 1;
    return this.lastSpeaker;
  }
}

function normalize(vector: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < vector.length; i++) sum += vector[i] * vector[i];
  const length = Math.sqrt(sum) || 1;
  const out = new Float32Array(vector.length);
  for (let i = 0; i < vector.length; i++) out[i] = vector[i] / length;
  return out;
}

function dot(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) sum += a[i] * b[i];
  return sum;
}
