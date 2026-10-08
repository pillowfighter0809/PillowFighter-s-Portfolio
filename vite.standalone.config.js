import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// A self-contained copy can run directly from a local HTML file, even offline.
export default defineConfig({
  publicDir: false,
  plugins: [
    {
      name: 'inline-game-icon',
      transformIndexHtml(html) {
        const icon = readFileSync(new URL('./public/favicon.svg', import.meta.url), 'utf8');
        return html.replace('/favicon.svg', `data:image/svg+xml,${encodeURIComponent(icon)}`);
      },
    },
    viteSingleFile(),
  ],
  build: { outDir: 'standalone' },
});
