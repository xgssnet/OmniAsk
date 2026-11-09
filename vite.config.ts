import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin, type UserConfig } from 'vite';
import { createManifest } from './src/shared/manifest';

const rootDir = fileURLToPath(new URL('.', import.meta.url));
const fromRoot = (...paths: string[]) => resolve(rootDir, ...paths);

/**
 * MV3 需要三类产物：
 * 1. pages   - 多 HTML 入口（popup / sidepanel / app），普通 ESM 打包
 * 2. background / content - 必须单文件 IIFE（Content Script 不支持 ESM import）
 * 通过 --mode 切换，三次构建写入同一个 dist。
 */
function manifestPlugin(): Plugin {
  return {
    name: 'omniask:manifest',
    apply: 'build',
    closeBundle() {
      const pkg = JSON.parse(
        readFileSync(fromRoot('package.json'), 'utf8'),
      ) as { version: string };
      mkdirSync(fromRoot('dist'), { recursive: true });
      writeFileSync(
        fromRoot('dist', 'manifest.json'),
        `${JSON.stringify(createManifest(pkg.version), null, 2)}\n`,
        'utf8',
      );
    },
  };
}

function scriptConfig(entry: string, fileName: string, name: string): UserConfig {
  return {
    publicDir: false,
    build: {
      outDir: 'dist',
      emptyOutDir: false,
      lib: {
        entry: fromRoot(entry),
        name,
        formats: ['iife'],
        fileName: () => fileName,
      },
    },
  };
}

const pagesConfig: UserConfig = {
  base: './',
  plugins: [react(), manifestPlugin()],
  resolve: {
    alias: { '@': fromRoot('src') },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: fromRoot('popup.html'),
        sidepanel: fromRoot('sidepanel.html'),
        app: fromRoot('app.html'),
      },
    },
  },
};

export default defineConfig(({ mode }) => {
  if (mode === 'background') {
    return scriptConfig('src/background/index.ts', 'background.js', 'OmniAskBackground');
  }
  if (mode === 'content') {
    return scriptConfig('src/content/index.ts', 'content.js', 'OmniAskContent');
  }
  return pagesConfig;
});
