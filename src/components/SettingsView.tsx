import { Toggle } from './Toggle';
import { UI_LANGUAGES, type Translate } from '../shared/i18n';
import { COLORS, FONTS, FONT_SIZE, type Engine, type Settings } from '../shared/types';

const ENGINE_NOTE = {
  auto: 'settings.engineAutoNote',
  chrome: 'settings.engineChromeNote',
  whisper: 'settings.engineWhisperNote',
} as const;

interface Props {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onClose: () => void;
  t: Translate;
}

export function SettingsView({ settings, onChange, onClose, t }: Props) {
  const font = FONTS.find((option) => option.value === settings.font)!;
  const color = COLORS.find((option) => option.value === settings.color)!;

  return (
    <>
      <div className="settings">
        <div className="row">
          <span className="label">{t('settings.title')}</span>
          <button className="quiet" onClick={onClose}>
            {t('action.done')}
          </button>
        </div>

        <p className="sample" style={{ fontFamily: font.stack, fontSize: `${settings.fontSize}px`, color: color.hex }}>
          {t('settings.sample')}
        </p>

        <label className="field">
          <span className="label">{t('settings.engine')}</span>
          <select value={settings.engine} onChange={(event) => onChange({ engine: event.target.value as Engine })}>
            <option value="auto">{t('settings.engineAuto')}</option>
            <option value="chrome">{t('settings.engineChrome')}</option>
            <option value="whisper">{t('settings.engineWhisper')}</option>
          </select>
        </label>
        <p className="hint">{t(ENGINE_NOTE[settings.engine])}</p>

        <label className="field">
          <span className="label">{t('settings.appLanguage')}</span>
          <select value={settings.uiLanguage} onChange={(event) => onChange({ uiLanguage: event.target.value })}>
            <option value="auto">{t('lang.auto')}</option>
            {UI_LANGUAGES.map((option) => (
              <option key={option.code} value={option.code}>
                {option.flag} {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="label">{t('settings.typeface')}</span>
          <select value={settings.font} onChange={(event) => onChange({ font: event.target.value as Settings['font'] })}>
            {FONTS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="field column">
          <div className="row">
            <span className="label">{t('settings.size')}</span>
            <span className="value">{settings.fontSize}px</span>
          </div>
          <input
            type="range"
            min={FONT_SIZE.min}
            max={FONT_SIZE.max}
            step={1}
            aria-label="subtitle size"
            value={settings.fontSize}
            style={{
              ['--fill' as string]: `${((settings.fontSize - FONT_SIZE.min) / (FONT_SIZE.max - FONT_SIZE.min)) * 100}%`,
            }}
            onChange={(event) => onChange({ fontSize: Number(event.target.value) })}
          />
        </div>

        <div className="field">
          <span className="label">{t('settings.colour')}</span>
          <div className="swatches">
            {COLORS.map((option) => (
              <button
                key={option.value}
                className="swatch"
                aria-label={option.label}
                aria-pressed={settings.color === option.value}
                style={{ background: option.hex }}
                onClick={() => onChange({ color: option.value })}
              />
            ))}
          </div>
        </div>

        <div className="field">
          <span className="label">{t('settings.timestamps')}</span>
          <Toggle label={t('settings.timestamps')} checked={settings.timestamps} onChange={(next) => onChange({ timestamps: next })} />
        </div>

        <div className="field">
          <span className="label">{t('settings.overlay')}</span>
          <Toggle label={t('settings.overlay')} checked={settings.overlay} onChange={(next) => onChange({ overlay: next })} />
        </div>
        <p className="hint">
          {t('settings.overlayNote')}
        </p>

        <div className="field">
          <span className="label">{t('settings.speakers')}</span>
          <Toggle label={t('settings.speakers')} checked={settings.speakers} onChange={(next) => onChange({ speakers: next })} />
        </div>
        <p className="hint">
          {t('settings.speakersNote')}
        </p>
      </div>

      {/* The same footer bar as the main screen, so the link never moves. */}
      <footer className="controls">
        <div className="bar">
          <div className="tools" />
          <a className="site" href="https://jenyadoesapps.com" target="_blank" rel="noreferrer">
            jenyadoesapps.com
          </a>
        </div>
      </footer>
    </>
  );
}
