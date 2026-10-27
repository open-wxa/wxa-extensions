# @open-wxa/wxa-inspector

[wxa-runner](https://github.com/open-wxa/wxa-runner) 扩展：在页面上点选元素，直接在编辑器打开对应源码的那一行。

```bash
pnpm add -D wxa-runner @open-wxa/wxa-inspector
npx wxa-runner dev ./miniprogram --extension @open-wxa/wxa-inspector
# → http://localhost:3000/__wxa-inspector__/
```

在打开的页面上按 `Alt+Shift+C`（或点右下角的按钮）开始检查：悬停高亮元素并显示 `文件:行:列`，点击在编辑器打开那一行，`Esc` 退出。
编辑器按正在运行的编辑器自动选择，也可以用环境变量 `LAUNCH_EDITOR` 指定（`code`、`cursor`、`webstorm`……）。

## 注意

- 需要 wxa-runner 0.9.0 及以上。
- 目前只支持原生小程序，uni-app 还不能用。

## 许可证

MIT
