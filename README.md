# Tab Subtitles

**Live subtitles for any tab.**

A Chrome side panel that captions whatever the current tab is playing. Click the toolbar icon
and it starts listening on its own — no button, no setup. Subtitles appear in the panel and,
if you want, over the page itself the way a television shows them.

Chrome Web Store listing name: `Tab Subtitles`.

By [jenyadoesapps.com](https://jenyadoesapps.com).

---

## What it does

- **Captions the tab you are listening to.** Video, calls, podcasts, anything with sound.
- **Starts by itself.** Opening the panel is the whole instruction.
- **Two engines.** Chrome's own recognition leads, because it is instant and reads speech
  better. A local Whisper model is there when Chrome cannot do the job, or when you want the
  guarantee that nothing leaves the machine. The header always says which is working.
- **Optional voice separation** works with either engine — when enabled, each speaker gets a colour and a label.
- **On the page too.** One switch puts the current line centred at the bottom of the page,
  over the video, and it follows video into fullscreen.
- **Exports.** Copy, or save `.txt`, `.srt` or `.vtt`.
- **Looks how you want.** Typeface, size, colour, timestamps — all in settings.

## Install and run

```bash
npm install
npm run build
```

Then load it:

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `dist` folder of this project.
4. Pin *Tab Subtitles* to the toolbar.

To use it: **click the toolbar icon on the tab you want captioned.** The panel opens and
starts listening on its own. Chrome requires that click — see *About the toolbar click*.

For development, `npm run dev` rebuilds on change; press reload on the extension card in
`chrome://extensions` to pick up a new build.

### Production build

`npm run build` regenerates the icons, type-checks, bundles into `dist/`, and copies the
onnxruntime binaries into `dist/ort/`. `dist/` is the unpacked extension; zip its
*contents* (not the folder) for the Web Store.

## The two engines

| | Chrome | Offline model |
| --- | --- | --- |
| Starts | instantly | after a ~150 MB download |
| Runs | on Google's servers, unless Chrome's on-device model is installed | entirely on your machine |
| Recognition | noticeably better in practice | good, and never leaves the device |
| Languages | whatever Chrome offers | multilingual Whisper |

`auto` (the default) uses Chrome and stays on it, falling back to the offline model only if
Chrome cannot run — so the 150 MB is never downloaded unless it is actually needed. `chrome`
pins it to Chrome with no fallback. `offline model` is the choice to make if you want the
guarantee that no audio ever leaves the machine; the first session then waits for the
download.

Voice separation is off by default. When enabled, voices are separated by a **separate 7 MB
model that listens to the audio, not to the recogniser**, so speaker colours work with Chrome
as well as with Whisper.

**Verified, not assumed:** Chrome 147's `SpeechRecognition.start()` accepts a
`MediaStreamTrack`, which is what makes this possible — it listens to the captured tab, not to
your microphone. On a Chrome without that, `start()` would quietly listen to the microphone
instead, so the panel reports the engine it is actually using rather than guessing. Chrome
also never finalises a line while speech continues, so an utterance is committed at the first
pause and after eight seconds regardless; if a session ends with only interim text in hand,
that text is committed rather than dropped.

## Subtitles on the page

**settings → subtitles on the page** injects a small script into the captured tab that draws
the current line centred near the bottom, over the video. It lives in a closed shadow root so
page styles cannot reach it, re-attaches itself to the fullscreen element when a video goes
fullscreen, and clears itself after four seconds of quiet. It uses the same typeface, size and
colour as the panel, scaled up for viewing distance.

## Language

Resolved in this order: what you picked in settings, else what the page declares
(`<html lang>`, then `og:locale`), else the browser's own language, else the model's own
detection. The picker shows what `auto` landed on — `auto · ru`.

## Permissions, and why each one is there

| Permission | Why |
| --- | --- |
| `sidePanel` | The whole interface is the side panel. |
| `tabCapture` | The only way to get a tab's audio. This is the permission behind the "read and change all your data" install warning — Chrome has no narrower one for audio. |
| `offscreen` | An MV3 service worker cannot hold a Web Audio graph or a speech worker. The offscreen document plays the captured audio back and transcribes it. |
| `storage` | Remembers your engine, language and subtitle appearance. |
| `activeTab` | Grants access to the tab you invoked the extension on. Chrome accepts nothing else for tab capture. |
| `tabs` | To show which tab is being captioned, and to notice when it closes or you switch. |
| `scripting` | Two things, on the captured tab only: read the page's declared language, and inject the on-page subtitle overlay when that switch is on. Runs under `activeTab`. |

No host permissions, no `<all_urls>`, and no permission prompt for the model download — the
Hugging Face CDN serves permissive CORS headers, so an extension page can fetch the model
without host access. That was measured, not assumed: the models download with
`permissions.getAll().origins` empty.

### About the toolbar click

Chrome refuses tab capture unless the extension was *invoked* on that specific tab — verified
here: even with `<all_urls>` granted, `tabCapture.getMediaStreamId` still returns *"Extension
has not been invoked for the current page"*. That is why this extension asks for no site
access at all: granting it would not help. Clicking the toolbar icon is the invocation, and it
is also what opens the panel and starts the subtitles, so the normal flow costs nothing extra.
Captioning another tab means clicking the icon there.

## Privacy

Chrome's recogniser sends audio to Google unless Chrome's own on-device model is installed —
so the header says `chrome, cloud` or `chrome, on device`, plainly, whenever it is running.
Choosing **offline model** in settings is the switch that guarantees nothing ever leaves the
machine. The 7 MB voice model and the 150 MB speech model are downloads only; they send
nothing back.

Transcripts live in memory only. They are gone when the capture stops or the browser closes —
`copy` and `save as` are how you keep one.

## How it works

```
tab audio ─┬─ speakers (untouched — capturing a tab silences it)
           ├─ MediaStreamTrack ──── Chrome SpeechRecognition ─── text ─┐
           ├─ tap ─ 16 kHz ─┬─ chunks ─ worker ─ Whisper ───── text ─┤
           │                └─ 45 s buffer ─ wespeaker ─ voice ── colour
           └────────────────────────────────────── panel + page overlay ─┘
```

Chrome hands back a line and the seconds it covers, but not the audio behind it — so a rolling
45-second buffer of the tab at 16 kHz sits alongside, and the voice print for a line is taken
from the slice of audio it covers. Both engines feed the same clustering, so speaker numbers
and colours stay consistent whichever one is talking.

One capture, no second stream: no echo, no doubled playback. Only one engine listens at a
time, so the two never produce the same line twice.

Chunks are cut at pauses — typically every 2–3 seconds, never longer than 6 — so subtitles
trail the audio by a couple of seconds rather than a paragraph. If the machine cannot keep up,
the oldest queued chunk is dropped so the subtitles stay live instead of falling further
behind.

Chrome's recogniser needs one trick: with continuous speech it never finalises a line, so an
utterance is committed at the first pause and after eight seconds regardless.

Voices are told apart by embedding each chunk with `wespeaker-voxceleb-resnet34-LM` (7 MB) and
clustering by cosine similarity. Clear matches reuse a known voice; uncertain matches use the
nearest voice without changing its centroid; and a third-or-later voice must be heard more than
once before it gets a new number. Chunks are cut at pauses, so in practice one chunk is one
speaker; a chunk spanning a turn is attributed to one of them.

### Project structure

```
src/
  background/service-worker.ts   state, tab tracking, capture lifecycle
  offscreen/offscreen.ts         hosts the audio and both engines
  audio/
    config.ts                    every tuning constant, in one place
    pipe.ts                      capture, playback, tap
    tap-worklet.ts               mono blocks off the audio thread
  transcription/
    chrome-engine.ts             Chrome's recogniser, fed the captured track
    controller.ts                worker lifecycle, queue, voice clustering
    chunker.ts                   pause detection for the offline model
    resampler.ts                 shared 16 kHz decimation
    rolling-audio.ts             recent tab audio, addressable by time
    worker.ts                    Whisper + speaker embeddings
  content/overlay.ts             the on-page subtitle line
  lib/export.ts                  txt, srt, vtt
  sidepanel/, components/        React side panel
  shared/                        types, message protocol, storage
  dev/                           harness + preview, dev builds only
```

The Whisper model is `onnx-community/whisper-base`, set in `src/audio/config.ts`. It is
downloaded on demand, never bundled, and cached by the browser. Inference runs through WebGPU
when available and quantized WASM otherwise; chunk lengths and pause detection sit in the same
file under `TRANSCRIPTION`.

### Development pages

`npm run dev` additionally builds two pages that never ship:

- `preview.html` — the panel against scripted states, with the extension APIs stubbed.
- `harness.html` — plays synthesized speech (two alternating voices, made with macOS `say`)
  through both engines inside the extension's own origin and reports what each returned to
  `window.__results`. This is how the engines were verified end to end: Chrome and Whisper both
  return the right words, and the voice model labels the four turns `0, 1, 0, 1`.

Open them as `chrome-extension://<id>/preview.html` once the extension is loaded.

## When things go wrong

Every failure is reported in plain language: a tab Chrome will not capture, a tab that closed,
a capture Chrome stopped, an interrupted download, no memory, or an engine that will not run.
If the offline model fails, Chrome's recogniser takes over rather than leaving the panel empty.

If the offline model's download stops making progress for 90 seconds it is reported as stalled
rather than left as a bar that never fills.

Known limits: `chrome://` pages and the Web Store cannot be captured — Chrome forbids it. Some
DRM-protected streams do not expose audio. A chunk that spans a change of speaker is
attributed to one of them.

## Not in this MVP

No accounts, no cloud sync, no analytics, no subscriptions. No summaries, translation, meeting
notes or transcript search. No audio recording, no PDF or DOCX export.
