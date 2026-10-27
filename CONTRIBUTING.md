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

## 发布

两个包独立发版，由 [release-please](https://github.com/googleapis/release-please) 管理，配置在 `release-please-config.json` 和 `.release-please-manifest.json`：

1. PR 只能 squash 合并，**PR 标题**就是 main 上的提交信息，按 Conventional Commits 写。改到 `packages/<包>/` 下的 `feat`、`fix`、`perf` 会让这个包进入下一次发布，CHANGELOG 只收这几类
2. 推送到 main 后，`.github/workflows/release.yml` 开一个（或更新已有的）发布 PR，版本号和各包的 `CHANGELOG.md` 都已改好。想攒几个改动一起发就先不合并
3. 合并发布 PR 后，打 tag（如 `unplugin-wxa-runner-v0.1.0`）、建 GitHub Release，跑一遍 CI，再执行 `node scripts/release.mjs` 发布 npm 上还没有的版本

认证用 npm 的 Trusted Publishing（OIDC），不需要 npm token。发布前可以在本地检查打包和试用：

```bash
pnpm build && node scripts/release.mjs --dry-run   # 版本号是 0.0.0 的包会跳过
```

### 首次发布

npm 上还没有这个包时，没法给它登记 Trusted Publishing，所以第一个版本要手动发：

1. 合并发布 PR。CI 里的发布这一步会因为没有认证失败，这是预期的
2. 本地拉取 main，用有 `@open-wxa` scope 发布权限的账号登录后发布：
   ```bash
   git pull && pnpm install && pnpm build
   npm login
   node scripts/release.mjs
   ```
3. 在 npmjs.com 上，每个包的 Settings → Trusted Publisher 选 GitHub Actions，填 `open-wxa` / `wxa-extensions` / `release.yml`

之后的版本合并发布 PR 就会自动发布。
