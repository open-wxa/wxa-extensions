# wxa-inspector

> 在 [wxa-runner](https://github.com/open-wxa/wxa-runner) 里点选小程序页面上的元素，直接在编辑器打开对应源码的那一行。

**状态：设计阶段，还没有可用的代码。** 架构与决策见 [PROJECT_DESIGN.md](./PROJECT_DESIGN.md)，需要 wxa-runner 配合新增的扩展点见 [docs/runner-extensions.md](./docs/runner-extensions.md)，原生小程序的技术预演任务见 [docs/native-spike.md](./docs/native-spike.md)。

## 计划中的用法

原生小程序：

```bash
pnpm add -D wxa-runner @open-wxa/wxa-inspector
npx wxa-runner dev ./miniprogram --inspect
# → http://localhost:3000/__wxa-inspector__/
```

uni-app（Vue 3 + Vite）：一条 `dev:mp-weixin` 同时完成监听构建和启动 wxa-runner，不用再开第二个终端。

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

## 许可证

MIT
