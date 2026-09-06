import {
  PANEL_COMMANDS,
  PANEL_PORT,
  toOffscreen,
  type OffscreenCommand,
  type OffscreenEvent,
  type PanelCommand,
  type PanelEvent,
} from '../shared/messages';
import { isModelReady, loadSettings, saveSettings, setModelReady } from '../shared/storage';
import {
  DEFAULT_SETTINGS,
  DEFAULT_TRANSCRIPTION,
  FONTS,
  LANGUAGE_CODES,
  speakerColor,
  tagFor,
  type AppState,
  type ErrorCode,
  type Segment,
  type Settings,
  type TabInfo,
} from '../shared/types';

const OFFSCREEN_PATH = 'offscreen.html';
const SESSION_TAB_KEY = 'captureTabId';
const SESSION_INVOKED_KEY = 'invokedTabs';

const state: AppState = {
  capture: { status: 'idle', tab: null, error: null },
  activeTab: null,
  activeTabInvoked: false,
  settings: DEFAULT_SETTINGS,
  transcription: { ...DEFAULT_TRANSCRIPTION },
};

let panel: chrome.runtime.Port | null = null;
let ready: Promise<void> | null = null;

/** Tabs the user has invoked the extension on, i.e. where Chrome granted
 *  activeTab. Tab capture is impossible without it, whatever else is granted.
 *  Kept in session storage because the service worker sleeps and forgets. */
const invokedTabs = new Set<number>();

async function rememberInvoked(tabId: number): Promise<void> {
  invokedTabs.add(tabId);
  await chrome.storage.session.set({ [SESSION_INVOKED_KEY]: [...invokedTabs] });
}

async function forgetInvoked(tabId: number): Promise<void> {
  if (!invokedTabs.delete(tabId)) return;
  await chrome.storage.session.set({ [SESSION_INVOKED_KEY]: [...invokedTabs] });
}

function hydrate(): Promise<void> {
  ready ??= (async () => {
    state.settings = await loadSettings();
    state.transcription.model = (await isModelReady()) ? 'ready' : 'absent';
    const stored = await chrome.storage.session.get(SESSION_INVOKED_KEY);
    for (const tabId of (stored[SESSION_INVOKED_KEY] as number[] | undefined) ?? []) invokedTabs.add(tabId);
    state.activeTab = await readActiveTab();
    state.activeTabInvoked = isInvoked(state.activeTab);
    refreshDetectedLanguage();
    await restoreCapture();
  })();
  return ready;
}

/* ------------------------------------------------------------ language --- */

let pageLanguage: string | null = null;

function normalizeLanguage(raw: string | undefined | null): string | null {
  const code = (raw ?? '').trim().toLowerCase().split(/[-_]/)[0];
  return code && LANGUAGE_CODES.has(code) ? code : null;
}

/** What the page says it is written in. activeTab covers this — the same grant
 *  that let us capture the tab in the first place. */
async function readPageLanguage(tabId: number): Promise<string | null> {
  try {
    const [injected] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () =>
        document.documentElement.lang ||
        document.querySelector<HTMLMetaElement>('meta[property="og:locale"]')?.content ||
        '',
    });
    return normalizeLanguage(injected?.result as string | undefined);
  } catch {
    return null;
  }
}

/**
 * What the user picked, then what the page says, then the browser's own
 * language, and only then the model's own guess.
 */
function resolveLanguage(): string | null {
  if (state.settings.language !== 'auto') return state.settings.language;
  return pageLanguage ?? normalizeLanguage(chrome.i18n.getUILanguage());
}

function refreshDetectedLanguage(): void {
  state.transcription = {
    ...state.transcription,
    detected: state.settings.language === 'auto' ? resolveLanguage() : null,
  };
}

/* ------------------------------------------------------------- overlay --- */

let overlayInjected = false;
let overlayRevision = 0;
let overlayCurrent: { id: string; text: string; speaker: number | null } | null = null;

function nextOverlayRevision(): number {
  overlayRevision = Math.max(overlayRevision + 1, Date.now());
  return overlayRevision;
}

/** Puts the subtitle script into the captured page, once. */
async function ensureOverlay(): Promise<boolean> {
  const tabId = state.capture.tab?.id;
  if (!tabId || !state.settings.overlay) return false;
  if (overlayInjected) return true;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['overlay.js'] });
    overlayInjected = true;
    return true;
  } catch {
    return false;
  }
}

