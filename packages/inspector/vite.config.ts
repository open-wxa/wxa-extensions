import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: [
    // Node 端：inspector() 与中间件。wxa-runner 的命令行是 CommonJS，用 require 加载，所以同时出 CJS
    {
      entry: { index: 'src/index.ts' },
      format: ['esm', 'cjs'],
      platform: 'node',
      target: 'node18',
      dts: true,
      sourcemap: true,
      // ESM 产物里也有 __dirname，中间件用它找 runtime.js
      shims: true
    },
    // 浏览器端：注入每个渲染层页面的运行时，单个 IIFE，产物是 dist/runtime.iife.js，由中间件按 /__wxa-inspector__/runtime.js 提供
    {
      entry: { runtime: 'src/runtime/index.ts' },
      format: 'iife',
      platform: 'browser',
      target: 'es2020',
      sourcemap: true,
      // 两份配置输出到同一个 dist，只在第一份里清理
      clean: false
    }
  ]
});
