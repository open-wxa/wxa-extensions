import { describe, expect, it } from 'vite-plus/test';
import { instrumentWxml } from '../../packages/inspector/src/transform/instrumentWxml';

/** 去掉插入的标记后应与原文完全相同 */
const strip = (code: string) => code.replace(/ data-wxa-src="\d+:\d+:\d+"/g, '');
const markers = (code: string) =>
  [...code.matchAll(/<([\w-]+) data-wxa-src="(\d+:\d+:\d+)"/g)].map((m) => `${m[1]}@${m[2]}`);

describe('instrumentWxml', () => {
  it('在标签名后插入 fileId:行:列，行列指向 < 的位置', () => {
    const code = '<view class="a">\n  <text>hi</text>\n  <image src="x.png"/>\n</view>';
    const out = instrumentWxml(code, 7);
    expect(markers(out)).toEqual(['view@7:1:1', 'text@7:2:3', 'image@7:3:3']);
  });

  it('除插入的属性外其余字节不变，行数不变', () => {
    const code = '<view>\r\n\t<text wx:if="{{a}}">{{b}}</text>\n<!-- <view> -->\n</view>\n';
    const out = instrumentWxml(code, 0);
    expect(strip(out)).toBe(code);
    expect(out.split('\n').length).toBe(code.split('\n').length);
  });

  it('不渲染成元素的标签不加标记，里面的元素照常加', () => {
    const code =
      '<import src="a.wxml"/><include src="b.wxml"/>\n<template name="t"><view/></template>\n<block wx:if="{{x}}"><text/></block>\n<slot/>';
    expect(markers(instrumentWxml(code, 1))).toEqual(['view@1:2:20', 'text@1:3:22']);
  });

  it('自定义组件标签加标记', () => {
    expect(markers(instrumentWxml('<my-counter value="1"></my-counter>', 2))).toEqual(['my-counter@2:1:1']);
  });

  it('{{ }} 里的 < > 和引号不会被当成标签或属性的边界', () => {
    const code = '<view hidden="{{a < b && c > \'"\'}}">{{ x<y ? "<view>" : z }}</view><text class={{a>b}}/>';
    const out = instrumentWxml(code, 3);
    expect(markers(out)).toEqual(['view@3:1:1', 'text@3:1:68']);
    expect(strip(out)).toBe(code);
  });

  it('<wxs> 里的脚本不扫描', () => {
    const code = '<wxs module="m">\nvar s = "<view>"; if (a < b) {}\n</wxs>\n<view/>';
    expect(markers(instrumentWxml(code, 4))).toEqual(['view@4:4:1']);
  });

  it('没闭合的 {{ 当普通文本，后面的元素照常标记', () => {
    const code = '<text>{{ oops</text>\n<view/>';
    expect(markers(instrumentWxml(code, 5))).toEqual(['text@5:1:1', 'view@5:2:1']);
  });

  it('已经写了 data-wxa-src 的元素不重复添加', () => {
    const code = '<view data-wxa-src="9:9:9"/><text/>';
    expect(instrumentWxml(code, 6)).toBe('<view data-wxa-src="9:9:9"/><text data-wxa-src="6:1:29"/>');
  });

  it('文本里单独的 < 不当成标签', () => {
    expect(markers(instrumentWxml('<text>1 < 2</text>', 8))).toEqual(['text@8:1:1']);
  });
});
