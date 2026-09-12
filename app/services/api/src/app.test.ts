import { afterEach, expect, test } from "bun:test";
import { createApp, type Config } from "./app";
import { Store } from "./store";
import type { GoogleClassroom } from "../../classroom/src";
import type {
  Lesson,
  StudySource,
  TurnInput,
  TutorReply,
} from "../../../packages/shared-types/src/study";

const stores: Store[] = [];
afterEach(() => stores.splice(0).forEach((s) => s.close()));
const source: StudySource = {
  id: "doc",
  title: "Light",
  mimeType: "application/pdf",
  postIds: ["post"],
  passages: [{ id: "p1", text: "Sunlight supplies energy to make food." }],
  originalUrl: "https://drive.google.com/file/d/doc",
  pdfAvailable: true,
};
const diagnostic: TutorReply = {
  text: "What does sunlight supply?",
  action: "diagnostic",
  assessment: "none",
  misconception: null,
  citations: [
    { sourceId: "doc", passageId: "p1", quote: "Sunlight supplies energy" },
  ],
  board: [],
};
function setup(
  options: {
    empty?: boolean;
    tutor?: Parameters<typeof createApp>[0]["tutor"];
  } = {},
) {
  const store = new Store(":memory:");
  stores.push(store);
  let calls = 0;
  const config: Config = {
    googleClientIds: ["client"],
    apiKey: "fake",
    model: "fake",
    realtimeModel: "fake",
    allowedOrigins: ["https://classroom.google.com"],
    allowedEmails: [],
  };
  const app = createApp({
    store,
    config,
    google: (token) =>
      ({
        authenticate: async () => ({
          id: token,
          email: `${token}@example.com`,
          name: token,
        }),
        loadSources: async () => ({
          posts: [{ id: "post", title: "Light" }],
          sources: options.empty ? [] : [source],
          failures: [
            { id: "missing", title: "Missing notes", reason: "Access denied" },
          ],
        }),
        pdf: async () => new TextEncoder().encode("%PDF-test"),
      }) as unknown as GoogleClassroom,
    tutor:
      options.tutor ??
      (async () => {
        calls++;
        return diagnostic;
      }),
    voice: async () => {
      throw new Error("not called");
    },
  });
  const request = (
    path: string,
    method = "GET",
    body?: unknown,
    user = "student-one",
    headers: Record<string, string> = {},
  ) =>
    app(
      new Request(`http://localhost/api${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${user}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
  const create = async () => {
    const r = await request("/lessons", "POST", {
      courseId: "course",
      posts: [{ id: "post", type: "courseWorkMaterials" }],
    });
    expect(r.status).toBe(201);
    return (await r.json()) as Lesson;
  };
  return { store, app, request, create, calls: () => calls };
}
test("owners cannot list, read, delete, or preview another account lesson", async () => {
  const s = setup(),
    l = await s.create();
  expect(
    await (await s.request("/lessons", "GET", undefined, "student-two")).json(),
  ).toEqual({ lessons: [] });
  for (const [path, method] of [
    [`/lessons/${l.id}`, "GET"],
    [`/lessons/${l.id}`, "DELETE"],
    [`/lessons/${l.id}/sources/doc/pdf`, "GET"],
  ])
    expect(
      (await s.request(path!, method, undefined, "student-two")).status,
    ).toBe(404);
  expect(s.store.lesson("student-one", l.id)).not.toBeNull();
});
test("CORS and authentication reject unauthorized requests", async () => {
  const s = setup();
  const denied = await s.request("/status", "GET", undefined, "student-one", {
    Origin: "https://evil.example",
  });
  expect(denied.status).toBe(403);
  expect(denied.headers.has("Access-Control-Allow-Origin")).toBe(false);
  const allowed = await s.request(
    "/status",
    "OPTIONS",
    undefined,
    "student-one",
    { Origin: "https://classroom.google.com" },
  );
  expect(allowed.status).toBe(204);
  expect(allowed.headers.get("Access-Control-Allow-Origin")).toBe(
    "https://classroom.google.com",
  );
  expect(
    (await s.app(new Request("http://localhost/api/lessons"))).status,
  ).toBe(401);
});
test("body size, malformed JSON, identifiers and empty selections are validated", async () => {
  const s = setup();
  for (const body of [
    { courseId: "../x", posts: [] },
    { courseId: "course", posts: [] },
    { courseId: "course", posts: [{ id: "x", type: "unknown" }] },
    [],
  ])
    expect((await s.request("/lessons", "POST", body)).status).toBe(400);
  for (const [body, type, status] of [
    ["{", "application/json", 400],
    ["{}", "text/plain", 415],
    ["x".repeat(300001), "application/json", 413],
  ] as const)
    expect(
      (
        await s.app(
          new Request("http://localhost/api/lessons", {
            method: "POST",
            headers: {
              Authorization: "Bearer student-one",
              "Content-Type": type,
            },
            body,
          }),
        )
      ).status,
    ).toBe(status);
});
test("partial sources remain readable; empty sources cannot start teaching; PDFs return bytes", async () => {
  const s = setup(),
    l = await s.create();
  expect(l.sources).toHaveLength(1);
  expect(l.failures).toHaveLength(1);
  const pdf = await s.request(`/lessons/${l.id}/sources/doc/pdf`);
  expect(pdf.headers.get("Content-Type")).toBe("application/pdf");
  expect(await pdf.text()).toBe("%PDF-test");
  const empty = setup({ empty: true }),
    e = await empty.create();
  const r = await empty.request(`/lessons/${e.id}/turn`, "POST", {
    intent: "teach",
    text: "",
    requestId: "first",
    revision: 0,
  });
  expect(r.status).toBe(422);
  expect((await r.json()).code).toBe("no_sources");
  expect(empty.calls()).toBe(0);
});
test("adaptive turns commit evidence, reject stale revisions, and replay only identical requests", async () => {
  let count = 0;
  const s = setup({
      tutor: async () =>
        ++count === 1
          ? diagnostic
          : {
              ...diagnostic,
              text: "Sunlight gives energy, not food. Try again.",
              action: "reteach",
              assessment: "incorrect",
              misconception: "Light is food",
            },
    }),
    l = await s.create(),
    path = `/lessons/${l.id}/turn`;
  const first = { intent: "teach", text: "", requestId: "first", revision: 0 };
  expect((await s.request(path, "POST", first)).status).toBe(200);
  expect((await s.request(path, "POST", first)).status).toBe(200);
  expect(count).toBe(1);
  expect(
    (await s.request(path, "POST", { ...first, text: "changed" })).status,
  ).toBe(409);
  expect(
    (await s.request(path, "POST", { ...first, requestId: "stale" })).status,
  ).toBe(409);
  const r = await s.request(path, "POST", {
    intent: "answer",
    text: "Food",
    requestId: "answer",
    revision: 1,
  });
  expect(r.status).toBe(200);
  const next = await r.json();
  expect(next.phase).toBe("reteaching");
  expect(next.revision).toBe(2);
  expect(next.messages).toHaveLength(4);
  expect(next.evidence[0].assessment).toBe("incorrect");
  expect(s.store.profile("student-one").evidence).toEqual(next.evidence);
  await s.request("/profile", "PUT", {
    name: "New",
    pace: "gentle",
    explanation: "diagrams",
    goals: "Learn",
    evidence: [],
  });
  expect(s.store.profile("student-one").evidence).toHaveLength(1);
  await s.request(
    `/profile/evidence/${encodeURIComponent(next.evidence[0].id)}`,
    "DELETE",
  );
  expect(s.store.lesson("student-one", l.id)!.evidence).toHaveLength(0);
  expect(s.store.turn("student-one", l.id, "answer")).toBeNull();
  const resumed = await s.request(path, "POST", {
    intent: "answer",
    text: "Still food?",
    requestId: "new-answer",
    revision: 2,
  });
  expect(resumed.status).toBe(200);
  expect(s.store.profile("student-one").evidence.map((e) => e.id)).toEqual([
    "new-answer:evidence",
  ]);
  await s.request("/profile", "DELETE");
  expect(s.store.list("student-one")).toEqual([]);
  expect(s.store.profile("student-one").evidence).toEqual([]);
});
test("concurrent pending turns conflict and tutor failure leaves no partial save", async () => {
  let release!: (reply: TutorReply) => void, started!: () => void;
  const ready = new Promise<void>((resolve) => (started = resolve));
  const s = setup({
      tutor: async () => {
        started();
        return new Promise((resolve) => (release = resolve));
      },
    }),
    l = await s.create(),
    path = `/lessons/${l.id}/turn`,
    input = { intent: "teach", text: "", requestId: "first", revision: 0 };
  const pending = s.request(path, "POST", input);
  await ready;
  expect((await s.request(path, "POST", input)).status).toBe(409);
  release(diagnostic);
  expect((await pending).status).toBe(200);
  const failing = setup({
      tutor: async () => {
        throw new Error("Unavailable");
      },
    }),
    f = await failing.create();
  expect(
    (await failing.request(`/lessons/${f.id}/turn`, "POST", input)).status,
  ).toBe(502);
  expect(failing.store.lesson("student-one", f.id)!.revision).toBe(0);
  expect(failing.store.turn("student-one", f.id, "first")).toBeNull();
});
test("board geometry, duplicate IDs and invalid turn inputs cannot be persisted", async () => {
  const s = setup(),
    l = await s.create(),
    item = {
      id: "a",
      kind: "text" as const,
      text: "Energy",
      x: 0,
      y: 0,
      width: 100,
      height: 50,
    };
  for (const board of [
    { items: [{ ...item, x: -100001 }], strokes: [] },
    { items: [{ ...item, width: -1 }], strokes: [] },
    { items: [{ ...item, kind: "diamond" }], strokes: [] },
    { items: [{ ...item, target: "not an id" }], strokes: [] },
    { items: [{ ...item, extra: true }], strokes: [] },
    { items: [item, item], strokes: [] },
    { items: [], strokes: [{ color: "red", points: [] }] },
  ])
    expect(
      (await s.request(`/lessons/${l.id}/board`, "PUT", board)).status,
    ).toBe(400);
  // Tutor annotations use the scene's coordinates, which may be negative, and may name a student shape.
  const annotation = { ...item, id: "tutor-0", kind: "ellipse" as const, x: -40, y: -20, target: "shape-1" };
  expect(
    (
      await s.request(`/lessons/${l.id}/board`, "PUT", {
        items: [item, annotation],
        strokes: [],
      })
    ).status,
  ).toBe(200);
  for (const input of [
    { intent: "answer", text: " ", requestId: "a", revision: 0 },
    { intent: "teach", text: "", requestId: "a", revision: -1 },
    { intent: "hack", text: "", requestId: "a", revision: 0 },
    { intent: "question", text: "What is this?", requestId: "a", revision: 0, boardSnapshot: "https://example.com/board.png" },
    { intent: "question", text: "What is this?", requestId: "a", revision: 0, boardSnapshot: "data:text/html;base64,PHNjcmlwdD4=" },
    { intent: "question", text: "What is this?", requestId: "a", revision: 0, boardSnapshot: "data:image/png;base64,not base64!" },
    { intent: "teach", text: "", requestId: "a", revision: 0, whiteboard: "yes" },
  ])
    expect(
      (await s.request(`/lessons/${l.id}/turn`, "POST", input)).status,
    ).toBe(400);
  expect(s.store.lesson("student-one", l.id)!.board.items).toEqual([item, annotation]);
});

test("a whiteboard picture reaches the tutor but never the stored turn fingerprint", async () => {
  let seen: TurnInput | undefined;
  const s = setup({
    tutor: async (_lesson, _profile, input) => {
      seen = input;
      return { ...diagnostic, action: "answer" };
    },
  });
  const l = await s.create();
  // Larger than the plain 300 KB turn limit; pictures get their own allowance.
  const boardSnapshot = `data:image/jpeg;base64,${"QUJD".repeat(120000)}`;
  const question = { intent: "question", text: "Is my circuit complete?", requestId: "board-q", revision: 0 };
  const r = await s.request(`/lessons/${l.id}/turn`, "POST", { ...question, boardSnapshot, whiteboard: true });
  expect(r.status).toBe(200);
  expect(seen?.boardSnapshot).toBe(boardSnapshot);
  expect(seen?.whiteboard).toBe(true);
  expect(((await r.json()) as Lesson).messages.at(-1)?.annotated).toBeUndefined();
  const committed = s.store.turn("student-one", l.id, "board-q")!;
  expect(committed.fingerprint).not.toContain("QUJD");
  expect(committed.fingerprint.length).toBeLessThan(300);
  // Retrying the same question with a fresh picture replays the saved lesson instead of teaching again.
  seen = undefined;
  const retry = await s.request(`/lessons/${l.id}/turn`, "POST", { ...question, whiteboard: true, boardSnapshot: "data:image/png;base64,aGVsbG8=" });
  expect(retry.status).toBe(200);
  expect(seen).toBeUndefined();
  expect(
    (await s.request(`/lessons/${l.id}/turn`, "POST", { ...question, text: "Different question", boardSnapshot })).status,
  ).toBe(409);
  // Leaving the whiteboard changes the lesson mode, so it is a different turn as well.
  expect(
    (await s.request(`/lessons/${l.id}/turn`, "POST", { ...question, boardSnapshot })).status,
  ).toBe(409);
});

test("parallel lessons preserve both evidence records and preferences edited during generation", async () => {
  const waiting = new Map<string, (reply: TutorReply) => void>();
  const s = setup({
    tutor: async (lesson) =>
      new Promise((resolve) => waiting.set(lesson.id, resolve)),
  });
  const a = await s.create(),
    b = await s.create();
  for (const lesson of [a, b])
    s.store.save("student-one", {
      ...lesson,
      phase: "diagnostic",
      messages: [
        {
          id: "diagnostic",
          role: "agent",
          text: "What does sunlight supply?",
          action: "diagnostic",
          citations: [],
          createdAt: lesson.createdAt,
        },
      ],
    });
  const input = {
    intent: "answer",
    text: "Food",
    requestId: "answer",
    revision: 0,
  };
  const pendingA = s.request(`/lessons/${a.id}/turn`, "POST", input),
    pendingB = s.request(`/lessons/${b.id}/turn`, "POST", input);
  for (let attempt = 0; waiting.size < 2 && attempt < 100; attempt++)
    await new Promise((resolve) => setTimeout(resolve, 1));
  expect(waiting.size).toBe(2);
  expect(
    (
      await s.request("/profile", "PUT", {
        name: "Edited during teaching",
        pace: "quick",
        explanation: "words",
        goals: "Keep this preference",
      })
    ).status,
  ).toBe(200);
  const reply: TutorReply = {
    ...diagnostic,
    action: "reteach",
    assessment: "incorrect",
    misconception: "Light is food",
  };
  waiting.get(a.id)!(reply);
  expect((await pendingA).status).toBe(200);
  waiting.get(b.id)!(reply);
  expect((await pendingB).status).toBe(200);
  const profile = s.store.profile("student-one");
  expect(profile.name).toBe("Edited during teaching");
  expect(profile.pace).toBe("quick");
  expect(profile.goals).toBe("Keep this preference");
  expect(profile.evidence.map((e) => e.lessonId).sort()).toEqual(
    [a.id, b.id].sort(),
  );
});

test("retrying an older committed request returns latest lesson without generating again", async () => {
  let calls = 0;
  const s = setup({
      tutor: async () =>
        ++calls === 1
          ? diagnostic
          : {
              ...diagnostic,
              action: "reteach",
              assessment: "incorrect",
              misconception: "Light is food",
            },
    }),
    l = await s.create(),
    path = `/lessons/${l.id}/turn`;
  const first = { intent: "teach", text: "", requestId: "first", revision: 0 };
  expect((await s.request(path, "POST", first)).status).toBe(200);
  expect(
    (
      await s.request(path, "POST", {
        intent: "answer",
        text: "Food",
        requestId: "second",
        revision: 1,
      })
    ).status,
  ).toBe(200);
  const retry = await s.request(path, "POST", first);
  expect(retry.status).toBe(200);
  const latest = await retry.json();
  expect(latest.revision).toBe(2);
  expect(latest.messages).toHaveLength(4);
  expect(latest.evidence).toHaveLength(1);
  expect(calls).toBe(2);
});

test("a request whose body arrives after another turn commits is rejected as stale", async () => {
  const s = setup(),
    l = await s.create(),
    path = `/lessons/${l.id}/turn`;
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  const delayed = s.app(
    new Request(`http://localhost/api${path}`, {
      method: "POST",
      headers: {
        Authorization: "Bearer student-one",
        "Content-Type": "application/json",
      },
      body: stream,
    }),
  );
  // Let the first handler reach its body reader before the competing request finishes.
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(
    (
      await s.request(path, "POST", {
        intent: "teach",
        text: "",
        requestId: "first",
        revision: 0,
      })
    ).status,
  ).toBe(200);
  controller.enqueue(
    new TextEncoder().encode(
      JSON.stringify({
        intent: "teach",
        text: "",
        requestId: "delayed",
        revision: 0,
      }),
    ),
  );
  controller.close();
  const response = await delayed;
  expect(response.status).toBe(409);
  expect((await response.json()).code).toBe("stale_lesson");
  expect(s.calls()).toBe(1);
  expect(s.store.lesson("student-one", l.id)!.revision).toBe(1);
});
