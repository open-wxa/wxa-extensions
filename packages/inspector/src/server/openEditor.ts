import launchEditor from 'launch-editor';

/** 打开编辑器；失败时抛出（reject）带原因的错误，原因会显示在检查器页面上 */
export type OpenEditor = (file: string, line: number, col: number) => void | Promise<void>;

/** launch-editor 启动失败（没有可用的编辑器、命令不存在）都在这段时间内报告 */
const LAUNCH_FAILURE_WINDOW = 300;

/**
 * 默认用 launch-editor 打开：按 LAUNCH_EDITOR 环境变量或正在运行的编辑器选择。
 * launch-editor 只在失败时回调，所以等一小段时间没有报错就当作已经打开
 */
export const launchInEditor: OpenEditor = (file, line, col) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, LAUNCH_FAILURE_WINDOW);
    launchEditor(`${file}:${line}:${col}`, (_fileName: string, message: string | null) => {
      clearTimeout(timer);
      reject(new Error(message ?? '没有找到可用的编辑器，用环境变量 LAUNCH_EDITOR 指定，如 LAUNCH_EDITOR=code'));
    });
  });
