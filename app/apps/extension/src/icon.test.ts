import { expect, test } from "bun:test";
import { inflateSync } from "node:zlib";
import { iconPng } from "./icon";

test("the generated icon is a well-formed 128px RGBA PNG", () => {
  const png = iconPng(128);
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(png.buffer, png.byteOffset);
  expect(new TextDecoder().decode(png.subarray(12, 16))).toBe("IHDR");
  expect(view.getUint32(16)).toBe(128);
  expect(view.getUint32(20)).toBe(128);
  expect(png[24]).toBe(8);
  expect(png[25]).toBe(6);
  const idatLength = view.getUint32(33);
  expect(new TextDecoder().decode(png.subarray(37, 41))).toBe("IDAT");
  const pixels = inflateSync(png.subarray(41, 41 + idatLength));
  expect(pixels.length).toBe(128 * (128 * 4 + 1));
  // Centre pixel is the white star; a corner is transparent; the edge midpoint is brand green.
  const at = (x: number, y: number) => [...pixels.subarray(y * 513 + 1 + x * 4, y * 513 + 5 + x * 4)];
  expect(at(64, 64)).toEqual([255, 255, 255, 255]);
  expect(at(0, 0)[3]).toBe(0);
  expect(at(4, 64)).toEqual([0x18, 0x7c, 0x55, 255]);
  expect(new TextDecoder().decode(png.subarray(png.length - 8, png.length - 4))).toBe("IEND");
});
