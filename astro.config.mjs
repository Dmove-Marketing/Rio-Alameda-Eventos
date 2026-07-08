import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  prefetch: true,
  build: {
    inlineStylesheets: 'auto',
  },
  server: {
    port: 4321,
  },
  image: {
    domains: ['media.dmove.com.br'],
  },
});
