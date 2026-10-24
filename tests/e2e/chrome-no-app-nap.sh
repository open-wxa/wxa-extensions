#!/bin/sh
# macOS 上 e2e 经这个脚本启动 Chrome，关掉 App Nap，原因见 inspector.test.ts 的 launchChrome。
# Playwright 不接受 args 里的位置参数，所以在这里加到命令行末尾，由 Cocoa 读成这个进程自己的设置，不影响平时用的 Chrome
exec "${WXA_CHROME_BINARY:?要由 inspector.test.ts 的 launchChrome 传入 Chrome 的路径}" "$@" -NSAppSleepDisabled YES
