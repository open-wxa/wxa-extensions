import { parse } from 'vue/compiler-sfc';
import { describe, expect, it } from 'vite-plus/test';
import { instrumentVue } from '../../packages/inspector/src/transform/instrumentVue';

const instrument = (code: string, fileId = 0) =>
  instrumentVue(code, { fileId, filename: '/project/src/pages/index/index.vue', parse });

/** 打了标记的输出；没有输出（返回 null）时是原文 */
const output = (code: string, fileId = 0) => instrument(code, fileId)?.code ?? code;
/** 去掉插入的标记后应与原文完全相同 */
const strip = (code: string) => code.replace(/ data-wxa-src="\d+:\d+:\d+"/g, '');
const markers = (code: string) =>
  [...code.matchAll(/<([\w.-]+) data-wxa-src="(\d+:\d+:\d+)"/g)].map((m) => `${m[1]}@${m[2]}`);

describe('instrumentVue', () => {
  it('行列是 .vue 文件里的位置，<script> 和 <style> 不动', () => {
    const code = [
      '<script setup>',
      'const html = "<view>"',
      '</script>',
      '',
      '<template>',
      '  <view class="page">',
      '    <text>{{ title }}</text><image src="a.png"/>',
      '  </view>',
      '</template>',
      '<style>view > text { color: red }</style>'
    ].join('\n');
    const out = output(code, 3);
    expect(markers(out)).toEqual(['view@3:6:3', 'text@3:7:5', 'image@3:7:29']);
    expect(strip(out)).toBe(code);
  });

  it('除插入的属性外其余字节不变，行数不变；CRLF、中文不影响行列', () => {
    const code = '<template>\r\n  <view>中文标题</view>\r\n  <view>\t<text>{{ 名字 }}</text></view>\r\n</template>\r\n';
    const out = output(code);
    expect(strip(out)).toBe(code);
    expect(out.split('\n').length).toBe(code.split('\n').length);
    expect(markers(out)).toEqual(['view@0:2:3', 'view@0:3:3', 'text@0:3:10']);
  });

  it('条件编译各分支里不配对的标签照常按原文行列标记', () => {
    const code = [
      '<template>',
      '<!-- #ifdef H5 -->',
      '<div>',
      '<!-- #endif -->',
      '<!-- #ifdef MP-WEIXIN -->',
      '<view class="a" :b="x > 1">',
      '<!-- #endif -->',
      '<text>{{ a<b }}</text><MyCard/>',
      '<!-- #ifdef H5 -->',
      '</div>',
      '<!-- #endif -->',
      '<!-- #ifdef MP-WEIXIN -->',
      '</view>',
      '<!-- #endif -->',
      '</template>'
    ].join('\n');
    expect(markers(output(code))).toEqual(['div@0:3:1', 'view@0:6:1', 'text@0:8:1', 'MyCard@0:8:23']);
  });

  it('不渲染成元素的标签和页面配置节点不加标记，里面的元素照常加', () => {
    const code = [
      '<template>',
      '<page-meta><navigation-bar title="t"/></page-meta>',
      '<template v-if="ok"><view/></template>',
      '<block v-for="i in list"><text/></block>',
      '<slot name="footer"/>',
      '</template>'
    ].join('\n');
    expect(markers(output(code))).toEqual(['view@0:3:21', 'text@0:4:26']);
  });

  it('@uni-ku/root 的占位标签不加标记，它要按原文换成 <slot />', () => {
    const code = '<template>\n  <app-dialog />\n  <KuRootView />\n  <ku-root-view></ku-root-view>\n</template>';
    const out = output(code);
    expect(markers(out)).toEqual(['app-dialog@0:2:3']);
    expect(out).toContain('<KuRootView />');
  });

  it('自定义组件标签加标记：kebab-case、PascalCase、带点号的组件名', () => {
    const code = '<template><wd-button type="primary"/><MyCard/><Foo.Bar title="x"/></template>';
    expect(markers(output(code))).toEqual(['wd-button@0:1:11', 'MyCard@0:1:38', 'Foo.Bar@0:1:47']);
  });

  it('引号里的 > 和 {{ 是普通字符，插值里的 < 不当成标签', () => {
    const code = '<template><view :a="b > c" title="{{"><text/>}}</view><image/>{{ x<y ? "<view>" : z }}</template>';
    const out = output(code);
    expect(markers(out)).toEqual(['view@0:1:11', 'text@0:1:39', 'image@0:1:55']);
    expect(strip(out)).toBe(code);
  });

  it('v-pre 里的 {{ 不是插值，里面的标签照常标记', () => {
    const code = '<template><view v-pre>{{ <text/> }}</view><image/></template>';
    expect(markers(output(code))).toEqual(['view@0:1:11', 'text@0:1:26', 'image@0:1:43']);
  });

  it('已经写了或绑定了 data-wxa-src 的元素不重复添加，属性值里出现这几个字不算', () => {
    const code =
      '<template><view data-wxa-src="9:9:9"/><view :data-wxa-src="id"/><view title=" data-wxa-src=x"/></template>';
    expect(output(code)).toBe(
      '<template><view data-wxa-src="9:9:9"/><view :data-wxa-src="id"/><view data-wxa-src="0:1:65" title=" data-wxa-src=x"/></template>'
    );
  });

  it('注释里的标签不标记', () => {
    expect(markers(output('<template><!-- <wd-message-box /> --><view/></template>'))).toEqual(['view@0:1:38']);
  });

  it('没有内联 HTML 模板时不处理：没有 template、引用外部文件、pug 写法', () => {
    expect(instrument('<script setup>const a = 1</script>')).toBeNull();
    expect(instrument('<template src="./page.html"></template>')).toBeNull();
    expect(instrument('<template lang="pug">\nview\n  text hi\n</template>')).toBeNull();
  });

  it('生成指向原文件的 sourcemap', () => {
    const result = instrument('<template>\n  <view/>\n</template>');
    expect(result?.map.sources).toEqual(['/project/src/pages/index/index.vue']);
    expect(result?.map.mappings).not.toBe('');
  });
});
