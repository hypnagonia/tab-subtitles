import assert from 'node:assert/strict';
import test from 'node:test';
import { SpeakerCluster, type SpeakerClusteringOptions } from '../src/transcription/speaker-cluster.ts';

const options: SpeakerClusteringOptions = {
  sameVoiceThreshold: 0.8,
  differentVoiceThreshold: 0.4,
  newVoiceConfirmations: 3,
  minSeconds: 1,
  maxSpeakers: 6,
};

const vector = (...values: number[]) => new Float32Array(values);

test('recognizes two alternating voices without creating more speakers', () => {
  const cluster = new SpeakerCluster(options);
  assert.deepEqual(
    [
      cluster.identify(vector(1, 0, 0), 2),
      cluster.identify(vector(0, 1, 0), 2),
      cluster.identify(vector(0.99, 0.04, 0), 2),
      cluster.identify(vector(0.03, 0.99, 0), 2),
    ],
    [0, 1, 0, 1],
  );
});

test('does not turn one noisy outlier into a permanent speaker', () => {
  const cluster = new SpeakerCluster(options);
  cluster.identify(vector(1, 0, 0), 2);
  cluster.identify(vector(0, 1, 0), 2);

  assert.equal(cluster.identify(vector(0, 0, 1), 2), 0);
  assert.equal(cluster.identify(vector(0.98, 0.02, 0), 2), 0);
  assert.equal(cluster.identify(vector(0, 0, 1), 2), 0);
});

test('requires repeated evidence before admitting a third speaker', () => {
  const cluster = new SpeakerCluster(options);
  cluster.identify(vector(1, 0, 0), 2);
  cluster.identify(vector(0, 1, 0), 2);

  assert.equal(cluster.identify(vector(0, 0, 1), 2), 0);
  assert.equal(cluster.identify(vector(0, 0.02, 0.99), 2), 1);
  assert.equal(cluster.identify(vector(0.01, 0, 1), 2), 2);
  assert.equal(cluster.identify(vector(0, 0, 1), 2), 2);
});

test('keeps short clips with the most recently identified speaker', () => {
  const cluster = new SpeakerCluster(options);
  assert.equal(cluster.identify(vector(1, 0), 2), 0);
  assert.equal(cluster.identify(vector(0, 1), 2), 1);
  assert.equal(cluster.identify(vector(1, 0), 0.5), 1);
  cluster.reset();
  assert.equal(cluster.identify(vector(1, 0), 0.5), null);
});
