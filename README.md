# wxa-inspector

> 在 [wxa-runner](https://github.com/open-wxa/wxa-runner) 里点选小程序页面上的元素，直接在编辑器打开对应源码的那一行。

**状态：原生小程序已经可用，但还没发布到 npm**，依赖的 wxa-runner 扩展点也还没发版。uni-app 支持和 Elements 面板还没开始。
架构与决策见 [PROJECT_DESIGN.md](./PROJECT_DESIGN.md)，wxa-runner 的扩展点见 [docs/runner-extensions.md](./docs/runner-extensions.md)，
依赖的基础库行为见 [docs/base-library.md](./docs/base-library.md)。

## 用法

原生小程序：

```bash
pnpm add -D wxa-runner @open-wxa/wxa-inspector
npx wxa-runner dev ./miniprogram --extension @open-wxa/wxa-inspector
# → http://localhost:3000/__wxa-inspector__/
```

uni-app（Vue 3 + Vite，计划中，还不能用）：一条 `dev:mp-weixin` 同时完成监听构建和启动 wxa-runner，不用再开第二个终端。

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import wxaInspector from '@open-wxa/wxa-inspector-uni'

export default defineConfig({
  plugins: [wxaInspector(), uni()],
})
```

打开终端打印的地址：

- 左边是 wxa-runner 运行的小程序，右边是面板（Elements 树、页面栈、构建错误）
- 打开检查器（工具栏按钮或 `Alt+Shift+C`），悬停高亮元素并显示 `文件:行:列`，点击后在编辑器打开

Console、Network、Sources 继续用 Chrome DevTools，wxa-inspector 不重复实现。

## 开发

```bash
pnpm install
pnpm build
pnpm test          # 单测
pnpm lint && pnpm typecheck

# E2E：真实的 wxa-runner + Chrome。WXA_RUNNER_DIR 指向带扩展点、已 pnpm build 的 wxa-runner 仓库
WXA_RUNNER_DIR=../wxa-runner pnpm test:e2e
WXA_BASELIB=2.32.3 WXA_RUNNER_DIR=../wxa-runner pnpm test:e2e   # 换基础库版本

# 手动试用：用示例项目启动
node ../wxa-runner/packages/cli/bin/wxa-runner.js dev tests/fixtures/native --extension @open-wxa/wxa-inspector --open
```

## 许可证

MIT
