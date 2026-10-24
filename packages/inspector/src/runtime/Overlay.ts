/**
 * 高亮框和位置标签，画在渲染层页面自己的 document 里：坐标就是页面视口坐标，不用换算外层 iframe 和设备缩放。
 * 滚动、窗口尺寸变化时跟着元素重新定位。
 */

const BOX_STYLE = 'position:fixed;z-index:2147483646;pointer-events:none;box-sizing:border-box;'
  + 'border:1px solid #3478f6;background:rgba(52,120,246,.14);border-radius:2px;';
const LABEL_STYLE = 'position:fixed;z-index:2147483647;pointer-events:none;max-width:calc(100vw - 8px);overflow:hidden;'
  + 'padding:2px 6px;border-radius:4px;background:#16181d;color:#fff;white-space:nowrap;text-overflow:ellipsis;'
  + 'font:11px/16px ui-monospace,SFMono-Regular,Menlo,monospace;box-shadow:0 2px 6px rgba(0,0,0,.25);';
const CURSOR_STYLE = '*{cursor:crosshair!important}';

const LABEL_GAP = 4;
const EDGE = 4;

export class Overlay {
  private box: HTMLElement | null = null;
  private label: HTMLElement | null = null;
  private cursor: HTMLStyleElement | null = null;
  private target: Element | null = null;
  private frame = 0;

  constructor() {
    const reposition = () => {
      if (!this.target || this.frame) return;
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.place();
      });
    };
    addEventListener('scroll', reposition, true);
    addEventListener('resize', reposition);
  }

  /** 检查时全页显示十字光标 */
  setActive(active: boolean): void {
    if (active) {
      this.cursor ??= Object.assign(document.createElement('style'), { textContent: CURSOR_STYLE });
      document.documentElement.appendChild(this.cursor);
    } else {
      this.cursor?.remove();
      this.hide();
    }
  }

  show(target: Element, text: string): void {
    this.target = target;
    this.ensure();
    this.label!.textContent = text;
    this.place();
  }

  hide(): void {
    this.target = null;
    this.box?.remove();
    this.label?.remove();
  }

  private ensure(): void {
    this.box ??= element('box', BOX_STYLE);
    this.label ??= element('label', LABEL_STYLE);
    // 页面热更新、重新渲染时可能被移出文档，每次显示前补回去
    if (!this.box.isConnected) document.documentElement.appendChild(this.box);
    if (!this.label.isConnected) document.documentElement.appendChild(this.label);
  }

  private place(): void {
    if (!this.target || !this.box || !this.label) return;
    if (!this.target.isConnected) return this.hide();
    const rect = this.target.getBoundingClientRect();
    Object.assign(this.box.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });

    // 标签默认在框上方；上方放不下放到下方，下方也放不下就贴着框内顶部。水平方向不超出视口
    const { offsetWidth: width, offsetHeight: height } = this.label;
    let top = rect.top - height - LABEL_GAP;
    if (top < EDGE) top = rect.bottom + LABEL_GAP + height <= innerHeight - EDGE ? rect.bottom + LABEL_GAP : Math.max(rect.top, 0) + EDGE;
    const left = Math.min(Math.max(rect.left, EDGE), Math.max(innerWidth - width - EDGE, EDGE));
    Object.assign(this.label.style, { left: `${left}px`, top: `${top}px` });
  }
}

function element(role: string, cssText: string): HTMLElement {
  const el = document.createElement('div');
  el.dataset.wxaInspector = role;
  el.style.cssText = cssText;
  return el;
}
