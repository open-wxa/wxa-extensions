# wxa-extensions

[wxa-runner](https://github.com/open-wxa/wxa-runner) 的扩展与构建插件。

| 包                                                            | 作用                                                                |
| ------------------------------------------------------------- | ------------------------------------------------------------------- |
| [`@open-wxa/unplugin-wxa-runner`](./packages/unplugin#readme) | uni-app `dev:mp-weixin` 时自动启动 wxa-runner，不用再开一个终端     |
| [`@open-wxa/wxa-inspector`](./packages/inspector#readme)      | wxa-runner 扩展：在页面上点选元素，直接在编辑器打开对应源码的那一行 |

```bash
# uni-app：构建插件，wxa-runner-core 是对等依赖，要一起装
pnpm add -D @open-wxa/unplugin-wxa-runner @open-wxa/wxa-runner-core
```

```ts
// uni-app：vite.config.ts
import wxaRunner from '@open-wxa/unplugin-wxa-runner/vite';

export default defineConfig({
  plugins: [uni(), wxaRunner()]
});
```

```bash
# 原生小程序：检查器
npx wxa-runner dev ./miniprogram --extension @open-wxa/wxa-inspector
```

安装、选项和注意事项见各包的 README。

## 参与开发

见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 许可证

MIT
