import type {
  Board,
  LearnerProfile,
  PostRef,
  TurnInput,
} from "../../../packages/shared-types/src/study";
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
  return {
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
  const ids = new Set<string>();
  for (const item of b.items) {
    const r = object(item);
    const key = id(r.id);
    if (
      ids.has(key) ||
      !["text", "arrow", "rectangle"].includes(String(r.kind)) ||
      !["x", "y", "width", "height"].every((k) => finite(r[k]))
    )
      throw new HttpError(400, "Invalid board item");
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
  return b as Board;
}
