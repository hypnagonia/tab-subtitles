/**
 * Draws the Tab Subtitles icon — white "srt." on a black tile — and writes the
 * PNG sizes Chrome asks for.
 *
 * The lettering is an alpha mask of real type (Arial Bold), rasterised once and
 * stored in srt-mask.json, so this script needs no font engine and no
 * dependencies at all. To regenerate the mask, render the text to a trimmed
 * greyscale bitmap 512 px wide and store it zlib-compressed and base64-encoded.
 */
import { deflateSync, inflateSync } from 'node:zlib';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../public/icons');
const SIZES = [16, 32, 48, 128];
const SS = 4; // supersampling factor

const BG = [0x00, 0x00, 0x00];
const EDGE = [0x26, 0x26, 0x28];
const FG = [0xff, 0xff, 0xff];

const mask = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'srt-mask.json'), 'utf8'));
const MASK = { width: mask.width, height: mask.height, data: inflateSync(Buffer.from(mask.data, 'base64')) };

/** Average the lettering mask over one destination pixel. */
function maskAt(u0, v0, u1, v1) {
  const x0 = Math.max(0, Math.floor(u0));
  const x1 = Math.min(MASK.width, Math.ceil(u1));
  const y0 = Math.max(0, Math.floor(v0));
  const y1 = Math.min(MASK.height, Math.ceil(v1));
  if (x1 <= x0 || y1 <= y0) return 0;
  let sum = 0;
  let count = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      sum += MASK.data[y * MASK.width + x];
      count++;
    }
  }
  return count ? sum / count / 255 : 0;
}

function png(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }

  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([length, body, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour with alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

function render(size) {
  const big = size * SS;
  const hi = new Float32Array(big * big * 4);
  // The Web Store asks square artwork in the 128 px icon to occupy 96 px,
  // leaving 16 px of transparent padding on every side. Toolbar sizes remain
  // full weight so the lettering is legible at 16 px.
  const artworkSize = size === 128 ? 96 : size;
  const inset = ((size - artworkSize) / 2) * SS;
  const artworkBig = artworkSize * SS;

  const radius = Math.round(artworkSize * 0.22) * SS;
  const inside = (x, y) => {
    if (x < inset || y < inset || x >= inset + artworkBig || y >= inset + artworkBig) return false;
    const localX = x - inset;
    const localY = y - inset;
    const dx = Math.min(localX, artworkBig - 1 - localX);
    const dy = Math.min(localY, artworkBig - 1 - localY);
    if (dx >= radius || dy >= radius) return true;
    const ox = radius - dx;
    const oy = radius - dy;
    return ox * ox + oy * oy <= radius * radius;
  };

  const put = (x, y, [r, g, b], a = 1) => {
    const i = (y * big + x) * 4;
    hi[i] = r;
    hi[i + 1] = g;
    hi[i + 2] = b;
    hi[i + 3] = a * 255;
  };

  for (let y = 0; y < big; y++) {
    for (let x = 0; x < big; x++) {
      if (!inside(x, y)) continue;
      const edge = x < inset + SS || y < inset + SS || x >= inset + artworkBig - SS || y >= inset + artworkBig - SS;
      put(x, y, edge ? EDGE : BG);
    }
  }

  // "srt." sits centred, as wide as the tile allows. Small icons get less
  // padding so the lettering stays as large as it can.
  const pad = artworkSize <= 16 ? 1 : Math.round(artworkSize * 0.13);
  const textW = artworkSize - pad * 2;
  const textH = Math.max(1, Math.round((textW * MASK.height) / MASK.width));
  const left = (size - textW) / 2;
  const top = (size - textH) / 2;

  for (let y = 0; y < big; y++) {
    for (let x = 0; x < big; x++) {
      const u = ((x / SS - left) / textW) * MASK.width;
      const v = ((y / SS - top) / textH) * MASK.height;
      const step = MASK.width / (textW * SS);
      const alpha = maskAt(u, v, u + step, v + (MASK.height / (textH * SS)));
      if (alpha <= 0.02) continue;
      const i = (y * big + x) * 4;
      // Paint the letter over whatever tile colour is underneath.
      for (let ch = 0; ch < 3; ch++) hi[i + ch] = hi[i + ch] * (1 - alpha) + FG[ch] * alpha;
      hi[i + 3] = Math.max(hi[i + 3], alpha * 255);
    }
  }

  // Box downsample to the final size.
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * big + x * SS + sx) * 4;
          const alpha = hi[i + 3] / 255;
          r += hi[i] * alpha;
          g += hi[i + 1] * alpha;
          b += hi[i + 2] * alpha;
          a += alpha;
        }
      }
      const o = (y * size + x) * 4;
      out[o] = a ? Math.round(r / a) : 0;
      out[o + 1] = a ? Math.round(g / a) : 0;
      out[o + 2] = a ? Math.round(b / a) : 0;
      out[o + 3] = Math.round((a / (SS * SS)) * 255);
    }
  }
  return png(size, size, out);
}

mkdirSync(OUT, { recursive: true });
for (const size of SIZES) {
  writeFileSync(`${OUT}/icon-${size}.png`, render(size));
  console.log(`icons/icon-${size}.png`);
}
