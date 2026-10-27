import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vite-plus/test';
import { FileIdRegistry } from '../../packages/inspector/src/transform/FileIdRegistry';
import { createMiddleware, isLoopback } from '../../packages/inspector/src/server/middleware';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wxa-inspector-'));
fs.mkdirSync(path.join(root, 'pages/index'), { recursive: true });
fs.mkdirSync(path.join(root, 'components/counter'), { recursive: true });
fs.writeFileSync(path.join(root, 'pages/index/index.wxml'), '<view/>');
fs.writeFileSync(path.join(root, 'components/counter/counter.wxml'), '<view/>');

const registry = new FileIdRegistry();
const indexId = registry.idFor('pages/index/index.wxml');
const missingId = registry.idFor('pages/gone/gone.wxml');
const escapeId = registry.idFor('../outside.wxml');

let opened: Array<[string, number, number]> = [];
let failure: Error | null = null;
let server: http.Server;
let base = '';

beforeAll(async () => {
  const handler = createMiddleware({
    registry,
    sourceRoot: root,
    componentRoot: root,
    runtime: () => 'runtime-code',
    openEditor: async (file, line, col) => {
      if (failure) throw failure;
      opened.push([file, line, col]);
    }
  });
  server = http.createServer((req, res) =>
    handler(req, res, () => {
      res.statusCode = 404;
      res.end('next');
    })
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

afterAll(() => {
  server.close();
  fs.rmSync(root, { recursive: true, force: true });
});

beforeEach(() => {
  opened = [];
  failure = null;
});

const open = (body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}/open`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });

describe('页面、运行时、manifest', () => {
  it('提供检查器页面、运行时和 manifest', async () => {
    expect(await (await fetch(`${base}/`)).text()).toContain('<title>wxa-inspector</title>');
    expect(await (await fetch(`${base}/runtime.js`)).text()).toBe('runtime-code');
    expect(await (await fetch(`${base}/manifest`)).json()).toEqual({
      [indexId]: 'pages/index/index.wxml',
      [missingId]: 'pages/gone/gone.wxml',
      [escapeId]: '../outside.wxml'
    });
  });

  it('其他路径交给下一个处理者', async () => {
    expect(await (await fetch(`${base}/other`)).text()).toBe('next');
  });
});

describe('POST /open', () => {
  it('按 fileId 打开源码根目录下的文件，返回相对路径和行列', async () => {
    const res = await open({ id: indexId, line: 3, col: 5 });
    expect(await res.json()).toEqual({ file: 'pages/index/index.wxml', line: 3, col: 5 });
    expect(opened).toEqual([[path.join(root, 'pages/index/index.wxml'), 3, 5]]);
  });

  it('按组件路径打开组件的 wxml', async () => {
    expect((await open({ component: 'components/counter/counter' })).status).toBe(200);
    expect(opened).toEqual([[path.join(root, 'components/counter/counter.wxml'), 1, 1]]);
  });

  it('越出源码根目录时拒绝', async () => {
    expect((await open({ id: escapeId })).status).toBe(403);
    expect((await open({ component: '../../etc/passwd' })).status).toBe(403);
    expect(opened).toEqual([]);
  });

  it('不认识的 id、不存在的文件返回 404', async () => {
    expect((await open({ id: 999 })).status).toBe(404);
    expect(await (await open({ id: missingId })).json()).toEqual({ error: '文件不存在：pages/gone/gone.wxml' });
    expect(opened).toEqual([]);
  });

  it('打开失败时把原因返回给页面', async () => {
    failure = new Error('没有找到可用的编辑器');
    const res = await open({ id: indexId });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: '没有找到可用的编辑器' });
  });

  it('只接受同源页面发来的 POST + JSON', async () => {
    expect((await fetch(`${base}/open?id=${indexId}`)).status).toBe(405);
    expect((await fetch(`${base}/open`, { method: 'POST', body: JSON.stringify({ id: indexId }) })).status).toBe(415);
    expect((await open({ id: indexId }, { 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403);
    expect((await open({ id: indexId }, { Origin: 'http://evil.example' })).status).toBe(403);
    expect((await open({ id: indexId }, { Origin: base, 'Sec-Fetch-Site': 'same-origin' })).status).toBe(200);
    expect(opened).toHaveLength(1);
  });

  it('只接受本机的请求', () => {
    expect(['127.0.0.1', '::1', '::ffff:127.0.0.1'].every(isLoopback)).toBe(true);
    expect(['192.168.1.5', '::ffff:10.0.0.2', undefined].some(isLoopback)).toBe(false);
  });
});
