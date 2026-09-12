import type { Board } from "../../../../packages/shared-types/src/study";
export function mountBoard(
  host: HTMLElement,
  initial: Board,
  save: (board: Board) => Promise<void>,
) {
  let board: Board = structuredClone(initial),
    drawing = false;
  const ns = "http://www.w3.org/2000/svg";
  const bar = document.createElement("div");
  bar.className = "study-tools";
  const canvas = document.createElementNS(ns, "svg");
  canvas.setAttribute("viewBox", "0 0 900 500");
  canvas.setAttribute(
    "aria-label",
    "Lesson whiteboard. Draw with your pointer or add text.",
  );
  canvas.classList.add("study-board");
  const status = document.createElement("span");
  status.setAttribute("role", "status");
  async function persist() {
    const snapshot = structuredClone(board);
    status.textContent = "Saving…";
    try {
      await save(snapshot);
      status.textContent = "Saved";
    } catch {
      status.textContent = "Not saved. Retry save.";
    }
  }
  function button(text: string, fn: () => void) {
    const b = document.createElement("button");
    b.textContent = text;
    b.type = "button";
    b.onclick = fn;
    bar.append(b);
  }
  const input = document.createElement("input");
  input.placeholder = "Add a thought…";
  input.setAttribute("aria-label", "Whiteboard text");
  bar.append(input);
  button("Add text", () => {
    if (!input.value.trim()) return;
    board.items.push({
      id: crypto.randomUUID(),
      kind: "text",
      x: 30,
      y: 35 + ((board.items.length * 45) % 400),
      width: 700,
      height: 40,
      text: input.value.trim(),
    });
    input.value = "";
    render();
    void persist();
  });
  button("Remove last note", () => {
    board.items.pop();
    render();
    void persist();
  });
  button("Undo drawing", () => {
    board.strokes.pop();
    render();
    void persist();
  });
  button("Save", () => void persist());
  bar.append(status);
  function render() {
    canvas.replaceChildren();
    for (const item of board.items) {
      if (item.kind !== "text") {
        const shape = document.createElementNS(
          ns,
          item.kind === "arrow" ? "line" : "rect",
        );
        const props =
          item.kind === "arrow"
            ? {
                x1: item.x,
                y1: item.y,
                x2: item.x + item.width,
                y2: item.y + item.height,
              }
            : { x: item.x, y: item.y, width: item.width, height: item.height };
        for (const [k, v] of Object.entries(props))
          shape.setAttribute(k, String(v));
        shape.setAttribute("stroke", "#47785b");
        shape.setAttribute("fill", "none");
        shape.setAttribute("stroke-width", "2");
        canvas.append(shape);
      }
      const text = document.createElementNS(ns, "text");
      text.setAttribute("x", String(item.x + 8));
      text.setAttribute("y", String(item.y + 24));
      text.setAttribute("fill", "#23394a");
      text.setAttribute("font-size", "19");
      text.textContent = item.text;
      canvas.append(text);
    }
    for (const stroke of board.strokes) {
      const line = document.createElementNS(ns, "polyline");
      line.setAttribute(
        "points",
        stroke.points.map((p) => `${p.x},${p.y}`).join(" "),
      );
      line.setAttribute("fill", "none");
      line.setAttribute("stroke", stroke.color);
      line.setAttribute("stroke-width", "3");
      line.setAttribute("stroke-linecap", "round");
      canvas.append(line);
    }
  }
  const point = (e: PointerEvent) => {
    const p = canvas.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    const m = canvas.getScreenCTM();
    const local = m ? p.matrixTransform(m.inverse()) : p;
    return { x: local.x, y: local.y };
  };
  canvas.onpointerdown = (e) => {
    drawing = true;
    canvas.setPointerCapture(e.pointerId);
    board.strokes.push({ points: [point(e)], color: "#274738" });
    render();
  };
  canvas.onpointermove = (e) => {
    if (drawing) {
      board.strokes.at(-1)!.points.push(point(e));
      render();
    }
  };
  canvas.onpointerup = () => {
    if (drawing) {
      drawing = false;
      void persist();
    }
  };
  canvas.onpointercancel = () => {
    drawing = false;
    void persist();
  };
  host.append(bar, canvas);
  render();
}
