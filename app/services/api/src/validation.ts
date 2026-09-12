import type {
  AssignmentInput,
  Board,
  LearnerProfile,
  PostRef,
  TurnInput,
} from "../../../packages/shared-types/src/study";
import { BOARD_COORDINATE_LIMIT } from "../../agent/src";
/** Data URL length; a 1400 px JPEG of a sketch is well under this. Turn requests allow 3 MB in total. */
export const BOARD_SNAPSHOT_LIMIT = 2_000_000;
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "invalid_request",
  ) {
    super(message);
  }
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new HttpError(400, "Expected a JSON object");
  return value as Record<string, unknown>;
}
export function string(value: unknown, max = 4000): string {
  if (typeof value !== "string" || value.length > max)
    throw new HttpError(400, `Expected text of at most ${max} characters`);
  return value;
}
export function id(value: unknown): string {
  const s = string(value, 200);
  if (!/^[A-Za-z0-9_-]+$/.test(s))
    throw new HttpError(400, "Invalid resource identifier");
  return s;
}
export function posts(value: unknown): PostRef[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 30)
    throw new HttpError(400, "Select between 1 and 30 posts");
  const result = new Map<string, PostRef>();
  for (const entry of value) {
    const r = object(entry);
    const type = string(r.type);
    if (!["courseWork", "courseWorkMaterials", "announcements"].includes(type))
      throw new HttpError(400, "Invalid post type");
    const p = { id: id(r.id), type: type as PostRef["type"] };
    result.set(`${p.type}:${p.id}`, p);
  }
  return [...result.values()];
}
export function turn(value: unknown): TurnInput {
  const b = object(value);
  const intent = string(b.intent);
  if (
    ![
      "teach",
      "answer",
      "question",
      "simplify",
      "example",
      "why",
      "skip",
      "recap",
    ].includes(intent)
  )
    throw new HttpError(400, "Unknown teaching action");
  const text = string(b.text);
  if (["answer", "question"].includes(intent) && !text.trim())
    throw new HttpError(400, "Enter your answer or question");
  if (!Number.isSafeInteger(b.revision) || Number(b.revision) < 0)
    throw new HttpError(400, "Invalid lesson revision");
  if (b.catchUpMinutes !== undefined && (!Number.isSafeInteger(b.catchUpMinutes) || Number(b.catchUpMinutes) < 5 || Number(b.catchUpMinutes) > 120))
    throw new HttpError(400, "Catch-up time must be 5–120 whole minutes");
  if (b.boardSnapshot !== undefined && !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(string(b.boardSnapshot, BOARD_SNAPSHOT_LIMIT)))
    throw new HttpError(400, "Whiteboard snapshot must be a PNG, JPEG or WebP image");
  if (b.whiteboard !== undefined && typeof b.whiteboard !== "boolean")
    throw new HttpError(400, "whiteboard must be true or false");
  return {
    ...(b.catchUpMinutes !== undefined ? { catchUpMinutes: Number(b.catchUpMinutes) } : {}),
    ...(b.boardSnapshot !== undefined ? { boardSnapshot: b.boardSnapshot as string } : {}),
    ...(b.whiteboard === true ? { whiteboard: true } : {}),
    intent: intent as TurnInput["intent"],
    text,
    requestId: id(b.requestId),
    revision: Number(b.revision),
  };
}
export function profile(
  value: unknown,
  current: LearnerProfile,
): LearnerProfile {
  const b = object(value);
  if (
    !["gentle", "balanced", "quick"].includes(String(b.pace)) ||
    !["examples", "diagrams", "words"].includes(String(b.explanation))
  )
    throw new HttpError(400, "Choose a valid learning preference");
  return {
    ...current,
    name: string(b.name, 100),
    goals: string(b.goals, 2000),
    pace: b.pace as LearnerProfile["pace"],
    explanation: b.explanation as LearnerProfile["explanation"],
  };
}
export function board(value: unknown): Board {
  const b = object(value);
  if (
    !Array.isArray(b.items) ||
    b.items.length > 100 ||
    !Array.isArray(b.strokes) ||
    b.strokes.length > 300
  )
    throw new HttpError(400, "Whiteboard is too large");
  let points = 0;
  const finite = (n: unknown) =>
    typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 2000;
  // Tutor annotations follow the student's scene, so items share the scene's coordinate range.
  const coordinate = (n: unknown) =>
    typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= BOARD_COORDINATE_LIMIT;
  const ids = new Set<string>();
  for (const item of b.items) {
    const r = object(item);
    const key = id(r.id);
    if (
      ids.has(key) ||
      !["text", "arrow", "line", "rectangle", "ellipse"].includes(String(r.kind)) ||
      !["x", "y", "width", "height"].every((k) => coordinate(r[k])) ||
      (!["arrow", "line"].includes(String(r.kind)) && (Number(r.width) < 0 || Number(r.height) < 0)) ||
      Object.keys(r).some((k) => !["id", "kind", "x", "y", "width", "height", "text", "target"].includes(k))
    )
      throw new HttpError(400, "Invalid board item");
    if (r.target !== undefined) id(r.target);
    ids.add(key);
    string(r.text, 1000);
  }
  for (const stroke of b.strokes) {
    const s = object(stroke);
    if (
      !/^#[0-9a-fA-F]{6}$/.test(string(s.color, 7)) ||
      !Array.isArray(s.points)
    )
      throw new HttpError(400, "Invalid board stroke");
    points += s.points.length;
    if (points > 10000)
      throw new HttpError(400, "Whiteboard has too many points");
    for (const p of s.points) {
      const q = object(p);
      if (!finite(q.x) || !finite(q.y))
        throw new HttpError(400, "Invalid board point");
    }
  }
  if (b.scene !== undefined) {
    const scene = object(b.scene);
    if (!Array.isArray(scene.elements) || scene.elements.length > 2000)
      throw new HttpError(400, "Whiteboard has too many elements");
    const elementIds = new Set<string>();
    for (const value of scene.elements) {
      const element = object(value);
      const key = id(element.id);
      if (elementIds.has(key) || !["rectangle", "diamond", "ellipse", "arrow", "line", "freedraw", "text", "image", "frame", "magicframe"].includes(String(element.type)) ||
          !["x", "y", "width", "height"].every(k => typeof element[k] === "number" && Number.isFinite(element[k]) && Math.abs(element[k] as number) <= 1000000))
        throw new HttpError(400, "Invalid Excalidraw element");
      elementIds.add(key);
      if (element.link != null && !/^https?:\/\//i.test(string(element.link, 2000)))
        throw new HttpError(400, "Invalid whiteboard link");
    }
    const files = object(scene.files);
    if (Object.keys(files).length > 100) throw new HttpError(400, "Too many whiteboard images");
    for (const [key, value] of Object.entries(files)) {
      id(key);
      const file = object(value);
      if (file.id !== key || !["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"].includes(String(file.mimeType)) ||
          !String(file.dataURL).startsWith(`data:${file.mimeType};base64,`) ||
          !/^[A-Za-z0-9+/=\s]*$/.test(String(file.dataURL).split(",")[1] || ""))
        throw new HttpError(400, "Invalid whiteboard image");
    }
    board({ items: scene.sourceItems, strokes: [] });
  }
  return b as Board;
}

export function assignmentWrite(value: unknown, editing: boolean) {
  const b = object(value), result: Record<string, unknown> = {};
  const allowed = new Set(["title", "description", "state", "dueAt", "maxPoints", "topicId", ...(editing ? [] : ["attachments"])]);
  if (Object.keys(b).some(k => !allowed.has(k))) throw new HttpError(400, "Unsupported assignment field; attachments can only be set on creation");
  if (!editing || b.title !== undefined) {
    result.title = string(b.title, 3000).trim();
    if (!result.title) throw new HttpError(400, "Assignment title is required");
  }
  if (b.description !== undefined) result.description = string(b.description, 30000);
  if (b.state !== undefined && !["DRAFT", "PUBLISHED", "DELETED"].includes(String(b.state))) throw new HttpError(400, "Invalid assignment state");
  if (!editing || b.state !== undefined) result.state = b.state || "DRAFT";
  if (b.topicId !== undefined) result.topicId = id(b.topicId);
  if (b.maxPoints !== undefined) {
    if (typeof b.maxPoints !== "number" || !Number.isFinite(b.maxPoints) || b.maxPoints < 0 || b.maxPoints > 100000) throw new HttpError(400, "Invalid assignment points");
    result.maxPoints = b.maxPoints;
  }
  if (b.dueAt !== undefined) {
    if (b.dueAt === null) { result.dueDate = null; result.dueTime = null; }
    else {
      const date = new Date(string(b.dueAt, 40));
      if (!Number.isFinite(date.getTime())) throw new HttpError(400, "Invalid deadline");
      result.dueDate = { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
      result.dueTime = { hours: date.getUTCHours(), minutes: date.getUTCMinutes() };
    }
  }
  if (b.attachments !== undefined) {
    if (!Array.isArray(b.attachments) || b.attachments.length > 20) throw new HttpError(400, "At most 20 attachments are allowed");
    result.materials = b.attachments.map(entry => {
      const a = object(entry);
      if (!["VIEW", "EDIT", "STUDENT_COPY"].includes(String(a.shareMode))) throw new HttpError(400, "Invalid attachment sharing mode");
      return { driveFile: { driveFile: { id: id(a.id) }, shareMode: a.shareMode } };
    });
  }
  if (!Object.keys(result).length) throw new HttpError(400, "No assignment changes supplied");
  return result;
}

export function assignment(value: unknown): AssignmentInput {
  const b = object(value);
  if (!["prepare", "save", "help", "review"].includes(String(b.action)))
    throw new HttpError(400, "Unknown assignment action");
  if (!Number.isSafeInteger(b.revision) || Number(b.revision) < 0)
    throw new HttpError(400, "Invalid lesson revision");
  const assignmentId = b.assignmentId === undefined ? undefined : id(b.assignmentId);
  const draft = b.draft === undefined ? undefined : string(b.draft, 20000);
  const question = b.question === undefined ? undefined : string(b.question, 2000);
  if (b.action === "prepare" && !assignmentId)
    throw new HttpError(400, "Select an assignment to prepare");
  if (b.action === "save" && draft === undefined)
    throw new HttpError(400, "Include your draft to save");
  return {
    action: b.action as AssignmentInput["action"],
    ...(assignmentId === undefined ? {} : { assignmentId }),
    ...(draft === undefined ? {} : { draft }),
    ...(question === undefined ? {} : { question }),
    revision: Number(b.revision),
    requestId: id(b.requestId),
  };
}
