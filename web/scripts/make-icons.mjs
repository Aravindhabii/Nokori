// Generates the PWA / iOS app icons with zero dependencies (pure PNG encoder).
// A clean wallet mark on a teal background. Run: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
mkdirSync(OUT, { recursive: true });

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeData), 0);
  return Buffer.concat([len, typeData, crc]);
}
function encodePNG(size, pixels) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Colors
const TEAL = [13, 148, 136];      // #0D9488 background
const TEAL_DK = [15, 118, 110];   // clasp / detail
const WHITE = [255, 255, 255];

function draw(size) {
  const px = Buffer.alloc(size * size * 4);
  const set = (x, y, [r, g, b], a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
  };
  // background
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) set(x, y, TEAL);

  // wallet body: rounded rectangle
  const bx0 = size * 0.20, bx1 = size * 0.80, by0 = size * 0.32, by1 = size * 0.70;
  const rad = size * 0.07;
  const inRounded = (x, y, x0, y0, x1, y1, r) => {
    if (x < x0 || x > x1 || y < y0 || y > y1) return false;
    const cx = Math.min(Math.max(x, x0 + r), x1 - r);
    const cy = Math.min(Math.max(y, y0 + r), y1 - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      if (inRounded(x, y, bx0, by0, bx1, by1, rad)) set(x, y, WHITE);

  // clasp: teal circle on the right-center of the wallet
  const cx = bx1 - size * 0.11, cy = (by0 + by1) / 2, cr = size * 0.055;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= cr * cr) set(x, y, TEAL_DK);

  // top flap line
  const fy = by0 + size * 0.10;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      if (x > bx0 + size * 0.03 && x < bx1 - size * 0.03 && Math.abs(y - fy) < size * 0.012)
        set(x, y, TEAL_DK);

  return px;
}

for (const size of [180, 192, 512]) {
  const png = encodePNG(size, draw(size));
  const name = size === 180 ? 'apple-touch-icon.png' : `pwa-${size}.png`;
  writeFileSync(join(OUT, name), png);
  console.log('wrote', name);
}
