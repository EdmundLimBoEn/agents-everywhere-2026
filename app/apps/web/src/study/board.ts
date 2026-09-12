import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { Excalidraw, CaptureUpdateAction, convertToExcalidrawElements, exportToBlob, getCommonBounds, restoreElements } from "@excalidraw/excalidraw";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI, BinaryFiles } from "@excalidraw/excalidraw/types";
import type { Board, BoardItem } from "../../../../packages/shared-types/src/study";
import "@excalidraw/excalidraw/index.css";

(window as Window & { EXCALIDRAW_ASSET_PATH?: string }).EXCALIDRAW_ASSET_PATH = new URL("./", location.href).href;

type Box = { x: number; y: number; width: number; height: number };
type Point = { x: number; y: number };
/** Tutor marks share one colour so students can tell them from their own work at a glance. */
const TUTOR_STYLE = { strokeColor: "#187c55", strokeWidth: 2, roughness: 0, fontFamily: 2, fontSize: 20 } as const;
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
  const label = (text: string, fontSize = 20) => (text.trim() ? { label: { text, fontSize, fontFamily: TUTOR_STYLE.fontFamily, customData: meta.customData } } : {});
  const convert = (skeletons: unknown[]) => convertToExcalidrawElements(skeletons as ExcalidrawElementSkeleton[]);
  const note = (x: number, y: number, text: string) => restoreElements(
    convert([{ ...meta, type: "text", x, y, text, autoResize: false }]).map(element => ({
      ...element, width: Math.min(element.width, Math.max(160, Math.min(item.width || 260, 360))),
    })), null, { repairBindings: true, refreshDimensions: true });
  const arrow = (from: Point, to: Point, text = "", kind: "arrow" | "line" = "arrow") => {
    const elements = convert([{
      ...meta, type: kind, x: from.x, y: from.y, startArrowhead: null, endArrowhead: kind === "arrow" ? "arrow" : null,
      points: [[0, 0], [to.x - from.x, to.y - from.y]], ...(kind === "arrow" ? label(text, 16) : {}),
    }]);
    // Excalidraw binds text to arrows, but silently ignores a line's label.
    if (kind === "line" && text.trim()) {
      const caption = note((from.x + to.x) / 2, (from.y + to.y) / 2, text);
      if (caption[0]) caption[0] = { ...caption[0], x: caption[0].x - caption[0].width / 2, y: caption[0].y - caption[0].height - 8 };
      elements.push(...caption);
    }
    return elements;
  };
  switch (item.kind) {
    case "text": {
      const text = note(item.x, item.y, item.text);
      if (!target || !text[0]) return text;
      const start = edge(text[0], centre(target), 4);
      return [...text, ...arrow(start, edge(target, start, 6))];
    }
    case "line":
    case "arrow": {
      const from = target && inside(target, item, 20) ? { x: centre(target).x, y: target.y - 80 } : { x: item.x, y: item.y };
      return arrow(from, target ? edge(target, from, 6) : { x: item.x + item.width, y: item.y + item.height }, item.text, item.kind);
    }
    default: {
      if (!target) {
        const width = item.width || 160, height = item.height || 80;
        const caption = item.text.trim() ? note(item.x + width + 12, item.y, item.text) : [];
        const inset = item.kind === "ellipse" ? Math.SQRT2 : 1;
        const fits = !caption[0] || (width >= (caption[0].width + 20) * inset && height >= (caption[0].height + 20) * inset);
        const shape = convert([{ ...meta, type: item.kind, x: item.x, y: item.y, width, height,
          backgroundColor: "#e9f5ee", fillStyle: "solid", ...(fits ? label(item.text) : {}) }]);
        if (fits || !caption[0]) return shape;
        // A caption must not enlarge a physical object and move it into nearby force vectors.
        caption[0] = { ...caption[0], y: item.y + (height - caption[0].height) / 2 };
        return [...shape, ...caption];
      }
      const pad = 14, box = { x: target.x - pad, y: target.y - pad, width: target.width + 2 * pad, height: target.height + 2 * pad };
      const text = item.text.trim() ? note(box.x, box.y - 32, item.text) : [];
      if (text[0]) text[0] = { ...text[0], y: box.y - text[0].height - 12 };
      return [...convert([{ ...meta, type: item.kind, ...box, strokeStyle: "dashed" }]), ...text];
    }
  }
}

