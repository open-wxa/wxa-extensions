import { defineConfig } from 'tsup';

export default defineConfig([
  // Node 端：inspector() 与中间件
  {
    entry: { index: 'src/index.ts' },
    format: ['cjs', 'esm'],
    platform: 'node',
    target: 'node18',
    dts: true,
    sourcemap: true,
    shims: true
  },
  // 浏览器端：注入每个渲染层页面的运行时，单个 IIFE，由中间件按 /__wxa-inspector__/runtime.js 提供
  {
    entry: { runtime: 'src/runtime/index.ts' },
    format: ['iife'],
    platform: 'browser',
    target: 'es2020',
    sourcemap: true,
    outExtension: () => ({ js: '.js' })
  }
]);