function overlayStyle(speaker: number | null = null) {
  return {
    font: FONTS.find((option) => option.value === state.settings.font)?.stack ?? 'sans-serif',
    size: Math.round(state.settings.fontSize * 1.6),
    color: speakerColor(state.settings.speakers ? speaker : null, state.settings.color),
  };
}

async function showOnPage(text: string, speaker: number | null = null, id: string | null = null): Promise<void> {
  if (!state.settings.overlay || state.capture.status !== 'active') return;
  const revision = nextOverlayRevision();
  const tabId = state.capture.tab?.id;
  if (!tabId || !(await ensureOverlay())) return;
  if (revision === overlayRevision) overlayCurrent = id ? { id, text, speaker } : null;
  await chrome.tabs
    .sendMessage(tabId, { type: 'overlay:show', text, style: overlayStyle(speaker), revision })
    .catch(() => {
      // The page navigated away from under the script; put it back next time.
      if (revision === overlayRevision) overlayInjected = false;
    });
}

async function hideOnPage(): Promise<void> {
  const tabId = state.capture.tab?.id;
  if (!tabId || !overlayInjected) return;
  const revision = nextOverlayRevision();
  overlayCurrent = null;
  await chrome.tabs
    .sendMessage(tabId, { type: 'overlay:hide', revision })
    .catch(() => undefined);
}

/* ---------------------------------------------------------------- tabs --- */

function hostOf(url: string | undefined): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? parsed.hostname.replace(/^www\./, '')
      : parsed.protocol.replace(':', '');
  } catch {
    return '';
  }
}

function toTabInfo(tab: chrome.tabs.Tab | undefined): TabInfo | null {
  if (!tab?.id) return null;
  return {
    id: tab.id,
    title: tab.title ?? 'Untitled tab',
    host: hostOf(tab.url) || tab.title || 'this tab',
    audible: tab.audible === true,
  };
}

function isInvoked(tab: TabInfo | null): boolean {
  return !!tab && invokedTabs.has(tab.id);
}

async function readActiveTab(): Promise<TabInfo | null> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return toTabInfo(tab);
}

function capturable(tab: TabInfo | null): boolean {
  return !!tab && !['chrome', 'chrome-extension', 'edge', 'about', 'devtools'].includes(tab.host);
}

/* ------------------------------------------------------------ messaging --- */

function broadcast(event: PanelEvent): void {
  try {
    panel?.postMessage(event);
  } catch {
    panel = null;
  }
}

function pushState(): void {
  state.activeTabInvoked = isInvoked(state.activeTab);
  broadcast({ type: 'state', state });
}

let creatingOffscreen: Promise<void> | null = null;

/** Only one offscreen document may exist, and creating a second one throws, so
 *  concurrent callers share the same attempt. */
async function ensureOffscreen(): Promise<void> {
  const existing = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });
  if (existing.length) return;
  if (creatingOffscreen) return creatingOffscreen;

  creatingOffscreen = createOffscreen().finally(() => {
    creatingOffscreen = null;
  });
  return creatingOffscreen;
}

async function createOffscreen(): Promise<void> {
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: [
      chrome.offscreen.Reason.USER_MEDIA,
      chrome.offscreen.Reason.AUDIO_PLAYBACK,
      chrome.offscreen.Reason.WORKERS,
    ],
    justification: 'Plays back the captured tab audio and runs local speech-to-text on it.',
  });
}

async function tellOffscreen(command: OffscreenCommand): Promise<{ ok: boolean; [key: string]: unknown }> {
  try {
    return (await chrome.runtime.sendMessage(toOffscreen(command))) ?? { ok: false };
  } catch {
    return { ok: false };
  }
}

/**
 * The service worker sleeps whenever the panel is closed, but the offscreen
 * document keeps listening. On wake-up, ask it what is still running so the
 * panel doesn't come back showing "ready" over a live session.
 */
async function restoreCapture(): Promise<void> {
  const contexts = await chrome.runtime
    .getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] })
    .catch(() => []);
  if (!contexts.length) return;

  const status = await tellOffscreen({ type: 'status:get' });
  if (!status.ok || status.capturing !== true) return;

  const stored = await chrome.storage.session.get(SESSION_TAB_KEY);
  const tabId = stored[SESSION_TAB_KEY] as number | undefined;
  const tab = tabId ? toTabInfo(await chrome.tabs.get(tabId).catch(() => undefined)) : null;

  state.capture = { status: 'active', tab, error: null };
  if (status.transcribing === true) {
    state.transcription.status = 'running';
    state.transcription.active = (status.active as typeof state.transcription.active) ?? null;
  }
}

/* ------------------------------------------------------------- capture --- */

