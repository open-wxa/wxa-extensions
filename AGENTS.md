# wxa-extensions

[wxa-runner](https://github.com/open-wxa/wxa-runner) 的扩展与构建插件。`CLAUDE.md` 是指向本文件的软链，只维护这一份。

| 包                              | 目录                 | 作用                                                                           |
| ------------------------------- | -------------------- | ------------------------------------------------------------------------------ |
| `@open-wxa/wxa-inspector`       | `packages/inspector` | runner 扩展：悬停高亮小程序页面元素，点击在编辑器打开源码的行列                |
| `@open-wxa/unplugin-wxa-runner` | `packages/unplugin`  | 构建插件（`/vite`、`/webpack`）：框架监听构建微信小程序时启动 runner，可挂扩展 |

状态：都没有发布到 npm。检查器支持原生小程序和 uni-app（Vue 3 + Vite）；Taro、Elements 树 / 页面栈面板还没做。构建插件在 uni-app（Vue 3 + Vite）上验证过，Taro 没有验证。
wxa-runner 0.9.0 起支持扩展（`--extension`、`DevServer({ extensions })`）。

## 命令

开发需要 Node 22.18 及以上。工具链是 Vite+（`vp`），配置在根目录 `vite.config.ts`。

```bash
pnpm build      # 各包 vp pack
pnpm check      # 格式、lint、类型检查；pnpm exec vp check --fix 自动修格式
pnpm test       # 单测 tests/unit
pnpm test:e2e   # 真实 wxa-runner（默认 npm 上的版本，WXA_RUNNER_DIR 可指向本地已 build 的 runner 仓库）+ Chrome，WXA_BASELIB 换基础库
```

提交信息按 Conventional Commits 写，描述用中文，如 `fix: …`、`feat: …`。PR 只能 squash 合并，PR 标题会成为 main 上的提交信息，也要按这个规范写。代码注释用中文，风格跟随周围代码。

两个包独立发版：release-please 按提交开发布 PR，合并后 `.github/workflows/release.yml` 用 Trusted Publishing 执行 `scripts/release.mjs`，流程见 [CONTRIBUTING.md](./CONTRIBUTING.md#发布)。
新增包时要同步改 `release-please-config.json`、`.release-please-manifest.json`，以及 `scripts/release.mjs` 的 `PACKAGE_DIRS`、`SMOKE_TESTS`。

## 和 wxa-runner 的关系

- 扩展通过 runner 公开的约定 `DevServerExtension` 接入：`setup({ projectPath, root })` 返回 `webviewScripts`、`middlewares`、`wxmlTransform`、`entry`。扩展点的细节见 [docs/runner-extensions.md](./docs/runner-extensions.md)。
- 双向解耦：runner 不认识具体扩展；扩展不依赖 runner，扩展的形状在扩展里按约定自己声明。新的开发工具（如网络面板）按同样方式做成扩展，能和检查器同时加载。
- 术语：runner 里「插件」指小程序插件，「devtools」指微信开发者工具，所以这里叫扩展（extension），也不用 devtools 命名。

## 检查器（`packages/inspector`）

```
src/index.ts            wxaInspector(options?) → 扩展；instrumentSource（构建插件调用，uni + Vite 时给 .vue 打标记）、options.openEditor（测试替换）
src/transform/          instrumentWxml.ts（wxml 插桩）、instrumentVue.ts（.vue 模板插桩）、FileIdRegistry.ts（文件 ↔ 短 id）
src/server/             middleware.ts（/__wxa-inspector__/ 下的接口）、shell.ts（壳页面）、openEditor.ts（launch-editor）
src/runtime/            注入渲染层页面的运行时：index.ts（事件拦截、消息）、Overlay.ts（高亮层）、locate.ts（读 __wxElement）
```

### 源码标记

- 属性 `data-wxa-src="<fileId>:<line>:<col>"`，fileId → 路径的映射经 `/__wxa-inspector__/manifest` 下发。
- 属性插在标签名之后、同一行，**插入后行号不变**；只改送给编译器的内容，**不改用户源文件**；只在开发时插桩，生产产物没有标记。
- 原生项目：runner 的 `wxmlTransform`（wxml 送进 wcc 之前）。给普通元素和自定义组件标签加；不给 `block`、`template`、`import`、`include`、`wxs`、`slot` 和 `miniprogram_npm/` 下的文件加。
  `<template name>` 里的元素按定义它的文件标记。
- wxml 用只找开始标签的扫描器处理，不用通用 HTML 解析器：`{{ }}` 和 `<wxs>` 里可能有 `<`、`>`；没闭合的 `{{` 当普通文本；已有 `data-wxa-src` 的元素不重复加。
- uni-app：构建插件在构建开始时调用扩展的 `instrumentSource({ root, framework, bundler })`，之后用 `load` 钩子把项目里的 `.vue` 原文件交给它。
  返回了插桩方法就是上游打标记：registry 与 setup 共用、监听期间不清空，setup 不再注册 `wxmlTransform`，源码根目录是项目根，不按组件路径兜底（组件路径是产物路径，对不上源码）。
  Taro、webpack 返回 null，按原生项目处理产物。
- `.vue` 用 `load` 读磁盘原文件，不用 `transform`：@uni-ku/root 等前置插件会在模板前插行，行号就对不上了。
  原文件还没经过 uni 的条件编译，各平台分支里的标签可能不配对、Vue 解析会报错，所以不建树：compiler-sfc（从项目里加载，版本与项目一致）只取 `<template>` 块范围，块内用 Vue 版的开始标签扫描器。
  与 wxml 扫描器的区别：标签名可以带点号，引号里的 `{{` 是普通字符，`v-pre` 里的 `{{` 不是插值，`:data-wxa-src` 也算已有标记。
  另外不给 `page-meta`、`navigation-bar` 和 @uni-ku/root 的 `KuRootView` 加标记（它按原文换成 `<slot />`）；`<template src>`、pug 等写法整个文件不处理。
- uni 的模板编译器会把静态 `data-wxa-src` 原样带进 wxml（普通元素、`v-for`、`<template v-if>` 里、自定义组件都保留），不进组件 props。
  `node_modules` 下的组件不打标记，点到内部时命中页面里的组件标签；开了 `virtualHost` 的组件（如 wot-design-uni）没有宿主节点，命中外层元素。

### 命中与兜底

鼠标下的元素 → `__wxElement.dataset.wxaSrc` → 没有就向上找最近带标记的祖先 → 仍没有就按所属自定义组件打开对应 `.wxml`（只有原生项目，只到文件）。
高亮框画在**找到标记的元素**上，不是鼠标下的元素。`__wxElement` 是基础库内部 API，访问只放在 `runtime/locate.ts`，实测行为见 [docs/base-library.md](./docs/base-library.md)。

### 浏览器端

- 壳页面 `/__wxa-inspector__/`：iframe 铺满整页、指向 runner 根路径（查询参数透传）；右下角悬浮检查按钮，上方是状态气泡（成功 2.5 秒、失败 6 秒后收起，文字保留），编译失败时顶部浮出可关闭的错误卡片、按钮上显示红点。不用紫色，高亮用 DevTools 式的蓝色。构建错误先读 `/__wxa__/app-info.json` 的 `buildError`，再听 `/__wxa__/ws` 的 `error` / `hot` / `reload`。
- 运行时经 `webviewScripts`（`position: 'head'`）注入每个页面 iframe。**事件拦截必须在基础库之前注册**：在 window 捕获阶段拦 touch 系列和 `click`，监听在加载时注册、开关只改行为，否则基础库 2.x 拦不住。
- 开关状态只存在壳页面，运行时发 `hello` 要状态、收 `state` 广播；跨 iframe 消息都校验同源。快捷键 `Alt+Shift+C`，`Esc` 退出。
- 只有一个检查模式：点击打开源码，按住 Alt（⌥）点击复制「绝对路径:行:列」和源码里那个元素的开始标签（`/locate` 按行列从源文件截取，跨行合成一行）。
  不用页面上渲染出的文字：那是数据绑定的结果，源码里没有，交给编程助手反而误导。
  剪贴板在渲染层页面里写：点击发生在那里，只有那个 frame 有用户激活和焦点。
- 高亮层画在页面 iframe 内（`position: fixed`、`pointer-events: none`），不跨 iframe 换算坐标。

### Node 端接口与安全

| 路径                                | 作用                                                                          |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| `GET /__wxa-inspector__/`           | 壳页面                                                                        |
| `GET /__wxa-inspector__/runtime.js` | 注入页面的运行时（`dist/runtime.iife.js`）                                    |
| `GET /__wxa-inspector__/manifest`   | fileId → 相对源码根目录的路径                                                 |
| `POST /__wxa-inspector__/open`      | `{ id, line, col }` 或 `{ component }`，打开编辑器，返回位置或失败原因        |
| `POST /__wxa-inspector__/locate`    | 同 `/open` 的请求体，不打开编辑器，返回位置、绝对路径和开始标签原文（复制用） |

`/open` 会在本机启动进程，`/locate` 返回本机绝对路径，两者共用以下规则，**不能放松**：只接受 `POST` + `application/json`；`Sec-Fetch-Site` 为 `same-origin` 且 `Origin` 与 `Host` 一致；请求来自本机回环地址；
解析出的文件必须在源码根目录下且存在。越界或来源不对返回 403，fileId 不存在返回 404，编辑器打开失败返回 500 和原因。
`launch-editor` 只在失败时回调，等 300ms 没报错就算打开成功。

## 构建插件（`packages/unplugin`）

```
src/index.ts             unplugin 工厂：启用判断、启动 runner、打印启动信息
src/loadRunner.ts        动态加载 @open-wxa/wxa-runner-core（对等依赖），单独成模块便于测试替换
src/instrumentSource.ts  把项目源码交给扩展插桩，与构建工具无关（Vite 经 load 钩子调用，webpack 还没接）
src/vite.ts              unplugin.vite
src/webpack.ts           unplugin.webpack
```

- 只在**监听构建 + 微信小程序**时启用：`UNI_PLATFORM === 'mp-weixin'` 或 `TARO_ENV === 'weapp'`；Vite 看 `build.watch`、产物目录取 `build.outDir`；webpack 看 `watchRun` 是否触发、产物目录取 `compiler.outputPath`。
- 首次 `writeBundle` 且产物目录已有 `app.json` 时，以产物目录启动 `DevServer`，按 runner 命令行的格式打印地址和扩展入口；停止监听（`closeWatcher` / `watchClose`）时 `close()`。
- 启动后不再介入：产物变化交给 runner 默认的 `watch: true`（按内容指纹过滤 uni 的整批重写，120ms 防抖，再决定热更新或整页刷新）。不用 `watch: 'manual'` + `invalidate()`，除非遇到刷新到半成品。
- 选项原样透传给 `DevServer`（`projectPath`、`watch` 除外），`forwardConsole` 默认 `'errors'`，与 runner 命令行一致。setup 文件默认在项目根目录找、相对路径也相对项目根目录（runner 默认在产物目录找）。
- `extensions` 交给 runner；runner 低于 0.9.0 会静默忽略它，所以插件检查 `extensionEntries` 是否存在，不存在时提示升级。
- 扩展可以提供 `instrumentSource(context)`：启用时（configResolved）调用一次，`context` 带项目根目录、`framework`（uni / taro）、`bundler`（vite / webpack）。
  Vite 的 `load` 钩子用 `order: 'pre'` 先于其他插件读原文件，只交出项目根目录下、node_modules 以外、不带查询参数的真实文件，每个文件交给第一个 `include` 匹配的扩展。
  Vite 的模块 id 解析过软链接，所以项目根目录先取真实路径再比较、再交给扩展。
  只把这一个钩子提前：整个插件 `enforce: 'pre'` 的话 `writeBundle` 会跑在 uni 写出 app.json 之前。
  uni 的监听构建（`uni`、`uni build --watch`）都把 NODE_ENV 设为 development，`--mode` 只决定 env 文件，所以不按 `config.mode` 判断开发构建。
- **不能中断框架的编译**：runner 加载失败、启动失败、扩展插桩出错只在终端打印原因。
- 包是 ESM + CJS（框架项目的 `vite.config` 常被打包成 CJS 再加载）；unplugin 3 是纯 ESM，所以要求 Node 20.19 / 22.12 及以上。

## 范围与取舍

- 不做：Console / Network / Sources（Chrome DevTools 原生可用）；Vue 组件状态 / Pinia（要在逻辑层装探针）。
- 用编译期标记，不用 Vue DevTools 那种运行时定位：渲染层 DOM 和 Vue 实例不在同一个 frame，渲染层没有 `__vueParentComponent`。
- 给 runner 加通用扩展点，不做反向代理，也不借用户的 `setup` 文件注入；不给检查器做自己的 CLI（要转发 runner 的全部选项，会持续漂移）。
- 构建插件不按框架分包（不叫 `-uni`、`-taro`），也不并进检查器：它只负责接入 runner，扩展经 `extensions` 挂上。框架源码的插桩由扩展经 `instrumentSource` 提供，构建插件只负责调用；以后支持 Taro 时，扩展按 `framework` / `bundler` 返回插桩方法，构建插件给 webpack 接上读文件的环节。
