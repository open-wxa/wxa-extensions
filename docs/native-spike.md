# 原生小程序技术预演：任务说明

给执行预演的 AI / 开发者。读完这份就能开工，不需要其他对话上下文。

## 先读

1. [PROJECT_DESIGN.md](../PROJECT_DESIGN.md)：整体设计（重点看「源码标记」「浏览器端」「Node 端接口」）
2. [runner-extensions.md](./runner-extensions.md)：要给 wxa-runner 加的扩展点

设计与实际不符时以**实际跑通**为准，偏差记进报告（见「交付物」），不要为了贴合文档硬改。

## 目标

在 wxa-runner 自带的原生示例上**真实跑通**整条链路：

```bash
# 在 wxa-runner 工作区里
node packages/cli/bin/wxa-runner.js dev examples/showcase --inspect
```

1. 终端打印壳页面地址 `http://localhost:<port>/__wxa-inspector__/`
2. 壳页面左侧是正常运行的小程序，可以点击、跳转
3. 打开检查器后，悬停元素出现高亮框和 `pages/index/index.wxml:12:5` 这样的标签
4. 点击后编辑器打开对应文件并跳到该行列；页面上**不**触发 tap
5. 改 wxml 保存后热更新，检查器标记依然正确（行号跟着变）

## 不做

- uni-app（P3）、Elements 树和页面栈面板（P4）
- `watch: 'manual'` / `invalidate()`：原生用 runner 自己的文件监听，这两个只给 uni 用
- 发布 npm、推送远程、开 PR：做完由人决定

## 仓库与工作区

| 仓库          | 位置                                                         | 怎么做                                                                                                                      |
| ------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| wxa-runner    | `/Users/mac/Documents/workspace/DBAA/open-wxa/wxa-runner`    | 现有工作区在别的分支上（`fix/hide-tabbar`），**不要动它**。从 `origin/main` 新开 worktree，分支 `feat/inspector-extensions` |
| wxa-inspector | `/Users/mac/Documents/workspace/DBAA/open-wxa/wxa-inspector` | 新开分支 `spike/native`                                                                                                     |

工具链跟随 wxa-runner：pnpm、TypeScript ESM、vitest、oxlint、Conventional Commits（中文描述）。开发命令见 wxa-runner 的 `CONTRIBUTING.md`。

wxa-inspector 建成 pnpm monorepo，核心包放在 `packages/inspector`（npm 名 `@open-wxa/wxa-inspector`），依赖 `@open-wxa/wxa-runner-core` 时用 `link:` 指向 runner worktree 里的包。

## 步骤

### S0 验证基础库能力（先做，约半天）

**不写任何正式代码**，手工在 `examples/showcase` 上验证，结论写进报告：

1. 在示例的某个 wxml 里手写 `data-wxa-src="0:1:1"`，用原版 runner 启动，在 Chrome DevTools 里切到该页面的 webview iframe：
   - `document.querySelector('wx-view').__wxElement` 拿到的是什么对象
   - 能否读到 `dataset.wxaSrc`（`data-wxa-src` 转成驼峰）
   - 怎么拿父节点、怎么判断节点属于哪个自定义组件、能否拿到组件路径（类似 `components/foo/foo`）
2. 自定义组件标签上的 `data-*` 能否在组件宿主节点上读到
3. 记下 runner 用哪些 DOM 事件合成 tap（mouse / touch / pointer），后面要在捕获阶段拦截这些
4. 有其他基础库版本时（`wxa-runner baselib list`），至少再换一个版本验证第 1 条

第 1 条走不通（读不到 dataset 或拿不到节点）就**停下来写报告**，不要继续，整体方案需要重审。

### S1 runner 扩展点（wxa-runner worktree）

按 [runner-extensions.md](./runner-extensions.md) 实现 `webviewScripts`、`middlewares`、`wxmlTransform`，每个都配测试。要点：

- `wxmlTransform`：`AppBuilder.compileTemplates()` 只把路径交给 `wcc`、由 `wcc` 自己读磁盘，所以要把转换后的 `.wxml`（和原样复制的 `.wxs`）写进临时镜像目录，`compileWxml` 的 `cwd` 指向镜像目录；增量时只重写变化的文件；`close()` 时删除
- `webviewScripts`：`server/html.ts` 的 `webviewHtml()` 和 `pluginWebviewHtml()` 都要注入
- CLI 加 `--inspect`：动态 `import('@open-wxa/wxa-inspector')`，把 `inspector({ projectPath, markers: 'wxml' })` 的返回值展开进 `DevServer` 选项；导入失败时提示 `pnpm add -D @open-wxa/wxa-inspector` 并退出

