/**
 * 检查器页面：铺满整页的 wxa-runner 宿主页面（iframe），上面浮着右下角的检查按钮、按钮上方的状态气泡和顶部的构建错误卡片。
 *
 * 开关状态只存在这里，广播给各层 frame；渲染层页面的运行时加载后发 hello 来要当前状态，
 * 点选结果（打开源码，或按住 Alt 点击复制源码位置）发回来显示在气泡里。构建错误连 wxa-runner 的 /__wxa__/ws：编译失败时显示，重新编译成功后收起。
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
<iframe class="app" title="小程序"></iframe>
<div class="build-error" role="alert" hidden>
  <div class="build-error-title">编译失败</div>
  <pre class="build-error-text"></pre>
  <button class="build-error-close" type="button" aria-label="关闭">${CLOSE}</button>
</div>
<div class="dock">
  <div class="status" role="status"></div>
  <button class="toggle" type="button" aria-pressed="false">${CROSSHAIR}<span class="alert-dot" hidden></span></button>
</div>
<script>${SCRIPT}</script>
</body>
</html>`;
}

const CROSSHAIR =
  '<svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M7.25 1h1.5v2.08A5 5 0 0 1 12.92 7.25H15v1.5h-2.08a5 5 0 0 1-4.17 4.17V15h-1.5v-2.08A5 5 0 0 1 3.08 8.75H1v-1.5h2.08A5 5 0 0 1 7.25 3.08zM8 4.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7m0 2a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3"/></svg>';

const CLOSE =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06"/></svg>';

const STYLE = `
:root { color-scheme: light; --ink: #18181b; --muted: #52525b; --ok: #22c55e; --err: #ef4444; }
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; overflow: hidden; }
body { font: 13px/1.4 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; background: #eef0f3; }
.app { position: fixed; inset: 0; width: 100%; height: 100%; border: 0; }

.dock { position: fixed; right: 20px; bottom: 20px; z-index: 10; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
.toggle {
  position: relative; display: grid; place-items: center; width: 40px; height: 40px; padding: 0;
  border: 1px solid rgba(0, 0, 0, .08); border-radius: 50%;
  background: rgba(255, 255, 255, .85); color: var(--muted);
  -webkit-backdrop-filter: blur(12px) saturate(180%); backdrop-filter: blur(12px) saturate(180%);
  box-shadow: 0 4px 16px rgba(0, 0, 0, .1), 0 1px 2px rgba(0, 0, 0, .06);
  cursor: pointer; transition: background .15s, color .15s, transform .15s;
}
.toggle:hover { background: #fff; color: var(--ink); }
.toggle:active { transform: scale(.94); }
.toggle:focus-visible { outline: 2px solid rgba(24, 24, 27, .35); outline-offset: 2px; }
.toggle[aria-pressed="true"] { background: var(--ink); border-color: var(--ink); color: #fff; }
.alert-dot { position: absolute; top: 4px; right: 4px; width: 9px; height: 9px; border: 2px solid #fff; border-radius: 50%; background: var(--err); }

.status {
  display: flex; align-items: center; gap: 7px; max-width: min(360px, calc(100vw - 40px)); padding: 6px 10px;
  border-radius: 8px; background: rgba(24, 24, 27, .92); color: #e4e4e7;
  box-shadow: 0 6px 18px rgba(0, 0, 0, .18); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  opacity: 0; transform: translateY(4px); pointer-events: none; transition: opacity .15s, transform .15s;
}
.status.show { opacity: 1; transform: none; }
.status.ok::before, .status.err::before { content: ""; flex: none; width: 6px; height: 6px; border-radius: 50%; }
.status.ok::before { background: var(--ok); }
.status.err::before { background: var(--err); }
.status code { font: 11.5px ui-monospace, SFMono-Regular, Menlo, monospace; color: #fafafa; }

.build-error {
  position: fixed; top: 16px; left: 50%; z-index: 10; width: min(760px, calc(100vw - 32px)); max-height: 40vh; overflow: auto;
  padding: 10px 40px 12px 14px; border: 1px solid #fecaca; border-left: 3px solid var(--err); border-radius: 10px;
  background: #fff; box-shadow: 0 8px 24px rgba(0, 0, 0, .12); transform: translateX(-50%);
}
.build-error[hidden] { display: none; }
.build-error-title { margin-bottom: 4px; color: #b91c1c; font-weight: 600; }
.build-error-text { margin: 0; color: #7f1d1d; font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; }
.build-error-close {
  position: absolute; top: 8px; right: 8px; display: grid; place-items: center; width: 24px; height: 24px; padding: 0;
  border: 0; border-radius: 6px; background: transparent; color: #a1a1aa; cursor: pointer;
}
.build-error-close:hover { background: #f4f4f5; color: var(--ink); }

@media (prefers-reduced-motion: reduce) { .toggle, .status { transition: none; } }
`;

const SCRIPT = `
(function () {
  var SOURCE = 'wxa-inspector';
  var isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  var toggle = document.querySelector('.toggle');
  var statusEl = document.querySelector('.status');
  var buildError = document.querySelector('.build-error');
  var buildErrorText = document.querySelector('.build-error-text');
  var alertDot = document.querySelector('.alert-dot');
  var app = document.querySelector('.app');
  var enabled = false;
  var hideTimer = null;

  var alt = isMac ? '⌥' : 'Alt+';
  var label = '检查元素：点击打开源码，' + alt + '点击复制源码位置（' + (isMac ? '⌥⇧C' : 'Alt+Shift+C') + '）';
  toggle.title = label;
  toggle.setAttribute('aria-label', label);
  // 查询参数原样交给宿主页面：?path=pages/detail/detail 直接打开对应页面
  app.src = '/' + location.search;

  // 气泡到时间只是收起，文字留着：无障碍工具和测试都按 .status 的内容读结果
  function setStatus(kind, html, duration) {
    clearTimeout(hideTimer);
    statusEl.className = 'status' + (kind ? ' ' + kind : '') + (html ? ' show' : '');
    if (html) statusEl.innerHTML = html;
    if (duration) hideTimer = setTimeout(idleStatus, duration);
  }

  function escape(text) {
    return String(text).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; });
  }

  function idleStatus() {
    setStatus('', enabled ? '悬停选择元素，点击打开源码，' + alt + '点击复制位置，Esc 退出' : '');
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
      setStatus('ok', '已在编辑器打开 <code>' + escape(data.label) + '</code>', 2500);
    } else if (data.kind === 'failed') {
      setStatus('err', '打开失败：' + escape(data.message), 6000);
    } else if (data.kind === 'copied') {
      setStatus('ok', '已复制 <code>' + escape(data.label) + '</code>', 2500);
    } else if (data.kind === 'copy-failed') {
      setStatus('err', '复制失败：' + escape(data.message), 6000);
    }
  });

  function showBuildError(message) {
    buildErrorText.textContent = message || '';
    buildError.hidden = !message;
    alertDot.hidden = !message;
  }

  // 只收起卡片，按钮上的红点留到重新编译成功
  document.querySelector('.build-error-close').addEventListener('click', function () { buildError.hidden = true; });

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
