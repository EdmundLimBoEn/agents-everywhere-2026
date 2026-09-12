import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { Excalidraw, CaptureUpdateAction, convertToExcalidrawElements, exportToBlob, restoreElements } from "@excalidraw/excalidraw";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI, BinaryFiles } from "@excalidraw/excalidraw/types";
import type { Board, BoardItem } from "../../../../packages/shared-types/src/study";
import "@excalidraw/excalidraw/index.css";

(window as Window & { EXCALIDRAW_ASSET_PATH?: string }).EXCALIDRAW_ASSET_PATH = new URL("./", location.href).href;

type Box = { x: number; y: number; width: number; height: number };
type Point = { x: number; y: number };
/** Tutor marks share one colour so students can tell them from their own work at a glance. */
const TUTOR_STYLE = { strokeColor: "#187c55", strokeWidth: 2, roughness: 1, fontFamily: 2 } as const;
const centre = (box: Box): Point => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
const inside = (box: Box, p: Point, gap: number) =>
  p.x >= box.x - gap && p.x <= box.x + box.width + gap && p.y >= box.y - gap && p.y <= box.y + box.height + gap;
/** Where a line from `from` towards the centre of `box` meets the box, kept `gap` px clear of it. */
function edge(box: Box, from: Point, gap: number): Point {
  const c = centre(box), dx = from.x - c.x, dy = from.y - c.y;
  if (inside(box, from, gap) || (!dx && !dy)) return { x: c.x, y: box.y - gap };
  const t = Math.min(dx ? (box.width / 2 + gap) / Math.abs(dx) : Infinity, dy ? (box.height / 2 + gap) / Math.abs(dy) : Infinity);
  return { x: c.x + dx * t, y: c.y + dy * t };
}
/** Convert one tutor board item into Excalidraw elements, anchored to the student's shape when it names one. */
export function annotationElements(item: BoardItem, targets: ReadonlyMap<string, Box>): ExcalidrawElement[] {
  const target = item.target ? targets.get(item.target) : undefined;
  const meta = { ...TUTOR_STYLE, customData: { boardItemId: item.id } };
  // Bound labels are separate text elements; tag them too so a replaced mark takes its label with it.
  const label = (text: string) => (text.trim() ? { label: { text, fontFamily: TUTOR_STYLE.fontFamily, customData: meta.customData } } : {});
  const convert = (skeletons: unknown[]) => convertToExcalidrawElements(skeletons as ExcalidrawElementSkeleton[]);
  const note = (x: number, y: number, text: string) => convert([{ ...meta, type: "text", x, y, text }]);
  const arrow = (from: Point, to: Point, text = "") => convert([{
    ...meta, type: "arrow", x: from.x, y: from.y, endArrowhead: "arrow",
    points: [[0, 0], [to.x - from.x, to.y - from.y]], ...label(text),
  }]);
  switch (item.kind) {
    case "text": {
      const text = note(item.x, item.y, item.text);
      if (!target || !text[0]) return text;
      const start = edge(text[0], centre(target), 4);
      return [...text, ...arrow(start, edge(target, start, 6))];
    }
    case "arrow": {
      const from = target && inside(target, item, 20) ? { x: centre(target).x, y: target.y - 80 } : { x: item.x, y: item.y };
      return arrow(from, target ? edge(target, from, 6) : { x: item.x + item.width, y: item.y + item.height }, item.text);
    }
    default: {
      if (!target)
        return convert([{ ...meta, type: item.kind, x: item.x, y: item.y, width: item.width, height: item.height, ...label(item.text) }]);
      const pad = 14, box = { x: target.x - pad, y: target.y - pad, width: target.width + 2 * pad, height: target.height + 2 * pad };
      return [...convert([{ ...meta, type: item.kind, ...box, strokeStyle: "dashed" }]), ...(item.text.trim() ? note(box.x, box.y - 32, item.text) : [])];
    }
  }
}

export function mountBoard(host: HTMLElement, initial: Board, save: (board: Board) => Promise<void>, options: { ask?: (question: string) => void } = {}) {
  const board = structuredClone(initial);
  // Retain edits to existing tutor shapes; replace only changed source diagrams.
  const changed = new Set(board.items.filter(item =>
    JSON.stringify(item) !== JSON.stringify(board.scene?.sourceItems.find(old => old.id === item.id)),
  ).map(item => item.id));
  const existing = (board.scene?.elements || []).filter(element => {
    const source = (element.customData as { boardItemId?: string } | undefined)?.boardItemId;
    return !source || (!changed.has(source) && board.items.some(item => item.id === source));
  });
  const targets = new Map(existing.filter(element => element.isDeleted !== true && typeof element.id === "string")
    .map(element => [element.id as string, element as unknown as Box]));
  const added = board.items.filter(item => !board.scene || changed.has(item.id)).flatMap(item => annotationElements(item, targets));
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
      { type: "text", fontFamily: 2, x: 30, y: 35 + api.getSceneElements().length * 40, text: input.value.trim() },
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
  if (options.ask) {
    const ask = document.createElement("form");
    ask.className = "study-board-ask";
    const question = document.createElement("input");
    question.placeholder = "Ask about what you drew…";
    question.setAttribute("aria-label", "Ask about your drawing");
    question.maxLength = 4000;
    const send = document.createElement("button");
    send.type = "submit";
    send.className = "study-primary";
    send.textContent = "Ask the tutor ✎";
    const hint = document.createElement("span");
    hint.className = "study-meta";
    hint.textContent = "The tutor sees a picture of this board and marks its answer on it.";
    ask.onsubmit = event => {
      event.preventDefault();
      const text = question.value.trim();
      if (!text) return;
      question.value = "";
      options.ask!(text);
    };
    ask.append(question, send, hint);
    host.append(ask);
  }
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
  /** JPEG data URL of the current drawing for the tutor, or "" when the board is empty. */
  async function snapshot(): Promise<string> {
    const elements = api?.getSceneElements() ?? [];
    if (!api || !elements.length) return "";
    const blob = await exportToBlob({ elements, files: api.getFiles(), mimeType: "image/jpeg", quality: 0.85, maxWidthOrHeight: 1400, exportPadding: 24,
      appState: { exportBackground: true, viewBackgroundColor: "#fffdf7", exportWithDarkMode: false } });
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }
  return { dispose: () => root.unmount(), snapshot };
}
