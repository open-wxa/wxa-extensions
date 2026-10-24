# 检查器依赖的基础库行为

检查器读的是微信基础库的内部结构，没有公开文档。下面是实测结论，来自技术预演（`spike/native` 分支的报告）
并由 `tests/e2e` 在基础库 **2.32.3、3.5.8、3.7.0** 上持续验证。基础库升级后 E2E 失败，先对照这里。

访问这些内部结构的代码都在 `packages/inspector/src/runtime/locate.ts`。

## 节点

- 渲染层页面的 DOM 元素（`wx-view`、`wx-text`、自定义组件标签…）上有 `__wxElement`，是基础库的节点对象，不是 DOM 节点
- `__wxElement.dataset` 是普通对象，wxml 里的 `data-wxa-src` 读作 `dataset.wxaSrc`（驼峰转换由基础库完成）。
  写在自定义组件标签上的 `data-*` 同样能在宿主元素上读到
- `__wxElement.is`：内置组件是 `wx-view` 这类；自定义组件宿主节点是相对小程序根目录的组件路径，如 `components/counter/counter`
- 自定义组件的内容渲染在宿主标签里面，没有真正的 shadow DOM，沿 DOM 的 `parentElement` 往上就是节点树的父级
- 组件内部元素的 `id` 会被加上随机前缀，测试里不要用组件内部的 id 定位
- 基础库 2.x 的 `wx-text` 里有两份文字，按文字找元素时用组件标签（`wx-text`）而不是 `getByText`

## 事件

- wxa-runner（`runtime/frame.ts`）在渲染层 window 的捕获阶段把鼠标操作转成 `touchstart` / `touchmove` / `touchend` 派发，
  并吞掉非触摸的 pointer 事件；浏览器原生的 `click` 照常派发
- 基础库从 touchstart / touchend 合成 tap，DOM 上没有 `tap` 事件可拦。要阻止 tap，拦 `touchstart`、`touchmove`、`touchend`、`touchcancel`（再加上 `click`）
- **拦截监听必须在基础库之前注册**：2.32.3 的基础库自己在 window 捕获阶段监听 touch 事件，晚于它注册的拦截拦不住 tap（3.7.0 上碰巧拦得住）。
  所以运行时用 `webviewScripts` 的 `position: 'head'` 注入，在 `WAWebview.js` 之前执行
- `mouseover` 不受影响，任何时候注册都能收到

## 已知限制

- `virtualHost: true` 的组件没有宿主 DOM，按组件路径兜底时会落到外层组件
- 插件页面的 wxml 来自插件代码包，不经过 `wxmlTransform`，没有标记
