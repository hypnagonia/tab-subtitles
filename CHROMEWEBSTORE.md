# Chrome Web Store submission

## Product details

**Name:** Tab Subtitles — Live Captions & Translation

The same in every locale: the summary and description are translated, the name is a brand and is not. The store searches the name, so it carries the two terms people type; the toolbar tooltip uses a separate short message (`appShortName`) and stays "Tab Subtitles".

**Category:** Accessibility

**Summary (132 characters maximum):**

Live subtitles for any video or call: speech to text on your device, translation, speaker colors, SRT/VTT export.

Each locale has its own summary in `public/_locales/<locale>/messages.json`, written for what people search in that language rather than translated word for word.

**What's new (0.2.1) — put at the top of the detailed description for this release:**

What's new in 0.2.1

- Translation on your own machine. Choose a language in settings and each line is translated as it is heard, using Chrome's built-in translator. Nothing is sent to a translation service. The line as it was spoken stays above the translation, and exports keep the original.
- The spoken language now sits in the panel beside the settings icon, so it can be changed while captions are running instead of only before they start.
- The old "auto" spoken language is gone. It guessed from the page or the browser rather than from the audio, and a wrong guess produced nonsense. The language is now always explicit, starting from your browser's language.
- Click any line in the transcript to copy it.
- Speaker separation and speaker colors are on by default.

Translation needs Chrome 138 or later; without it the option is simply unavailable. Chrome downloads a translation model the first time each pair of languages is used.

**Detailed description:**

Live subtitles for anything playing in a Chrome tab: video, lectures, calls, streams, podcasts. Speech becomes readable text as it is spoken, and can be translated into another language on your own machine as it goes.

Click the toolbar icon on the tab you want to caption. Tab Subtitles opens in the side panel and starts listening — nothing to set up per site, no account, no upload, no file to prepare.

Works with any tab that plays sound:

- Videos and streams in any player
- Online meetings and calls
- Lectures, talks, and courses
- Podcasts and radio
- Anything where you would rather read than listen, or need both

Privacy note: Auto mode uses Chrome Speech Recognition first. Depending on your Chrome setup, Chrome may send captured tab audio to Google for transcription. Choose Offline model in settings before starting captions if you want transcription to stay on your device. Translation always runs on your device. Tab Subtitles has no account, analytics, advertising, or developer-operated server, and the developer does not receive your audio or transcripts.

Features:

- Live captions in a focused side panel, in 17 spoken languages
- Optional captions over the page and in fullscreen video
- Optional offline Whisper transcription
- Speaker separation and speaker colors (on by default, switchable in settings)
- Spoken language picked from the panel, switchable mid-session
- Optional on-device translation, shown above the original line
- Adjustable typeface, text size, color, and timestamps
- Copy transcripts or export TXT, SRT, and VTT files
- No account, advertising, analytics, or cloud storage

Some protected pages and DRM-protected media cannot be captured. Offline transcription downloads approximately 150 MB of model data. Translation uses Chrome's built-in on-device translator and downloads a model for each language pair on first use. Enabling speaker separation downloads an additional model of approximately 7 MB.

## Graphic assets

- Store icon: `store/media/icon-128.png` (the same artwork is packaged at `dist/icons/icon-128.png`)
- Screenshot — live captions: `store/media/screenshot-1-live.png`
- Screenshot — settings: `store/media/screenshot-2-settings.png`
- Screenshot — translation: `store/media/screenshot-3-translation.png`
- Small promo tile: `store/media/promo-small-440x280.png`
- Optional marquee: `store/media/promo-marquee-1400x560.png`

Promo video is optional. Do not add an unrelated video merely to fill the field.

## Privacy practices

**Single purpose:**

Create live, readable captions and downloadable subtitle transcripts from audio playing in the user-selected browser tab.

**Permission justifications:**

- `sidePanel`: Displays the live transcript, controls, settings, and export actions alongside the selected tab.
- `tabCapture`: Captures audio from the tab on which the user invokes the extension so it can be transcribed and played back without muting the tab.
- `offscreen`: Hosts the Web Audio graph, Chrome Speech Recognition integration, and on-device transcription worker because an MV3 service worker cannot keep those media operations alive.
- `storage`: Saves only extension settings, model-ready state, and short-lived session state needed to restore an active capture after the service worker sleeps.
- `activeTab`: Grants user-initiated access to the specific tab selected by clicking the toolbar icon. The extension requests no blanket host access.
- `tabs`: Reads the selected tab title, URL/host, and audio state to identify the captioned tab and stop cleanly if it closes or changes.
- `scripting`: Injects the on-page subtitle overlay into the user-selected tab, and only when that option is enabled.

**Remote code:** No, the extension does not use remote code. JavaScript and WebAssembly are packaged in the ZIP. The optional ONNX speech and speaker models are downloaded as data and do not add extension logic.

**User data categories to disclose:**

- Website content: audio from the user-selected tab and the generated transcript.
- Web history: the selected tab’s URL/host and title are read locally only to identify the active caption session.
- Personal communications: may be present if the user chooses to caption a call or other communication.

**Data-use certification:**

- Data is used only to provide live captions, speaker separation, on-device translation, and user-requested exports.
- Data is not sold, used for advertising, used for creditworthiness or lending, or shared for unrelated purposes.
- The developer does not allow humans to read captured audio or transcripts.
- Use of information received from Google APIs follows the Chrome Web Store User Data Policy, including Limited Use requirements.

**Privacy policy URL:** Publish `PRIVACY.md` on `https://jenyadoesapps.com` and enter that public HTTPS URL in the dashboard before submission.

## Distribution and support

- Visibility: Public
- Regions: All regions unless support requirements dictate otherwise
- Mature content: No
- Homepage: `https://jenyadoesapps.com`
- Support URL: add a dedicated public support/contact page under `jenyadoesapps.com`
- Official URL: verify `jenyadoesapps.com` in Google Search Console and select it in the dashboard

## Submission checklist

- [ ] Test `release/tab-subtitles-0.2.1.zip` as an unpacked extension in a clean Chrome profile.
- [ ] Confirm Auto mode’s cloud-processing disclosure is prominent in the listing.
- [ ] Re-shoot both screenshots from `store-preview.html` whenever the panel changes.
- [ ] Publish the privacy policy and add its HTTPS URL to the dashboard.
- [ ] Add the detailed description and select Accessibility.
- [ ] Upload the icon, three screenshots, small promo tile, and optional marquee.
- [ ] Complete every permission justification exactly and consistently with the privacy policy.
- [ ] Select “No” for remote code.
- [ ] Disclose website content, web history, and personal communications conservatively.
- [ ] Certify the Limited Use statements.
- [ ] Add homepage/support URLs and verify the official publisher website.
- [ ] Choose public distribution and the intended regions.
- [ ] Save the draft, resolve dashboard warnings, then submit for review.
