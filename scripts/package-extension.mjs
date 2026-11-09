/**
 * 生成可上传到 Chrome Web Store / Edge Add-ons 的 ZIP（store 模式，纯 Node 无第三方依赖）。
 * dist/ 内的所有文件按原相对路径打包，manifest.json 位于 ZIP 根目录。
 */
import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = resolve(root, 'dist');
const releaseDir = resolve(root, 'release');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const output = resolve(releaseDir, `OmniAsk-${pkg.version}.zip`);

let CRC_TABLE;
function crc32(buffer) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function collect(dir, prefix = '') {
  const files = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const relative = prefix ? `${prefix}/${name}` : name;
    if (statSync(full).isDirectory()) files.push(...collect(full, relative));
    else files.push({ name: relative.replace(/\\/g, '/'), data: readFileSync(full) });
  }
  return files;
}

function dosTimestamp(date) {
  const time =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    (Math.floor(date.getSeconds() / 2) & 0x1f);
  const day =
    (((date.getFullYear() - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0x0f) << 5) |
    (date.getDate() & 0x1f);
  return { time: time & 0xffff, day: day & 0xffff };
}

if (!statSync(distDir, { throwIfNoEntry: false })) {
  console.error('[omniask] dist/ 不存在，请先执行 npm run build');
  process.exit(1);
}

const files = collect(distDir).filter((file) => !file.name.endsWith('.map'));
if (!files.some((file) => file.name === 'manifest.json')) {
  console.error('[omniask] dist/manifest.json 缺失');
  process.exit(1);
}

const { time, day } = dosTimestamp(new Date());
const localParts = [];
const centralParts = [];
let offset = 0;

for (const file of files) {
  const nameBytes = Buffer.from(file.name, 'utf8');
  const size = file.data.length;
  const crc = crc32(file.data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(0, 8); // store
  local.writeUInt16LE(time, 10);
  local.writeUInt16LE(day, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(size, 18);
  local.writeUInt32LE(size, 22);
  local.writeUInt16LE(nameBytes.length, 26);
  local.writeUInt16LE(0, 28);
  localParts.push(local, nameBytes, file.data);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(0, 10);
  central.writeUInt16LE(time, 12);
  central.writeUInt16LE(day, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(size, 20);
  central.writeUInt32LE(size, 24);
  central.writeUInt16LE(nameBytes.length, 28);
  central.writeUInt16LE(0, 30);
  central.writeUInt16LE(0, 32);
  central.writeUInt16LE(0, 34);
  central.writeUInt16LE(0, 36);
  central.writeUInt32LE(0, 38);
  central.writeUInt32LE(offset, 42);
  centralParts.push(central, nameBytes);

  offset += local.length + nameBytes.length + size;
}

const centralDirectory = Buffer.concat(centralParts);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(0, 4);
end.writeUInt16LE(0, 6);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralDirectory.length, 12);
end.writeUInt32LE(offset, 16);
end.writeUInt16LE(0, 20);

mkdirSync(releaseDir, { recursive: true });
writeFileSync(output, Buffer.concat([...localParts, centralDirectory, end]));
console.log(`[omniask] 发布包已生成：${output}（${files.length} 个文件）`);
