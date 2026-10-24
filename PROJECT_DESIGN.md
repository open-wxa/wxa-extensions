# wxa-inspector 设计文档

这份文档写给参与开发的人：wxa-inspector 要做什么、整体怎么组织、关键取舍的理由。
需要 wxa-runner 新增的扩展点单独写在 [docs/runner-extensions.md](./docs/runner-extensions.md)。

状态：设计已确认，未开工。

---

## 目标

1. **点选打开源码**：在 wxa-runner 运行的小程序页面上悬停高亮元素，点击后在编辑器打开对应源码的**行列**。原生小程序跳到 `.wxml`，uni-app 跳到 `.vue`。
2. **uni-app 一条命令**：`dev:mp-weixin` 时由 Vite 插件拉起 wxa-runner，浏览器里直接看到运行效果，不再需要第二个终端。
3. **补 Chrome DevTools 看不到的部分**：面板提供 Elements 树（带源码位置）、页面栈、构建错误。

## 范围

- 支持：原生微信小程序；uni-app Vue 3 + Vite 的 `mp-weixin`（wxa-runner 只验证过 Vue 3 的 uni-app）。
- 不支持：uni-app Vue 2 / webpack、Taro 等其他框架（架构上留了口子，见「插桩来源」）。
- 不做：
  - Console / Network / Sources：逻辑层跑在 `appservice.html` frame 里，Chrome DevTools 原生可用；wxa-runner 已把 mock 的请求镜像到 Network 面板
  - Vue 组件状态 / Pinia：需要在逻辑层装探针，等同重写 [@uni-helper/devtools](https://github.com/uni-helper/devtools) 的 probes，与本项目定位冲突
- 生产零影响：插桩只在开发时启用，正式构建的产物不含任何标记。

---

## 设计依据

| 事实 | 影响 |
| --- | --- |
| wxa-runner 每个页面是一个**同源 iframe**，里面是基础库渲染出的真实 DOM（`wx-view`、`wx-canvas`…）；DOM 节点经 `element.__wxElement` 拿到基础库组件实例（wxa-runner 自己摆放 canvas 就是这么做的） | 检查器可以在页面 iframe 内完成命中和高亮 |
| 小程序逻辑层（Vue 实例所在）与渲染层（DOM 所在）分属不同 frame，渲染层 DOM 上**没有** `__vueParentComponent` | 不能照搬 Vue DevTools v9「DOM → Vue 实例」的运行时定位，改用编译期标记 |
| uni 的 `dev:mp-weixin` 是 `vite build --watch`，**没有 Vite dev server**，`configureServer` 不执行 | uni 插件挂不了 Vite 中间件，HTTP 能力借 wxa-runner 的服务器 |
| 原生项目的 wxml 就是源码，wxml → `wcc` 这一步在 wxa-runner 的 `AppBuilder` 里 | 原生项目在 runner 编译 wxml 前插桩即可，行列就是用户文件的真实位置 |
| wxa-runner 0.8.0 的 `DevServer` 只有 `start()` / `close()`；`setup` 文件是给用户 mock 用的配置槽位 | 需要给 runner 加通用扩展点；不借 setup 注入 |

---

## 整体结构

```
@open-wxa/wxa-inspector（核心，不绑框架）
  检查器运行时 · 壳页面 · Elements 面板 · 打开编辑器接口 · manifest 协议
        ▲                                   ▲
        │ inspector({ markers: 'external' }) │ inspector({ markers: 'wxml' })
        │                                   │
@open-wxa/wxa-inspector-uni           wxa-runner dev --inspect
（Vite 插件：.vue 层插桩，             （原生：wxml 编译钩子插桩，零配置）
  拉起 runner）
        │                                   │
        └──────────────► wxa-runner-core DevServer ◄──┘
                         webviewScripts · middlewares · wxmlTransform · watch:'manual' + invalidate()
```

两条路径的唯一差别是**谁来打标记**；检查器运行时、壳页面、`/open` 接口、manifest 只有一份实现。

### 包

| 包 | 作用 |
| --- | --- |
| `@open-wxa/wxa-inspector` | 核心。对外只暴露 `inspector(options)`，返回 DevServer 选项片段；包含浏览器端运行时与壳页面的静态资源 |
| `@open-wxa/wxa-inspector-uni` | uni-app 的 Vite 插件：`.vue` 模板插桩 + 管理 wxa-runner 生命周期 |

原生不单独出包：wxa-runner 的 CLI 在 `--inspect` 时动态 `import('@open-wxa/wxa-inspector')`。

### 集成入口：`inspector(options)`

```ts
export function inspector(options: {
  /** 小程序项目目录（与 DevServer 的 projectPath 相同） */
  projectPath: string
  /**
   * 'wxml'：原生项目，由 runner 编译 wxml 时插桩；
   * 'external'：标记已由上游打好（uni 插件在 .vue 层插桩），只提供运行时、面板与接口
   */
  markers: 'wxml' | 'external'
  /** markers 为 'external' 时由上游提供 fileId → 源文件绝对路径 */
  resolveFile?: (fileId: string) => string | undefined
}): Pick<DevServerOptions, 'webviewScripts' | 'middlewares' | 'wxmlTransform'>
```

三种用法都是把它展开进 `DevServer`：

| 场景 | 用法 |
| --- | --- |
| 原生 · 命令行 | `wxa-runner dev ./miniprogram --inspect`，CLI 内部 `new DevServer({ ...opts, ...inspector({ projectPath, markers: 'wxml' }) })` |
| 原生 · 代码调用（Playwright、自定义脚本） | `new DevServer({ projectPath, ...inspector({ projectPath, markers: 'wxml' }) })` |
| uni-app | `@open-wxa/wxa-inspector-uni` 启动 runner 时传 `inspector({ projectPath, markers: 'external', resolveFile })` |

依赖方向单向：inspector 只依赖 `@open-wxa/wxa-runner-core` 的类型；runner-core 不知道 inspector 的存在；runner CLI 把 inspector 当可选依赖，未安装时 `--inspect` 提示 `pnpm add -D @open-wxa/wxa-inspector`。

---

## 源码标记

### 格式

- 属性：`data-wxa-src="<fileId>:<line>:<col>"`，运行时从 `__wxElement.dataset.wxaSrc` 读取
- `fileId` 是短 id，id → 文件路径的映射表经 manifest 接口下发，避免 wxml 膨胀
- 属性插在标签名之后、与标签同一行，后续行号不变；只改送给编译器的内容，**不改用户源文件**

### 插桩来源

| 来源 | 位置 | 加标记 | 不加标记 |
| --- | --- | --- | --- |
| 原生（`markers: 'wxml'`） | runner 的 `wxmlTransform` 钩子，wxml 送进 `wcc` 之前 | 普通元素、自定义组件标签 | `block`、`template`、`import`、`include`、`wxs`、`slot`；`miniprogram_npm` 下的文件 |
| uni（`markers: 'external'`） | Vite 插件 `enforce: 'pre'` 的 transform，用 `@vue/compiler-sfc` 解析模板，按源码偏移插入属性 | 原生元素与 uni 内置组件（`view`、`text`、`image`、`button`…） | `template`、`slot`、`component`、自定义组件标签；`node_modules` |

- 原生 `<template name>` 里的元素按**定义它的文件**标记，经 `include` / `is` 展开后位置仍正确。
- wxml 解析需要带位置信息，候选 htmlparser2 + `withStartIndices`；`{{ }}` 表达式里的 `<`、`>` 可能需要单独处理。
- 标记会出现在业务事件的 `e.currentTarget.dataset` 里（多一个 `wxaSrc` 字段）。只在开发时插桩，属性名够冷门，可接受。
- 以后支持其他框架（Taro 等），只需新增一种插桩来源，传 `markers: 'external'`。

### 命中与兜底

1. 鼠标所在 DOM 元素 → `__wxElement` → `dataset.wxaSrc`
2. 没有标记（第三方组件、插件、uni 内置组件内部）→ 沿基础库节点树向上找最近带标记的祖先
3. 仍找不到 → 取所属自定义组件的路径（如 `components/foo/foo`），打开对应 `.wxml`（原生）——**组件级**，只到文件

`__wxElement` 是基础库内部 API，所有访问收敛在一个适配函数里，E2E 覆盖；不可用时检查器整体降级为禁用并在工具栏说明原因。

---

## 浏览器端

### 壳页面（`/__wxa-inspector__/`）

- 左：模拟器（iframe 指向 runner 根路径）；右：面板；顶部：工具栏（检查器开关）
- 构建错误：读 runner 的 `/__wxa__/app-info.json` 的 `buildError` 直接显示

### 检查器运行时

经 `webviewScripts` 注入每个页面 iframe（包括跳转后新建的页面），与壳页面用 `postMessage` 同步开关状态和选中节点。

- **高亮**：覆盖层直接画在页面 iframe 内（`position: fixed`、`pointer-events: none`、高 z-index），标签显示 `Foo.vue:12:5`。不跨 iframe 换算坐标和设备缩放。
- **拦截**：开启时在 window **捕获阶段**监听 `mouseover` / `mousedown` / `click` / `touchstart`，`preventDefault` + `stopPropagation`，不触发小程序的 tap；捕获阶段也能防止业务的 `catch` 事件吞掉检查器（Vue DevTools 同样做法）。
- **开关**：工具栏按钮、`Alt+Shift+C`；`Esc` 退出。
- **点击**：请求 `/__wxa-inspector__/open?id=&line=&col=`。

### 面板

- **Elements 树**：从渲染层基础库节点树生成的 WXML 风格树，节点附源码位置；与检查器双向联动（树中悬停 = 页面高亮，页面点选 = 树中定位）。具体遍历 API 在 P0 确认。
- **页面栈**：当前路由与参数。

---

## Node 端接口

经 `middlewares` 挂在 runner 的 HTTP 服务上，统一前缀 `/__wxa-inspector__/`（不与 runner 的 `/__wxa__/` 冲突）：

| 路径 | 作用 |
| --- | --- |
| `/__wxa-inspector__/` | 壳页面静态资源 |
| `/__wxa-inspector__/manifest` | fileId → 项目相对路径 |
| `/__wxa-inspector__/open?id&line&col` | `launch-editor` 打开文件；解析后的路径越出项目根时返回 403 |

源文件路径：

- 原生：manifest 记录相对小程序根目录的路径；根目录按 `project.config.json` 的 `miniprogramRoot` 解析（runner 的 `MiniProgram.root` 已处理）
- uni：manifest 记录 `.vue` 的项目相对路径，由 uni 插件经 `resolveFile` 提供

编辑器按 `launch-editor` 的规则选择，可用 `LAUNCH_EDITOR` 环境变量指定（`code`、`cursor`、`webstorm`…）。

---

## uni-app 插件的 runner 生命周期

uni 分批写产物，runner 自己监听文件时可能在产物写到一半就刷新，所以改由构建驱动：

1. 仅在 watch 模式且 `UNI_PLATFORM === 'mp-weixin'` 时启用，否则插件什么都不做
2. 首次 `writeBundle`（产物目录已有 `app.json`）后启动：`new DevServer({ projectPath, watch: 'manual', ...inspector({ ... }) }).start()`，打印壳页面地址
3. 之后每次 `writeBundle` 结束调用 `server.invalidate()`，触发一次重建和热更新
4. 进程退出时 `close()`

插件选项透传 runner 的常用选项（`port`、`host`、`baseLibVersion`、`setup`、`device`），默认值与 runner CLI 一致。

---

## 错误处理

| 情况 | 处理 |
| --- | --- |
| 找不到基础库、端口被占用、runner 启动失败 | 终端打印原因与处理办法，**不中断 uni 的编译** |
| `/open` 解析出的路径越出项目根 | 拒绝，返回 403 |
| manifest 里没有这个 fileId（插桩与产物不同步） | 标签显示「位置未知」，不发起打开请求 |
| `__wxElement` 不可用（基础库内部变化） | 检查器禁用，工具栏说明原因 |
| `--inspect` 但未安装 `@open-wxa/wxa-inspector` | runner CLI 提示安装命令后退出 |

---

## 阶段计划

先做原生：它不经过 uni 编译器，最快验证「标记 → `__wxElement` → 高亮 → 打开编辑器」整条链路；uni 只是在这条链路上换一个插桩来源。

| 阶段 | 内容 | 验收 |
| --- | --- | --- |
| P0 技术验证（约 1 天） | ① 基础库 `__wxElement` 能读到 `dataset` 并能向上遍历；② uni 编译后 `data-*` 原样进入 wxml | ① 不通过则整体方案需重审；② 不通过则 uni 降级为组件级定位 |
| P1 runner 扩展点 | 在 wxa-runner 实现 [扩展点](./docs/runner-extensions.md) 并发版 | runner 测试覆盖每个扩展点 |
| P2 原生检查器 | `@open-wxa/wxa-inspector` 核心 + runner CLI `--inspect` | `wxa-runner dev ./miniprogram --inspect` 打开壳页面，悬停显示高亮与 `文件:行:列`，点击后编辑器跳到对应行 |
| P3 uni 插件 | `@open-wxa/wxa-inspector-uni`：`.vue` 插桩 + runner 生命周期 | 只运行 `pnpm dev:mp-weixin` 即可在浏览器看到小程序，改代码自动刷新；检查器跳到 `.vue` 的对应行 |
| P4 面板 | Elements 树、页面栈，与检查器双向联动 | 树与页面点选互相定位 |

## 测试

- **单测**：wxml 插桩与 `.vue` 插桩——该加的加、不该加的不加、插入后行号不变、未插桩部分字节不变；`/open` 越界守卫；manifest 生成。
- **E2E**：`@open-wxa/wxa-runner-playwright` 跑原生示例和 uni 示例。悬停断言覆盖层出现；点击断言 `/open` 请求的文件、行、列；检查器开启时点击不触发页面 tap。

---

## 关键决策

### 为什么用编译期标记，而不是 Vue DevTools v9 的运行时定位

Vue 生态里有两种检查器：

| | Vue DevTools v9（`@vue/devtools-kit` 的 `component-inspector.ts`） | vite-plugin-vue-inspector（v7 / v8 Vite 插件集成） | wxa-inspector |
| --- | --- | --- | --- |
| 定位 | 运行时：DOM 往上找 `__vueParentComponent` 得到组件实例 | 编译期：`data-v-inspector="文件:行:列"` | 编译期：`data-wxa-src="id:行:列"` |
| 粒度 | 组件级，高亮整个组件 | 元素级，行列 | 元素级，行列 |
| 点击后 | 面板里选中组件，再按 `__file` 打开（只到文件） | 直接打开编辑器到行 | 直接打开编辑器到行 |

交互和事件拦截与官方一致；源码定位走编译期标记，因为小程序渲染层 DOM 上没有 Vue 实例，运行时链路断开，而标记会随 wxml 进入渲染层，点击时直接读出。

### 为什么给 runner 加扩展点，而不是反向代理

另一种做法是自起壳服务器，把 runner 的 HTTP 与 WebSocket 全部反向代理成同源，再从壳页面伸进 iframe 注入。wxa-runner 是自有仓库，加扩展点更干净：不维护代理、不依赖 runner 的 iframe 层级，扩展点对其他工具也有用。借 `setup` 文件注入会占用用户的配置槽位，不采用。

### 为什么不做 inspector 自己的 CLI，也不做 runner 插件系统

- inspector 自带 CLI（`npx wxa-inspector dev`）要转发 runner 的全部选项（端口、基础库、设备、setup…），两边会持续漂移。
- 给 runner 做配置文件加插件系统（`wxa.config.ts` 里 `plugins: [inspector()]`）更通用，但现在只有一个插件，属于过度设计。出现第二个插件时再把 `--inspect` 升级为插件机制。

### 为什么叫 wxa-inspector

- 与组织内 `wxa-runner`、`wxa-baselib` 的「`wxa-` + 名词」命名一致
- 核心能力是检查（点选、定位、Elements 树），对应 Vue 生态的 vite-plugin-vue-inspector
- 不绑 uni：要支持原生
- 不叫 `wxa-devtools`：组织里「devtools」已经专指微信开发者工具（runner 的 `devtoolsLogin`、extractor 从开发者工具提取基础库），容易误解

uni 侧拉起 runner 的能力与 wxa-runner 仓库里的 `playwright` 包性质相同（把 runner 接进某个工具），也可以作为 `@open-wxa/wxa-runner-uni` 放回 runner 仓库。第一版先放在本仓库，避免两个仓库协调发版；有人需要「不带检查器的 uni 集成」时再拆。

## 可选增强（未排期）

- 修饰键点击（如 `Alt+点击`）在面板 Elements 树中选中节点，普通点击打开编辑器；P4 完成后再评估。