/** tabCapture.getMediaStreamId is callback-only, and its errors only surface
 *  through chrome.runtime.lastError. */
function mediaStreamId(tabId: number): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (streamId) => {
      const error = chrome.runtime.lastError;
      if (error || !streamId) reject(new Error(error?.message ?? 'Chrome returned no audio stream.'));
      else resolve(streamId);
    });
  });
}

function describeCaptureError(error: unknown): ErrorCode {
  const message = error instanceof Error ? error.message : String(error);
  if (/activeTab|not been invoked|permission/i.test(message)) return 'notInvoked';
  if (/already being captured|in use/i.test(message)) return 'inUse';
  if (/Cannot capture|chrome:\/\/|extension page/i.test(message)) return 'notCapturable';
  return 'captureFailed';
}

async function startSubtitles(tabId: number): Promise<void> {
  await hydrate();
  const tab = toTabInfo(await chrome.tabs.get(tabId).catch(() => undefined));

  if (!capturable(tab)) {
    state.capture = { status: 'error', tab: null, error: 'notCapturable' };
    return pushState();
  }

  state.capture = { status: 'starting', tab, error: null };
  pushState();

  try {
    await ensureOffscreen();
    const streamId = await mediaStreamId(tabId);
    pageLanguage = await readPageLanguage(tabId);
    refreshDetectedLanguage();

    const result = await tellOffscreen({
      type: 'audio:start',
      streamId,
      language: resolveLanguage(),
      tag: tagFor(resolveLanguage()),
      speakers: state.settings.speakers,
      engine: state.settings.engine,
    });
    if (!result.ok) throw new Error(String(result.error ?? 'the audio engine did not start'));

    state.capture = { status: 'active', tab, error: null };
    state.transcription = { ...state.transcription, status: 'running', error: null };
    await rememberInvoked(tabId);
    await chrome.storage.session.set({ [SESSION_TAB_KEY]: tabId });
  } catch (error) {
    state.capture = { status: 'error', tab, error: describeCaptureError(error) };
    await tellOffscreen({ type: 'audio:stop' });
  }
  pushState();
}

async function stopSubtitles(error: ErrorCode | null = null): Promise<void> {
  await hideOnPage();
  overlayInjected = false;
  pageLanguage = null;
  await tellOffscreen({ type: 'audio:stop' });
  await chrome.storage.session.remove(SESSION_TAB_KEY);
  state.capture = { status: error ? 'error' : 'idle', tab: error ? state.capture.tab : null, error };
  state.transcription = {
    ...state.transcription,
    status: 'off',
    active: null,
    model: state.transcription.model === 'downloading' ? 'absent' : state.transcription.model,
    progress: 0,
  };
  pushState();
  if (!error) await chrome.offscreen.closeDocument().catch(() => undefined);
}

/* -------------------------------------------------------------- events --- */

// Opening the panel from this handler, rather than through
// openPanelOnActionClick, is what makes the click count as an invocation — the
// one thing Chrome accepts as permission to capture a tab's audio.
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => undefined);

  void (async () => {
    if (tab.id) await rememberInvoked(tab.id);
    await hydrate();
    state.activeTab = toTabInfo(tab) ?? state.activeTab;
    pushState();
  })();
});

function setPanelBehavior(): void {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => undefined);
}

chrome.runtime.onInstalled.addListener(setPanelBehavior);
chrome.runtime.onStartup.addListener(setPanelBehavior);

chrome.tabs.onActivated.addListener(async () => {
  await hydrate();
  state.activeTab = await readActiveTab();
  pushState();
});

chrome.tabs.onUpdated.addListener(async (tabId, changes) => {
  if (changes.url) await forgetInvoked(tabId);
  if (!('audible' in changes) && !('title' in changes) && !('url' in changes) && !('status' in changes)) return;
  await hydrate();
  if (state.activeTab?.id === tabId) state.activeTab = toTabInfo(await chrome.tabs.get(tabId).catch(() => undefined));
  if (state.capture.tab?.id === tabId && state.capture.status === 'active') {
    state.capture.tab = toTabInfo(await chrome.tabs.get(tabId).catch(() => undefined)) ?? state.capture.tab;
  }
  pushState();
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await forgetInvoked(tabId);
  if (state.capture.tab?.id === tabId && state.capture.status !== 'idle') {
    await stopSubtitles('tabClosed');
  }
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PANEL_PORT) return;
  panel = port;

  void (async () => {
    await hydrate();
    state.activeTab = await readActiveTab();
    pushState();

    // Opening the panel is the whole instruction: start listening to the tab it
    // was opened from. Only that tab — Chrome refuses any other, and starting
    // on a tab the user did not invoke would just produce an error.
    if (state.capture.status === 'idle' && state.activeTab && isInvoked(state.activeTab) && capturable(state.activeTab)) {
      await startSubtitles(state.activeTab.id);
    }
  })();

  port.onDisconnect.addListener(() => {
    panel = null;
  });
});

