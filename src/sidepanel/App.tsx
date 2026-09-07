import { useCallback, useEffect, useMemo, useState } from 'react';
import { ModePicker } from '../components/ModePicker';
import { Notice } from '../components/Notice';
import { SettingsView } from '../components/SettingsView';
import { Transcript } from '../components/Transcript';
import { download, filenameFor, serialize, type Format } from '../lib/export';
import { PANEL_PORT, toSw, type PanelCommand, type PanelEvent } from '../shared/messages';
import { resolveUiLanguage, translator } from '../shared/i18n';
import {
  NO_TRANSLATION,
  prepareTranslation,
  translationAvailability,
  translationSupported,
} from '../transcription/translator';
import {
  DEFAULT_SETTINGS,
  DEFAULT_TRANSCRIPTION,
  LANGUAGES,
  defaultTranslationTarget,
  type AppState,
  type Mode,
  type Segment,
  type Settings,
} from '../shared/types';

const INITIAL_STATE: AppState = {
  capture: { status: 'idle', tab: null, error: null },
  activeTab: null,
  activeTabInvoked: false,
  settings: DEFAULT_SETTINGS,
  transcription: { ...DEFAULT_TRANSCRIPTION },
};

function send(command: PanelCommand): Promise<any> {
  return chrome.runtime.sendMessage(toSw(command)).catch(() => undefined);
}

