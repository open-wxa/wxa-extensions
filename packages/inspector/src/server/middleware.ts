/**
 * 挂在 wxa-runner 开发服务器上的接口，前缀 /__wxa-inspector__：
 *
 *   GET  /            检查器页面
 *   GET  /runtime.js  注入渲染层页面的运行时
 *   GET  /manifest    fileId → 文件路径
 *   POST /open        { id, line, col } 或 { component }：在编辑器里打开
 */

import fs from 'fs';
import path from 'path';
import type { IncomingMessage, ServerResponse } from 'http';
import type { FileIdRegistry } from '../transform/FileIdRegistry';
import type { OpenEditor } from './openEditor';
import { shellHtml } from './shell';

export const MOUNT_PATH = '/__wxa-inspector__';

export interface MiddlewareOptions {
  registry: FileIdRegistry;
  /** registry 里的路径相对这个目录；打开的文件必须在这个目录下 */
  sourceRoot: string;
  /** 组件路径（基础库给出的 components/foo/foo）相对这个目录，即小程序根目录；只有原生项目能按组件路径打开 */
  componentRoot: string | null;
  openEditor: OpenEditor;
  /** 运行时代码，默认读构建产物里的 runtime.js */
  runtime?: () => string;
}

type Handler = (req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => void;

export function createMiddleware(options: MiddlewareOptions): Handler {
  const runtime = options.runtime ?? readBuiltRuntime;
  return (req, res, next) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost');
    if (req.method === 'GET' && pathname === '/') return send(res, 200, 'text/html', shellHtml());
    if (req.method === 'GET' && pathname === '/runtime.js') return send(res, 200, 'application/javascript', runtime());
    if (req.method === 'GET' && pathname === '/manifest') return send(res, 200, 'application/json', JSON.stringify(options.registry.manifest()));
    if (pathname === '/open') {
      handleOpen(req, res, options).catch(next);
      return;
    }
    next();
  };
}

/**
 * 打开编辑器会在本机启动进程，只接受本机检查器页面发来的请求：
 * 必须是 POST + JSON（跨站请求过不了 CORS 预检），来源要与页面同源，并且来自本机（开放局域网访问时别的设备也能打开页面）
 */
async function handleOpen(req: IncomingMessage, res: ServerResponse, options: MiddlewareOptions): Promise<void> {
  if (req.method !== 'POST') return sendError(res, 405, '只接受 POST');
  if (!String(req.headers['content-type']).startsWith('application/json')) return sendError(res, 415, '只接受 JSON');
  if (!isSameOrigin(req)) return sendError(res, 403, '只接受检查器页面发来的请求');
  if (!isLoopback(req.socket.remoteAddress)) return sendError(res, 403, '只能在运行 wxa-runner 的电脑上打开编辑器');

  let body: { id?: unknown; line?: unknown; col?: unknown; component?: unknown };
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    return sendError(res, 400, '请求体不是 JSON');
  }

  const target = resolveTarget(body, options);
  if ('error' in target) return sendError(res, target.status, target.error);
  if (!fs.existsSync(target.file)) return sendError(res, 404, `文件不存在：${target.relative}`);

  try {
    await options.openEditor(target.file, target.line, target.col);
  } catch (error) {
    return sendError(res, 500, (error as Error).message);
  }
  send(res, 200, 'application/json', JSON.stringify({ file: target.relative, line: target.line, col: target.col }));
}

type Target = { file: string; relative: string; line: number; col: number } | { status: number; error: string };

function resolveTarget(body: { id?: unknown; line?: unknown; col?: unknown; component?: unknown }, options: MiddlewareOptions): Target {
  if (body.id !== undefined) {
    const file = Number.isInteger(body.id) ? options.registry.fileOf(body.id as number) : undefined;
    if (file === undefined) return { status: 404, error: `没有 id 为 ${String(body.id)} 的文件` };
    return within(options.sourceRoot, file, positive(body.line), positive(body.col));
  }
  if (typeof body.component === 'string') {
    if (!options.componentRoot) return { status: 404, error: '这个项目不能按组件路径打开' };
    return within(options.componentRoot, `${body.component}.wxml`, 1, 1);
  }
  return { status: 400, error: '缺少 id 或 component' };
}

/** 解析出的文件必须在 root 下，防止 ../ 越界 */
function within(root: string, relative: string, line: number, col: number): Target {
  const file = path.resolve(root, relative);
  const fromRoot = path.relative(root, file);
  if (fromRoot === '' || fromRoot.startsWith(`..${path.sep}`) || fromRoot === '..' || path.isAbsolute(fromRoot)) {
    return { status: 403, error: `不能打开源码目录之外的文件：${relative}` };
  }
  return { file, relative: fromRoot.split(path.sep).join('/'), line, col };
}

function isSameOrigin(req: IncomingMessage): boolean {
  const site = req.headers['sec-fetch-site'];
  if (site !== undefined && site !== 'same-origin') return false;
  const origin = req.headers.origin;
  return origin === undefined || origin === `http://${req.headers.host}`;
}

export function isLoopback(address: string | undefined): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

function positive(value: unknown): number {
  return Number.isInteger(value) && (value as number) > 0 ? (value as number) : 1;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 4096) req.destroy(new Error('请求体过大'));
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function send(res: ServerResponse, status: number, type: string, body: string): void {
  res.statusCode = status;
  res.setHeader('Content-Type', `${type}; charset=utf-8`);
  res.setHeader('Cache-Control', 'no-store');
  res.end(body);
}

function sendError(res: ServerResponse, status: number, message: string): void {
  send(res, status, 'application/json', JSON.stringify({ error: message }));
}

let builtRuntime: string | null = null;

/** 构建产物里 runtime.js 与 index.js 同目录；tsup 的 shims 让 ESM 产物里也有 __dirname */
function readBuiltRuntime(): string {
  builtRuntime ??= fs.readFileSync(path.join(__dirname, 'runtime.js'), 'utf8');
  return builtRuntime;
}
