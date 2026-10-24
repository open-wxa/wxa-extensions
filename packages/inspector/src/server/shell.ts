/**
 * 检查器页面：顶部工具栏 + 构建错误条 + 运行小程序的 wxa-runner 宿主页面（iframe）。
 *
 * 开关状态只存在这里，广播给各层 frame；渲染层页面的运行时加载后发 hello 来要当前状态，
 * 点选结果发回来显示在状态栏。构建错误连 wxa-runner 的 /__wxa__/ws：编译失败时显示，重新编译成功后收起。
 */

export function shellHtml(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>wxa-inspector</title>
<style>${STYLE}</style>
</head>
<body>
<header class="bar">
  <span class="brand">${CROSSHAIR}wxa-inspector</span>
  <button class="toggle" type="button" aria-pressed="false">${CROSSHAIR}<span class="toggle-text">检查元素</span><kbd class="shortcut"></kbd></button>
  <span class="status" role="status"></span>
  <a class="plain" href="/" target="_blank" rel="noopener" title="不带检查器，单独打开 wxa-runner 的页面">单独打开</a>
</header>
<pre class="build-error" hidden></pre>
<iframe class="app" title="小程序"></iframe>
<script>${SCRIPT}</script>
</body>
</html>`;
}

const CROSSHAIR = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M7.25 1h1.5v2.08A5 5 0 0 1 12.92 7.25H15v1.5h-2.08a5 5 0 0 1-4.17 4.17V15h-1.5v-2.08A5 5 0 0 1 3.08 8.75H1v-1.5h2.08A5 5 0 0 1 7.25 3.08zM8 4.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7m0 2a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3"/></svg>';

const STYLE = `
:root { color-scheme: light; --bar: #16181d; --line: #2c3038; --text: #d7dae0; --muted: #8b929e; --accent: #8b5cf6; --ok: #3fb950; --err: #f85149; }
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body { display: flex; flex-direction: column; font: 13px/1.4 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; background: #eef0f3; }
.bar { flex: none; display: flex; align-items: center; gap: 12px; height: 44px; padding: 0 14px; background: var(--bar); color: var(--text); border-bottom: 1px solid var(--line); }
.brand { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; letter-spacing: .2px; }
.brand svg { color: var(--accent); }
.toggle { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border: 1px solid var(--line); border-radius: 6px; background: #22252c; color: var(--text); font: inherit; cursor: pointer; }
.toggle:hover { border-color: #3b404a; background: #282c34; }
.toggle:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.toggle[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: #fff; }
.shortcut { padding: 0 5px; border-radius: 4px; background: rgba(255,255,255,.08); color: inherit; font: 11px/18px ui-monospace, SFMono-Regular, Menlo, monospace; opacity: .75; }
.status { flex: 1; min-width: 0; overflow: hidden; color: var(--muted); white-space: nowrap; text-overflow: ellipsis; }
.status code { font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--text); }
.status.ok { color: var(--ok); }
.status.err { color: var(--err); }
.plain { color: var(--muted); text-decoration: none; }
.plain:hover { color: var(--text); }
.build-error { flex: none; max-height: 35%; margin: 0; padding: 10px 14px; overflow: auto; background: #3a1d1f; color: #ffd8d6; border-bottom: 1px solid #5c2a2d; font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; }
.app { flex: 1; width: 100%; border: 0; }
`;

const SCRIPT = `
(function () {
  var SOURCE = 'wxa-inspector';
  var isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  var toggle = document.querySelector('.toggle');
  var statusEl = document.querySelector('.status');
  var buildError = document.querySelector('.build-error');
  var app = document.querySelector('.app');
  var enabled = false;

  document.querySelector('.shortcut').textContent = isMac ? '⌥⇧C' : 'Alt+Shift+C';
  // 查询参数原样交给宿主页面：?path=pages/detail/detail 直接打开对应页面
  app.src = '/' + location.search;

  function setStatus(kind, html) {
    statusEl.className = 'status' + (kind ? ' ' + kind : '');
    statusEl.innerHTML = html;
  }

  function escape(text) {
    return String(text).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; });
  }

  function idleStatus() {
    setStatus('', enabled ? '移动鼠标选择元素，点击在编辑器里打开，Esc 退出' : '');
  }

  function setEnabled(value) {
    enabled = value;
    toggle.setAttribute('aria-pressed', String(enabled));
    idleStatus();
    broadcast(window);
  }

  // 宿主页面和每个渲染层页面都可能在跳转中重建，按当前的 frame 树逐个发
  function broadcast(win) {
    for (var i = 0; i < win.frames.length; i++) {
      win.frames[i].postMessage({ source: SOURCE, kind: 'state', enabled: enabled }, location.origin);
      broadcast(win.frames[i]);
    }
  }

  function isToggleKey(e) { return e.altKey && e.shiftKey && e.code === 'KeyC'; }

  function onKey(e) {
    if (isToggleKey(e)) setEnabled(!enabled);
    else if (e.key === 'Escape' && enabled) setEnabled(false);
  }

  toggle.addEventListener('click', function () { setEnabled(!enabled); });
  window.addEventListener('keydown', function (e) {
    if (isToggleKey(e) || (e.key === 'Escape' && enabled)) { e.preventDefault(); onKey(e); }
  });

  window.addEventListener('message', function (event) {
    var data = event.data;
    if (event.origin !== location.origin || !data || data.source !== SOURCE) return;
    if (data.kind === 'hello') {
      event.source.postMessage({ source: SOURCE, kind: 'state', enabled: enabled }, location.origin);
    } else if (data.kind === 'key') {
      onKey(data);
    } else if (data.kind === 'opened') {
      setStatus('ok', '已在编辑器打开 <code>' + escape(data.label) + '</code>');
    } else if (data.kind === 'failed') {
      setStatus('err', '打开失败：' + escape(data.message));
    }
  });

  function showBuildError(message) {
    buildError.textContent = message || '';
    buildError.hidden = !message;
  }

  fetch('/__wxa__/app-info.json').then(function (res) { return res.json(); })
    .then(function (info) { showBuildError(info.buildError); }, function () {});

  try {
    var socket = new WebSocket((location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + '/__wxa__/ws');
    socket.addEventListener('message', function (event) {
      var message = JSON.parse(event.data);
      if (message.type === 'error') showBuildError(message.message);
      else if (message.type === 'hot' || message.type === 'reload') showBuildError('');
    });
  } catch (e) {}

  idleStatus();
})();
`;