export function App() {
  const [state, setState] = useState<AppState>(INITIAL_STATE);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [interim, setInterim] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [copied, setCopied] = useState(false);
  /** 0 – 1 while Chrome fetches a pair's translation model, else null. */
  const [translationProgress, setTranslationProgress] = useState<number | null>(null);
  const [translationFailed, setTranslationFailed] = useState(false);


  useEffect(() => {
    const port = chrome.runtime.connect({ name: PANEL_PORT });
    port.onMessage.addListener((event: PanelEvent) => {
      if (event.type === 'state') setState(event.state);
      else if (event.type === 'transcript:segment') setSegments((prev) => [...prev, event.segment]);
      else if (event.type === 'transcript:interim') setInterim(event.text);
      else if (event.type === 'transcript:speaker')
        setSegments((prev) =>
          prev.map((segment) => (segment.id === event.id ? { ...segment, speaker: event.speaker } : segment)),
        );
      else if (event.type === 'transcript:translation')
        setSegments((prev) =>
          prev.map((segment) => (segment.id === event.id ? { ...segment, translation: event.text } : segment)),
        );
      else if (event.type === 'transcript:reset') setSegments([]);
    });

    void (async () => {
      const current = await send({ type: 'state:get' });
      if (current?.state) setState(current.state);
      const transcript = await send({ type: 'transcript:get' });
      if (transcript?.segments?.length) setSegments(transcript.segments);
    })();

    return () => port.disconnect();
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const patchSettings = useCallback(async (patch: Partial<Settings>) => {
    setState((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }));
    await send({ type: 'settings:set', patch });
  }, []);

  /**
   * Chrome only downloads a translation model on a user gesture, and the
   * offscreen document never has one — so the click that picked the language is
   * the moment to fetch it. Nothing is awaited before the check, or the gesture
   * goes stale.
   */
  const ensureTranslation = useCallback(async (source: string, target: string) => {
    setTranslationFailed(false);
    if (target === NO_TRANSLATION || target === source || !translationSupported()) return;

    const availability = await translationAvailability(source, target);
    if (availability === 'available') return;
    if (availability === 'unavailable') {
      setTranslationFailed(true);
      await patchSettings({ mode: 'quick', translateTo: NO_TRANSLATION });
      return;
    }

    setTranslationProgress(0);
    const ready = await prepareTranslation(source, target, setTranslationProgress);
    setTranslationProgress(null);
    if (ready) return;
    setTranslationFailed(true);
    await patchSettings({ mode: 'quick', translateTo: NO_TRANSLATION });
  }, [patchSettings]);

  const { capture, activeTab, activeTabInvoked, settings, transcription } = state;

  /** Picking a translation both saves it and, if Chrome needs one, fetches the
   *  model for the pair — which only the click itself is allowed to start. */
  const chooseTranslation = useCallback(
    (translateTo: string) => {
      void patchSettings({ translateTo });
      void ensureTranslation(state.settings.language, translateTo);
    },
    [ensureTranslation, patchSettings, state.settings.language],
  );
  const uiLanguage = useMemo(() => resolveUiLanguage(settings.uiLanguage), [settings.uiLanguage]);
  const t = useMemo(() => translator(uiLanguage), [uiLanguage]);

  /** Choosing to translate has to name a language as well, and fetch its model
   *  on the very click that asked for it. The language a previous session
   *  translated into is kept, so the mode can be left and come back to. */
  const chooseMode = useCallback(
    (mode: Mode) => {
      if (mode !== 'translate') {
        void patchSettings({ mode });
        return;
      }
      const kept = settings.translateTo;
      const translateTo =
        kept !== NO_TRANSLATION && kept !== settings.language
          ? kept
          : defaultTranslationTarget(settings.language, uiLanguage);
      void patchSettings({ mode, translateTo });
      void ensureTranslation(settings.language, translateTo);
    },
    [ensureTranslation, patchSettings, settings.language, settings.translateTo, uiLanguage],
  );
  const tab = capture.tab ?? activeTab;
  const live = capture.status === 'active';
  const starting = capture.status === 'starting';
  const otherTab = live && activeTab && capture.tab && activeTab.id !== capture.tab.id ? activeTab : null;

  const start = useCallback(async () => {
    if (!activeTab) return;
    setInterim('');
    await send({ type: 'subtitles:start', tabId: activeTab.id });
  }, [activeTab]);

  const statusTone = live ? 'active' : starting ? 'busy' : capture.status === 'error' ? 'error' : 'idle';
  const statusText = live
    ? transcription.active === 'whisper'
      ? t('status.onDevice')
      : transcription.active === 'chrome-local'
        ? t('status.chromeLocal')
        : transcription.active === 'chrome'
          ? t('status.chromeCloud')
          : t('status.listening')
    : starting
      ? t('status.starting')
      : capture.status === 'error'
        ? t('status.stopped')
        : t('status.ready');

  async function copy() {
    await navigator.clipboard.writeText(serialize(segments, 'txt', settings.timestamps));
    setCopied(true);
  }

  function save(format: Format) {
    download(serialize(segments, format, settings.timestamps), filenameFor(tab?.host, format));
  }

  return (
    <div className="app">
      <header className="head">
        <div className="who">
          <div className="host">{tab?.host ?? t('status.noTab')}</div>
          <div className="state">
            <span className="dot" data-tone={statusTone} />
            {statusText}
          </div>
        </div>
        <div className="head-tools">
          {/* The one setting worth reaching for mid-session: the wrong language
              here is the difference between subtitles and nonsense. */}
          <select
            className="lang"
            aria-label={t('settings.spokenLanguage')}
            title={t('settings.spokenLanguage')}
            value={settings.language}
            onChange={(event) => {
              const language = event.target.value;
              // Translating a language into itself is nothing, and the picker
              // does not offer it, so the setting cannot be left pointing at it.
              const translateTo =
                language === settings.translateTo
                  ? defaultTranslationTarget(language, uiLanguage)
                  : settings.translateTo;
              void patchSettings({ language, translateTo });
              if (settings.mode === 'translate') void ensureTranslation(language, translateTo);
            }}
          >
            {LANGUAGES.map((option) => (
              <option key={option.code} value={option.code}>
                {option.flag} {option.label}
              </option>
            ))}
          </select>
          <button
            className="icon"
            aria-label={t('settings.title')}
            aria-pressed={showSettings}
            onClick={() => setShowSettings((open) => !open)}
          >
            <GearIcon />
          </button>
        </div>
      </header>

      {/* Fetching a translation model is started from either screen, so it
          reports from above both of them. */}
      {translationFailed ? <Notice tone="error">{t('error.translationUnavailable')}</Notice> : null}

      {translationProgress !== null ? (
        <div className="stack banner">
          <div className="row">
            <span className="label">{t('model.translating')}</span>
            <span className="value">{Math.round(translationProgress * 100)}%</span>
          </div>
          <div className="progress">
            <i style={{ width: `${Math.max(2, translationProgress * 100)}%` }} />
          </div>
        </div>
      ) : null}

      {showSettings ? (
        <SettingsView settings={settings} onChange={patchSettings} onClose={() => setShowSettings(false)} t={t} />
      ) : (
        <>
          <ModePicker
            settings={settings}
            live={live}
            active={transcription.active}
            onMode={chooseMode}
            onTranslate={chooseTranslation}
            t={t}
          />

          {capture.error ? (
            <Notice tone="error" action={activeTab ? <button onClick={start}>try again</button> : null}>
              {t(`error.${capture.error}` as never)}
            </Notice>
          ) : null}

          {otherTab ? (
            <Notice
              action={
                <button onClick={() => send({ type: 'subtitles:start', tabId: otherTab.id })}>
                  {t('action.useCurrentTab')}
                </button>
              }
            >
              {t('notice.otherTab', { host: otherTab.host, tab: capture.tab?.host ?? '' })}
            </Notice>
          ) : null}

          {transcription.model === 'downloading' || transcription.model === 'preparing' ? (
            <div className="stack">
              <div className="row">
                <span className="label">
                  {transcription.model === 'preparing'
                    ? t('model.preparing')
                    : transcription.active?.startsWith('chrome')
                      ? t('model.filling')
                      : t('model.downloading')}
                </span>
                {transcription.model === 'downloading' ? (
                  <span className="value">{Math.round(transcription.progress * 100)}%</span>
                ) : null}
              </div>
              <div className="progress" data-busy={transcription.model === 'preparing' ? 'true' : undefined}>
                <i style={{ width: `${Math.max(2, transcription.progress * 100)}%` }} />
              </div>
            </div>
          ) : null}

          <Transcript segments={segments} settings={settings} live={live} interim={interim} t={t} />

          <footer className="controls">
            {live ? null : (
              <div className="stack">
                <button className="primary" disabled={!activeTab || starting} onClick={start}>
                  {segments.length ? t('action.startAgain') : t('action.start')}
                </button>
                {activeTab && !activeTabInvoked && !capture.error ? (
                  <span className="hint">
                    {t('notice.invokeHint')}
                  </span>
                ) : null}
              </div>
            )}

            <div className="bar">
              <div className="tools">
                {live ? (
                  <button
                    className="tool"
                    title={t('action.stop')}
                    aria-label={t('action.stop')}
                    onClick={() => send({ type: 'subtitles:stop' })}
                  >
                    <StopIcon />
                  </button>
                ) : null}

                {segments.length > 0 ? (
                  <>
                    <button
                      className="tool"
                      title={copied ? t('action.copied') : t('action.copy')}
                      aria-label={t('action.copy')}
                      onClick={copy}
                    >
                      {copied ? <CheckIcon /> : <CopyIcon />}
                    </button>

                    <span className="tool save">
                      <SaveIcon />
                      <select
                        aria-label={t('save.as')}
                        title={t('save.as')}
                        value=""
                        onChange={(event) => {
                          if (event.target.value) save(event.target.value as Format);
                          event.target.value = '';
                        }}
                      >
                        <option value="">{t('save.as')}</option>
                        <option value="txt">{t('save.txt')}</option>
                        <option value="srt">{t('save.srt')}</option>
                        <option value="vtt">{t('save.vtt')}</option>
                      </select>
                    </span>

                    <button
                      className="tool"
                      title={t('action.clear')}
                      aria-label={t('action.clear')}
                      onClick={() => {
                        setSegments([]);
                        setInterim('');
                        void send({ type: 'transcript:clear' });
                      }}
                    >
                      <TrashIcon />
                    </button>
                  </>
                ) : null}
              </div>

              <a className="site" href="https://jenyadoesapps.com" target="_blank" rel="noreferrer">
                jenyadoesapps.com
              </a>
            </div>
          </footer>
        </>
      )}
    </div>
  );
}

function StopIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="4" y="4" width="8" height="8" rx="1.6" fill="currentColor" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="5.6" y="2.6" width="7.8" height="7.8" rx="1.8" stroke="currentColor" strokeWidth="1.3" />
      <path d="M10.4 13.4H4.4a1.8 1.8 0 0 1-1.8-1.8v-6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 2.4v7.2M5.2 7l2.8 2.8L10.8 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.8 11.4v1.2a1 1 0 0 0 1 1h8.4a1 1 0 0 0 1-1v-1.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3.2 4.6h9.6M6.5 4.6V3.4a.8.8 0 0 1 .8-.8h1.4a.8.8 0 0 1 .8.8v1.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M4.5 4.6l.5 8a1 1 0 0 0 1 .9h4a1 1 0 0 0 1-.9l.5-8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3.4 8.4l3 3 6.2-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GearIcon() {
  const teeth = Array.from({ length: 8 }, (_, index) => {
    const angle = (index * Math.PI) / 4;
    const x1 = (8 + Math.cos(angle) * 4.7).toFixed(2);
    const y1 = (8 + Math.sin(angle) * 4.7).toFixed(2);
    const x2 = (8 + Math.cos(angle) * 6.7).toFixed(2);
    const y2 = (8 + Math.sin(angle) * 6.7).toFixed(2);
    return `M${x1} ${y1}L${x2} ${y2}`;
  }).join('');

  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d={teeth} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="8" cy="8" r="4.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="8" cy="8" r="1.5" fill="currentColor" />
    </svg>
  );
}
