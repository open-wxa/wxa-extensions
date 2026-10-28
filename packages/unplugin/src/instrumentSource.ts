/**
 * 框架编译源码之前，把项目源码交给扩展插桩（如检查器给 .vue 模板打源码标记）。与构建工具无关：
 * 构建开始时 prepareInstrumenters 问一遍扩展，之后由构建工具的读文件环节（Vite 的 load）调用 loadInstrumented。
 * 读的是磁盘上的原文件，早于其他插件的改写，标记里的行列就是源文件的行列。
 */

import fs from 'fs';
import path from 'path';

export interface SourceBuildContext {
  /** 项目根目录，只有它下面、node_modules 以外的文件交给扩展 */
  root: string;
  framework: 'uni' | 'taro';
  bundler: 'vite' | 'webpack';
}

/** 源码映射，magic-string 的 generateMap() 就是这个形状 */
export interface SourceMap {
  version: number;
  file?: string;
  sources: string[];
  sourcesContent?: Array<string | null>;
  names: string[];
  mappings: string;
}

export interface InstrumentedSource {
  code: string;
  map?: SourceMap | null;
}

export interface SourceInstrumenter {
  include: RegExp;
  /** 不需要改动时返回 null */
  transform(code: string, file: string): InstrumentedSource | null;
}

export interface NamedInstrumenter {
  extension: string;
  instrumenter: SourceInstrumenter;
}

interface InstrumentingExtension {
  name: string;
  instrumentSource?(context: SourceBuildContext): SourceInstrumenter | null;
}

/** 扩展准备失败只提示，不中断编译：这个扩展的标记不打，runner 照常启动 */
export function prepareInstrumenters(
  extensions: InstrumentingExtension[] | undefined,
  context: SourceBuildContext,
  pluginName: string
): NamedInstrumenter[] {
  const prepared: NamedInstrumenter[] = [];
  for (const extension of extensions ?? []) {
    try {
      const instrumenter = extension.instrumentSource?.(context);
      if (instrumenter) prepared.push({ extension: extension.name, instrumenter });
    } catch (error) {
      console.warn(`[${pluginName}] ${extension.name} 不能处理源码：${(error as Error).message}`);
    }
  }
  return prepared;
}

/**
 * 返回插桩后的源码；不归扩展处理或扩展出错时返回 null，交回构建工具照常读取。
 * 每个文件只交给第一个 include 匹配的扩展
 */
export async function loadInstrumented(
  instrumenters: NamedInstrumenter[],
  root: string,
  id: string,
  pluginName: string
): Promise<InstrumentedSource | null> {
  if (instrumenters.length === 0 || !isProjectSource(root, id)) return null;
  const found = instrumenters.find(({ instrumenter }) => instrumenter.include.test(id));
  if (!found) return null;
  try {
    return found.instrumenter.transform(await fs.promises.readFile(id, 'utf8'), id);
  } catch (error) {
    console.warn(
      `[${pluginName}] ${found.extension} 处理 ${path.relative(root, id)} 失败：${(error as Error).message}`
    );
    return null;
  }
}

/** 真实的项目文件：不带查询参数（?vue&type=… 这类子请求）、不是虚拟模块、在项目根目录下且不在 node_modules 里 */
function isProjectSource(root: string, id: string): boolean {
  if (id.includes('?') || id.startsWith('\0') || !path.isAbsolute(id)) return false;
  const relative = path.relative(root, id);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return false;
  return !relative.split(path.sep).includes('node_modules');
}
