import * as path from 'node:path';
import { defineConfig } from '@rspress/core';

export default defineConfig({
  root: path.join(__dirname, 'docs'),
  title: 'Dialogue',
  description: 'Event-based realtime communication library built on Socket.IO, Hono, and Bun',
  icon: '/rspress-icon.png',
  logoText: 'Dialogue',
  themeConfig: {
    socialLinks: [
      {
        icon: 'github',
        mode: 'link',
        content: 'https://github.com/Hussseinkizz/dialogue',
      },
    ],
    // Built-in search is enabled by default
    search: true,
  },
  markdown: {
    showLineNumbers: true,
    shiki: {
      theme: 'vitesse-dark',
    },
  },
});
