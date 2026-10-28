/**
 * 给 .vue 模板里的元素加源码标记，标记格式与 instrumentWxml 相同：标签名后插入 ` data-wxa-src="<fileId>:<行>:<列>"`，
 * 行列是 .vue 文件里的位置。只插入不改动其他字节，插入的内容不含换行。
 *
 * 处理的是磁盘上的原始文件，早于 uni 的条件编译：各平台分支里不配对的开始、结束标签会让 Vue 解析报错，所以不建树，
 * 只用 compiler-sfc 找出 <template> 块，块内按 Vue 的模板语法只扫描开始标签。
 * 与 wxml 的区别：标签名可以带点号（<Foo.Bar>）；引号里的 {{ 是普通字符；v-pre 里的 {{ 不是插值，里面的标签照常标记。
 */

import MagicString from 'magic-string';
import { MARKER_ATTRIBUTE } from './instrumentWxml';

/** compiler-sfc 的 parse，只用到 template 块的范围和写法 */
export type ParseSfc = (
  code: string,
  options: { filename: string }
) => {
  descriptor: {
    template: { src?: string; lang?: string; loc: { start: { offset: number }; end: { offset: number } } } | null;
  };
};

export interface InstrumentedSource {
  code: string;
  map: ReturnType<MagicString['generateMap']>;
}

/**
 * 不加标记的标签：
 * - template、slot、block 不渲染成元素，标记加上也读不到
 * - page-meta、navigation-bar 是页面配置节点
 * - KuRootView / ku-root-view 是 @uni-ku/root 的占位标签，它按原文匹配后换成 <slot />，加了属性就匹配不上
 */
const SKIPPED_TAGS = new Set([
  'template',
  'slot',
  'block',
  'page-meta',
  'navigation-bar',
  'KuRootView',
  'ku-root-view'
]);

/** 写了这些属性的元素已经有标记（或由用户自己绑定），不再添加 */
const MARKER_NAMES = new Set([MARKER_ATTRIBUTE, `:${MARKER_ATTRIBUTE}`, `v-bind:${MARKER_ATTRIBUTE}`]);

/** 没有可以插标记的内联 HTML 模板（没有 template、src 引用外部文件、pug 等其他写法）或一个标记都没加时返回 null */
export function instrumentVue(
  code: string,
  options: { fileId: number; filename: string; parse: ParseSfc }
): InstrumentedSource | null {
  const template = options.parse(code, { filename: options.filename }).descriptor.template;
  if (!template || template.src || (template.lang && template.lang !== 'html')) return null;

  const out = new MagicString(code);
  const positionOf = createPositionCounter(code);
  let inserted = false;
  scanTemplate(code, template.loc.start.offset, template.loc.end.offset, true, (tagStart, nameEnd) => {
    out.appendLeft(nameEnd, ` ${MARKER_ATTRIBUTE}="${options.fileId}:${positionOf(tagStart)}"`);
    inserted = true;
  });
  if (!inserted) return null;
  return {
    code: out.toString(),
    map: out.generateMap({ hires: true, source: options.filename, includeContent: true })
  };
}

/** 位置 index 的行列，从 1 开始；列按 UTF-16 码元计，与 VS Code 一致。index 必须递增 */
function createPositionCounter(code: string) {
  let line = 1;
  let lineStart = 0;
  let counted = 0;
  return (index: number) => {
    for (; counted < index; counted++) {
      if (code.charCodeAt(counted) === 10) {
        line++;
        lineStart = counted + 1;
      }
    }
    return `${line}:${index - lineStart + 1}`;
  };
}

/** 扫描 [from, to) 里的开始标签，按出现顺序对要标记的标签调用 mark；interpolation 为 false 时 {{ 是普通文本（v-pre 里） */
function scanTemplate(
  code: string,
  from: number,
  to: number,
  interpolation: boolean,
  mark: (tagStart: number, nameEnd: number) => void
): void {
  let i = from;
  while (i < to) {
    if (interpolation && code.startsWith('{{', i)) {
      i = skipInterpolation(code, i, to);
    } else if (code.startsWith('<!--', i)) {
      i = indexAfter(code, '-->', i + 4, to);
    } else if (code[i] === '<' && isLetter(code.charCodeAt(i + 1))) {
      const tag = scanStartTag(code, i, to);
      if (!SKIPPED_TAGS.has(tag.name) && !tag.attributes.some((name) => MARKER_NAMES.has(name))) mark(i, tag.nameEnd);
      i = tag.end;
      if (tag.attributes.includes('v-pre') && !tag.selfClosing) {
        const closing = findClosingTag(code, tag.name, tag.end, to);
        scanTemplate(code, tag.end, closing.start, false, mark);
        i = closing.end;
      }
    } else {
      i++;
    }
  }
}

