# wxa-extensions

[wxa-runner](https://github.com/open-wxa/wxa-runner) 的扩展与构建插件。`CLAUDE.md` 是指向本文件的软链，只维护这一份。

| 包                              | 目录                 | 作用                                                                           |
| ------------------------------- | -------------------- | ------------------------------------------------------------------------------ |
| `@open-wxa/wxa-inspector`       | `packages/inspector` | runner 扩展：悬停高亮小程序页面元素，点击在编辑器打开源码的行列                |
| `@open-wxa/unplugin-wxa-runner` | `packages/unplugin`  | 构建插件（`/vite`、`/webpack`）：框架监听构建微信小程序时启动 runner，可挂扩展 |

状态：都没有发布到 npm。检查器支持原生小程序；uni-app 的 `.vue` 插桩、Elements 树 / 页面栈面板还没做。构建插件在 uni-app（Vue 3 + Vite）上验证过，Taro 没有验证。
wxa-runner 0.9.0 起支持扩展（`--extension`、`DevServer({ extensions })`）。

## 命令

开发需要 Node 22.18 及以上。工具链是 Vite+（`vp`），配置在根目录 `vite.config.ts`。

```bash
pnpm build      # 各包 vp pack
pnpm check      # 格式、lint、类型检查；pnpm exec vp check --fix 自动修格式
pnpm test       # 单测 tests/unit
pnpm test:e2e   # 真实 wxa-runner + Chrome，需要 WXA_RUNNER_DIR 指向已 build 的 wxa-runner 仓库，可用 WXA_BASELIB 换基础库
```

提交信息按 Conventional Commits 写，描述用中文，如 `fix: …`、`feat: …`。代码注释用中文，风格跟随周围代码。

两个包独立发版：release-please 按提交开发布 PR，合并后 `.github/workflows/release.yml` 用 Trusted Publishing 执行 `scripts/release.mjs`，流程见 [CONTRIBUTING.md](./CONTRIBUTING.md#发布)。
新增包时要同步改 `release-please-config.json`、`.release-please-manifest.json`，以及 `scripts/release.mjs` 的 `PACKAGE_DIRS`、`SMOKE_TESTS`。

## 和 wxa-runner 的关系

- 扩展通过 runner 公开的约定 `DevServerExtension` 接入：`setup({ projectPath, root })` 返回 `webviewScripts`、`middlewares`、`wxmlTransform`、`entry`。扩展点的细节见 [docs/runner-extensions.md](./docs/runner-extensions.md)。
- 双向解耦：runner 不认识具体扩展；扩展不依赖 runner，扩展的形状在扩展里按约定自己声明。新的开发工具（如网络面板）按同样方式做成扩展，能和检查器同时加载。
- 术语：runner 里「插件」指小程序插件，「devtools」指微信开发者工具，所以这里叫扩展（extension），也不用 devtools 命名。

## 检查器（`packages/inspector`）

```
src/index.ts            wxaInspector(options?) → 扩展；options.openEditor（测试替换）、options.external（上游已打标记时传 registry 与 sourceRoot）
src/transform/          instrumentWxml.ts（wxml 插桩）、FileIdRegistry.ts（文件 ↔ 短 id）
src/server/             middleware.ts（/__wxa-inspector__/ 下的接口）、shell.ts（壳页面）、openEditor.ts（launch-editor）
src/runtime/            注入渲染层页面的运行时：index.ts（事件拦截、消息）、Overlay.ts（高亮层）、locate.ts（读 __wxElement）
```

### 源码标记

- 属性 `data-wxa-src="<fileId>:<line>:<col>"`，fileId → 路径的映射经 `/__wxa-inspector__/manifest` 下发。
- 属性插在标签名之后、同一行，**插入后行号不变**；只改送给编译器的内容，**不改用户源文件**；只在开发时插桩，生产产物没有标记。
- 原生项目：runner 的 `wxmlTransform`（wxml 送进 wcc 之前）。给普通元素和自定义组件标签加；不给 `block`、`template`、`import`、`include`、`wxs`、`slot` 和 `miniprogram_npm/` 下的文件加。
  `<template name>` 里的元素按定义它的文件标记。
- wxml 用只找开始标签的扫描器处理，不用通用 HTML 解析器：`{{ }}` 和 `<wxs>` 里可能有 `<`、`>`；没闭合的 `{{` 当普通文本；已有 `data-wxa-src` 的元素不重复加。
- uni-app（未做）：计划在构建时用 `@vue/compiler-sfc` 解析 `.vue` 模板，按源码偏移插入，再以 `external` 把 registry 交给检查器。源码根目录是项目根，不是产物目录。

### 命中与兜底

鼠标下的元素 → `__wxElement.dataset.wxaSrc` → 没有就向上找最近带标记的祖先 → 仍没有就按所属自定义组件打开对应 `.wxml`（只有原生项目，只到文件）。
高亮框画在**找到标记的元素**上，不是鼠标下的元素。`__wxElement` 是基础库内部 API，访问只放在 `runtime/locate.ts`，实测行为见 [docs/base-library.md](./docs/base-library.md)。

### 浏览器端

- 壳页面 `/__wxa-inspector__/`：iframe 铺满整页、指向 runner 根路径（查询参数透传）；右下角悬浮检查按钮，上方是状态气泡（成功 2.5 秒、失败 6 秒后收起，文字保留），编译失败时顶部浮出可关闭的错误卡片、按钮上显示红点。不用紫色，高亮用 DevTools 式的蓝色。构建错误先读 `/__wxa__/app-info.json` 的 `buildError`，再听 `/__wxa__/ws` 的 `error` / `hot` / `reload`。
- 运行时经 `webviewScripts`（`position: 'head'`）注入每个页面 iframe。**事件拦截必须在基础库之前注册**：在 window 捕获阶段拦 touch 系列和 `click`，监听在加载时注册、开关只改行为，否则基础库 2.x 拦不住。
- 开关状态只存在壳页面，运行时发 `hello` 要状态、收 `state` 广播；跨 iframe 消息都校验同源。快捷键 `Alt+Shift+C`，`Esc` 退出。
- 高亮层画在页面 iframe 内（`position: fixed`、`pointer-events: none`），不跨 iframe 换算坐标。

### Node 端接口与安全

| 路径                                | 作用                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------- |
| `GET /__wxa-inspector__/`           | 壳页面                                                                 |
| `GET /__wxa-inspector__/runtime.js` | 注入页面的运行时（`dist/runtime.iife.js`）                             |
| `GET /__wxa-inspector__/manifest`   | fileId → 相对源码根目录的路径                                          |
| `POST /__wxa-inspector__/open`      | `{ id, line, col }` 或 `{ component }`，打开编辑器，返回位置或失败原因 |

`/open` 会在本机启动进程，以下规则**不能放松**：只接受 `POST` + `application/json`；`Sec-Fetch-Site` 为 `same-origin` 且 `Origin` 与 `Host` 一致；请求来自本机回环地址；
解析出的文件必须在源码根目录下且存在。越界或来源不对返回 403，fileId 不存在返回 404，编辑器打开失败返回 500 和原因。
`launch-editor` 只在失败时回调，等 300ms 没报错就算打开成功。

## 构建插件（`packages/unplugin`）

```
src/index.ts       unplugin 工厂：启用判断、启动 runner、打印启动信息
src/loadRunner.ts  动态加载 @open-wxa/wxa-runner-core（对等依赖），单独成模块便于测试替换
src/vite.ts        unplugin.vite
src/webpack.ts     unplugin.webpack
```

- 只在**监听构建 + 微信小程序**时启用：`UNI_PLATFORM === 'mp-weixin'` 或 `TARO_ENV === 'weapp'`；Vite 看 `build.watch`、产物目录取 `build.outDir`；webpack 看 `watchRun` 是否触发、产物目录取 `compiler.outputPath`。
- 首次 `writeBundle` 且产物目录已有 `app.json` 时，以产物目录启动 `DevServer`，按 runner 命令行的格式打印地址和扩展入口；停止监听（`closeWatcher` / `watchClose`）时 `close()`。
- 启动后不再介入：产物变化交给 runner 默认的 `watch: true`（按内容指纹过滤 uni 的整批重写，120ms 防抖，再决定热更新或整页刷新）。不用 `watch: 'manual'` + `invalidate()`，除非遇到刷新到半成品。
- 选项原样透传给 `DevServer`（`projectPath`、`watch` 除外），`forwardConsole` 默认 `'errors'`，与 runner 命令行一致。setup 文件默认在项目根目录找、相对路径也相对项目根目录（runner 默认在产物目录找）。
- `extensions` 交给 runner；runner 低于 0.9.0 会静默忽略它，所以插件检查 `extensionEntries` 是否存在，不存在时提示升级。
- **不能中断框架的编译**：runner 加载失败、启动失败只在终端打印原因。
- 包是 ESM + CJS（框架项目的 `vite.config` 常被打包成 CJS 再加载）；unplugin 3 是纯 ESM，所以要求 Node 20.19 / 22.12 及以上。

## 范围与取舍

- 不做：Console / Network / Sources（Chrome DevTools 原生可用）；Vue 组件状态 / Pinia（要在逻辑层装探针）。
- 用编译期标记，不用 Vue DevTools 那种运行时定位：渲染层 DOM 和 Vue 实例不在同一个 frame，渲染层没有 `__vueParentComponent`。
- 给 runner 加通用扩展点，不做反向代理，也不借用户的 `setup` 文件注入；不给检查器做自己的 CLI（要转发 runner 的全部选项，会持续漂移）。
- 构建插件不按框架分包（不叫 `-uni`、`-taro`），也不并进检查器：它只负责接入 runner，扩展经 `extensions` 挂上。uni 用检查器还需要构建时的 `.vue` 插桩，计划让扩展带上自己的构建钩子，由构建插件合并。
