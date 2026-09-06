import { useCallback, useEffect, useMemo, useState } from 'react';
import { Notice } from '../components/Notice';
import { SettingsView } from '../components/SettingsView';
import { Transcript } from '../components/Transcript';
import { download, filenameFor, serialize, type Format } from '../lib/export';
import { PANEL_PORT, toSw, type PanelCommand, type PanelEvent } from '../shared/messages';
import { resolveUiLanguage, translator } from '../shared/i18n';
import {
  DEFAULT_SETTINGS,
  DEFAULT_TRANSCRIPTION,
  type AppState,
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

  const { capture, activeTab, activeTabInvoked, settings, transcription } = state;
  const t = useMemo(() => translator(resolveUiLanguage(settings.uiLanguage)), [settings.uiLanguage]);
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
        <button
          className="icon"
          aria-label={t('settings.title')}
          aria-pressed={showSettings}
          onClick={() => setShowSettings((open) => !open)}
        >
          <GearIcon />
        </button>
      </header>

      {showSettings ? (
        <SettingsView
          settings={settings}
          transcription={transcription}
          onChange={patchSettings}
          onClose={() => setShowSettings(false)}
          t={t}
        />
      ) : (
        <>
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
