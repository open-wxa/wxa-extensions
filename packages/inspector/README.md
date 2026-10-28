# @open-wxa/wxa-inspector

[wxa-runner](https://github.com/open-wxa/wxa-runner) 扩展：在页面上点选元素，直接在编辑器打开对应源码的那一行。

```bash
pnpm add -D wxa-runner @open-wxa/wxa-inspector
npx wxa-runner dev ./miniprogram --extension @open-wxa/wxa-inspector
# → http://localhost:3000/__wxa-inspector__/
```

在打开的页面上按 `Alt+Shift+C`（或点右下角的按钮）开始检查：悬停高亮元素并显示 `文件:行:列`，点击在编辑器打开那一行，`Esc` 退出。
按住 `Alt`（macOS 上是 `⌥`）点击则把源码位置复制到剪贴板，方便交给编程助手：第一行是绝对路径加行列，第二行是源码里这个元素的开始标签（跨行的合成一行）：

```
/path/to/project/src/components/story-card/index.vue:43:3
<view class="story-card" :class="{ 'story-card--completed': isCompleted }" @click="emit('click')" >
```

编辑器按正在运行的编辑器自动选择，也可以用环境变量 `LAUNCH_EDITOR` 指定（`code`、`cursor`、`webstorm`……）。

## uni-app

经 [`@open-wxa/unplugin-wxa-runner`](../unplugin#readme) 挂上，点选元素打开的是 `.vue` 源码的行列：

```ts
// vite.config.ts
import wxaRunner from '@open-wxa/unplugin-wxa-runner/vite';
import wxaInspector from '@open-wxa/wxa-inspector';

export default defineConfig({
  plugins: [uni(), wxaRunner({ extensions: [wxaInspector()] })]
});
```

`extensions` 要传 `wxaInspector()` 调用后得到的扩展，不能传包名字符串。
构建时给 `.vue` 模板的元素加上 `data-wxa-src` 标记（只在开发构建、不改源文件），用的是项目自己的 `vue/compiler-sfc`。

## 注意

- 需要 wxa-runner 0.9.0 及以上。
- 支持原生小程序和 uni-app（Vue 3 + Vite），Taro 还不支持。
- uni-app 里 `node_modules` 下的组件不加标记，点到组件内部时打开页面里使用它的那一行；
  组件开了 `virtualHost`（如 wot-design-uni）时页面上没有组件标签，打开的是它外层的元素。
- `<template src>`、pug 等非 HTML 写法的模板不加标记。

## 许可证

MIT
