/**
 * Injected into the captured page to show the current line the way a television
 * does: centred, near the bottom, over whatever is playing. It re-attaches
 * itself to the fullscreen element, because a video in fullscreen covers
 * everything else on the page.
 */
type OverlayStyle = {
  font: string;
  size: number;
  color: string;
};

type OverlayMessage =
  | { type: 'overlay:show'; text: string; style: OverlayStyle; revision: number }
  | { type: 'overlay:hide'; revision: number };

const MARKER = '__tabSubtitlesOverlay';
const HIDE_AFTER_MS = 4000;

if (!(window as any)[MARKER]) {
  (window as any)[MARKER] = true;

  const host = document.createElement('div');
  host.style.cssText = 'all:initial;position:fixed;inset:auto 0 0 0;z-index:2147483647;pointer-events:none';
  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    .wrap {
      display: flex;
      justify-content: center;
      padding: 0 4vw 6vh;
      pointer-events: none;
    }
    .line {
      max-width: 46em;
      margin: 0;
      padding: 0.25em 0.6em;
      border-radius: 4px;
      background: rgba(0, 0, 0, 0.72);
      color: #fff;
      text-align: center;
      line-height: 1.35;
      text-wrap: balance;
      white-space: pre-wrap;
    }
    .line:empty {
      display: none;
    }
  `;
  const wrap = document.createElement('div');
  wrap.className = 'wrap';
  const line = document.createElement('p');
  line.className = 'line';
  wrap.appendChild(line);
  shadow.append(style, wrap);

  let timer: ReturnType<typeof setTimeout> | null = null;
  let revision = 0;

  const attach = () => {
    const parent = document.fullscreenElement ?? document.body ?? document.documentElement;
    if (host.parentNode !== parent) parent.appendChild(host);
  };
  attach();
  document.addEventListener('fullscreenchange', attach, true);

  chrome.runtime.onMessage.addListener((message: OverlayMessage) => {
    if (message?.type !== 'overlay:show' && message?.type !== 'overlay:hide') return;
    // Interim and final events travel through separate async hops. Ignore an
    // older one if it arrives after the caption that replaced it.
    if (!Number.isFinite(message.revision) || message.revision < revision) return;
    revision = message.revision;

    if (message?.type === 'overlay:hide') {
      if (timer) clearTimeout(timer);
      timer = null;
      line.textContent = '';
      return;
    }
    attach();
    line.style.fontFamily = message.style.font;
    line.style.fontSize = `${message.style.size}px`;
    line.style.color = message.style.color;
    line.textContent = message.text;

    // Subtitles that never clear turn into litter over the video.
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      line.textContent = '';
    }, HIDE_AFTER_MS);
  });
}
