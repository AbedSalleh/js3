import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so a `npm run build` drops straight onto any static host
  // (GitHub Pages, itch.io, Netlify) without a path rewrite.
  base: './',
  build: { outDir: 'dist', target: 'es2022' },
});
