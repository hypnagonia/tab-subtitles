/** Development preview: renders the side panel against scripted states. */
import type { AppState, Segment } from '../shared/types';

const listeners: ((event: any) => void)[] = [];

const base: AppState = {
  capture: { status: 'idle', tab: null, error: null },
  activeTab: { id: 1, title: 'The Interview', host: 'media.example', audible: true },
  activeTabInvoked: true,
  settings: {
    mode: 'quick',
    uiLanguage: 'auto',
    language: 'en',
    translateTo: 'none',
    font: 'sans',
    fontSize: 17,
    color: 'white',
    timestamps: true,
    speakers: true,
    overlay: false,
  },
  transcription: { status: 'off', active: null, model: 'ready', progress: 1, error: null },
};

const segments: Segment[] = [
  { id: 's1', time: 12, end: 15.4, text: "Today we're going to discuss the new architecture.", speaker: 0 },
  { id: 's2', time: 15.6, end: 19.2, text: 'And what made you rewrite the transport layer in the first place?', speaker: 1 },
  { id: 's3', time: 19.4, end: 24.1, text: 'Every change touched three services at once. That was the whole problem.', speaker: 0 },
  { id: 's4', time: 24.3, end: 27, text: 'Так что мы сначала посмотрели на список задач.', speaker: 1 },
];

let current: AppState = base;
let currentSegments: Segment[] = [];

(globalThis as any).chrome = {
  runtime: {
    connect: () => ({
      onMessage: { addListener: (cb: any) => listeners.push(cb) },
      postMessage: () => undefined,
      disconnect: () => undefined,
    }),
    sendMessage: async (message: any) => {
      if (message.type === 'state:get') return { ok: true, state: current };
      if (message.type === 'transcript:get') return { ok: true, segments: currentSegments };
      return { ok: true };
    },
  },
  permissions: { request: async () => true },
};

const SCENES: Record<string, () => void> = {
  first: () => {
    current = { ...base, transcription: { ...base.transcription, model: 'absent' } };
    currentSegments = [];
  },
  downloading: () => {
    current = { ...base, transcription: { ...base.transcription, model: 'downloading', progress: 0.42 } };
    currentSegments = [];
  },
  ready: () => {
    current = base;
    currentSegments = [];
  },
  live: () => {
    current = {
      ...base,
      capture: { status: 'active', tab: base.activeTab, error: null },
      // The private mode, which is what "listening · on device" means.
      settings: { ...base.settings, mode: 'private', speakers: true, overlay: true },
      transcription: { ...base.transcription, status: 'running', active: 'whisper' },
    };
    currentSegments = segments;
  },
  settings: () => {
    current = {
      ...base,
      capture: { status: 'active', tab: base.activeTab, error: null },
      transcription: { ...base.transcription, status: 'running', active: 'whisper' },
    };
    currentSegments = segments;
  },
  bridging: () => {
    current = {
      ...base,
      capture: { status: 'active', tab: base.activeTab, error: null },
      transcription: { ...base.transcription, status: 'running', active: 'chrome', model: 'downloading', progress: 0.36 },
    };
    currentSegments = segments.slice(0, 2);
  },
  large: () => {
    current = {
      ...base,
      capture: { status: 'active', tab: base.activeTab, error: null },
      settings: { ...base.settings, fontSize: 22, color: 'yellow', font: 'grotesk', timestamps: false },
      transcription: { ...base.transcription, status: 'running', active: 'chrome-local' },
    };
    currentSegments = segments;
  },
  translated: () => {
    current = {
      ...base,
      capture: { status: 'active', tab: base.activeTab, error: null },
      settings: { ...base.settings, mode: 'translate', language: 'en', translateTo: 'ru' },
      transcription: { ...base.transcription, status: 'running', active: 'chrome' },
    };
    // Every line is spoken in the source language here, so the screenshot
    // reads as one conversation being translated in one direction.
    currentSegments = segments.map((segment, index) => ({
      ...segment,
      text: index === 3 ? 'So we started by looking at the list of tasks.' : segment.text,
      translation: [
        'Сегодня мы обсудим новую архитектуру.',
        'А что заставило вас переписать транспортный слой?',
        'Каждое изменение задевало три сервиса сразу. В этом и была проблема.',
        'Так что мы сначала посмотрели на список задач.',
      ][index],
    }));
  },

  russian: () => {
    current = {
      ...base,
      capture: { status: 'active', tab: base.activeTab, error: null },
      settings: { ...base.settings, uiLanguage: 'ru' },
      transcription: { ...base.transcription, status: 'running', active: 'chrome' },
    };
    currentSegments = segments;
  },
  error: () => {
    current = {
      ...base,
      capture: {
        status: 'error',
        tab: base.activeTab,
        error: 'notInvoked',
      },
    };
    currentSegments = [];
  },
};

async function main() {
  const [{ createElement }, { createRoot }, { App }] = await Promise.all([
    import('react'),
    import('react-dom/client'),
    import('../sidepanel/App'),
  ]);
  await import('../sidepanel/styles.css');

  const root = createRoot(document.getElementById('root')!);

  (globalThis as any).__scene = (name: string) => {
    SCENES[name]();
    root.render(createElement(App));
    setTimeout(() => {
      for (const listener of listeners) {
        listener({ type: 'transcript:reset' });
        listener({ type: 'state', state: current });
        for (const segment of currentSegments) listener({ type: 'transcript:segment', segment });
        if (current.capture.status === 'active') listener({ type: 'transcript:interim', text: 'and that is roughly where' });
      }
    }, 60);
  };

  (globalThis as any).__scene('live');
}

void main();
