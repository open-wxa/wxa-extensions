/**
 * 端到端：在 wxa-runner 里运行原生小程序示例，通过检查器页面点选元素
 *
 * 需要：
 * - 带扩展点的 wxa-runner，WXA_RUNNER_DIR 指向它的仓库目录（已 pnpm build）
 * - 本仓库已构建（pnpm build），用的是 dist 里的入口和运行时
 * - Chrome（或用 WXA_CHROME 指定浏览器路径）
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { chromium, Browser, Frame, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '../..');
const FIXTURE = path.join(__dirname, '../fixtures/native');
const INSPECTOR_DIST = path.join(REPO_ROOT, 'packages/inspector/dist/index.js');
const RUNNER_CORE = process.env.WXA_RUNNER_DIR && path.resolve(process.env.WXA_RUNNER_DIR, 'packages/core/dist/index.js');
const CHROME = process.env.WXA_CHROME || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome'
].find(file => fs.existsSync(file));

const missing = [
  !(RUNNER_CORE && fs.existsSync(RUNNER_CORE)) && `wxa-runner 的构建产物（WXA_RUNNER_DIR=${process.env.WXA_RUNNER_DIR ?? '未设置'}）`,
  !fs.existsSync(INSPECTOR_DIST) && '本仓库的构建产物（先 pnpm build）',
  !CHROME && 'Chrome（或用 WXA_CHROME 指定）'
].filter(Boolean);
const ready = missing.length === 0;

// 本地缺条件时跳过；CI 上跳过会显示通过，等于没测，所以直接失败
if (process.env.CI && !ready) throw new Error(`E2E 缺少：${missing.join('、')}`);

/**
 * macOS 上经脚本启动 Chrome 关掉 App Nap：没有窗口的 Chrome 偶尔会卡在申请 App Nap 断言上，launch / newPage 不再返回
 * （做法和原因同 wxa-runner 的 tests/e2e/runner.ts）
 */
function launchChrome(): Promise<Browser> {
  return chromium.launch(process.platform === 'darwin'
    ? { executablePath: path.join(__dirname, 'chrome-no-app-nap.sh'), env: { ...process.env, WXA_CHROME_BINARY: CHROME! } }
    : { executablePath: CHROME });
}

/** 源文件里 snippet 所在的 行:列 */
function positionOf(project: string, file: string, snippet: string): string {
  const code = fs.readFileSync(path.join(project, file), 'utf8');
  const before = code.slice(0, code.indexOf(snippet)).split('\n');
  return `${before.length}:${before[before.length - 1].length + 1}`;
}

