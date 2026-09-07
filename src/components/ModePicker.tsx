import type { Translate } from '../shared/i18n';
import { LANGUAGES, MODES, type ActiveEngine, type Mode, type Settings } from '../shared/types';
import { translationSupported } from '../transcription/translator';

const LABEL = {
  quick: 'mode.quick',
  private: 'mode.private',
  translate: 'mode.translate',
} as const;

const NOTE = {
  quick: 'mode.quickNote',
  private: 'mode.privateNote',
  translate: 'mode.translateNote',
} as const;

interface Props {
  settings: Settings;
  /** Subtitles are running. */
  live: boolean;
  /** Which recogniser is producing text, so the panel can say when a mode is
   *  still waiting for its turn. */
  active: ActiveEngine;
  onMode: (mode: Mode) => void;
  /** Picking a language may have to fetch a model, which Chrome only allows on
   *  the click that picked it. */
  onTranslate: (translateTo: string) => void;
  t: Translate;
}

/**
 * The one choice the panel asks for: what the subtitles are for. Which
 * recogniser answers, and whether anything is translated, follows from it.
 */
export function ModePicker({ settings, live, active, onMode, onTranslate, t }: Props) {
  // A session fixes its recogniser when it starts, so privacy asked for
  // half-way through is a promise this session cannot keep.
  const waiting = live && settings.mode === 'private' && active !== null && active !== 'whisper';

  return (
    <div className="modes">
      <div className="segmented" role="group" aria-label={t('mode.label')}>
        {MODES.map((mode) => (
          <button
            key={mode}
            className="segment"
            aria-pressed={settings.mode === mode}
            disabled={mode === 'translate' && !translationSupported()}
            title={t(NOTE[mode])}
            onClick={() => onMode(mode)}
          >
            {t(LABEL[mode])}
          </button>
        ))}
      </div>

      {settings.mode === 'translate' ? (
        <label className="field">
          <span className="label">{t('mode.into')}</span>
          <select value={settings.translateTo} onChange={(event) => onTranslate(event.target.value)}>
            {LANGUAGES.filter((option) => option.code !== settings.language).map((option) => (
              <option key={option.code} value={option.code}>
                {option.flag} {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {/* Once subtitles are running the note has said its piece, and the room
          belongs to the transcript. */}
      {waiting || !live ? <p className="hint">{waiting ? t('mode.appliesNext') : t(NOTE[settings.mode])}</p> : null}
    </div>
  );
}
