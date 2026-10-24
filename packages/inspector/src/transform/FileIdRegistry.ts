/**
 * 源文件的短 id：标记里写 id 而不是路径，模板不会因为长路径膨胀。
 *
 * id 按首次登记的顺序自增，进程内不回收：热更新后页面上还留着的旧标记依然能查到文件。
 * uni 等框架的插件在自己的编译环节登记，再把同一个实例交给 inspector({ markers: 'external' })。
 */
export class FileIdRegistry {
  private readonly ids = new Map<string, number>();
  private readonly files: string[] = [];

  /** 登记文件并返回它的 id；file 是相对源码根目录的 posix 路径 */
  idFor(file: string): number {
    let id = this.ids.get(file);
    if (id === undefined) {
      id = this.files.push(file) - 1;
      this.ids.set(file, id);
    }
    return id;
  }

  fileOf(id: number): string | undefined {
    return this.files[id];
  }

  /** id → 文件，浏览器端用它把标记显示成路径 */
  manifest(): Record<string, string> {
    return Object.fromEntries(this.files.map((file, id) => [id, file]));
  }
}
