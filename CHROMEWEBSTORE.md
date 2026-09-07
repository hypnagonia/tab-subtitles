# Chrome Web Store submission

## Product details

**Name:** Tab Subtitles — the same in every locale. The summary and description are translated; the name is a brand and is not.

**Category:** Accessibility

**Summary (132 characters maximum):**

Live captions for tab audio, with on-device translation, optional offline transcription, speaker colors, and SRT/VTT export.

**Detailed description:**

Turn audio playing in a Chrome tab into readable live subtitles. Click the toolbar icon on the tab you want to caption and Tab Subtitles opens in the side panel and starts listening.

Privacy note: Auto mode uses Chrome Speech Recognition first. Depending on your Chrome setup, Chrome may send captured tab audio to Google for transcription. Choose Offline model in settings before starting captions if you want transcription to stay on your device. Tab Subtitles has no account, analytics, advertising, or developer-operated server, and the developer does not receive your audio or transcripts.

Features:

- Live captions in a focused side panel
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

- [ ] Test `release/tab-subtitles-0.2.0.zip` as an unpacked extension in a clean Chrome profile.
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
