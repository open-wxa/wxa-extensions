/**
 * 从页面上的 DOM 元素找到源码位置。基础库内部 API 的访问都在这个文件里：
 *
 * - DOM 元素的 __wxElement 是基础库的节点，dataset 是普通对象，data-wxa-src 读作 dataset.wxaSrc
 * - 自定义组件的内容渲染在宿主标签里面（不是真正的 shadow DOM），沿 parentElement 往上就是节点树的父级
 * - 自定义组件宿主节点的 is 是相对小程序根目录的组件路径，如 components/counter/counter；内置组件是 wx-view 这类
 *
 * 在基础库 2.32.3、3.5.8、3.7.0 上验证过，见 docs/base-library.md。
 */

export type Source =
  | { kind: 'marker'; fileId: number; line: number; col: number }
  /** 没有标记时的兜底：只知道属于哪个自定义组件 */
  | { kind: 'component'; path: string };

export interface Located {
  /** 源码位置对应的元素：带标记的元素，或者兜底时的组件宿主元素。高亮框画在它上面 */
  element: Element;
  source: Source;
}

interface WxNode {
  dataset?: Record<string, unknown>;
  is?: unknown;
}

const MARKER = /^(\d+):(\d+):(\d+)$/;

/** 目标元素自身或最近一个带标记的祖先；都没有时取所在的自定义组件 */
export function locate(target: EventTarget | null): Located | null {
  const start = target instanceof Element ? target : null;
  for (let el = start; el; el = el.parentElement) {
    const marker = wxNode(el)?.dataset?.wxaSrc;
    const match = typeof marker === 'string' ? MARKER.exec(marker) : null;
    if (match) return { element: el, source: { kind: 'marker', fileId: +match[1], line: +match[2], col: +match[3] } };
  }
  for (let el = start; el; el = el.parentElement) {
    const is = wxNode(el)?.is;
    if (typeof is === 'string' && is.includes('/')) return { element: el, source: { kind: 'component', path: is } };
  }
  return null;
}

function wxNode(el: Element): WxNode | null {
  const node = (el as { __wxElement?: unknown }).__wxElement;
  return node && typeof node === 'object' ? (node as WxNode) : null;
}
