import { defineConfig } from 'vite-plus';

/** 构建产物、CI 检出的 wxa-runner、测试用的小程序项目都不检查 */
const ignorePatterns = ['**/dist/**', 'wxa-runner/**', 'tests/fixtures/**'];

export default defineConfig({
  lint: {
    ignorePatterns,
    options: {
      typeAware: true,
      typeCheck: true
    }
  },
  fmt: {
    ignorePatterns,
    printWidth: 120,
    singleQuote: true,
    trailingComma: 'none'
  },
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 60000
  }
});