/** Pause between tutor strokes so the diagram appears to be drawn, not pasted. */
export const REVEAL_DELAY_MS = 420;
export function mountBoard(host: HTMLElement, initial: Board, save: (board: Board) => Promise<void>, options: { ask?: (question: string) => void; animate?: boolean } = {}) {
  const board = structuredClone(initial);
  const animate = options.animate ?? !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
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
  // One group per tutor item, so a label and its arrow appear together when the tutor draws.
  const drawingItems = board.items.filter(item => !board.scene || changed.has(item.id));
  const groups = drawingItems.map(item => annotationElements(item, targets));
  // Move new free captions clear of other labels; student marks and bound labels stay put.
  const movable = new Set(groups.flatMap((group, i) => drawingItems[i].target ? [] : group.filter(e => e.type === "text" && !e.containerId)));
  const occupied = [...existing, ...groups.flat()].filter(e => e.type === "text" && e.isDeleted !== true && !movable.has(e as ExcalidrawElement)) as ExcalidrawElement[];
  for (const group of groups) for (const [i, element] of group.entries()) {
    if (!movable.has(element)) continue;
    let caption = element;
    let collision: ExcalidrawElement | undefined;
    while ((collision = occupied.find(other => caption.x < other.x + other.width + 8 && caption.x + caption.width + 8 > other.x &&
      caption.y < other.y + other.height + 8 && caption.y + caption.height + 8 > other.y)))
      caption = { ...caption, y: collision.y + collision.height + 8 };
    group[i] = caption;
    occupied.push(caption);
  }
  const strokes = board.scene ? [] : board.strokes.filter(s => s.points.length).flatMap(stroke => {
    const first = stroke.points[0];
    return convertToExcalidrawElements([{ type: "line", x: first.x, y: first.y,
      strokeColor: stroke.color, points: stroke.points.map(p => [p.x - first.x, p.y - first.y]) }]);
  });
  const reveal = animate && groups.length > 0;
  const elements = restoreElements([...existing, ...(reveal ? [] : groups.flat()), ...strokes] as ExcalidrawElement[], null);
  let animating = reveal, disposed = false, revealed = 0, settle: (() => void) | undefined;
  let ready!: () => void;
  const initialized = new Promise<void>(resolve => { ready = resolve; });
  const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
  /** Draw the tutor's new items one by one and follow them with the viewport, like a teacher at the board. */
  async function draw(instance: ExcalidrawImperativeAPI) {
    await initialized;
    // Frame the whole diagram once; do not zoom and pan after every stroke.
    fit([...elements, ...groups.flat()]);
    while (revealed < groups.length) {
      await wait(REVEAL_DELAY_MS);
      if (disposed || !animating) return;
      const group = groups[revealed++];
      instance.updateScene({ captureUpdate: CaptureUpdateAction.NEVER, elements: [...instance.getSceneElementsIncludingDeleted(), ...group] });
    }
    // Excalidraw reports the last stroke on a later render; wait for it so the save holds the whole drawing.
    await new Promise<void>(resolve => { settle = resolve; setTimeout(resolve, 400); });
    settle = undefined;
    if (disposed || !animating) return;
    animating = false;
    capture();
    void persist();
  }
  const bar = document.createElement("div");
  bar.className = "study-tools";
  const status = document.createElement("span");
  status.setAttribute("role", "status");
  let signature = "", api: ExcalidrawImperativeAPI | undefined, generation = 0;
  function fit(content: readonly ExcalidrawElement[] = api?.getSceneElements() ?? []) {
    const visible = content.filter(element => !element.isDeleted);
    if (visible.length) api?.scrollToContent(visible, { fitToViewport: true, viewportZoomFactor: 0.8, maxZoom: 1, animate: false });
  }
  function capture() {
    if (!api) return;
    board.scene = { elements: [...api.getSceneElementsIncludingDeleted()], files: { ...api.getFiles() }, sourceItems: board.items };
    signature = JSON.stringify(board.scene);
  }
  function finishDrawing() {
    if (!api || !animating) return;
    api.updateScene({ captureUpdate: CaptureUpdateAction.NEVER,
      elements: [...api.getSceneElementsIncludingDeleted(), ...groups.slice(revealed).flat()] });
    revealed = groups.length;
    animating = false;
    capture();
    void persist();
  }
  async function persist() {
    const current = ++generation;
    status.textContent = "Saving…";
    try {
      await save(structuredClone(board));
      if (current === generation) status.textContent = "Saved";
    } catch (error) {
      if (current === generation) status.textContent = `Not saved. ${error instanceof Error ? error.message : "Retry save."}`;
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
    const { scrollX, scrollY, width, height, zoom } = api.getAppState();
    const existing = api.getSceneElements();
    const bottom = existing.length ? getCommonBounds(existing)[3] + 24 : -Infinity;
    const text = convertToExcalidrawElements([{ type: "text", fontFamily: 2,
      x: -scrollX + width / zoom.value / 3, y: Math.max(bottom, -scrollY + height / zoom.value / 2), text: input.value.trim() }]);
    api.updateScene({ captureUpdate: CaptureUpdateAction.IMMEDIATELY, elements: [...api.getSceneElementsIncludingDeleted(), ...text] });
    api.scrollToContent(text, { animate: false });
    input.value = "";
  };
  const retry = document.createElement("button");
  retry.type = "button";
  retry.textContent = "Save";
  retry.onclick = () => { if (animating) finishDrawing(); else { capture(); void persist(); } };
  const fitButton = document.createElement("button");
  fitButton.type = "button";
  fitButton.textContent = "Fit drawing";
  fitButton.onclick = () => fit();
  bar.append(input, add, retry, fitButton, status);
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
    excalidrawAPI: instance => {
      api = instance;
      if (reveal) void draw(instance);
    },
    validateEmbeddable: false,
    UIOptions: { canvasActions: { loadScene: true, export: { saveFileToDisk: true } } },
    onChange: (elements, _state, files) => {
      if (disposed) return;
      const scene = { elements: elements.map(element => ({ ...element })), files: { ...files }, sourceItems: board.items };
      const next = JSON.stringify(scene);
      if (next === signature) return;
      const first = !signature;
      signature = next;
      board.scene = scene;
      ready();
      settle?.();
      if (first && !animating) fit();
      if (!animating && (!first || JSON.stringify(initial.scene) !== next && (elements.length > 0 || !!initial.scene))) void persist();
    },
  }));
  /** JPEG data URL of the current drawing for the tutor, or "" when the board is empty. */
  async function snapshot(): Promise<string> {
    await initialized;
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
  return { dispose: () => { finishDrawing(); disposed = true; ready(); root.unmount(); },
    flush: async () => { await initialized; finishDrawing(); }, snapshot };
}
