import fs from 'fs';
import os from 'os';
import path from 'path';
import type { IncomingMessage, ServerResponse } from 'http';
import { describe, expect, it } from 'vite-plus/test';
import wxaInspector from '../../packages/inspector/src/index';

/** 本仓库装了 vue，项目根目录指向这里就能找到 vue/compiler-sfc */
const repoRoot = path.resolve(__dirname, '../..');
const uniVite = { root: repoRoot, framework: 'uni', bundler: 'vite' } as const;

/** 调中间件的 GET /manifest，拿到 fileId → 文件 */
function manifestOf(extension: ReturnType<typeof wxaInspector>, projectPath: string): Record<string, string> {
  const { handler } = extension.setup({ projectPath, root: projectPath }).middlewares[0];
  let body = '';
  const res = { setHeader: () => undefined, end: (text: string) => (body = text) } as unknown as ServerResponse;
  handler({ method: 'GET', url: '/manifest' } as IncomingMessage, res, () => undefined);
  return JSON.parse(body);
}

describe('wxaInspector 的构建钩子 instrumentSource', () => {
  it('uni + Vite：给 .vue 打标记，标记里的文件 id 在 runner 端能查到相对项目根目录的路径', () => {
    const extension = wxaInspector();
    const instrumenter = extension.instrumentSource(uniVite);
    const file = path.join(repoRoot, 'src/pages/index/index.vue');

    expect(instrumenter?.include.test(file)).toBe(true);
    expect(instrumenter?.include.test(path.join(repoRoot, 'src/main.ts'))).toBe(false);
    const result = instrumenter?.transform('<template><view/></template>', file);
    expect(result?.code).toBe('<template><view data-wxa-src="0:1:11"/></template>');
    expect(manifestOf(extension, path.join(repoRoot, 'dist/dev/mp-weixin'))).toEqual({
      0: 'src/pages/index/index.vue'
    });
  });

  it('上游打了标记时 runner 编译产物不再打；没调用 instrumentSource 时按原生项目给 wxml 打标记', () => {
    const upstream = wxaInspector();
    upstream.instrumentSource(uniVite);
    expect(upstream.setup({ projectPath: repoRoot, root: repoRoot }).wxmlTransform).toBeUndefined();

    const native = wxaInspector();
    expect(native.setup({ projectPath: repoRoot, root: repoRoot }).wxmlTransform?.('<view/>', 'a.wxml')).toBe(
      '<view data-wxa-src="0:1:1"/>'
    );
  });

  it('Taro 和 webpack 下还不支持，返回 null，按原生项目处理产物', () => {
    const extension = wxaInspector();
    expect(extension.instrumentSource({ ...uniVite, framework: 'taro' })).toBeNull();
    expect(extension.instrumentSource({ ...uniVite, bundler: 'webpack' })).toBeNull();
    expect(extension.setup({ projectPath: repoRoot, root: repoRoot }).wxmlTransform).toBeTypeOf('function');
  });

  it('项目里找不到 Vue 编译器时抛错说明原因，不切换到上游打标记', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wxa-inspector-no-vue-'));
    try {
      const extension = wxaInspector();
      expect(() => extension.instrumentSource({ ...uniVite, root })).toThrow('找不到 vue/compiler-sfc');
      expect(extension.setup({ projectPath: root, root }).wxmlTransform).toBeTypeOf('function');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
