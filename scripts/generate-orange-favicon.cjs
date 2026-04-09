/**
 * Legacy one-off: wrote src/favicon.ico + favicon-32.png. The app now uses
 * src/assets/favicon/favicon.jpg only (see index.html). Keep this script only if you
 * still want generated ICO/PNG for something else. Run: node scripts/generate-orange-favicon.cjs
 */
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const W = 32;
const H = 32;
const R = 0xff;
const G = 0x79;
const B = 0x00;

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function buildPng() {
  const row = 1 + W * 3;
  const raw = Buffer.alloc(row * H);
  for (let y = 0; y < H; y++) {
    raw[y * row] = 0;
    for (let x = 0; x < W; x++) {
      const o = y * row + 1 + x * 3;
      raw[o] = R;
      raw[o + 1] = G;
      raw[o + 2] = B;
    }
  }
  const compressed = zlib.deflateSync(raw, { level: 9 });

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
}

function buildIco(pngBuf) {
  const reserved = Buffer.alloc(2);
  const type = Buffer.alloc(2);
  type.writeUInt16LE(1, 0);
  const count = Buffer.alloc(2);
  count.writeUInt16LE(1, 0);

  const width = W === 256 ? 0 : W;
  const height = H === 256 ? 0 : H;
  const entry = Buffer.alloc(16);
  entry[0] = width;
  entry[1] = height;
  entry[2] = 0;
  entry[3] = 0;
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(pngBuf.length, 8);
  entry.writeUInt32LE(6 + 16, 12);

  const header = Buffer.concat([reserved, type, count, entry]);
  return Buffer.concat([header, pngBuf]);
}

const png = buildPng();
const root = path.join(__dirname, '..', 'src');
fs.writeFileSync(path.join(root, 'favicon-32.png'), png);
fs.writeFileSync(path.join(root, 'favicon.ico'), buildIco(png));
console.log('Wrote src/favicon-32.png and src/favicon.ico');