### S2 inspector 核心（wxa-inspector）

对外只导出 `inspector(options)`，签名见 PROJECT_DESIGN.md「集成入口」。内部四块：

**1. wxml 插桩**（`wxmlTransform` 的实现）

- 在标签名之后插入 ` data-wxa-src="<fileId>:<line>:<col>"`，不换行，后续行号不变；其余字节不变
- 跳过 `block`、`template`、`import`、`include`、`wxs`、`slot`，以及 `miniprogram_npm/` 下的文件；`<template name>` 内部的元素照常标记（按定义它的文件）
- 需要带位置的解析器，候选 htmlparser2 + `withStartIndices`；注意属性值 `{{ a < b }}`、`<wxs>` 里的脚本、注释、自闭合标签。解析器不可靠就自己写一个只认标签起始位置的小扫描器
- `fileId`：按文件路径分配、进程内**永不复用**的短 id（自增即可），这样热更新后旧 id 仍然有效

**2. Node 端中间件**（前缀 `/__wxa-inspector__/`）

- `/`：壳页面
- `/runtime.js`：检查器运行时（构建成单个 IIFE 文件）
- `/manifest`：`{ [fileId]: 相对小程序根目录的路径 }`
- `/open?id&line&col`：路径以 runner 的小程序根目录（考虑 `miniprogramRoot`）为基准解析，越出根目录返回 403；用 `launch-editor` 打开。`inspector()` 增加可选的 `openEditor(file, line, col)` 注入点，测试时替换成记录调用

**3. 检查器运行时**（经 `webviewScripts` 注入每个页面 iframe）

- 命中：事件目标 → `__wxElement` → `dataset.wxaSrc`；没有就向上找最近带标记的祖先；还没有就用组件路径打开 `.wxml`（组件级）。所有 `__wxElement` 相关的访问收进一个适配模块
- 高亮：覆盖层画在页面 iframe 自己的 document 里（`position: fixed`、`pointer-events: none`、高 z-index），标签显示 `文件:行:列`
- 拦截：开启时在 window 捕获阶段监听 `mouseover`，以及 S0 第 3 条记下的 tap 相关事件，`preventDefault` + `stopPropagation`
- 遇到 manifest 里没有的 id 时重新拉一次 manifest，仍没有就显示「位置未知」
- 与壳页面通信：页面 iframe 嵌在 runner 宿主页里，宿主页又嵌在壳页面里，用 `window.top.postMessage`；开关状态由壳页面广播，新页面 iframe 加载后主动向壳页面询问当前状态

**4. 壳页面**

- 本阶段最简：一个 iframe 指向 runner 根路径 `/`，一个工具栏按钮切换检查器，快捷键 `Alt+Shift+C`，`Esc` 关闭
- 读 `/__wxa__/app-info.json` 的 `buildError`，有就显示
- 不引入前端框架

### S3 测试

- 单测：wxml 插桩（加与不加的标签、行号不变、未插桩部分字节不变、`{{ }}` 里含 `<` `>`、`<template name>`）；`/open` 越界返回 403；fileId 不复用
- E2E：用 `@open-wxa/wxa-runner-playwright` 跑 showcase。悬停后断言覆盖层出现、标签文字正确；点击后断言注入的 `openEditor` 收到正确的文件、行、列；点击一个绑定了 tap 的按钮，断言页面上的 tap 处理函数**没有**执行

## 交付物

1. 两个仓库各自分支上的提交（不推送）
2. `wxa-inspector/docs/spike/native-report.md`，包含：
   - S0 的结论：`__wxElement` 的实际 API、拿父节点和组件路径的方法、tap 的事件来源、不同基础库版本的差异
   - 跑通的截图或录屏路径，以及复现命令
   - 和 PROJECT_DESIGN.md、runner-extensions.md 不一致的地方，以及原因
   - 没解决的问题、已知限制，以及对 P3（uni）有影响的发现
