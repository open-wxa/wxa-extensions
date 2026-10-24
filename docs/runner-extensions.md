# wxa-runner 扩展点提案

wxa-inspector 需要 `@open-wxa/wxa-runner-core` 的 `DevServer` 新增几个**通用**扩展点。它们不认识 inspector，任何想接入 runner 的工具都能用。这份文档可以直接拿去 wxa-runner 开 issue / PR。

基于 wxa-runner 0.8.0 的源码（`packages/core/src`）。

## 总览

```ts
interface DevServerOptions {
  // ...现有选项

  /** 注入每个渲染层页面（webview）的脚本，包括跳转后新建的页面和插件页面 */
  webviewScripts?: Array<{ src: string } | { content: string }>

  /** 挂在 runner HTTP 服务上的中间件；path 不得以 /__wxa__/ 开头 */
  middlewares?: Array<{ path: string; handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void }>

  /** wxml 送进 wcc 前的转换；必须保持行号不变，返回值相同输入下必须稳定 */
  wxmlTransform?: (code: string, file: string) => string

  /** 新增取值 'manual'：打开基础库热更新开关，但不启动文件监听，变化只由 invalidate() 通知 */
  watch?: boolean | 'manual'
}

class DevServer {
  /** 通知产物已变化：重建并热更新或整页刷新；不传 files 时按结构变化处理（整页刷新） */
  invalidate(files?: string[]): Promise<void>
}
```

## webviewScripts

- **用途**：inspector 的检查器运行时需要进入每个页面 iframe。
- **落点**：`server/html.ts` 的 `webviewHtml()` 和 `pluginWebviewHtml()`，在 `<body>` 末尾、`frameLoaded` 脚本之后输出 `<script>`。
- `src` 由调用方的 `middlewares` 提供，或是任意同源 / 外部 URL；`content` 直接内联。
- 与 `setup` 无关：setup 仍然只给用户做 mock。

## middlewares

- **用途**：inspector 的壳页面、manifest、打开编辑器接口。
- **落点**：`server/DevServer.ts` 创建 express `app` 后，在 runner 自己的路由之前 `app.use(path, handler)`。
- 校验 `path` 不以 `/__wxa__/` 开头，冲突时启动报错。
- handler 用 Node 原生的 `req` / `res` 类型，不把 express 暴露成公共 API。

## wxmlTransform

- **用途**：原生项目在编译期给元素加源码标记。
- **限制**：`AppBuilder.compileTemplates()` 调用 `compileWxml({ cwd: project.root, files, ... })`，只传路径，`wcc` 自己从磁盘读文件，所以转换不能只在内存里做。
- **做法**：设置了 `wxmlTransform` 时，把 `.wxml` 经转换后写进临时目录的镜像树，`.wxs` 原样复制，`compileWxml` 的 `cwd` 改指镜像目录。相对路径不变，编译报错显示的文件和行列与源文件一致（转换保证行号不变）。
- 增量：只重写 `invalidate` / 监听报告变化的文件；`wxmlCache` 逻辑不变。
- 镜像目录随服务器进程存在，`close()` 时删除（与现有运行时临时文件同处理）。

## watch: 'manual' 与 invalidate()

- **用途**：uni-app 分批写产物，runner 自己监听可能在写到一半时刷新；改由构建工具在每轮 `writeBundle` 结束后通知。
- **现状**：`watch !== false` 时既启动 `watchProject` 又打开热更新开关（`hotEnabled`）；`watch: false` 两者都关，用于测试时与真机一致。所以单靠 `watch: false` + 手动通知会失去热更新。
- **做法**：
  - 把 `startWatching()` 里回调的主体（`builder.invalidate` → `build` → `planHotUpdate` → `broadcast`，以及失败时的 `error` 广播）抽成私有方法 `applyChanges(files, structural)`
  - `watch: true`：监听器回调调用它（行为不变）
  - `watch: 'manual'`：不启动监听，`hotEnabled` 为 true；公开的 `invalidate(files)` 调用它
  - `invalidate()` 不传 `files` 时 `structural = true`，整页刷新并恢复页面栈；传 `files` 时按现有规则判断结构变化和热更新

## 测试

每个扩展点在 runner 仓库内单测或 E2E 覆盖：

- `webviewScripts`：普通页面、跳转后的新页面、插件页面都执行了注入脚本
- `middlewares`：路由可达；以 `/__wxa__/` 开头时启动报错
- `wxmlTransform`：转换结果生效；编译错误的文件和行列指向源文件；只改一个文件时只重写它
- `watch: 'manual'`：不监听文件；`invalidate(files)` 触发热更新，`invalidate()` 触发整页刷新；编译失败时广播 `error`
