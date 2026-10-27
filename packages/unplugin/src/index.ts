/**
 * @open-wxa/unplugin-wxa-runner：uni-app、Taro 等框架编译微信小程序时，顺带在浏览器里用 wxa-runner 运行
 *
 *   import wxaRunner from '@open-wxa/unplugin-wxa-runner/vite';     // 或 /webpack
 *   plugins: [uni(), wxaRunner()]
 *   plugins: [uni(), wxaRunner({ extensions: [wxaInspector()] })]   // 挂上 runner 扩展，如检查器
 *
 * 只在编译微信小程序的监听构建（`uni -p mp-weixin`、`taro build --type weapp --watch`）时启用：
 * 首轮产物写出后启动 wxa-runner，打印地址。之后的改动交给 wxa-runner 自己监听产物目录：
 * 内容没变的文件不算改动，一批写入合并成一次热更新或整页刷新。
 */

import fs from 'fs';
import path from 'path';
import { styleText } from 'util';
import { createUnplugin } from 'unplugin';
import type { DevServer, DevServerOptions } from '@open-wxa/wxa-runner-core';
import { loadRunner } from './loadRunner';

/** wxa-runner 开发服务器扩展的形状（DevServerExtension），如 @open-wxa/wxa-inspector 默认导出的 wxaInspector() */
export interface RunnerExtension {
  name: string;
  setup(context: { projectPath: string; root: string }): object;
}

/**
 * 透传给 wxa-runner 开发服务器，默认值与 wxa-runner 命令行一致。
 * 小程序目录是框架的产物目录，由插件决定；setup 文件默认在项目根目录找，相对路径也相对它
 */
export type WxaRunnerPluginOptions = Omit<DevServerOptions, 'projectPath' | 'watch'> & {
  /** 要求 wxa-runner-core 0.9.0 及以上；版本太旧时在终端提示，不中断编译 */
  extensions?: RunnerExtension[];
};

interface ExtensionEntry {
  label: string;
  path: string;
}

interface BuildDirs {
  root: string;
  output: string;
}

const NAME = 'unplugin-wxa-runner';
const SETUP_FILE_NAMES = ['wxa.setup.ts', 'wxa.setup.js', 'wxa.setup.mjs'];

export const unplugin = createUnplugin<WxaRunnerPluginOptions | undefined>((options = {}) => {
  /** 编译微信小程序的监听构建才有 */
  let dirs: BuildDirs | null = null;
  let started = false;
  let server: DevServer | null = null;
  const close = async () => {
    await server?.close();
  };

  return {
    name: NAME,
    vite: {
      configResolved(config) {
        if (config.build.watch) dirs = weixinBuild(config.root, path.resolve(config.root, config.build.outDir));
      },
      closeWatcher: close
    },
    webpack(compiler) {
      // watchRun 只在监听构建时触发
      compiler.hooks.watchRun.tap(NAME, () => {
        dirs ??= weixinBuild(compiler.context, compiler.outputPath);
      });
      compiler.hooks.watchClose.tap(NAME, () => void close());
    },
    async writeBundle() {
      if (!dirs || started || !fs.existsSync(path.join(dirs.output, 'app.json'))) return;
      started = true;
      server = await startRunner(dirs.output, { ...options, setup: resolveSetup(options.setup, dirs.root) });
    }
  };
});

/** 其他平台（H5、支付宝小程序……）什么都不做 */
function weixinBuild(root: string, output: string): BuildDirs | null {
  const weixin = process.env.UNI_PLATFORM === 'mp-weixin' || process.env.TARO_ENV === 'weapp';
  return weixin ? { root, output } : null;
}

function resolveSetup(option: string | false | undefined, root: string): string | false | undefined {
  if (option === false) return false;
  if (option) return path.resolve(root, option);
  return SETUP_FILE_NAMES.map((name) => path.join(root, name)).find((file) => fs.existsSync(file));
}

/** 启动失败只打印原因，不抛出：预览起不来不能中断框架的编译 */
async function startRunner(projectPath: string, options: WxaRunnerPluginOptions): Promise<DevServer | null> {
  let runner: Awaited<ReturnType<typeof loadRunner>>;
  try {
    runner = await loadRunner();
  } catch (error) {
    console.warn(
      `[${NAME}] 加载不了 @open-wxa/wxa-runner-core（${(error as Error).message}），` +
        '请在项目里安装：pnpm add -D @open-wxa/wxa-runner-core'
    );
    return null;
  }

  try {
    const server = new runner.DevServer({ forwardConsole: 'errors', ...options, projectPath });
    // 不支持扩展的版本会忽略 extensions 选项，不报错
    const entries = 'extensionEntries' in server ? (server.extensionEntries as ExtensionEntry[]) : null;
    if (options.extensions?.length && !entries) {
      console.warn(`[${NAME}] 当前的 @open-wxa/wxa-runner-core 不支持扩展，extensions 没有生效：请升级到 0.9.0 及以上`);
    }
    printBanner(server, await server.start(), entries ?? []);
    return server;
  } catch (error) {
    console.error(`[${NAME}] wxa-runner 启动失败：${(error as Error).message}`);
    return null;
  }
}

/** 与 wxa-runner 命令行的启动信息一致 */
function printBanner(server: DevServer, url: string, entries: ExtensionEntry[]) {
  const lines = ['', styleText('green', '  wxa-runner 已启动'), `  地址      ${styleText('cyan', url)}`];
  entries.forEach((entry) => lines.push(`  ${padLabel(entry.label)}${styleText('cyan', url + entry.path)}`));
  const networkUrls = server.networkUrls;
  if (networkUrls.length === 0) lines.push(`  局域网    ${styleText('gray', "传 host: '0.0.0.0' 开放局域网访问")}`);
  networkUrls.forEach((networkUrl, i) =>
    lines.push(`  ${i === 0 ? '局域网' : '      '}    ${styleText('cyan', networkUrl)}`)
  );
  lines.push(`  项目      ${server.project.root}`);
  lines.push(`  基础库    ${server.baseLib.version}${server.baseLib.source === 'bundled' ? '（内置）' : ''}`);
  if (server.setupFile) lines.push(`  setup     ${server.setupFile}`);
  console.log(`${lines.join('\n')}\n`);
}

/** 按显示宽度补齐到 10 列（中文占两列），与「地址      」对齐 */
function padLabel(label: string): string {
  const width = label.length + (label.match(/[\u0100-\uffff]/g)?.length ?? 0);
  return label + ' '.repeat(Math.max(10 - width, 2));
}
