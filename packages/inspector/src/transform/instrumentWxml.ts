/**
 * 给 wxml 的元素加源码标记：在标签名后插入 ` data-wxa-src="<fileId>:<行>:<列>"`。
 *
 * 只插入，不改动其他任何字节，插入的内容不含换行，所以行号不变，编译错误仍然指向源文件的位置。
 * 用一个只找开始标签的扫描器，不用 HTML 解析器：wxml 里 {{ }} 表达式和 <wxs> 脚本都可能出现 < 和 >，
 * 通用解析器会把它们当成标签。
 */

export const MARKER_ATTRIBUTE = 'data-wxa-src';

/** 不渲染成元素的标签：标记加上也读不到 */
const SKIPPED_TAGS = new Set(['block', 'template', 'import', 'include', 'wxs', 'slot']);

const HAS_MARKER = new RegExp(`\\s${MARKER_ATTRIBUTE}\\s*=`);

export function instrumentWxml(code: string, fileId: number): string {
  let out = '';
  let copied = 0;
  let line = 1;
  let lineStart = 0;
  let counted = 0;

  /** 位置 index 的行列，从 1 开始；列按 UTF-16 码元计，与 VS Code 一致 */
  const positionOf = (index: number) => {
    for (; counted < index; counted++) {
      if (code.charCodeAt(counted) === 10) {
        line++;
        lineStart = counted + 1;
      }
    }
    return `${line}:${index - lineStart + 1}`;
  };

  let i = 0;
  while (i < code.length) {
    if (code.startsWith('{{', i)) {
      i = skipExpression(code, i);
    } else if (code.startsWith('<!--', i)) {
      i = indexAfter(code, '-->', i + 4);
    } else if (code[i] === '<' && isNameStart(code.charCodeAt(i + 1))) {
      const tag = scanStartTag(code, i);
      if (!SKIPPED_TAGS.has(tag.name.toLowerCase()) && !HAS_MARKER.test(code.slice(tag.nameEnd, tag.end))) {
        out += code.slice(copied, tag.nameEnd) + ` ${MARKER_ATTRIBUTE}="${fileId}:${positionOf(i)}"`;
        copied = tag.nameEnd;
      }
      i = tag.name.toLowerCase() === 'wxs' && !tag.selfClosing ? afterClosingTag(code, 'wxs', tag.end) : tag.end;
    } else {
      i++;
    }
  }
  return out + code.slice(copied);
}

interface StartTag {
  name: string;
  /** 标签名结束的位置，标记插在这里 */
  nameEnd: number;
  /** 开始标签结束（> 之后）的位置 */
  end: number;
  selfClosing: boolean;
}

function scanStartTag(code: string, start: number): StartTag {
  let nameEnd = start + 1;
  while (nameEnd < code.length && isNameChar(code.charCodeAt(nameEnd))) nameEnd++;
  const name = code.slice(start + 1, nameEnd);

  let i = nameEnd;
  while (i < code.length) {
    const ch = code[i];
    if (ch === '>') return { name, nameEnd, end: i + 1, selfClosing: code[i - 1] === '/' };
    if (ch === '"' || ch === "'") i = skipQuoted(code, i);
    else if (code.startsWith('{{', i)) i = skipExpression(code, i);
    else i++;
  }
  return { name, nameEnd, end: code.length, selfClosing: false };
}

/** 引号里的属性值；值里的 {{ }} 整段跳过，表达式里的另一种引号不会被当成值的结尾 */
function skipQuoted(code: string, open: number): number {
  const quote = code[open];
  let i = open + 1;
  while (i < code.length && code[i] !== quote) {
    i = code.startsWith('{{', i) ? skipExpression(code, i) : i + 1;
  }
  return i + 1;
}

/** {{ 开始的表达式；没有闭合的 }} 时只跳过 {{ 本身，按普通文本继续扫描，后面的标签照常标记 */
function skipExpression(code: string, open: number): number {
  const close = code.indexOf('}}', open + 2);
  return close < 0 ? open + 2 : close + 2;
}

function indexAfter(code: string, token: string, from: number): number {
  const found = code.indexOf(token, from);
  return found < 0 ? code.length : found + token.length;
}

/** 脚本类标签的内容不按 wxml 扫描，直接跳到结束标签之后 */
function afterClosingTag(code: string, name: string, from: number): number {
  const closing = new RegExp(`</${name}\\s*>`, 'ig');
  closing.lastIndex = from;
  const match = closing.exec(code);
  return match ? match.index + match[0].length : code.length;
}

function isNameStart(ch: number): boolean {
  return (ch >= 97 && ch <= 122) || (ch >= 65 && ch <= 90);
}

function isNameChar(ch: number): boolean {
  // 字母、数字、- _ :
  return isNameStart(ch) || (ch >= 48 && ch <= 57) || ch === 45 || ch === 95 || ch === 58;
}
