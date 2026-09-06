import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createRequire } from 'node:module';
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);

/**
 * onnxruntime-web ships its wasm/jsep binaries next to its dist bundle and, by
 * default, transformers.js loads them from a CDN. An MV3 extension page may not
 * fetch remote scripts, so the binaries are copied into the package and pointed
 * at with `env.backends.onnx.wasm.wasmPaths` at runtime (see transcription/worker.ts).
 */
function copyOnnxRuntime(): Plugin {
  return {
    name: 'copy-onnxruntime-wasm',
    apply: 'build' as const,
    // onnxruntime references its binaries through `new URL(..., import.meta.url)`,
    // which makes Vite emit a second, hashed copy of the same 20 MB file. The
    // runtime never reads it — wasmPaths points at dist/ort — so drop it.
    generateBundle(_options, bundle) {
      for (const name of Object.keys(bundle)) {
        if (/ort-wasm.*\.wasm$/.test(name)) delete bundle[name];
      }
    },
    closeBundle() {
      let ortDist: string;
      try {
        ortDist = dirname(require.resolve('onnxruntime-web'));
      } catch {
        this.warn('onnxruntime-web not found — transcription will not run until deps are installed.');
        return;
      }
      const target = resolve(__dirname, 'dist/ort');
      mkdirSync(target, { recursive: true });
      for (const file of readdirSync(ortDist)) {
        if (/^ort-.*\.(wasm|mjs)$/.test(file)) copyFileSync(`${ortDist}/${file}`, `${target}/${file}`);
      }
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), copyOnnxRuntime()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'esnext',
    sourcemap: false,
    chunkSizeWarningLimit: 4096,
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, 'sidepanel.html'),
        offscreen: resolve(__dirname, 'offscreen.html'),
        'service-worker': resolve(__dirname, 'src/background/service-worker.ts'),
        'tap-worklet': resolve(__dirname, 'src/audio/tap-worklet.ts'),
        overlay: resolve(__dirname, 'src/content/overlay.ts'),
        // Dev-only pages: a DSP harness and a side panel preview with scripted
        // states. Neither reaches a production build.
        ...(mode === 'development'
          ? {
              harness: resolve(__dirname, 'harness.html'),
              preview: resolve(__dirname, 'preview.html'),
              'store-preview': resolve(__dirname, 'store-preview.html'),
            }
          : {}),
      },
      output: {
        // The service worker, the AudioWorklet module and the injected overlay
        // are referenced by fixed paths, so they may not be hashed.
        entryFileNames: (chunk) =>
          chunk.name === 'service-worker' || chunk.name === 'tap-worklet' || chunk.name === 'overlay'
            ? '[name].js'
            : 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  worker: { format: 'es' },
}));
