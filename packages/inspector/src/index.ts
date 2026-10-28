/**
 * @open-wxa/wxa-inspector：wxa-runner 的元素检查器，以开发服务器扩展的形式接入
 *
 *   wxa-runner dev ./miniprogram --extension @open-wxa/wxa-inspector
 *   new DevServer({ projectPath, extensions: [wxaInspector()] })
 *   wxaRunner({ extensions: [wxaInspector()] })   // uni-app，@open-wxa/unplugin-wxa-runner
 *
 * 原生项目：wxa-runner 编译 wxml 时打标记。uni-app：构建插件在构建开始时调用 instrumentSource，
 * 之后 .vue 由构建插件交给它打标记，wxa-runner 编译产物时不再打。
 * 不依赖 wxa-runner 和构建插件：扩展的形状在这里按约定（DevServerExtension）声明。
 */

import path from 'path';
import { createRequire } from 'module';
import type { IncomingMessage, ServerResponse } from 'http';
import { FileIdRegistry } from './transform/FileIdRegistry';
import { instrumentWxml } from './transform/instrumentWxml';
import { instrumentVue, type InstrumentedSource, type ParseSfc } from './transform/instrumentVue';
import { createMiddleware, MOUNT_PATH } from './server/middleware';
import { launchInEditor, type OpenEditor } from './server/openEditor';

export { FileIdRegistry } from './transform/FileIdRegistry';
export { instrumentWxml, MARKER_ATTRIBUTE } from './transform/instrumentWxml';
export { instrumentVue } from './transform/instrumentVue';
export type { OpenEditor } from './server/openEditor';

export interface WxaInspectorOptions {
  /** 打开编辑器的方式，默认用 launch-editor（可用环境变量 LAUNCH_EDITOR 指定编辑器） */
  openEditor?: OpenEditor;
}

/** 构建插件调用 instrumentSource 时给出的构建信息 */
export interface SourceBuildContext {
  /** 项目根目录：标记里的文件路径相对它，打开的文件也必须在它下面 */
  root: string;
  framework: 'uni' | 'taro';
  bundler: 'vite' | 'webpack';
}

/** 给框架源码打标记；构建插件只把项目里、node_modules 以外、匹配 include 的文件交给 transform */
export interface SourceInstrumenter {
  include: RegExp;
  /** 不需要改动时返回 null */
  transform(code: string, file: string): InstrumentedSource | null;
}

/** wxa-runner 开发服务器扩展的形状，加上构建插件用的 instrumentSource */
export interface WxaInspectorExtension {
  name: string;
  /**
   * 构建开始、首次读取源码之前由构建插件调用一次。返回打标记的方法时，标记由上游打好，
   * setup 不再给 wxml 打标记；返回 null 表示这个框架还不支持，按原生项目处理产物。
   * 项目里找不到 Vue 的编译器时抛错，由构建插件提示
   */
  instrumentSource(context: SourceBuildContext): SourceInstrumenter | null;
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
  /** 上游打标记时用的 registry，setup 与之共用：标记里的 fileId 才能查到文件 */
  let upstream: { registry: FileIdRegistry; sourceRoot: string } | null = null;

  return {
    name: 'wxa-inspector',
    instrumentSource({ root, framework, bundler }) {
      // Taro、webpack 下框架编译器会不会保留标记还没验证
      if (framework !== 'uni' || bundler !== 'vite') return null;
      const parse = loadSfcParser(root);
      const sourceRoot = path.resolve(root);
      // 监听构建期间只调用一次；保留已有的 registry，热更新后页面上的旧标记依然能查到文件
      upstream ??= { registry: new FileIdRegistry(), sourceRoot };
      const { registry } = upstream;
      return {
        include: /\.vue$/,
        transform: (code, file) =>
          instrumentVue(code, {
            fileId: registry.idFor(path.relative(sourceRoot, file).split(path.sep).join('/')),
            filename: file,
            parse
          })
      };
    },
    setup({ root }) {
      const registry = upstream?.registry ?? new FileIdRegistry();
      const middleware = createMiddleware({
        registry,
        sourceRoot: upstream?.sourceRoot ?? root,
        // 组件路径对应的是小程序目录里的 wxml；框架项目里那是编译产物，打开它没有意义
        componentRoot: upstream ? null : root,
        openEditor: options.openEditor ?? launchInEditor
      });

      return {
        // 拦截 tap 的监听要在基础库之前注册，见 runtime/index.ts
        webviewScripts: [{ src: `${MOUNT_PATH}/runtime.js`, position: 'head' }],
        middlewares: [{ path: MOUNT_PATH, handler: middleware }],
        ...(!upstream && {
          // miniprogram_npm 下是第三方组件，不打标记，点到时按组件路径兜底
          wxmlTransform: (code: string, file: string) =>
            file.startsWith('miniprogram_npm/') ? code : instrumentWxml(code, registry.idFor(file))
        }),
        entry: { label: '检查器', path: `${MOUNT_PATH}/` }
      };
    }
  };
}

/** 用项目自己的 Vue 编译器解析 .vue，与项目的 Vue 版本一致 */
function loadSfcParser(root: string): ParseSfc {
  try {
    return (createRequire(path.join(root, 'package.json'))('vue/compiler-sfc') as { parse: ParseSfc }).parse;
  } catch (error) {
    throw new Error(`在 ${root} 找不到 vue/compiler-sfc（${(error as Error).message}）`, { cause: error });
  }
}

export { wxaInspector };
