import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/cli/main.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outdir: 'dist',
  packages: 'external',
  target: 'node22',
  sourcemap: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
});

console.log('Build complete.');
