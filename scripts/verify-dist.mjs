/**
 * P1 构建产物自检：校验 Manifest 引用、HTML 资源路径、脚本 IIFE 形态与图标 PNG 合法性。
 * 不启动浏览器，仅做可复现的静态检查。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const errors = [];
const checks = [];

function check(condition, message) {
  checks.push(message);
  if (!condition) errors.push(message);
}

if (!existsSync(resolve(dist, 'manifest.json'))) {
  console.error('[omniask] dist/manifest.json 不存在，请先执行 npm run build');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(resolve(dist, 'manifest.json'), 'utf8'));
check(manifest.manifest_version === 3, 'manifest_version 必须为 3');

const referenced = [
  ...Object.values(manifest.icons ?? {}),
  ...Object.values(manifest.action?.default_icon ?? {}),
  manifest.action?.default_popup,
  manifest.side_panel?.default_path,
  manifest.options_ui?.page?.split('?')[0],
  manifest.background?.service_worker,
  ...(manifest.content_scripts ?? []).flatMap((entry) => entry.js ?? []),
].filter(Boolean);

for (const file of referenced) {
  check(existsSync(resolve(dist, file)), `Manifest 引用的文件存在：${file}`);
}

for (const page of ['popup.html', 'sidepanel.html', 'app.html']) {
  const htmlPath = resolve(dist, page);
  check(existsSync(htmlPath), `页面存在：${page}`);
  if (!existsSync(htmlPath)) continue;
  const html = readFileSync(htmlPath, 'utf8');
  const assets = [...html.matchAll(/(?:src|href)="(\.\/[^"]+)"/g)].map((match) => match[1]);
  check(assets.length > 0, `${page} 引用了本地打包资源`);
  for (const asset of assets) {
    check(existsSync(resolve(dist, asset)), `${page} 资源存在：${asset}`);
  }
  check(!/src="https?:\/\//.test(html), `${page} 不含远程脚本（CSP 合规）`);
}

// 按需加载的 chunk 不会出现在 HTML 中，需从打包后的 JS 引用里反查文件是否存在
const assetsDir = resolve(dist, 'assets');
const assetFiles = existsSync(assetsDir) ? readdirSync(assetsDir) : [];
for (const asset of assetFiles.filter((file) => file.endsWith('.js'))) {
  const code = readFileSync(resolve(assetsDir, asset), 'utf8');
  const referenced = [
    ...new Set(
      [...code.matchAll(/["'`](?:\.\/|assets\/)?([A-Za-z0-9_-]+\.(?:js|css))["'`]/g)]
        .map((match) => match[1])
        .filter((name) => /^[A-Za-z0-9_]+-[A-Za-z0-9_-]{8}\.(?:js|css)$/.test(name)),
    ),
  ];
  for (const name of referenced) {
    check(assetFiles.includes(name), `动态资源存在：${name}（由 ${asset} 引用）`);
  }
}

for (const script of ['background.js', 'content.js']) {
  const path = resolve(dist, script);
  check(existsSync(path), `运行时脚本存在：${script}`);
  if (!existsSync(path)) continue;
  const code = readFileSync(path, 'utf8').trim();
  // Rollup 可能在 IIFE 前放置 class 字段转换的辅助变量，仍属于单文件普通脚本
  check(code.includes('(function()'), `${script} 打包为 IIFE 形态`);
  check(!/\bimport\s*\(/.test(code) && !/^\s*import\s/m.test(code), `${script} 不含 ESM import`);
  check(!/^\s*export\s/m.test(code), `${script} 不含 ESM export`);
}

const CRC_TABLE = new Int32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c;
}
function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

for (const [file, expectedSize] of [
  ['icons/icon16.png', 16],
  ['icons/icon32.png', 32],
  ['icons/icon48.png', 48],
  ['icons/icon128.png', 128],
]) {
  const path = resolve(dist, file);
  check(existsSync(path), `图标存在：${file}`);
  if (!existsSync(path)) continue;
  const png = readFileSync(path);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  check(signature.every((byte, index) => png[index] === byte), `${file} PNG 签名正确`);
  check(png.readUInt32BE(16) === expectedSize, `${file} 宽度正确`);
  check(png.readUInt32BE(20) === expectedSize, `${file} 高度正确`);

  let offset = 8;
  let crcValid = true;
  while (offset + 8 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8);
    const dataEnd = offset + 8 + length;
    const storedCrc = png.readUInt32BE(dataEnd);
    const actualCrc = crc32(png.subarray(offset + 4, dataEnd));
    if (storedCrc !== actualCrc) crcValid = false;
    offset = dataEnd + 4;
    if (type.toString('ascii') === 'IEND') break;
  }
  check(crcValid, `${file} PNG chunk CRC 正确`);
}

console.log(`[omniask] dist 自检：${checks.length - errors.length}/${checks.length} 项通过`);
if (errors.length > 0) {
  for (const error of errors) console.error(`  ✗ ${error}`);
  process.exit(1);
}
