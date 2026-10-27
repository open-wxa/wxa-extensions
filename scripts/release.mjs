/**
 * 打包、试装、发布本仓库的 npm 包。CI（.github/workflows/release.yml）和首次手动发布都用它：
 *
 *   node scripts/release.mjs            打包 → 在新目录里安装并试用 → 发布到 npm
 *   node scripts/release.mjs --dry-run  只打包和试用，不发布
 *
 * 需要先 pnpm build。各包独立发版，只处理 npm 上还没有的版本（0.0.0 表示还没发过版，也跳过），发布中途失败后可以直接重跑。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REGISTRY = 'https://registry.npmjs.org/';
const PACKAGE_DIRS = ['inspector', 'unplugin'];

/** 像外部用户一样从安装好的包里加载：CJS 和 ESM 都试，返回值的形状要对 */
const SMOKE_TESTS = {
  '@open-wxa/wxa-inspector': `
    const fs = require('node:fs');
    const path = require('node:path');
    const wxaInspector = require('@open-wxa/wxa-inspector').default;
    const setup = wxaInspector().setup({ projectPath: process.cwd(), root: process.cwd() });
    if (setup.entry.path !== '/__wxa-inspector__/') throw new Error('入口不对：' + JSON.stringify(setup.entry));
    const runtime = path.join(path.dirname(require.resolve('@open-wxa/wxa-inspector')), 'runtime.iife.js');
    if (!fs.existsSync(runtime)) throw new Error('包里没有 ' + runtime);
    import('@open-wxa/wxa-inspector').then((m) => {
      if (typeof m.default !== 'function') throw new Error('ESM 默认导出不是函数');
    });
  `,
  '@open-wxa/unplugin-wxa-runner': `
    for (const entry of ['vite', 'webpack']) {
      const plugin = require('@open-wxa/unplugin-wxa-runner/' + entry);
      if (typeof plugin !== 'function') throw new Error('require ' + entry + ' 拿到的不是函数');
    }
    if (require('@open-wxa/unplugin-wxa-runner/vite')().name !== 'unplugin-wxa-runner') throw new Error('Vite 插件名不对');
    Promise.all(['vite', 'webpack'].map((entry) => import('@open-wxa/unplugin-wxa-runner/' + entry))).then((mods) => {
      if (mods.some((m) => typeof m.default !== 'function')) throw new Error('ESM 默认导出不是函数');
    });
  `
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dryRun = process.argv.includes('--dry-run');

try {
  const pending = readPackages().filter((pkg) => {
    if (pkg.version === '0.0.0') return false;
    if (!isPublished(pkg)) return true;
    console.log(`跳过 ${pkg.name}@${pkg.version}：npm 上已有这个版本`);
    return false;
  });
  if (pending.length === 0) {
    console.log('没有要发布的版本');
  } else {
    const tarballs = pack(pending);
    smokeTest(pending, tarballs);
    if (dryRun) console.log(`\n--dry-run：${describe(pending)} 打包和试用都通过，没有发布`);
    else publish(pending, tarballs);
  }
} catch (error) {
  console.error(`\n${error.message}`);
  process.exit(1);
}

function readPackages() {
  const dirs = fs
    .readdirSync(path.join(root, 'packages'))
    .filter((dir) => fs.existsSync(path.join(root, 'packages', dir, 'package.json')));
  const unlisted = dirs.filter((dir) => !PACKAGE_DIRS.includes(dir));
  if (unlisted.length) throw new Error(`packages/${unlisted.join('、packages/')} 不在 PACKAGE_DIRS 里，请加进去`);

  return PACKAGE_DIRS.map((name) => {
    const dir = path.join(root, 'packages', name);
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    if (!SMOKE_TESTS[manifest.name]) throw new Error(`${manifest.name} 没有试用脚本，请加到 SMOKE_TESTS`);
    return { dir, name: manifest.name, version: manifest.version };
  });
}

function pack(packages) {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wxa-extensions-pack-'));
  return packages.map((pkg) => {
    run('pnpm', ['pack', '--pack-destination', outDir], { cwd: pkg.dir });
    const file = path.join(outDir, `${pkg.name.replace(/^@/, '').replace('/', '-')}-${pkg.version}.tgz`);
    if (!fs.existsSync(file)) throw new Error(`没有找到 ${pkg.name} 的打包结果 ${file}`);
    return file;
  });
}

function smokeTest(packages, tarballs) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wxa-extensions-smoke-'));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'wxa-extensions-smoke', private: true }));
  console.log(`在 ${dir} 安装 ${describe(packages)}`);
  // 试用只加载插件，不启动 runner，对等依赖 wxa-runner-core 不用装
  run('npm', ['install', '--no-audit', '--no-fund', '--omit=peer', '--registry', REGISTRY, ...tarballs], { cwd: dir });
  for (const pkg of packages) {
    run('node', ['-e', SMOKE_TESTS[pkg.name]], { cwd: dir });
    console.log(`试用通过：${pkg.name}@${pkg.version}`);
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

function publish(packages, tarballs) {
  packages.forEach((pkg, i) => {
    // 带 - 的预发布版本（如 0.2.0-beta.1）发到 next，默认安装的 latest 不变
    const tag = pkg.version.includes('-') ? 'next' : 'latest';
    console.log(`\n发布 ${pkg.name}@${pkg.version}（${tag}）`);
    // stdio 继承终端：本机手动发布时 npm 要在这里输入 2FA 验证码
    run('npm', ['publish', tarballs[i], '--access', 'public', '--tag', tag, '--registry', REGISTRY], {
      stdio: 'inherit'
    });
  });
}

function isPublished(pkg) {
  try {
    const args = ['view', `${pkg.name}@${pkg.version}`, 'version', '--registry', REGISTRY];
    return run('npm', args, { stdio: ['ignore', 'pipe', 'ignore'] }).trim() === pkg.version;
  } catch {
    // 包还不存在时 npm view 返回 404
    return false;
  }
}

function describe(packages) {
  return packages.map((pkg) => `${pkg.name}@${pkg.version}`).join('、');
}

function run(command, args, options = {}) {
  return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], ...options });
}
