import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    entry: { index: 'src/index.ts', vite: 'src/vite.ts', webpack: 'src/webpack.ts' },
    // 框架项目的 vite.config 常被打包成 CJS 再加载，所以同时出 CJS
    format: ['esm', 'cjs'],
    platform: 'node',
    target: 'node20',
    dts: true,
    sourcemap: true
  }
});