interface StartTag {
  name: string;
  /** 标签名结束的位置，标记插在这里 */
  nameEnd: number;
  /** 开始标签结束（> 之后）的位置 */
  end: number;
  selfClosing: boolean;
  attributes: string[];
}

/** 按 Vue 的模板语法读开始标签：标签名、属性名到空白、/、> 为止，属性值只有引号或空白、> 两种边界 */
function scanStartTag(code: string, start: number, to: number): StartTag {
  let nameEnd = start + 1;
  while (nameEnd < to && !isNameEnd(code[nameEnd])) nameEnd++;
  const name = code.slice(start + 1, nameEnd);
  const attributes: string[] = [];

  let i = nameEnd;
  while (i < to) {
    const ch = code[i];
    if (ch === '>') return { name, nameEnd, end: i + 1, selfClosing: code[i - 1] === '/', attributes };
    if (isSpace(ch) || ch === '/') {
      i++;
      continue;
    }
    const attributeStart = i;
    while (i < to && !isNameEnd(code[i]) && code[i] !== '=') i++;
    if (i === attributeStart) i++;
    attributes.push(code.slice(attributeStart, i));
    i = skipSpaces(code, i, to);
    if (code[i] === '=') i = skipAttributeValue(code, skipSpaces(code, i + 1, to), to);
  }
  return { name, nameEnd, end: to, selfClosing: false, attributes };
}

function skipAttributeValue(code: string, start: number, to: number): number {
  const quote = code[start];
  if (quote === '"' || quote === "'") return indexAfter(code, quote, start + 1, to);
  let i = start;
  while (i < to && !isSpace(code[i]) && code[i] !== '>') i++;
  return i;
}

/** v-pre 元素对应的结束标签：同名的开始、结束标签按层数配对；找不到时到范围末尾 */
function findClosingTag(code: string, name: string, from: number, to: number): { start: number; end: number } {
  let depth = 1;
  let i = from;
  while (i < to) {
    if (code.startsWith('<!--', i)) {
      i = indexAfter(code, '-->', i + 4, to);
    } else if (code.startsWith(`</${name}`, i) && isClosingNameEnd(code[i + name.length + 2])) {
      const end = indexAfter(code, '>', i, to);
      if (--depth === 0) return { start: i, end };
      i = end;
    } else if (code[i] === '<' && isLetter(code.charCodeAt(i + 1))) {
      const tag = scanStartTag(code, i, to);
      if (tag.name === name && !tag.selfClosing) depth++;
      i = tag.end;
    } else {
      i++;
    }
  }
  return { start: to, end: to };
}

/** {{ 开始的插值；没有闭合的 }} 时只跳过 {{ 本身，按普通文本继续扫描，后面的标签照常标记 */
function skipInterpolation(code: string, open: number, to: number): number {
  const close = code.indexOf('}}', open + 2);
  return close < 0 || close >= to ? open + 2 : close + 2;
}

function indexAfter(code: string, token: string, from: number, to: number): number {
  const found = code.indexOf(token, from);
  return found < 0 || found >= to ? to : found + token.length;
}

function skipSpaces(code: string, from: number, to: number): number {
  let i = from;
  while (i < to && isSpace(code[i])) i++;
  return i;
}

function isLetter(ch: number): boolean {
  return (ch >= 97 && ch <= 122) || (ch >= 65 && ch <= 90);
}

function isSpace(ch: string): boolean {
  return ch === ' ' || ch === '\n' || ch === '\t' || ch === '\r' || ch === '\f';
}

function isNameEnd(ch: string): boolean {
  return isSpace(ch) || ch === '/' || ch === '>';
}

function isClosingNameEnd(ch: string | undefined): boolean {
  return ch === undefined || ch === '>' || isSpace(ch);
}
