import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { loadRunner } from '../../packages/unplugin/src/loadRunner';
import { unplugin } from '../../packages/unplugin/src/index';
import wxaRunner, { type WxaRunnerPluginOptions } from '../../packages/unplugin/src/vite';

vi.mock('../../packages/unplugin/src/loadRunner', () => ({ loadRunner: vi.fn() }));

interface FakeServer {
  options: Record<string, unknown>;
  start: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

let servers: FakeServer[] = [];
let startError: Error | null = null;

class FakeDevServer {
  options: Record<string, unknown>;
  networkUrls: string[] = [];
  project = { root: '' };
  baseLib = { version: '3.0.0', source: 'bundled' };
  setupFile = null;
  start = vi.fn(async () => {
    if (startError) throw startError;
    return 'http://localhost:3000';
  });
  close = vi.fn(async () => undefined);

  constructor(options: Record<string, unknown>) {
    this.options = options;
    this.project.root = options.projectPath as string;
    servers.push(this);
  }
}

let root: string;
let output: string;

/** 模拟 uni 跑一次 Vite 构建：configResolved 之后按轮次调 writeBundle */
function createPlugin(options?: WxaRunnerPluginOptions, build: { watch?: object | null } = { watch: {} }) {
  const plugin = wxaRunner(options) as unknown as {
    configResolved(config: unknown): void;
    writeBundle(): Promise<void>;
    closeWatcher(): Promise<void>;
  };
  plugin.configResolved({ root, build: { outDir: 'dist/dev/mp-weixin', ...build } });
  return plugin;
}

function writeAppJson() {
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'app.json'), '{"pages":["pages/index/index"]}');
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'unplugin-wxa-runner-'));
  output = path.join(root, 'dist/dev/mp-weixin');
  servers = [];
  startError = null;
  vi.mocked(loadRunner).mockResolvedValue({ DevServer: FakeDevServer } as never);
  vi.stubEnv('UNI_PLATFORM', 'mp-weixin');
  vi.stubEnv('TARO_ENV', undefined);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('Vite 插件启动 wxa-runner', () => {
  it('首轮产物写出后以产物目录启动 runner，打印地址，文件变化交给 runner 自己监听', async () => {
    const plugin = createPlugin({ port: 4000 });
    writeAppJson();
    await plugin.writeBundle();

    expect(servers).toHaveLength(1);
    expect(servers[0].options).toMatchObject({ projectPath: output, port: 4000, forwardConsole: 'errors' });
    expect(servers[0].options).not.toHaveProperty('watch');
    expect(servers[0].start).toHaveBeenCalledOnce();
    expect(vi.mocked(console.log).mock.calls.join('\n')).toContain('http://localhost:3000');
  });

  it('之后每轮构建不再启动第二个 runner', async () => {
    const plugin = createPlugin();
    writeAppJson();
    await plugin.writeBundle();
    await plugin.writeBundle();

    expect(servers).toHaveLength(1);
  });

  it('产物里还没有 app.json 时等下一轮', async () => {
    const plugin = createPlugin();
    await plugin.writeBundle();
    expect(servers).toHaveLength(0);

    writeAppJson();
    await plugin.writeBundle();
    expect(servers).toHaveLength(1);
  });

  it('不是监听构建（uni build）时什么都不做', async () => {
    const plugin = createPlugin({}, { watch: null });
    writeAppJson();
    await plugin.writeBundle();

    expect(servers).toHaveLength(0);
  });

  it('不是微信小程序平台时什么都不做', async () => {
    vi.stubEnv('UNI_PLATFORM', 'h5');
    const plugin = createPlugin();
    writeAppJson();
    await plugin.writeBundle();

    expect(servers).toHaveLength(0);
  });

  it('传了 extensions 时交给 runner，并打印扩展的页面地址', async () => {
    class ExtensibleDevServer extends FakeDevServer {
      extensionEntries = [{ name: 'wxa-inspector', label: '检查器', path: '/__wxa-inspector__/' }];
    }
    vi.mocked(loadRunner).mockResolvedValue({ DevServer: ExtensibleDevServer } as never);
    const extension = { name: 'wxa-inspector', setup: () => ({}) };
    const plugin = createPlugin({ extensions: [extension] });
    writeAppJson();
    await plugin.writeBundle();

    expect(servers[0].options.extensions).toEqual([extension]);
    expect(vi.mocked(console.log).mock.calls.join('\n')).toContain(
      '检查器    http://localhost:3000/__wxa-inspector__/'
    );
  });

  it('runner 版本不支持扩展时提示升级，照常启动', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const plugin = createPlugin({ extensions: [{ name: 'wxa-inspector', setup: () => ({}) }] });
    writeAppJson();
    await plugin.writeBundle();

    expect(servers).toHaveLength(1);
    expect(warn.mock.calls.join('\n')).toContain('不支持扩展');
  });

  it('Taro 编译微信小程序时同样启动', async () => {
    vi.stubEnv('UNI_PLATFORM', undefined);
    vi.stubEnv('TARO_ENV', 'weapp');
    const plugin = createPlugin();
    writeAppJson();
    await plugin.writeBundle();

    expect(servers).toHaveLength(1);
  });

  it('setup 文件默认在 uni 项目根目录找，相对路径也相对项目根目录', async () => {
    fs.writeFileSync(path.join(root, 'wxa.setup.ts'), '');
    writeAppJson();

    const byDefault = createPlugin();
    await byDefault.writeBundle();
    expect(servers[0].options.setup).toBe(path.join(root, 'wxa.setup.ts'));

    const relative = createPlugin({ setup: 'mock/setup.ts' });
    await relative.writeBundle();
    expect(servers[1].options.setup).toBe(path.join(root, 'mock/setup.ts'));

    const disabled = createPlugin({ setup: false });
    await disabled.writeBundle();
    expect(servers[2].options.setup).toBe(false);
  });

  it('runner 启动失败时打印原因，不中断 uni 的编译', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    startError = new Error('端口 4000 已被占用');
    const plugin = createPlugin({ port: 4000 });
    writeAppJson();

    await expect(plugin.writeBundle()).resolves.toBeUndefined();
    expect(error.mock.calls.join('\n')).toContain('端口 4000 已被占用');
  });

  it('没有安装 wxa-runner-core 时提示安装，不中断 uni 的编译', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.mocked(loadRunner).mockRejectedValue(new Error("Cannot find package '@open-wxa/wxa-runner-core'"));
    const plugin = createPlugin();
    writeAppJson();

    await expect(plugin.writeBundle()).resolves.toBeUndefined();
    expect(warn.mock.calls.join('\n')).toContain('pnpm add -D @open-wxa/wxa-runner-core');
  });

  it('Vite 停止监听时关闭 runner', async () => {
    const plugin = createPlugin();
    writeAppJson();
    await plugin.writeBundle();
    await plugin.closeWatcher();

    expect(servers[0].close).toHaveBeenCalledOnce();
  });
});

