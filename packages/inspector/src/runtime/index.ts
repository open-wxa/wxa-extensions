/**
 * 检查器运行时：注入每个渲染层页面，在基础库之前执行（webviewScripts 的 position: 'head'）。
 *
 * 必须抢在基础库之前：基础库 2.x 自己在 window 捕获阶段监听 touch 事件，晚注册的拦截拦不住 tap。
 * 所以事件监听在这里一次注册好，开关只改变监听里的行为；执行时 DOM 还没就绪，高亮层等到要显示时才创建。
 *
 * 开关状态由检查器页面（window.top）统一管理：加载后发 hello 要当前状态，之后接收 state 广播。
 */

import { locate, type Located } from './locate';
import { Overlay, type Highlight } from './Overlay';

const SOURCE = 'wxa-inspector';
const API = '/__wxa-inspector__';
/**
 * wxa-runner 把鼠标操作转成 touch 事件派发，基础库再从 touchstart / touchend 合成 tap，没有 DOM 层的 tap 事件可拦；
 * 浏览器原生的 click 照常派发，也一并拦下
 */
const BLOCKED_EVENTS = ['touchstart', 'touchmove', 'touchend', 'touchcancel', 'click'];

let enabled = false;
const overlay = new Overlay();
const manifest = createManifest();

function post(message: Record<string, unknown>): void {
  if (window.top !== window) window.top!.postMessage({ source: SOURCE, ...message }, location.origin);
}

function setEnabled(value: boolean): void {
  enabled = value;
  overlay.setActive(value);
}

addEventListener('message', event => {
  const data = event.data;
  if (event.origin === location.origin && data?.source === SOURCE && data.kind === 'state') setEnabled(data.enabled === true);
});

for (const type of BLOCKED_EVENTS) {
  addEventListener(type, event => {
    if (!enabled) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (type === 'click') {
      overlay.flash();
      void open(locate(event.target));
    }
  }, { capture: true, passive: false });
}

addEventListener('mouseover', event => {
  if (enabled) void hover(locate(event.target));
}, true);

// 鼠标离开页面时收起高亮
addEventListener('mouseout', event => {
  if (enabled && !(event as MouseEvent).relatedTarget) overlay.hide();
}, true);

// 焦点在页面里时，快捷键交给检查器页面处理
addEventListener('keydown', event => {
  if ((event.altKey && event.shiftKey && event.code === 'KeyC') || event.key === 'Escape') {
    post({ kind: 'key', key: event.key, code: event.code, altKey: event.altKey, shiftKey: event.shiftKey });
  }
}, true);

post({ kind: 'hello' });

let hovering = 0;
async function hover(located: Located | null): Promise<void> {
  const current = ++hovering;
  if (!located) return overlay.hide();
  const highlight = await describeHighlight(located);
  // 等 manifest 时鼠标可能已经移到别处
  if (current === hovering && enabled) overlay.show(highlight);
}

async function open(located: Located | null): Promise<void> {
  if (!located) return;
  const { source } = located;
  const body = source.kind === 'marker' ? { id: source.fileId, line: source.line, col: source.col } : { component: source.path };
  try {
    const res = await fetch(`${API}/open`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await res.json();
    if (res.ok) post({ kind: 'opened', label: `${result.file}:${result.line}:${result.col}` });
    else post({ kind: 'failed', message: result.error });
  } catch (error) {
    post({ kind: 'failed', message: `连不上开发服务器（${(error as Error).message}）` });
  }
}

async function describeHighlight({ element, source }: Located): Promise<Highlight> {
  const tag = element.tagName.toLowerCase().replace(/^wx-/, '');
  if (source.kind === 'component') return { element, tag, file: `${source.path}.wxml`, componentOnly: true };
  const file = (await manifest.fileOf(source.fileId)) ?? null;
  return { element, tag, file, line: source.line, col: source.col, componentOnly: false };
}

/** fileId → 文件路径；遇到不认识的 id（刚热更新过）再拉一次 */
function createManifest() {
  let files: Record<string, string> = {};
  let loading: Promise<void> | null = null;
  const refresh = () => (loading ??= fetch(`${API}/manifest`)
    .then(res => res.json())
    .then(result => { files = result; }, () => undefined)
    .finally(() => { loading = null; }));
  return {
    async fileOf(id: number): Promise<string | undefined> {
      if (!(id in files)) await refresh();
      return files[id];
    }
  };
}
