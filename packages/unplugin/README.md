# @open-wxa/unplugin-wxa-runner

uni-app `dev:mp-weixin` 时自动启动 [wxa-runner](https://github.com/open-wxa/wxa-runner)，不用再开一个终端运行 `wxa-runner dev`。

```bash
pnpm add -D @open-wxa/unplugin-wxa-runner @open-wxa/wxa-runner-core
```

`@open-wxa/wxa-runner-core` 是对等依赖，插件不会替你安装，要在项目里自己装：版本 0.8.2 及以上，用 `extensions` 要 0.9.0 及以上。

```ts
// vite.config.ts
import uni from '@dcloudio/vite-plugin-uni';
import wxaRunner from '@open-wxa/unplugin-wxa-runner/vite';

export default defineConfig({
  plugins: [uni(), wxaRunner()]
});
```

首轮编译完成后终端打印 wxa-runner 的地址：

```
  wxa-runner 已启动
  地址      http://localhost:3000
  局域网    传 host: '0.0.0.0' 开放局域网访问
  项目      /path/to/project/dist/dev/mp-weixin
  基础库    3.7.0
```

之后的热更新由 wxa-runner 负责。插件只在 `uni -p mp-weixin` 时生效，`uni build` 和其他平台不受影响。

## 选项

`wxaRunner(options?)` 的选项都可以不传，默认值与 `wxa-runner dev` 命令行一致：

```ts
wxaRunner({
  port: 3100,
  host: '0.0.0.0',
  baseLibVersion: '3.7.0',
  setup: 'mock/wxa.setup.ts',
  forwardConsole: 'all',
  device: { model: 'iPhone 15', screenWidth: 393, screenHeight: 852 }
});
```

| 选项              | 类型                         | 默认值                                       | 说明                                                                                                                          |
| ----------------- | ---------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `port`            | `number`                     | 从 3000 起找空闲端口                         | 指定后，端口被占用时启动失败；`0` 用随机端口                                                                                  |
| `host`            | `string`                     | `'localhost'`                                | `'0.0.0.0'` 或 `'::'` 开放局域网访问                                                                                          |
| `baseLibVersion`  | `string`                     | 本机已安装的最新兼容版本                     | 基础库版本，如 `'3.7.0'`；不传时也可以用环境变量 `WXA_BASELIB` 指定                                                           |
| `baseLibCacheDir` | `string`                     | `~/.wxa-runner/baselib`                      | 基础库解包后的缓存目录                                                                                                        |
| `setup`           | `string \| false`            | 项目根目录的 `wxa.setup.ts` / `.js` / `.mjs` | 小程序启动前执行的 setup 文件（预置 storage、mock 等），相对项目根目录；`false` 不用。文件里只能读到 `WXA_` 开头的环境变量    |
| `forwardConsole`  | `'errors' \| 'all' \| false` | `'errors'`                                   | 浏览器里的报错打印到终端：`'errors'` 转发运行时错误和未实现 API 的提醒，`'all'` 再加上 `console.warn` / `console.error`       |
| `device`          | `Partial<DeviceProfile>`     | iPhone X                                     | 模拟的设备，只传要改的字段，见下表                                                                                            |
| `devtoolsLogin`   | `boolean`                    | `false`                                      | 借本机微信开发者工具的登录态访问微信后台：真实的 `wx.login` code 和手机号、服务市场、插件。要先登录开发者工具，会真实请求微信 |
| `extensions`      | `RunnerExtension[]`          | 无                                           | 挂 wxa-runner 扩展，如 `[wxaInspector()]`；传扩展对象，不能传包名。需要 `@open-wxa/wxa-runner-core` 0.9.0 及以上              |
| `logger`          | `{ log, warn, error }`       | `console`                                    | wxa-runner 自身日志的输出                                                                                                     |

`device` 的字段和默认值：

| 字段              | 默认值       | 说明                                       |
| ----------------- | ------------ | ------------------------------------------ |
| `model`           | `'iPhone X'` | 机型                                       |
| `screenWidth`     | `375`        | 屏幕宽度（px）                             |
| `screenHeight`    | `812`        | 屏幕高度（px）                             |
| `pixelRatio`      | `3`          | 设备像素比                                 |
| `statusBarHeight` | `44`         | 状态栏高度（px）                           |
| `safeAreaBottom`  | `34`         | 底部安全区高度（Home Indicator），无刘海 0 |
| `system`          | `'iOS 16.0'` | 操作系统及版本                             |
| `platform`        | `'devtools'` | `wx.getSystemInfo` 返回的平台              |

小程序目录（`projectPath`）固定是 uni 的产物目录，产物监听（`watch`）始终开启，这两项不能传。
`webviewScripts`、`middlewares`、`wxmlTransform` 是给开发工具用的扩展点，一般打包成扩展经 `extensions` 挂上，细节见 wxa-runner 的 `DevServerOptions` 类型。

## 注意

- 需要 Node.js 20.19 / 22.12 及以上。
- wxa-runner 启动失败（如指定的端口被占用）只在终端打印原因，不打断 uni 的编译。
- 启动时报 `Cannot read properties of undefined`，多半是装上的 `@open-wxa/wxa-runner-core` 太旧：项目里没直接安装它、别的包又依赖旧版时（如 `@open-wxa/wxa-runner-playwright` 0.2.x），pnpm 会直接用那个旧版。用 `pnpm why @open-wxa/wxa-runner-core` 查实际版本，把 core 和依赖它的包一起升级。
- Taro 用 `/vite` 或 `/webpack` 入口，还没有验证过。

## 许可证

MIT
