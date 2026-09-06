import { useEffect, useRef } from 'react';
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

  // Follow the speech, unless the reader has scrolled back to look at something.
  useEffect(() => {
    const list = listRef.current;
    if (list && pinned.current) list.scrollTop = list.scrollHeight;
  }, [segments.length, interim]);

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
          <div className="cue" key={segment.id}>
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
