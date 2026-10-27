/** wxa-runner-core 是对等依赖，启动时才加载；单独成模块，测试里换成假的开发服务器 */
export function loadRunner(): Promise<typeof import('@open-wxa/wxa-runner-core')> {
  return import('@open-wxa/wxa-runner-core');
}
