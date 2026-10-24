/**
 * 高亮层：画在渲染层页面自己的 document 里，坐标就是页面视口坐标，不用换算外层 iframe 和设备缩放。
 * 放在 Shadow DOM 里，页面的样式影响不到它，它的样式也不会漏到页面上。
 *
 * 高亮框贴着元素（圆角跟随元素），信息卡片显示标签名、rpx 尺寸和源码位置，带箭头指向元素。
 */

export interface Highlight {
  element: Element;
  /** 去掉 wx- 前缀的标签名：view、button，自定义组件是 counter 这样的组件名 */
  tag: string;
  /** 源码文件，不知道时为 null */
  file: string | null;
  line?: number;
  col?: number;
  /** 只定位到所属组件（没有元素级标记） */
  componentOnly: boolean;
}

const STYLE = `
:host { all: initial; }
* { box-sizing: border-box; }
.box, .card { position: fixed; z-index: 2147483647; pointer-events: none; }
.box {
  border: 1.5px solid #8b5cf6;
  background: rgba(139, 92, 246, .12);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, .55);
}
.box.picked { animation: picked .4s ease-out; }
@keyframes picked { from { background: rgba(139, 92, 246, .45); } }
.card {
  --arrow-x: 12px;
  max-width: calc(100vw - 12px);
  padding: 6px 9px 7px;
  border-radius: 7px;
  background: #18181b;
  color: #e4e4e7;
  box-shadow: 0 6px 18px rgba(0, 0, 0, .28), 0 0 0 1px rgba(255, 255, 255, .06);
  font: 12px/1.35 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
}
.card::after {
  content: ""; position: absolute; left: var(--arrow-x); width: 8px; height: 8px;
  background: #18181b; transform: translateX(-50%) rotate(45deg);
}
.card.above::after { bottom: -4px; }
.card.below::after { top: -4px; }
.head { display: flex; align-items: baseline; gap: 6px; }
.tag { color: #c4b5fd; font-weight: 600; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.badge { padding: 0 4px; border: 1px solid #52525b; border-radius: 3px; color: #a1a1aa; font-size: 10px; line-height: 14px; }
.size { margin-left: auto; padding-left: 10px; color: #a1a1aa; font-size: 11px; white-space: nowrap; }
.source { display: flex; margin-top: 3px; font: 11.5px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: nowrap; }
.dir { min-width: 0; overflow: hidden; text-overflow: ellipsis; color: #71717a; }
.name { flex: none; color: #fafafa; }
.pos { flex: none; color: #c4b5fd; }
@media (prefers-reduced-motion: reduce) { .box.picked { animation: none; } }
`;

/** 卡片与元素的间距（含箭头），以及离视口边缘的最小距离 */
const GAP = 8;
const EDGE = 6;

export class Overlay {
  private root: ShadowRoot | null = null;
  private host: HTMLElement | null = null;
  private box!: HTMLElement;
  private card!: HTMLElement;
  private cursor: HTMLStyleElement | null = null;
  private current: Highlight | null = null;
  private frame = 0;

  constructor() {
    const follow = () => {
      if (!this.current || this.frame) return;
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.place();
      });
    };
    addEventListener('scroll', follow, true);
    addEventListener('resize', follow);
  }

  /** 检查时整页显示十字光标 */
  setActive(active: boolean): void {
    if (active) {
      this.cursor ??= Object.assign(document.createElement('style'), { textContent: '*{cursor:crosshair!important}' });
      document.documentElement.appendChild(this.cursor);
    } else {
      this.cursor?.remove();
      this.hide();
    }
  }

  show(highlight: Highlight): void {
    this.mount();
    this.current = highlight;
    this.renderCard(highlight);
    this.box.classList.remove('picked');
    this.box.style.borderRadius = getComputedStyle(highlight.element).borderRadius;
    this.place();
  }

  /** 点中时闪一下 */
  flash(): void {
    if (!this.current) return;
    this.box.classList.remove('picked');
    void this.box.offsetWidth;
    this.box.classList.add('picked');
  }

  hide(): void {
    this.current = null;
    this.host?.remove();
  }

  private mount(): void {
    if (!this.root) {
      this.host = document.createElement('wxa-inspector');
      this.root = this.host.attachShadow({ mode: 'open' });
      this.root.innerHTML = `<style>${STYLE}</style><div class="box" data-wxa-inspector="box"></div><div class="card" data-wxa-inspector="card"></div>`;
      this.box = this.root.querySelector('.box')!;
      this.card = this.root.querySelector('.card')!;
    }
    // 页面重新渲染时可能被移出文档
    if (!this.host!.isConnected) document.documentElement.appendChild(this.host!);
  }

  private renderCard({ element, tag, file, line, col, componentOnly }: Highlight): void {
    const rect = element.getBoundingClientRect();
    // 小程序按 750rpx = 屏幕宽度写样式，渲染层页面的宽度就是屏幕宽度
    const rpx = (px: number) => Math.round((px * 750) / innerWidth);
    const slash = file ? file.lastIndexOf('/') + 1 : 0;

    this.card.replaceChildren(
      el('div', 'head', [
        el('span', 'tag', tag),
        componentOnly ? el('span', 'badge', '组件') : null,
        el('span', 'size', `${rpx(rect.width)} × ${rpx(rect.height)} rpx`)
      ]),
      el(
        'div',
        'source',
        file
          ? [
              el('span', 'dir', file.slice(0, slash)),
              el('span', 'name', file.slice(slash)),
              line ? el('span', 'pos', `:${line}:${col}`) : null
            ]
          : [el('span', 'dir', '位置未知')],
        { 'data-wxa-inspector': 'source' }
      )
    );
  }

  private place(): void {
    const highlight = this.current;
    if (!highlight) return;
    if (!highlight.element.isConnected) return this.hide();
    const rect = highlight.element.getBoundingClientRect();
    Object.assign(this.box.style, {
      left: px(rect.left),
      top: px(rect.top),
      width: px(rect.width),
      height: px(rect.height)
    });

    // 卡片默认在元素上方，放不下时放下方，都放不下时贴在视口顶部；水平方向对齐元素左边，不超出视口
    const { offsetWidth: width, offsetHeight: height } = this.card;
    const fitsAbove = rect.top - GAP - height >= EDGE;
    const fitsBelow = rect.bottom + GAP + height <= innerHeight - EDGE;
    const top = fitsAbove ? rect.top - GAP - height : fitsBelow ? rect.bottom + GAP : EDGE;
    const left = Math.min(Math.max(rect.left, EDGE), Math.max(innerWidth - width - EDGE, EDGE));
    this.card.className = `card ${fitsAbove ? 'above' : fitsBelow ? 'below' : ''}`;
    // 箭头指向元素的左段，跟着卡片的水平偏移调整
    const arrow = Math.min(Math.max(rect.left + Math.min(rect.width / 2, 16) - left, 10), width - 10);
    this.card.style.setProperty('--arrow-x', px(arrow));
    Object.assign(this.card.style, { left: px(left), top: px(top) });
  }
}

function px(value: number): string {
  return `${value}px`;
}

function el(
  tag: string,
  className: string,
  content: string | Array<Node | null>,
  attrs: Record<string, string> = {}
): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  if (typeof content === 'string') node.textContent = content;
  else node.append(...content.filter((child): child is Node => child !== null));
  return node;
}
