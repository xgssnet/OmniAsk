/**
 * 生成扩展图标（不依赖任何图像库，仅用 Node 内置 zlib 写 PNG）。
 * 图案：圆角蓝紫渐变方块 + 白色圆环，对应 OmniAsk 的「O」。
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'public', 'icons');

const CRC_TABLE = new Int32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c;
}

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) {
    c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBytes = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([length, typeBytes, data, crc]);
}

function createPng(size) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  const center = (size - 1) / 2;
  const half = size * 0.46;
  const cornerRadius = size * 0.24;
  const outerRing = size * 0.28;
  const innerRing = size * 0.15;

  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < size; x += 1) {
      const dx = Math.max(Math.abs(x - center) - (half - cornerRadius), 0);
      const dy = Math.max(Math.abs(y - center) - (half - cornerRadius), 0);
      const inRoundedSquare = Math.hypot(dx, dy) <= cornerRadius;
      const offset = rowStart + 1 + x * 4;

      if (!inRoundedSquare) {
        raw[offset] = 0;
        raw[offset + 1] = 0;
        raw[offset + 2] = 0;
        raw[offset + 3] = 0;
        continue;
      }

      const t = (x + y) / (2 * size);
      let r = Math.round(79 + 42 * t);
      let g = Math.round(70 + 34 * t);
      let b = Math.round(229 - 24 * t);

      const distance = Math.hypot(x - center, y - center);
      if (distance <= outerRing && distance >= innerRing) {
        r = 255;
        g = 255;
        b = 255;
      }

      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(outDir, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  writeFileSync(resolve(outDir, `icon${size}.png`), createPng(size));
}
console.log(`[omniask] icons generated: 16/32/48/128 -> public/icons`);
