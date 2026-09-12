import type {
  Lesson,
  TurnInput,
  TutorReply,
} from "../../../packages/shared-types/src/study";
import { GoogleClassroom, GoogleError } from "../../classroom/src";
import { generateReply, applyReply } from "../../agent/src";
import { createVoiceSession } from "../../realtime/src/voice";
import { Store } from "./store";
import * as v from "./validation";

export type Config = {
  googleClientIds: string[];
  apiKey: string;
  model: string;
  realtimeModel: string;
  allowedOrigins: string[];
  allowedEmails: string[];
};
type Dependencies = {
  store: Store;
  config: Config;
  google?: (token: string) => GoogleClassroom;
  tutor?: typeof generateReply;
  voice?: typeof createVoiceSession;
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
async function body(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new v.HttpError(415, "Use application/json");
  if (Number(request.headers.get("content-length")) > 300000)
    throw new v.HttpError(413, "Request is too large");
  const reader = request.body?.getReader();
  if (!reader) throw new v.HttpError(400, "Request body required");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const r = await reader.read();
    if (r.done) break;
    size += r.value.length;
    if (size > 300000) {
      await reader.cancel();
      throw new v.HttpError(413, "Request is too large");
    }
    chunks.push(r.value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new v.HttpError(400, "Invalid JSON");
  }
}

export function createApp({
  store,
  config,
  google = (token) => new GoogleClassroom(token),
  tutor = generateReply,
  voice = createVoiceSession,
}: Dependencies) {
  const busy = new Set<string>();
  const limits = new Map<string, { start: number; count: number }>();
  async function limited<T>(
    key: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    if (busy.has(key))
      throw new v.HttpError(
        409,
        "This lesson is updating. Try again shortly.",
        "lesson_busy",
      );
    busy.add(key);
    try {
      return await operation();
    } finally {
      busy.delete(key);
    }
  }
  async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname
      .split("/")
      .filter(Boolean)
      .map(decodeURIComponent);
    const method = request.method;
    if (url.pathname === "/api/status" && method === "GET")
      return json({
        configured: {
          google: config.googleClientIds.length > 0,
          teaching: !!config.apiKey && !!config.model,
          voice: !!config.apiKey && !!config.realtimeModel,
        },
        storage: "local",
        version: "1.0.0",
      });
    if (!config.googleClientIds.length)
      throw new v.HttpError(
        503,
        "Configure GOOGLE_CLIENT_ID to connect Classroom.",
        "setup_required",
      );
    const match = request.headers
      .get("authorization")
      ?.match(/^Bearer ([^\s]{10,4096})$/);
    if (!match)
      throw new v.HttpError(
        401,
        "Connect your Google account to read your Classroom materials.",
        "auth_required",
      );
    const client = google(match[1]!);
    let user: { id: string; email: string; name: string };
    try {
      user = await client.authenticate(config.googleClientIds);
    } catch {
      throw new v.HttpError(
        401,
        "Google authorization could not be verified. Reconnect your account.",
        "auth_required",
      );
    }
    if (
      config.allowedEmails.length &&
      !config.allowedEmails.includes(user.email.toLowerCase())
    )
      throw new v.HttpError(
        403,
        "This account is not enabled for the study pilot.",
        "access_denied",
      );
    const now = Date.now();
    for (const [key, val] of limits)
      if (now - val.start > 60000) limits.delete(key);
    const limit = limits.get(user.id) || { start: now, count: 0 };
    limit.count++;
    limits.set(user.id, limit);
    if (limit.count > 120)
      throw new v.HttpError(
        429,
        "Too many requests. Please wait a minute.",
        "rate_limited",
      );
    if (url.pathname === "/api/courses" && method === "GET")
      return json({ courses: await client.courses() });
    if (parts[1] === "courses" && parts[2]) {
      const courseId = v.id(parts[2]);
      if (parts[3] === "posts" && parts.length === 4 && method === "GET")
        return json(await client.posts(courseId));
      if (parts[3] === "relevant" && parts.length === 4 && method === "POST") {
        const ref = v.posts([v.object(await body(request)).assignment])[0]!;
        const { posts, warnings } = await client.posts(courseId);
        const assignment = posts.find(
          (p) => p.id === ref.id && p.type === ref.type,
        );
        if (!assignment)
          throw new v.HttpError(404, "Assignment not available", "not_found");
        const words = new Set(
          `${assignment.title} ${assignment.description}`
            .toLowerCase()
            .match(/[\p{L}\p{N}]{3,}/gu) || [],
        );
        const ranked = posts
          .filter(
            (p) =>
              !(p.id === ref.id && p.type === ref.type) && p.attachments.length,
          )
          .map((p) => ({
            post: p,
            score:
              (p.topicId && p.topicId === assignment.topicId ? 10 : 0) +
              [...words].filter((w) =>
                `${p.title} ${p.description}`.toLowerCase().includes(w),
              ).length,
          }))
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 10)
          .map((x) => x.post);
        return json({ posts: ranked, warnings });
      }
    }
    if (url.pathname === "/api/profile") {
      if (method === "GET") return json(store.profile(user.id, user.name));
      if (method === "PUT") {
        const profile = v.profile(
          await body(request),
          store.profile(user.id, user.name),
        );
        store.saveProfile(user.id, profile);
        return json(profile);
      }
      if (method === "DELETE") {
        if ([...busy].some((k) => k.startsWith(`${user.id}:`)))
          throw new v.HttpError(
            409,
            "Wait for your lesson to finish updating.",
          );
        store.deleteProfile(user.id);
        return json({ ok: true });
      }
    }
    if (
      parts[1] === "profile" &&
      parts[2] === "evidence" &&
      parts[3] &&
      parts.length === 4 &&
      method === "DELETE"
    ) {
      if ([...busy].some((k) => k.startsWith(`${user.id}:`)))
        throw new v.HttpError(409, "Wait for your lesson to finish updating.");
      store.deleteEvidence(user.id, v.string(parts[3], 250));
      return json({ ok: true });
    }
    if (url.pathname === "/api/lessons") {
      if (method === "GET")
        return json({
          lessons: store.list(
            user.id,
            url.searchParams.has("courseId")
              ? v.id(url.searchParams.get("courseId"))
              : undefined,
          ),
        });
      if (method === "POST") {
        const b = v.object(await body(request));
        const courseId = v.id(b.courseId);
        const refs = v.posts(b.posts);
        return limited(`${user.id}:create`, async () => {
          const loaded = await client.loadSources(courseId, refs);
          const date = new Date().toISOString();
          const lesson: Lesson = {
            id: crypto.randomUUID(),
            courseId,
            title: loaded.posts
              .map((p) => p.title)
              .join(" + ")
              .slice(0, 200),
            posts: refs,
            sources: loaded.sources,
            failures: loaded.failures,
            phase: "ready",
            messages: [],
            board: { items: [], strokes: [] },
            evidence: [],
            createdAt: date,
            updatedAt: date,
            revision: 0,
          };
          store.save(user.id, lesson);
          return json(lesson, 201);
        });
      }
    }
    if (parts[1] === "lessons" && parts[2]) {
      const lessonId = v.id(parts[2]);
      let lesson = store.lesson(user.id, lessonId);
      if (!lesson) throw new v.HttpError(404, "Lesson not found", "not_found");
      const key = `${user.id}:${lessonId}`;
      const refresh = async () => {
        lesson = store.lesson(user.id, lessonId);
        if (!lesson)
          throw new v.HttpError(404, "Lesson not found", "not_found");
        const loaded = await client.loadSources(lesson.courseId, lesson.posts);
        lesson = {
          ...lesson!,
          sources: loaded.sources,
          failures: loaded.failures,
        };
        return lesson;
      };
      if (parts.length === 3) {
        if (method === "GET")
          return limited(key, async () => {
            await refresh();
            store.save(user.id, lesson!);
            return json(lesson);
          });
        if (method === "DELETE")
          return limited(key, async () => {
            store.deleteLesson(user.id, lessonId);
            return json({ ok: true });
          });
      }
      if (parts.length === 4 && parts[3] === "board" && method === "PUT") {
        const board = v.board(await body(request));
        return limited(key, async () => {
          await refresh();
          lesson = { ...lesson!, board, updatedAt: new Date().toISOString() };
          store.save(user.id, lesson);
          return json({ board });
        });
      }
      if (
        parts.length === 6 &&
        parts[3] === "sources" &&
        (parts[5] === "preview" || parts[5] === "pdf") &&
        method === "GET"
      ) {
        const bytes = await client.pdf(
          lesson.courseId,
          lesson.posts,
          v.id(parts[4]),
        );
        return parts[5] === "preview"
          ? json({ data: Buffer.from(bytes).toString("base64") })
          : new Response(Buffer.from(bytes), {
              headers: {
                "Content-Type": "application/pdf",
                "Cache-Control": "no-store",
                "Content-Disposition": "inline",
              },
            });
      }
      if (parts.length === 4 && parts[3] === "voice" && method === "POST")
        return limited(key, async () => {
          if (!config.apiKey || !config.realtimeModel)
            throw new v.HttpError(
              503,
              "Configure OPENAI_API_KEY and OPENAI_REALTIME_MODEL for live voice.",
              "setup_required",
            );
          await refresh();
          if (!lesson!.sources.length)
            throw new v.HttpError(
              422,
              "No readable source documents. Retry loading materials.",
            );
          return json(
            await voice(lesson!, {
              apiKey: config.apiKey,
              model: config.realtimeModel,
            }),
          );
        });
      if (parts.length === 4 && parts[3] === "turn" && method === "POST") {
        const input = v.turn(await body(request));
        const fingerprint = JSON.stringify(input);
        return limited(key, async () => {
          // Check current Google access even on an idempotent retry.
          await refresh();
          const previous = store.turn(user.id, lessonId, input.requestId);
          if (previous) {
            if (previous.fingerprint !== fingerprint)
              throw new v.HttpError(
                409,
                "Request ID was already used for another answer.",
              );
            return json(lesson);
          }
          if (lesson!.revision !== input.revision)
            throw new v.HttpError(
              409,
              "This lesson changed in another tab. Reload before continuing.",
              "stale_lesson",
            );
          if (!config.apiKey || !config.model)
            throw new v.HttpError(
              503,
              "Configure OPENAI_API_KEY and OPENAI_MODEL to start teaching.",
              "setup_required",
            );
          if (!lesson!.sources.length)
            throw new v.HttpError(
              422,
              "No readable source documents. Retry loading materials.",
              "no_sources",
            );
          if (lesson!.messages.length >= 400)
            throw new v.HttpError(
              422,
              "This lesson is full. Start a new lesson to continue.",
            );
          const profile = store.profile(user.id, user.name);
          const reply = await tutor(lesson!, profile, input, {
            apiKey: config.apiKey,
            model: config.model,
          });
          const next = applyReply(lesson!, input, reply);
          const latestProfile = store.profile(user.id, user.name);
          const otherEvidence = latestProfile.evidence.filter(
            (e) => e.lessonId !== lessonId,
          );
          store.commitTurn(user.id, next, input.requestId, fingerprint, {
            ...latestProfile,
            evidence: [...otherEvidence, ...next.evidence].slice(-500),
          });
          return json(next);
        });
      }
    }
    throw new v.HttpError(404, "Endpoint not found", "not_found");
  }
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("origin");
    let response: Response;
    try {
      if (origin && !config.allowedOrigins.includes(origin))
        throw new v.HttpError(
          403,
          "This origin is not allowed",
          "origin_denied",
        );
      response =
        request.method === "OPTIONS"
          ? new Response(null, { status: 204 })
          : await handle(request);
    } catch (error) {
      const status =
        error instanceof v.HttpError
          ? error.status
          : error instanceof GoogleError
            ? error.status === 401
              ? 401
              : error.status === 403
                ? 403
                : error.status === 404
                  ? 404
                  : 502
            : 502;
      const code =
        error instanceof v.HttpError
          ? error.code
          : status === 401
            ? "auth_required"
            : "service_error";
      const message =
        error instanceof Error
          ? error.message
          : "The request could not be completed.";
      response = json({ error: message, code }, status);
    }
    if (origin && config.allowedOrigins.includes(origin)) {
      response.headers.set("Access-Control-Allow-Origin", origin);
      response.headers.set("Vary", "Origin");
      response.headers.set(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type",
      );
      response.headers.set(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS",
      );
    }
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  };
}
