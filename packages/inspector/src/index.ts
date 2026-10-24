/**
 * @open-wxa/wxa-inspector：wxa-runner 的元素检查器，以开发服务器扩展的形式接入
 *
 *   wxa-runner dev ./miniprogram --extension @open-wxa/wxa-inspector
 *   new DevServer({ projectPath, extensions: [wxaInspector()] })
 *
 * 原生项目不用传参数：wxa-runner 编译 wxml 时打标记。uni 等框架的插件在自己的编译环节打标记，传 external。
 * 不依赖 wxa-runner：扩展的形状在这里按 wxa-runner 的约定（DevServerExtension）声明。
 */

import path from 'path';
import type { IncomingMessage, ServerResponse } from 'http';
import { FileIdRegistry } from './transform/FileIdRegistry';
import { instrumentWxml } from './transform/instrumentWxml';
import { createMiddleware, MOUNT_PATH } from './server/middleware';
import { launchInEditor, type OpenEditor } from './server/openEditor';

export { FileIdRegistry } from './transform/FileIdRegistry';
export { instrumentWxml, MARKER_ATTRIBUTE } from './transform/instrumentWxml';
export type { OpenEditor } from './server/openEditor';

export interface WxaInspectorOptions {
  /** 打开编辑器的方式，默认用 launch-editor（可用环境变量 LAUNCH_EDITOR 指定编辑器） */
  openEditor?: OpenEditor;
  /**
   * 标记由上游打好时（如 uni 插件给 .vue 模板打标记）传入：registry 是上游登记文件用的同一个实例，里面的路径相对 sourceRoot。
   * 不传时是原生项目，由 wxa-runner 编译 wxml 时打标记
   */
  external?: { registry: FileIdRegistry; sourceRoot: string };
}

/** wxa-runner 开发服务器扩展的形状 */
export interface WxaInspectorExtension {
  name: string;
  setup(context: { projectPath: string; root: string }): {
    webviewScripts: Array<{ src: string; position: 'head' | 'body' }>;
    middlewares: Array<{
      path: string;
      handler: (req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => void;
    }>;
    wxmlTransform?: (code: string, file: string) => string;
    entry: { label: string; path: string };
  };
}

export default function wxaInspector(options: WxaInspectorOptions = {}): WxaInspectorExtension {
  return {
    name: 'wxa-inspector',
    setup({ root }) {
      const { external } = options;
      const registry = external?.registry ?? new FileIdRegistry();
      const middleware = createMiddleware({
        registry,
        sourceRoot: external ? path.resolve(external.sourceRoot) : root,
        // 组件路径对应的是小程序目录里的 wxml；框架项目里那是编译产物，打开它没有意义
        componentRoot: external ? null : root,
        openEditor: options.openEditor ?? launchInEditor
      });

      return {
        // 拦截 tap 的监听要在基础库之前注册，见 runtime/index.ts
        webviewScripts: [{ src: `${MOUNT_PATH}/runtime.js`, position: 'head' }],
        middlewares: [{ path: MOUNT_PATH, handler: middleware }],
        ...(!external && {
          // miniprogram_npm 下是第三方组件，不打标记，点到时按组件路径兜底
          wxmlTransform: (code: string, file: string) =>
            file.startsWith('miniprogram_npm/') ? code : instrumentWxml(code, registry.idFor(file))
        }),
        entry: { label: '检查器', path: `${MOUNT_PATH}/` }
      };
    }
  };
}

export { wxaInspector };
