/**
 * NIBM ACA Timetable Exporter - Standalone PNG Icon Generator
 * Generates production-ready icons in 16x16, 32x32, 48x48, and 128x128.
 * Uses only native Node.js (zlib, fs, path).
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function createCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) {
        c = 0xedb88320 ^ (c >>> 1);
      } else {
        c = c >>> 1;
      }
    }
    table[n] = c;
  }
  return table;
}

const crcTable = createCrcTable();

function calculateCrc(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function writePng(width, height, rgbaBuffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // 8 bits per channel
  ihdrData.writeUInt8(6, 9); // RGBA
  ihdrData.writeUInt8(0, 10);
  ihdrData.writeUInt8(0, 11);
  ihdrData.writeUInt8(0, 12);

  const ihdrChunk = createChunk('IHDR', ihdrData);

  // Scanlines with filter byte 0 (None)
  const scanlineLength = width * 4;
  const rawScanlines = Buffer.alloc((scanlineLength + 1) * height);
  for (let y = 0; y < height; y++) {
    rawScanlines[y * (scanlineLength + 1)] = 0; // Filter byte: None
    rgbaBuffer.copy(
      rawScanlines,
      y * (scanlineLength + 1) + 1,
      y * scanlineLength,
      (y + 1) * scanlineLength
    );
  }

  const idatData = zlib.deflateSync(rawScanlines);
  const idatChunk = createChunk('IDAT', idatData);

  // IEND
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const length = data.length;
  const typeBuf = Buffer.from(type, 'ascii');
  const crcPayload = Buffer.concat([typeBuf, data]);
  const crc = calculateCrc(crcPayload);

  const chunk = Buffer.alloc(4 + 4 + length + 4);
  chunk.writeUInt32BE(length, 0);
  typeBuf.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc, 8 + length);
  return chunk;
}

/**
 * Draws the NIBM Academic Calendar Icon
 */
function generateIconRgba(size) {
  const buf = Buffer.alloc(size * size * 4);

  function setPixel(x, y, r, g, b, a = 255) {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const idx = (y * size + x) * 4;
    buf[idx] = r;
    buf[idx + 1] = g;
    buf[idx + 2] = b;
    buf[idx + 3] = a;
  }

  const cornerRadius = Math.max(2, Math.floor(size * 0.18));

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Rounded rectangle test
      const isInside =
        (x >= cornerRadius && x < size - cornerRadius) ||
        (y >= cornerRadius && y < size - cornerRadius) ||
        (x < cornerRadius && y < cornerRadius && Math.hypot(x - cornerRadius, y - cornerRadius) <= cornerRadius) ||
        (x >= size - cornerRadius && y < cornerRadius && Math.hypot(x - (size - cornerRadius), y - cornerRadius) <= cornerRadius) ||
        (x < cornerRadius && y >= size - cornerRadius && Math.hypot(x - cornerRadius, y - (size - cornerRadius)) <= cornerRadius) ||
        (x >= size - cornerRadius && y >= size - cornerRadius && Math.hypot(x - (size - cornerRadius), y - (size - cornerRadius)) <= cornerRadius);

      if (!isInside) {
        setPixel(x, y, 0, 0, 0, 0);
        continue;
      }

      // Top banner: Gold accent (#D97706), Body: Navy (#0E2A47)
      const bannerHeight = Math.floor(size * 0.28);
      if (y < bannerHeight) {
        setPixel(x, y, 217, 119, 6, 255); // #D97706
      } else {
        setPixel(x, y, 14, 42, 71, 255); // #0E2A47
      }
    }
  }

  // Draw Calendar Grid / Lecture slots
  const startY = Math.floor(size * 0.4);
  const endY = Math.floor(size * 0.85);
  const startX = Math.floor(size * 0.18);
  const endX = Math.floor(size * 0.82);

  const numRows = 3;
  const numCols = 3;
  const rowH = Math.floor((endY - startY) / numRows);
  const colW = Math.floor((endX - startX) / numCols);

  for (let r = 0; r < numRows; r++) {
    for (let c = 0; c < numCols; c++) {
      const cellX = startX + c * colW + 1;
      const cellY = startY + r * rowH + 1;
      const cellW = colW - 2;
      const cellH = rowH - 2;

      // Fill cell with soft white or blue tint
      const isLecture = (r + c) % 2 === 0;
      for (let cy = cellY; cy < cellY + cellH; cy++) {
        for (let cx = cellX; cx < cellX + cellW; cx++) {
          if (isLecture) {
            setPixel(cx, cy, 238, 245, 251, 240); // Soft lecture card
          } else {
            setPixel(cx, cy, 35, 75, 115, 200); // Muted slot
          }
        }
      }
    }
  }

  return buf;
}

const outDir = path.resolve('icons');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const sizes = [16, 32, 48, 128];
for (const size of sizes) {
  const rgba = generateIconRgba(size);
  const png = writePng(size, size, rgba);
  const outPath = path.join(outDir, `icon${size}.png`);
  fs.writeFileSync(outPath, png);
  console.log(`Generated icon: ${outPath} (${png.length} bytes)`);
}