/** 反复读取直到满足条件，超时后返回最后一次读到的值（交给 expect 报出差异） */
async function eventually<T>(read: () => Promise<T>, done: (value: T) => boolean, timeout = 5000): Promise<T> {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await read().catch(() => undefined as T);
    if (done(value) || Date.now() > deadline) return value;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

describe.skipIf(!ready)('检查器：原生小程序', () => {
  let project: string;
  let server: { start(): Promise<string>; close(): Promise<void>; extensionEntries: Array<{ path: string }> };
  let browser: Browser;
  let page: Page;
  const opened: string[] = [];
  let openFailure: string | null = null;

  /** wxa-runner 的宿主页面：检查器页面里的 iframe */
  const host = () => page.frames().find(frame => frame.parentFrame() === page.mainFrame())!;

  /** 当前显示的渲染层页面 */
  async function currentPage(): Promise<Frame> {
    const frameName = await host().evaluate(async () => {
      const api = (window as any).__wxa_test_api__;
      await api.ready;
      return api.currentPage().frameName as string;
    });
    return page.frame({ name: frameName })!;
  }

  const label = (frame: Frame) => frame.locator('[data-wxa-inspector="source"]');
  const box = (frame: Frame) => frame.locator('[data-wxa-inspector="box"]');
  const status = () => page.locator('.status');
  const setInspecting = async (on: boolean) => {
    if ((await page.locator('.toggle').getAttribute('aria-pressed')) !== String(on)) await page.click('.toggle');
  };

  /** 页面上的 <text> / <button>：按组件标签找，不用 getByText——基础库 2.x 的 wx-text 里有两份文字 */
  const textEl = (frame: Frame, text: string) => frame.locator('wx-text', { hasText: text });
  const button = (frame: Frame, text: string) => frame.locator('wx-button', { hasText: text });

  /** 悬停在文字为 text 的 <text> 上，等标签出现后返回标签文字 */
  async function hoverText(frame: Frame, text: string): Promise<string> {
    await textEl(frame, text).hover();
    await label(frame).waitFor();
    return (await label(frame).textContent())!;
  }

  beforeAll(async () => {
    project = fs.mkdtempSync(path.join(os.tmpdir(), 'wxa-inspector-e2e-'));
    fs.cpSync(FIXTURE, project, { recursive: true });

    const { DevServer } = createRequire(__filename)(RUNNER_CORE!);
    const { wxaInspector } = createRequire(__filename)(INSPECTOR_DIST);
    server = new DevServer({
      projectPath: project,
      port: 0,
      logger: { log: () => undefined, warn: () => undefined, error: () => undefined },
      extensions: [
        wxaInspector({
          openEditor: (file: string, line: number, col: number) => {
            if (openFailure) throw new Error(openFailure);
            opened.push(`${path.relative(project, file)}:${line}:${col}`);
          }
        })
      ]
    });
    const base = await server.start();
    browser = await launchChrome();
    page = await browser.newPage();
    await page.goto(base + server.extensionEntries[0].path);
  });

  afterAll(async () => {
    await browser?.close();
    await server?.close();
    if (project) fs.rmSync(project, { recursive: true, force: true });
  });

  it('没开启检查器时，页面照常响应点击', async () => {
    const frame = await currentPage();
    await button(frame, '点击加一').click();
    await textEl(frame, '点击次数：1').waitFor();
  });

  it('悬停时高亮框贴合元素，标签显示 文件:行:列', async () => {
    await setInspecting(true);
    const frame = await currentPage();
    expect(await hoverText(frame, '检查器示例')).toBe(`pages/index/index.wxml:${positionOf(project, 'pages/index/index.wxml', '<text class="title"')}`);

    const target = await textEl(frame, '检查器示例').boundingBox();
    expect(await box(frame).boundingBox()).toEqual(target);
  });

  it('自定义组件里的元素指向组件的 wxml', async () => {
    const frame = await currentPage();
    expect(await hoverText(frame, '组件里的文字')).toBe(`components/counter/counter.wxml:${positionOf(project, 'components/counter/counter.wxml', '<text')}`);
  });

  it('点击在编辑器打开对应行列，不触发页面的 tap，状态栏显示结果', async () => {
    const frame = await currentPage();
    const expected = `pages/index/index.wxml:${positionOf(project, 'pages/index/index.wxml', '<button')}`;
    await button(frame, '点击加一').click();
    expect(await eventually(() => status().textContent(), text => text === `已在编辑器打开 ${expected}`)).toBe(`已在编辑器打开 ${expected}`);
    expect(opened).toEqual([expected]);
    expect(await textEl(frame, '点击次数：1').count()).toBe(1);
  });

  it('打开失败时状态栏显示原因', async () => {
    openFailure = '没有找到可用的编辑器';
    try {
      await textEl(await currentPage(), '检查器示例').click();
      expect(await eventually(() => status().textContent(), text => text!.startsWith('打开失败'))).toBe('打开失败：没有找到可用的编辑器');
      expect(await status().getAttribute('class')).toContain('err');
    } finally {
      openFailure = null;
    }
  });

  it('焦点在页面里时按 Esc 退出检查，高亮收起，点击恢复正常', async () => {
    const frame = await currentPage();
    await page.keyboard.press('Escape');
    expect(await eventually(() => page.locator('.toggle').getAttribute('aria-pressed'), value => value === 'false')).toBe('false');
    expect(await box(frame).count()).toBe(0);
    await button(frame, '点击加一').click();
    await textEl(frame, '点击次数：2').waitFor();
  });

  it('跳转后新建的页面自动处于检查状态', async () => {
    await setInspecting(true);
    await host().evaluate(() => (window as any).__wxa_test_api__.navigateTo('/pages/detail/detail'));
    expect(await eventually(async () => (await currentPage()).url(), url => url.includes('pages/detail/detail'))).toContain('pages/detail/detail');
    expect(await hoverText(await currentPage(), '详情页')).toBe(`pages/detail/detail.wxml:${positionOf(project, 'pages/detail/detail.wxml', '<text')}`);
  });

  it('改了 wxml 热更新后，标签里的行号跟着变', async () => {
    const file = path.join(project, 'pages/detail/detail.wxml');
    fs.writeFileSync(file, `<!-- 新加的一行 -->\n${fs.readFileSync(file, 'utf8')}`);
    const expected = `pages/detail/detail.wxml:${positionOf(project, 'pages/detail/detail.wxml', '<text')}`;
    expect(await eventually(async () => hoverText(await currentPage(), '详情页'), text => text === expected, 10000)).toBe(expected);
  });

  it('编译失败时显示错误，修好后收起', async () => {
    const file = path.join(project, 'pages/detail/detail.wxml');
    const source = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(file, '<view>\n<text>{{ a </text>\n</view>\n');
    expect(await eventually(() => page.locator('.build-error').textContent(), text => Boolean(text?.includes('detail.wxml')), 10000)).toContain('detail.wxml');
    fs.writeFileSync(file, source);
    await page.locator('.build-error').waitFor({ state: 'hidden', timeout: 10000 });
  });
});
