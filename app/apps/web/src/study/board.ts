import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { Excalidraw, CaptureUpdateAction, convertToExcalidrawElements, restoreElements } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI, BinaryFiles } from "@excalidraw/excalidraw/types";
import type { Board } from "../../../../packages/shared-types/src/study";
import "@excalidraw/excalidraw/index.css";

(window as Window & { EXCALIDRAW_ASSET_PATH?: string }).EXCALIDRAW_ASSET_PATH = new URL("./", location.href).href;

export function mountBoard(host: HTMLElement, initial: Board, save: (board: Board) => Promise<void>) {
  const board = structuredClone(initial);
  // Retain edits to existing tutor shapes; replace only changed source diagrams.
  const changed = new Set(board.items.filter(item =>
    JSON.stringify(item) !== JSON.stringify(board.scene?.sourceItems.find(old => old.id === item.id)),
  ).map(item => item.id));
  const existing = (board.scene?.elements || []).filter(element => {
    const source = (element.customData as { boardItemId?: string } | undefined)?.boardItemId;
    return !source || (!changed.has(source) && board.items.some(item => item.id === source));
  });
  const added = board.items.filter(item => !board.scene || changed.has(item.id)).flatMap(item => {
    const common = { x: item.x, y: item.y, customData: { boardItemId: item.id } };
    return convertToExcalidrawElements(item.kind === "text"
      ? [{ ...common, type: "text", text: item.text }]
      : [
          { ...common, type: item.kind, width: item.width, height: item.height },
          { ...common, x: item.x + 8, y: item.y + 8, type: "text", text: item.text },
        ]);
  });
  const strokes = board.scene ? [] : board.strokes.filter(s => s.points.length).flatMap(stroke => {
    const first = stroke.points[0];
    return convertToExcalidrawElements([{ type: "line", x: first.x, y: first.y,
      strokeColor: stroke.color, points: stroke.points.map(p => [p.x - first.x, p.y - first.y]) }]);
  });
  const elements = restoreElements([...existing, ...added, ...strokes] as ExcalidrawElement[], null);
  const bar = document.createElement("div");
  bar.className = "study-tools";
  const status = document.createElement("span");
  status.setAttribute("role", "status");
  let signature = "", api: ExcalidrawImperativeAPI | undefined, generation = 0;
  async function persist() {
    const current = ++generation;
    status.textContent = "Saving…";
    try {
      await save(structuredClone(board));
      if (current === generation) status.textContent = "Saved";
    } catch {
      if (current === generation) status.textContent = "Not saved. Retry save.";
    }
  }
  const input = document.createElement("input");
  input.placeholder = "Add a thought…";
  input.setAttribute("aria-label", "Whiteboard text");
  const add = document.createElement("button");
  add.type = "button";
  add.textContent = "Add text";
  add.onclick = () => {
    if (!input.value.trim() || !api) return;
    api.updateScene({ captureUpdate: CaptureUpdateAction.IMMEDIATELY, elements: [...api.getSceneElements(), ...convertToExcalidrawElements([
      { type: "text", x: 30, y: 35 + api.getSceneElements().length * 40, text: input.value.trim() },
    ])] });
    input.value = "";
  };
  const retry = document.createElement("button");
  retry.type = "button";
  retry.textContent = "Save";
  retry.onclick = () => void persist();
  bar.append(input, add, retry, status);
  const canvas = document.createElement("div");
  canvas.className = "study-excalidraw";
  canvas.setAttribute("aria-label", "Lesson whiteboard — Excalidraw");
  host.append(bar, canvas);
  const root = createRoot(canvas);
  root.render(createElement(Excalidraw, {
    initialData: { elements, files: (board.scene?.files || {}) as BinaryFiles,
      appState: { viewBackgroundColor: "#fffdf7" }, scrollToContent: true },
    excalidrawAPI: instance => { api = instance; },
    validateEmbeddable: false,
    UIOptions: { canvasActions: { loadScene: true, export: { saveFileToDisk: true } } },
    onChange: (elements, _state, files) => {
      const scene = { elements: elements.map(element => ({ ...element })), files: { ...files }, sourceItems: board.items };
      const next = JSON.stringify(scene);
      if (next === signature) return;
      const first = !signature;
      signature = next;
      board.scene = scene;
      if (!first) void persist();
    },
  }));
  return () => root.unmount();
}
