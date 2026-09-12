import { deflateSync } from "node:zlib";

const table = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = table[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** The Afterclass mark used by the study page favicon: green rounded square, white four-point star. Rendered at build time so no binary lives in the repo. */
export function iconPng(size = 128): Uint8Array {
  const stride = size * 4 + 1;
  const rows = new Uint8Array(size * stride);
  const half = size / 2;
  const radius = size * 0.275;
  const star = size * 0.36;
  for (let y = 0; y < size; y++) {
    rows[y * stride] = 0;
    for (let x = 0; x < size; x++) {
      const px = x + 0.5 - half;
      const py = y + 0.5 - half;
      const cx = Math.max(Math.abs(px) - (half - radius), 0);
      const cy = Math.max(Math.abs(py) - (half - radius), 0);
      const offset = y * stride + 1 + x * 4;
      if (cx * cx + cy * cy > radius * radius) continue;
      const onStar = Math.sqrt(Math.abs(px)) + Math.sqrt(Math.abs(py)) <= Math.sqrt(star);
      rows.set(onStar ? [255, 255, 255, 255] : [0x18, 0x7c, 0x55, 255], offset);
    }
  }
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, size);
  view.setUint32(4, size);
  header[8] = 8;
  header[9] = 6;
  return concat(
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", new Uint8Array(deflateSync(rows))),
    chunk("IEND", new Uint8Array(0)),
  );
}
