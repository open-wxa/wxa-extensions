# 参与开发

架构、约定与关键取舍见 [AGENTS.md](./AGENTS.md)，检查器依赖的 wxa-runner 扩展点见 [docs/runner-extensions.md](./docs/runner-extensions.md)，
依赖的基础库行为见 [docs/base-library.md](./docs/base-library.md)。

## 工具链

[Vite+](https://viteplus.dev)（`vp`）：打包用 tsdown（`vp pack`），测试用 Vitest，lint 和格式化用 Oxlint、Oxfmt，配置都在 `vite.config.ts`。
开发需要 Node 22.18 及以上；发布的 `@open-wxa/wxa-inspector` 支持 Node 18，`@open-wxa/unplugin-wxa-runner` 依赖的 unplugin 要求 Node 20.19 及以上。

```bash
pnpm install
pnpm build         # vp pack
pnpm check         # vp check：格式、lint、类型检查
pnpm test          # 单测
pnpm fmt           # 格式化
```

## E2E

用真实的 wxa-runner 和 Chrome 跑检查器。`WXA_RUNNER_DIR` 指向带扩展点、已 `pnpm build` 的 wxa-runner 仓库：

```bash
WXA_RUNNER_DIR=../wxa-runner pnpm test:e2e
WXA_BASELIB=2.32.3 WXA_RUNNER_DIR=../wxa-runner pnpm test:e2e   # 换基础库版本
```

## 手动试用

```bash
node ../wxa-runner/packages/cli/bin/wxa-runner.js dev tests/fixtures/native --extension @open-wxa/wxa-inspector --open
```
