import { mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const pkg = JSON.parse(await import('node:fs').then(({ readFileSync }) => readFileSync(resolve(ROOT, 'package.json'), 'utf8')));
const releaseDir = resolve(ROOT, 'release');
const archive = resolve(releaseDir, `tab-subtitles-${pkg.version}.zip`);

mkdirSync(releaseDir, { recursive: true });
rmSync(archive, { force: true });
const result = spawnSync('zip', ['-qr', archive, '.'], { cwd: resolve(ROOT, 'dist'), stdio: 'inherit' });
if (result.status !== 0) throw new Error('zip failed');
console.log(`✓ ${archive}`);
