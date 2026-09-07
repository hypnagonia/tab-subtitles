# Privacy Policy for Tab Subtitles

Effective date: September 6, 2026

Tab Subtitles creates live captions from audio playing in a browser tab selected by the user. This policy explains what information the extension handles and where that processing occurs.

## Information handled

When the user starts captions, the extension handles audio from the selected tab and the transcript produced from that audio. It also reads the selected tab’s title, URL/host, audio state, and declared page language to identify the caption session and choose a recognition language. Audio or text may contain personal communications or other personal information depending on what the user chooses to caption.

The extension stores preferences such as recognition engine, language, subtitle appearance, and feature switches in Chrome local storage. It stores the active tab identifier and invocation state in Chrome session storage while needed for the current browser session.

## How information is used

This information is used only to create live captions, optionally distinguish speakers, show captions over the selected page, and create transcript files when the user chooses Copy or Save.

## Processing and sharing

In Auto or Chrome mode, Tab Subtitles uses Chrome Speech Recognition. Depending on the user’s Chrome installation and language model availability, Chrome may transmit tab audio to Google for transcription. That processing is governed by Google’s applicable terms and privacy policy. The extension UI identifies whether Chrome reports the active recognizer as cloud-based or on-device.

In Offline model mode, speech recognition runs locally in the browser. Optional speaker separation also runs locally. Optional translation uses Chrome's built-in Translator, which runs on the device after Chrome downloads the language pair's model; transcripts are not sent to a translation service. Enabling these features downloads machine-learning model files from Hugging Face over HTTPS; audio and transcripts are not sent to Hugging Face.

The developer does not operate a backend for Tab Subtitles and does not receive, collect, sell, or use tab audio, transcripts, browsing information, or settings for advertising or analytics. Information is not shared with third parties except for Chrome/Google processing described above when the user chooses Auto or Chrome mode.

## Storage and retention

Captured audio is held temporarily in memory while captions are active; the speaker-identification buffer keeps at most approximately 45 seconds. Transcripts are held in extension memory for the active session and are removed when the offscreen caption session closes. User-created TXT, SRT, or VTT exports and clipboard copies are controlled by the user and remain wherever the user saves them.

Preferences remain in Chrome local storage until the user changes them, clears extension data, or uninstalls the extension. Session state is temporary. Tab Subtitles does not provide cloud storage or synchronization.

## Security and limited use

Network requests used for Chrome transcription or model downloads use HTTPS or browser-managed secure services. Use of information received from Google APIs follows the Chrome Web Store User Data Policy, including Limited Use requirements. Data is used only for the extension’s disclosed captioning purpose and is not used for personalized advertising, lending decisions, or unrelated profiling. The developer does not permit humans to read captured audio or transcripts.

## User choices

Users can select Offline model before starting captions to keep speech recognition on their device. On-page subtitles are optional and disabled by default. Speaker separation is on by default and can be switched off in settings; it runs locally and downloads an approximately 7 MB model on first use. Users can stop captions at any time, clear the visible transcript, remove saved exports, clear extension storage, or uninstall the extension.

## Changes and contact

Material changes to these practices will be disclosed before the changed handling begins. Questions about this policy can be sent through the contact method at [jenyadoesapps.com](https://jenyadoesapps.com).
