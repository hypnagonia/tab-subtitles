import { useEffect, useRef, useState } from 'react';
import { timecode } from '../lib/export';
import { FONTS, speakerColor, type Segment, type Settings } from '../shared/types';
import type { Translate } from '../shared/i18n';

export function Transcript({
  segments,
  settings,
  live,
  interim,
  t,
}: {
  segments: Segment[];
  settings: Settings;
  live: boolean;
  interim: string;
  t: Translate;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Follow the speech, unless the reader has scrolled back to look at something.
  useEffect(() => {
    const list = listRef.current;
    if (list && pinned.current) list.scrollTop = list.scrollHeight;
  }, [segments.length, interim]);

  useEffect(() => {
    if (!copiedId) return;
    const timer = setTimeout(() => setCopiedId(null), 1200);
    return () => clearTimeout(timer);
  }, [copiedId]);

  /** A line is a quotable thing, so clicking one copies it — the line as it is
   *  being read, which is the translation when there is one. Dragging across it
   *  is someone picking out a few words by hand, and is left alone. */
  async function copyLine(segment: Segment): Promise<void> {
    const selection = getSelection();
    if (selection && !selection.isCollapsed) return;
    try {
      await navigator.clipboard.writeText(segment.translation ?? segment.text);
      setCopiedId(segment.id);
    } catch {
      // Clipboard refused, e.g. the panel lost focus mid-click.
    }
  }

  const voices = new Set(segments.map((segment) => segment.speaker).filter((speaker) => speaker !== null));
  const showSpeakers = settings.speakers && voices.size > 1;

  return (
    <div
      className="transcript"
      ref={listRef}
      style={{
        fontFamily: FONTS.find((option) => option.value === settings.font)?.stack,
        fontSize: `${settings.fontSize}px`,
      }}
      onScroll={(event) => {
        const el = event.currentTarget;
        pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      }}
    >
      {segments.length === 0 && !interim ? (
        <p className="empty">{live ? t('transcript.listening') : ''}</p>
      ) : (
        segments.map((segment) => (
          <div
            className="cue"
            key={segment.id}
            role="button"
            tabIndex={0}
            title={t('action.copy')}
            data-copied={copiedId === segment.id ? 'true' : undefined}
            onClick={() => void copyLine(segment)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              void copyLine(segment);
            }}
          >
            {settings.timestamps || showSpeakers ? (
              <div className="cue-meta">
                {settings.timestamps ? <span>{timecode(segment.time)}</span> : null}
                {showSpeakers && segment.speaker !== null ? (
                  <span style={{ color: speakerColor(segment.speaker, settings.color) }}>
                    {t('transcript.speaker', { n: segment.speaker + 1 })}
                  </span>
                ) : null}
              </div>
            ) : null}
            <p style={{ color: speakerColor(showSpeakers ? segment.speaker : null, settings.color) }}>{segment.text}</p>
            {/* The translation follows the line it came from. */}
            {segment.translation ? <p className="cue-translation">{segment.translation}</p> : null}
            {copiedId === segment.id ? <span className="cue-copied">{t('action.copied')}</span> : null}
          </div>
        ))
      )}
      {interim ? (
        <div className="cue interim">
          <p style={{ color: speakerColor(null, settings.color) }}>{interim}</p>
        </div>
      ) : null}
    </div>
  );
}
