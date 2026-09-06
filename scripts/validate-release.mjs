import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = resolve(ROOT, 'dist');
const MEDIA = resolve(ROOT, 'store/media');

function check(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`✓ ${message}`);
}

function dimensions(path) {
  const png = readFileSync(path);
  check(png.subarray(1, 4).toString('ascii') === 'PNG', `${path} is a PNG`);
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
}

function filesBelow(path, prefix = '') {
  return readdirSync(path).flatMap((name) => {
    const absolute = resolve(path, name);
    const relative = prefix ? `${prefix}/${name}` : name;
    return statSync(absolute).isDirectory() ? filesBelow(absolute, relative) : [relative];
  });
}

const manifest = JSON.parse(readFileSync(resolve(DIST, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
check(manifest.manifest_version === 3, 'manifest uses MV3');
check(manifest.version === pkg.version, 'manifest and package versions match');
check(dimensions(resolve(DIST, 'icons/icon-128.png')).join('x') === '128x128', 'store icon is 128x128');

const releaseFiles = filesBelow(DIST);
for (const devFile of ['preview.html', 'harness.html', 'store-preview.html']) {
  check(!releaseFiles.includes(devFile), `${devFile} is excluded from the production ZIP`);
}

for (const [name, expected] of [
  ['icon-128.png', '128x128'],
  ['promo-small-440x280.png', '440x280'],
  ['promo-marquee-1400x560.png', '1400x560'],
  ['screenshot-1-live.png', '1280x800'],
  ['screenshot-2-settings.png', '1280x800'],
]) {
  check(dimensions(resolve(MEDIA, name)).join('x') === expected, `${name} is ${expected}`);
}

for (const locale of readdirSync(resolve(ROOT, 'public/_locales'))) {
  const messages = JSON.parse(readFileSync(resolve(ROOT, `public/_locales/${locale}/messages.json`), 'utf8'));
  check(messages.appDescription.message.length <= 132, `${locale} summary is at most 132 characters`);
}
