/**
 * @open-wxa/wxa-inspector：wxa-runner 的元素检查器
 *
 * inspector() 返回要展开进 wxa-runner DevServer 的选项：
 *
 *   new DevServer({ projectPath, ...inspector({ projectPath, markers: 'wxml' }) })
 *
 * wxa-runner dev --inspect 就是这样接入的。uni 等框架的插件在自己的编译环节打标记，传 markers: 'external'。
 */

import fs from 'fs';
import path from 'path';
import type { IncomingMessage, ServerResponse } from 'http';
import { FileIdRegistry } from './transform/FileIdRegistry';
import { instrumentWxml } from './transform/instrumentWxml';
import { createMiddleware, MOUNT_PATH } from './server/middleware';
import { launchInEditor, type OpenEditor } from './server/openEditor';

export { FileIdRegistry } from './transform/FileIdRegistry';
export { instrumentWxml, MARKER_ATTRIBUTE } from './transform/instrumentWxml';
export type { OpenEditor } from './server/openEditor';

/** 检查器页面的路径，拼在开发服务器地址后面 */
export const SHELL_PATH = `${MOUNT_PATH}/`;

interface CommonOptions {
  /** 小程序项目目录，与 DevServer 的 projectPath 相同 */
  projectPath: string;
  /** 打开编辑器的方式，默认用 launch-editor（可用环境变量 LAUNCH_EDITOR 指定编辑器） */
  openEditor?: OpenEditor;
}

export type InspectorOptions = CommonOptions & (
  /** 原生项目：wxa-runner 编译 wxml 时打标记，打开的就是项目里的 wxml */
  | { markers: 'wxml' }
  /**
   * 标记由上游打好（如 uni 插件给 .vue 模板打标记），registry 是上游登记文件用的同一个实例，
   * 里面的路径相对 sourceRoot
   */
  | { markers: 'external'; registry: FileIdRegistry; sourceRoot: string }
);

/** 与 wxa-runner DevServerOptions 里对应字段的形状一致 */
export interface InspectorDevServerOptions {
  webviewScripts: Array<{ src: string; position: 'head' | 'body' }>;
  middlewares: Array<{ path: string; handler: (req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => void }>;
  wxmlTransform?: (code: string, file: string) => string;
}

export function inspector(options: InspectorOptions): InspectorDevServerOptions {
  const root = miniProgramRoot(options.projectPath);
  const native = options.markers === 'wxml';
  const registry = native ? new FileIdRegistry() : options.registry;

  const middleware = createMiddleware({
    registry,
    sourceRoot: native ? root : path.resolve(options.sourceRoot),
    // 组件路径对应的是小程序目录里的 wxml；框架项目里那是编译产物，打开它没有意义
    componentRoot: native ? root : null,
    openEditor: options.openEditor ?? launchInEditor
  });

  return {
    // 拦截 tap 的监听要在基础库之前注册，见 runtime/index.ts
    webviewScripts: [{ src: `${MOUNT_PATH}/runtime.js`, position: 'head' }],
    middlewares: [{ path: MOUNT_PATH, handler: middleware }],
    ...(native && {
      // miniprogram_npm 下是第三方组件，不打标记，点到时按组件路径兜底
      wxmlTransform: (code: string, file: string) => file.startsWith('miniprogram_npm/') ? code : instrumentWxml(code, registry.idFor(file))
    })
  };
}

/** 小程序代码根目录：project.config.json 里的 miniprogramRoot，与 wxa-runner 的规则一致 */
function miniProgramRoot(projectPath: string): string {
  const configFile = path.join(projectPath, 'project.config.json');
  const config = fs.existsSync(configFile) ? JSON.parse(fs.readFileSync(configFile, 'utf8')) : {};
  return path.resolve(projectPath, typeof config.miniprogramRoot === 'string' ? config.miniprogramRoot : '');
}
