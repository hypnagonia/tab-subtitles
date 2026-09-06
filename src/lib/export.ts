import type { Segment } from '../shared/types';

export type Format = 'txt' | 'srt' | 'vtt';

export function timecode(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function cueTime(seconds: number, separator: ',' | '.'): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const hh = String(Math.floor(ms / 3_600_000)).padStart(2, '0');
  const mm = String(Math.floor((ms % 3_600_000) / 60_000)).padStart(2, '0');
  const ss = String(Math.floor((ms % 60_000) / 1000)).padStart(2, '0');
  return `${hh}:${mm}:${ss}${separator}${String(ms % 1000).padStart(3, '0')}`;
}

export function speakerCount(segments: Segment[]): number {
  return new Set(segments.map((segment) => segment.speaker).filter((speaker) => speaker !== null)).size;
}

function label(segment: Segment, multiple: boolean): string {
  return multiple && segment.speaker !== null ? `Speaker ${segment.speaker + 1}: ` : '';
}

/** WebVTT has its own voice tag, which players understand. */
function voice(segment: Segment, multiple: boolean, text: string): string {
  return multiple && segment.speaker !== null ? `<v Speaker ${segment.speaker + 1}>${text}` : text;
}

export function toText(segments: Segment[], timestamps: boolean): string {
  const multiple = speakerCount(segments) > 1;
  return segments
    .map((segment) => `${timestamps ? `${timecode(segment.time)}  ` : ''}${label(segment, multiple)}${segment.text}`)
    .join(timestamps ? '\n\n' : '\n');
}

export function toSrt(segments: Segment[]): string {
  const multiple = speakerCount(segments) > 1;
  return segments
    .map((segment, index) =>
      [
        index + 1,
        `${cueTime(segment.time, ',')} --> ${cueTime(Math.max(segment.end, segment.time + 0.5), ',')}`,
        `${label(segment, multiple)}${segment.text}`,
        '',
      ].join('\n'),
    )
    .join('\n');
}

export function toVtt(segments: Segment[]): string {
  const multiple = speakerCount(segments) > 1;
  const cues = segments.map((segment) =>
    [
      `${cueTime(segment.time, '.')} --> ${cueTime(Math.max(segment.end, segment.time + 0.5), '.')}`,
      voice(segment, multiple, segment.text),
      '',
    ].join('\n'),
  );
  return ['WEBVTT', '', ...cues].join('\n');
}

export function serialize(segments: Segment[], format: Format, timestamps: boolean): string {
  if (format === 'srt') return toSrt(segments);
  if (format === 'vtt') return toVtt(segments);
  return toText(segments, timestamps);
}

export function download(text: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Give the download a moment to start before the blob goes away.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function filenameFor(host: string | undefined, format: Format): string {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
  const site = (host ?? 'tab').replace(/[^a-z0-9.-]/gi, '') || 'tab';
  return `${site}-${stamp}.${format}`;
}