chrome.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
  const message = raw as (PanelCommand | OffscreenEvent) & { target?: string };
  if (message?.target !== 'sw') return undefined;
  // Offscreen events are fire-and-forget; only panel commands get a reply.
  const expectsReply = PANEL_COMMANDS.has(message.type as PanelCommand['type']);

  void (async () => {
    await hydrate();
    switch (message.type) {
      /* --- from the side panel --- */
      case 'state:get':
        state.activeTab = await readActiveTab();
        state.activeTabInvoked = isInvoked(state.activeTab);
        sendResponse({ ok: true, state });
        return;

      case 'subtitles:start':
        await startSubtitles(message.tabId);
        sendResponse({ ok: true, state });
        return;

      case 'subtitles:stop':
        await stopSubtitles();
        sendResponse({ ok: true, state });
        return;

      case 'settings:set': {
        const next: Settings = { ...state.settings, ...message.patch };
        const overlayOff = state.settings.overlay && !next.overlay;
        state.settings = next;
        await saveSettings(next);
        if (overlayOff) await hideOnPage();
        else if (next.overlay && overlayCurrent) {
          await showOnPage(overlayCurrent.text, overlayCurrent.speaker, overlayCurrent.id);
        }
        refreshDetectedLanguage();
        await tellOffscreen({
          type: 'config',
          language: resolveLanguage(),
          tag: tagFor(resolveLanguage()),
          speakers: next.speakers,
        });
        pushState();
        sendResponse({ ok: true, state });
        return;
      }

      case 'model:download':
        state.transcription = { ...state.transcription, model: 'downloading', progress: 0, error: null };
        pushState();
        try {
          await ensureOffscreen();
          await tellOffscreen({ type: 'model:download', speakers: state.settings.speakers });
          sendResponse({ ok: true });
        } catch {
          state.transcription = { ...state.transcription, model: 'error', error: 'modelFailed' };
          pushState();
          sendResponse({ ok: false });
        }
        return;

      case 'transcript:get': {
        const result = await tellOffscreen({ type: 'transcript:get' });
        sendResponse({ ok: true, segments: (result.segments as Segment[]) ?? [] });
        return;
      }

      case 'transcript:clear':
        await tellOffscreen({ type: 'transcript:clear' });
        broadcast({ type: 'transcript:reset' });
        sendResponse({ ok: true });
        return;

      /* --- from the offscreen document --- */
      case 'audio:ended':
        await stopSubtitles('chromeStopped');
        return;

      case 'model:progress':
        state.transcription = { ...state.transcription, model: 'downloading', progress: message.progress };
        pushState();
        return;

      case 'model:ready':
        state.transcription = { ...state.transcription, model: 'ready', progress: 1, error: null };
        await setModelReady(true);
        pushState();
        return;

      case 'model:error':
        state.transcription = { ...state.transcription, model: 'error', error: message.error };
        await setModelReady(false);
        pushState();
        return;

      case 'transcription:status':
        state.transcription = {
          ...state.transcription,
          status: message.status,
          error: message.error ?? (message.status === 'error' ? state.transcription.error : null),
        };
        pushState();
        return;

      case 'transcript:segment':
        broadcast({ type: 'transcript:segment', segment: message.segment });
        await showOnPage(message.segment.text, message.segment.speaker, message.segment.id);
        return;

      case 'transcript:interim':
        broadcast({ type: 'transcript:interim', text: message.text });
        if (message.text) await showOnPage(message.text);
        return;

      case 'transcript:speaker':
        broadcast({ type: 'transcript:speaker', id: message.id, speaker: message.speaker });
        if (overlayCurrent?.id === message.id) {
          overlayCurrent.speaker = message.speaker;
          await showOnPage(overlayCurrent.text, message.speaker, message.id);
        }
        return;

      case 'engine:active':
        state.transcription = { ...state.transcription, active: message.active };
        pushState();
        return;

      case 'engine:unavailable':
        state.transcription = { ...state.transcription, error: message.code };
        pushState();
        return;

      case 'model:preparing':
        state.transcription = { ...state.transcription, model: 'preparing', progress: 1 };
        pushState();
        return;
    }
  })();

  return expectsReply;
});