describe('webpack 插件启动 wxa-runner', () => {
  /** 只模拟插件用到的两个钩子 */
  function createCompiler() {
    const taps = { watchRun: [] as Array<() => void>, watchClose: [] as Array<() => void> };
    const hook = (name: keyof typeof taps) => ({ tap: (_: string, fn: () => void) => taps[name].push(fn) });
    const compiler = {
      context: root,
      outputPath: output,
      hooks: { watchRun: hook('watchRun'), watchClose: hook('watchClose') }
    };
    return { compiler, run: (name: keyof typeof taps) => taps[name].forEach((fn) => fn()) };
  }

  function createPlugin(options?: WxaRunnerPluginOptions) {
    const { compiler, run } = createCompiler();
    const plugin = unplugin.raw(options, { framework: 'webpack' }) as unknown as {
      webpack(compiler: unknown): void;
      writeBundle(): Promise<void>;
    };
    plugin.webpack(compiler);
    return { plugin, run };
  }

  beforeEach(() => {
    vi.stubEnv('UNI_PLATFORM', undefined);
    vi.stubEnv('TARO_ENV', 'weapp');
  });

  it('监听构建首轮产物写出后以 output.path 启动 runner，setup 文件在 context 目录找', async () => {
    fs.writeFileSync(path.join(root, 'wxa.setup.ts'), '');
    const { plugin, run } = createPlugin();
    writeAppJson();
    run('watchRun');
    await plugin.writeBundle();
    run('watchRun');
    await plugin.writeBundle();

    expect(servers).toHaveLength(1);
    expect(servers[0].options).toMatchObject({ projectPath: output, setup: path.join(root, 'wxa.setup.ts') });
  });

  it('不是监听构建（taro build 不带 --watch）时什么都不做', async () => {
    const { plugin } = createPlugin();
    writeAppJson();
    await plugin.writeBundle();

    expect(servers).toHaveLength(0);
  });

  it('停止监听时关闭 runner', async () => {
    const { plugin, run } = createPlugin();
    writeAppJson();
    run('watchRun');
    await plugin.writeBundle();
    run('watchClose');

    await vi.waitFor(() => expect(servers[0].close).toHaveBeenCalledOnce());
  });
});
