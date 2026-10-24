# wxa-runner 扩展点

wxa-inspector 依赖 `@open-wxa/wxa-runner-core` 的 `DevServer` 上几个**通用**扩展点。它们不认识 inspector，任何想接入 runner 的开发工具都能用。

| 扩展点 | 状态 |
| --- | --- |
| `webviewScripts`、`middlewares`、`wxmlTransform`，CLI `--inspect` | 已实现：wxa-runner 分支 `feat/dev-server-extensions`（基于 0.8.1），未发版 |
| `watch: 'manual'` + `invalidate()` | 未实现，P3（uni）需要 |

## 接口

```ts
/** 注入每个渲染层页面的脚本，src 与 content 二选一 */
type WebviewScript = ({ src: string } | { content: string }) & {
  /** 'head'：在基础库（WAWebview.js）之前执行，还没有 document.body；'body'（默认）：<body> 开头、页面渲染之前 */
  position?: 'head' | 'body'
}

interface DevServerMiddleware {
  /** 以 / 开头的路径前缀；不能是 /，不能落在 /__wxa__、/__baselib__、/__plugin__ 下 */
  path: string
  /** req.url 已去掉 path 前缀；不处理时调用 next() 交给 runner */
  handler: (req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => void
}

interface DevServerOptions {
  // ...现有选项
  webviewScripts?: WebviewScript[]
  middlewares?: DevServerMiddleware[]
  /** wxml 交给 wcc 前的转换；不能改变行数，相同输入返回相同输出，源文件不会被修改 */
  wxmlTransform?: (code: string, file: string) => string
}
```

## webviewScripts

- 落点：`server/html.ts` 的 `webviewHtml()` 和 `pluginWebviewHtml()`，普通页面、跳转后新建的页面、插件页面都注入。
- `position: 'head'` 的脚本在 runner 的桥（`frame.js`）之后、`WAWebview.js` 之前。要赶在基础库之前注册事件监听时用它（检查器拦 tap 就是这种情况，原因见 [base-library.md](./base-library.md)）。
- `'body'` 的脚本在 `<body>` 开头。不能放在 body 末尾：基础库渲染时会换掉 body，之后才解析到的脚本落在脱离文档的旧 body 里，不会执行。
- 内联内容里的 `</script` 会被转义，不会提前结束标签。

## middlewares

- 落点：`DevServer.createApp()` 里最先 `app.use(path, handler)`，排在 runner 自己的路由之前。
- 构造时校验路径，不合法直接抛错：盖住宿主页面（`/`）或占用 runner 保留前缀都会让 runner 本身坏掉。
- handler 用 Node 原生的 `req` / `res` 类型，不把 express 暴露成公共 API。

## wxmlTransform

- wcc 只接收文件路径、自己从磁盘读文件，所以转换后的 `.wxml` 和原样的 `.wxs` 写进临时镜像目录（`project/WxmlMirror.ts`），编译时 wcc 的工作目录指向它。相对路径和行号与源文件一致，编译错误照常指向源文件。
- 只重新转换**源内容变化**的文件；项目里删掉的文件同时从镜像目录删除——否则 `<include>` 了已删除文件的模板会读到旧副本（wcc 找不到 include 的文件时不报错，只是没有内容）。
- 镜像目录在开发服务器 `close()` 时删除。

## CLI `--inspect`

- 从**用户项目**解析 `@open-wxa/wxa-inspector`：依次以项目目录、当前目录、wxa-runner 自身为起点查找。它是用户项目的开发依赖，pnpm 不提升依赖时从 wxa-runner 的安装位置找不到。
- 找到后把 `inspector({ projectPath, markers: 'wxml' })` 的返回值展开进 `DevServer`，启动信息里打印检查器地址，`--open` 打开检查器页面。
- 找不到时提示安装命令并退出；找到但初始化出错时按普通启动失败报告真实原因。

## watch: 'manual' 与 invalidate()（P3）

- **用途**：uni-app 分批写产物，runner 自己监听可能在写到一半时刷新；改由构建工具在每轮 `writeBundle` 结束后通知。
- **现状**：`watch !== false` 时既启动 `watchProject` 又打开热更新开关（`hotEnabled`）；`watch: false` 两者都关。单靠 `watch: false` + 手动通知会失去热更新。
- **做法**：
  - 把 `startWatching()` 回调的主体（`builder.invalidate` → `build` → `planHotUpdate` → `broadcast`，以及失败时的 `error` 广播）抽成私有方法 `applyChanges(files, structural)`
  - `watch: true`：监听器回调调用它（行为不变）
  - `watch: 'manual'`：不启动监听，`hotEnabled` 为 true；公开的 `invalidate(files?)` 调用它
  - `invalidate()` 不传 `files` 时按结构变化处理（整页刷新并恢复页面栈）

## 开发工具可以依赖的约定

除了这三个选项，检查器还依赖 runner 的几项运行时行为：frame 嵌套与跨层 `postMessage`、鼠标按 touch 事件派发、
`/__wxa__/ws` 的 `hot` / `reload` / `error` 消息、`app-info.json` 的 `buildError`，以及基础库的 `__wxElement.dataset` / `is`。
这些写在 wxa-runner 的 PROJECT_DESIGN.md「开发工具扩展点」里，并由 runner 仓库的 `tests/e2e/devTools.test.ts` 守着：runner 改动破坏了它们，runner 自己的 CI 就会失败。

## 测试

在 wxa-runner 仓库：

- `tests/e2e/devTools.test.ts`：上面的约定，在每个已验证的基础库上跑

- `tests/integration/devServerExtensions.test.ts`：注入位置（head 在基础库之前、body 在渲染之后、插件页面）、`</script>` 转义；中间件前缀剥离、`next()` 交回 runner、非法路径；转换进入产物且源文件不变、只转换变化的文件、删除的文件不再被编译进去、编译错误指向源文件、关闭时删除镜像目录
- `tests/integration/cli.test.ts`：`--inspect` 从当前目录的项目加载检查器并打印地址；未安装时说明安装方法并退出
