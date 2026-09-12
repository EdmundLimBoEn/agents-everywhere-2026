import { expect, test } from "bun:test";
import { board } from "./validation";

test("Excalidraw scenes retain negative coordinates, deleted shapes and images; reject invalid imports", () => {
  const value = { items: [], strokes: [], scene: {
    elements: [{ id: "shape-1", type: "rectangle", x: -40, y: 10, width: 80, height: 30, isDeleted: true }],
    sourceItems: [], files: { image1: { id: "image1", mimeType: "image/png", dataURL: "data:image/png;base64,aGVsbG8=" } },
  } };
  expect(board(value)).toEqual(value);
  for (const change of [{ type: "iframe" }, { x: Infinity }, { link: "javascript:alert(1)" }])
    expect(() => board({ ...value, scene: { ...value.scene, elements: [{ ...value.scene.elements[0], ...change }] } })).toThrow();
  expect(() => board({ ...value, scene: { ...value.scene, elements: [value.scene.elements[0], value.scene.elements[0]] } })).toThrow();
  expect(() => board({ ...value, scene: { ...value.scene, files: { image1: { ...value.scene.files.image1, dataURL: "https://example.com/image.png" } } } })).toThrow();
});
