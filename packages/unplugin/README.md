# @open-wxa/unplugin-wxa-runner

uni-app `dev:mp-weixin` 时自动启动 [wxa-runner](https://github.com/open-wxa/wxa-runner)，不用再开一个终端运行 `wxa-runner dev`。

```bash
pnpm add -D @open-wxa/unplugin-wxa-runner @open-wxa/wxa-runner-core
```

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

| 选项             | 默认值                                       | 说明                                                       |
| ---------------- | -------------------------------------------- | ---------------------------------------------------------- |
| `port`           | 从 3000 起找空闲端口                         | 指定后，端口被占用时启动失败                               |
| `host`           | `'localhost'`                                | `'0.0.0.0'` 开放局域网访问                                 |
| `baseLibVersion` | 本机已安装的最新兼容版本                     | 基础库版本                                                 |
| `setup`          | 项目根目录的 `wxa.setup.ts` / `.js` / `.mjs` | mock 等 setup 文件，相对项目根目录；`false` 不用           |
| `forwardConsole` | `'errors'`                                   | 浏览器里的报错转发到终端；`'all'` 再加上 warn              |
| `extensions`     | 无                                           | 挂 wxa-runner 扩展，如检查器；需要 wxa-runner 0.9.0 及以上 |

其余选项原样传给 wxa-runner 的 `DevServer`，与 `wxa-runner dev` 命令行的默认值一致。

## 注意

- 需要 Node.js 20.19 / 22.12 及以上。
- wxa-runner 启动失败（如指定的端口被占用）只在终端打印原因，不打断 uni 的编译。
- Taro 用 `/vite` 或 `/webpack` 入口，还没有验证过。

## 许可证

MIT
