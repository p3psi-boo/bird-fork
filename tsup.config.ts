import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/cli.ts'],
    format: ['esm'],
    target: 'node22',
    outDir: 'dist',
    bundle: true,
    minify: false,
    sourcemap: true,
    splitting: false,
    clean: false,
    banner: {
      js: '#!/usr/bin/env node',
    },
    external: ['@steipete/sweet-cookie'],
    noExternal: ['commander', 'kleur', 'json5', 'feedsmith'],
  },
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    target: 'node22',
    outDir: 'dist',
    bundle: false,
    sourcemap: true,
    splitting: false,
    clean: false,
    dts: false,
  },
]);
