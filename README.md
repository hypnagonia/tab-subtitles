# Tab Subtitles

<p align="center">
  <img src="store/media/icon-128.png" width="96" height="96" alt="Tab Subtitles icon">
</p>

![Tab Subtitles promotional banner](store/media/promo-marquee-1400x560.png)

Live captions for audio playing in a Chrome tab. Subtitles appear in the side panel and can optionally be shown over the page or fullscreen video.

## Features

- Chrome Speech Recognition for quick startup
- Optional on-device Whisper transcription
- Optional speaker separation and speaker colors
- Automatic or manually selected spoken language
- Adjustable typeface, size, color, and timestamps
- TXT, SRT, and VTT export
- No account, advertising, analytics, or cloud storage

## Screenshots

![Live captions in the side panel and over a video](store/media/screenshot-1-live.png)

![Subtitle and recognition settings](store/media/screenshot-2-settings.png)

## Install locally

```bash
npm install
npm run build
```

Then:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose this project's `dist` directory.
5. Click the extension icon on a tab that is playing audio.

Chrome requires the toolbar click before an extension can capture a tab. Protected Chrome pages and some DRM media cannot be captured.

## Recognition and privacy

| Mode | Processing |
| --- | --- |
| Auto | Uses Chrome recognition first and falls back to Whisper if unavailable. |
| Chrome | May send tab audio to Google unless Chrome has its on-device language model installed. |
| Offline model | Runs Whisper locally in the browser after an approximately 150 MB model download. |

Speaker separation is disabled by default. Enabling it downloads an approximately 7 MB model and processes speaker embeddings locally.

The developer does not receive audio or transcripts. Transcripts remain in extension memory for the active session unless the user copies or exports them. See [PRIVACY.md](PRIVACY.md) for the complete policy.

## Development

```bash
npm test          # unit tests
npm run typecheck # TypeScript validation
npm run dev       # development build in watch mode
npm run release   # build, test, validate assets, and create the store ZIP
```

The production extension is built into `dist/`. The Chrome Web Store upload archive is generated under `release/`.

Store listing copy, permission justifications, asset paths, and the submission checklist are in [CHROMEWEBSTORE.md](CHROMEWEBSTORE.md).
