import { afterEach, expect, test } from "bun:test";
import type { AssignmentInput, Lesson, StudySource } from "../../../packages/shared-types/src/study";
import type { GoogleClassroom } from "../../classroom/src";
import { assignmentSourcesChanged, generateAssignment } from "../../agent/src/assignment";
import { createApp } from "./app";
import { Store } from "./store";

const stores: Store[] = [];
afterEach(() => stores.splice(0).forEach((s) => s.close()));
const instruction = { sourceId: "classroom-courseWork-work", passageId: "instructions", quote: "Explain how light affects photosynthesis." };
const post = { id: "work", type: "courseWork" as const, courseId: "course", title: "Photosynthesis", description: instruction.quote, attachments: [] };
const sources: StudySource[] = [
  { id: instruction.sourceId, title: post.title, mimeType: "text/plain", postIds: ["work"], passages: [{ id: "instructions", text: instruction.quote }], originalUrl: "https://classroom.google.com/c/course/a/work", pdfAvailable: false },
  { id: "notes", title: "Light notes", mimeType: "text/plain", postIds: ["notes-post"], passages: [{ id: "p1", text: "Light supplies energy for photosynthesis." }], originalUrl: "https://docs.google.com/document/d/notes", pdfAvailable: false },
];
const prepared = { goal: "Explain the role of light", requirements: [{ id: "light", text: instruction.quote, citations: [instruction] }], materials: [{ sourceId: "notes", reason: "Read the role of light." }], blocker: null, nextAction: "Read the light notes." };
const reviewed = { summary: "Checked against assignment instructions; no teacher rubric available.", criteria: [{ requirementId: "light", status: "partial" as const, feedback: "You mention light; explain its role.", draftQuote: "Light matters.", citations: [instruction] }], nextAction: "Explain the role of light in your own words." };
const hint = { text: "What role does light play in the notes?", citations: [{ sourceId: "notes", passageId: "p1", quote: "Light supplies energy" }], blocker: "Unsure of light's role", nextAction: "Reread the energy sentence." };
function setup(beforeReply?: () => Promise<void>) {
  const store = new Store(":memory:"); stores.push(store);
  let output: unknown = prepared, calls = 0, refreshes = 0, denied = false;
  let loadedSources = sources;
  const requests: Record<string, unknown>[] = [];
  const config = { googleClientIds: ["client"], apiKey: "fake", model: "fake", realtimeModel: "", allowedOrigins: [], allowedEmails: [] };
  const app = createApp({ store, config,
    google: (token) => ({ authenticate: async () => ({ id: token, email: `${token}@example.com`, name: token }), loadSources: async () => {
      refreshes++;
      if (denied) throw new Error("Access revoked");
      return { posts: [post], sources: loadedSources, failures: [] };
    } }) as unknown as GoogleClassroom,
    assignment: (lesson, input, config) => generateAssignment(lesson, input, { ...config, fetcher: (async (_url, init) => {
      calls++; requests.push(JSON.parse(String(init?.body)));
      await beforeReply?.();
      return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(output) }] }] });
    }) as typeof fetch }),
  });
  const lesson: Lesson = { id: "lesson", title: post.title, courseId: "course", posts: [{ id: "work", type: "courseWork" }], classroomPosts: [post], sources, failures: [], phase: "ready", messages: [], board: { items: [], strokes: [] }, evidence: [], revision: 0, createdAt: "2026-09-12T00:00:00Z", updatedAt: "2026-09-12T00:00:00Z" };
  store.save("student-one", lesson);
  const send = (input: unknown, user = "student-one") => app(new Request("http://localhost/api/lessons/lesson/assignment", { method: "POST", headers: { Authorization: `Bearer ${user}`, "Content-Type": "application/json" }, body: JSON.stringify(input) }));
  const prepare: AssignmentInput = { action: "prepare", assignmentId: "work", revision: 0, requestId: "prepare" };
  return { app, store, config, lesson, send, prepare, sources: (value: StudySource[]) => loadedSources = value, output: (value: unknown) => output = value, deny: () => denied = true, calls: () => calls, refreshes: () => refreshes, requests };
}

test("assignment workflow prepares cited requirements, gives a hint, saves without provider, reviews and invalidates changed drafts", async () => {
  const s = setup();
  const response = await s.send(s.prepare);
  expect(response.status).toBe(200);
  let lesson: Lesson = await response.json();
  expect(lesson.assignment?.rubricAvailable).toBe(false);
  expect(lesson.assignment?.requirements).toEqual(prepared.requirements);
  expect(lesson.revision).toBe(1);
  s.output(hint);
  expect((await s.send({ action: "help", question: "I am stuck", revision: 1, requestId: "hint" })).status).toBe(200);
  s.config.apiKey = "";
  expect((await s.send({ action: "save", draft: "Light matters.", revision: 2, requestId: "save" })).status).toBe(200);
  expect(s.calls()).toBe(2);
  s.config.apiKey = "fake"; s.output(reviewed);
  expect((await s.send({ action: "review", revision: 3, requestId: "review" })).status).toBe(200);
  lesson = s.store.lesson("student-one", "lesson")!;
  expect(lesson.assignment?.review).toEqual(reviewed);
  expect(lesson.messages).toEqual([]);
  expect(lesson.evidence).toEqual([]);
  expect((await s.send({ action: "save", draft: "Light matters.", revision: 4, requestId: "unchanged" })).status).toBe(200);
  expect(s.store.lesson("student-one", "lesson")!.assignment?.review).toEqual(reviewed);
  expect((await s.send({ action: "save", draft: "Light supplies energy.", revision: 5, requestId: "changed" })).status).toBe(200);
  expect(s.store.lesson("student-one", "lesson")!.assignment?.review).toBeNull();
  expect(s.store.lesson("student-one", "lesson")!.assignment?.blocker).toBeNull();
  expect(s.store.lesson("student-one", "lesson")!.assignment?.nextAction).toBe("Check your updated draft against the assignment requirements.");
  expect(s.calls()).toBe(3);
});

test("assignment endpoint enforces ownership, selected courseWork, revisions, idempotency and access checks on retry", async () => {
  const s = setup();
  expect((await s.send(s.prepare, "student-two")).status).toBe(404);
  expect((await s.send({ ...s.prepare, assignmentId: "other" })).status).toBe(422);
  expect((await s.send(s.prepare)).status).toBe(200);
  expect((await s.send(s.prepare)).status).toBe(200);
  expect(s.calls()).toBe(1);
  expect((await s.send({ ...s.prepare, question: "changed" })).status).toBe(409);
  expect((await s.send({ ...s.prepare, requestId: "stale" })).status).toBe(409);
  expect((await s.send({ action: "save", draft: "new", revision: 1, requestId: "save" })).status).toBe(200);
  expect((await (await s.send(s.prepare)).json()).revision).toBe(2);
  s.deny();
  const before = s.refreshes();
  expect((await s.send(s.prepare)).status).toBe(502);
  expect(s.refreshes()).toBe(before + 1);
  expect(s.calls()).toBe(1);
});

test("assignment input rejects malformed requests and empty review before provider execution", async () => {
  const s = setup();
  for (const input of [{ ...s.prepare, action: "submit" }, { ...s.prepare, assignmentId: undefined }, { ...s.prepare, revision: -1 }, { ...s.prepare, draft: "x".repeat(20001) }, { ...s.prepare, question: "x".repeat(2001) }, { ...s.prepare, requestId: "../bad" }, { action: "save", revision: 0, requestId: "save" }])
    expect((await s.send(input)).status).toBe(400);
  expect((await s.send(s.prepare)).status).toBe(200);
  expect((await s.send({ action: "review", draft: " ", revision: 1, requestId: "empty" })).status).toBe(422);
  expect((await s.send({ action: "save", assignmentId: "other", draft: "draft", revision: 1, requestId: "wrong" })).status).toBe(400);
  expect(s.calls()).toBe(1);
});

test("provider rejects fabricated citations, duplicate requirements and demands cited only from lesson notes without saving", async () => {
  for (const invalid of [
    { ...prepared, requirements: [{ ...prepared.requirements[0], citations: [{ ...instruction, quote: "Invented rubric" }] }] },
    { ...prepared, requirements: [prepared.requirements[0], prepared.requirements[0]] },
    { ...prepared, requirements: [{ ...prepared.requirements[0], citations: hint.citations }] },
    { ...prepared, materials: [{ sourceId: "invented", reason: "No source" }] },
  ]) {
    const s = setup(); s.output(invalid);
    expect((await s.send(s.prepare)).status).toBe(502);
    expect(s.store.lesson("student-one", "lesson")!.revision).toBe(0);
    expect(s.store.turn("student-one", "lesson", "prepare")).toBeNull();
  }
});

test("review validates complete criterion coverage, exact student quotes and requirement citations", async () => {
  const s = setup(); await s.send(s.prepare);
  const criterion = reviewed.criteria[0]!;
  for (const criteria of [[], [criterion, criterion], [{ ...criterion, draftQuote: "Fabricated student work" }], [{ ...criterion, draftQuote: "" }], [{ ...criterion, requirementId: "invented" }], [{ ...criterion, citations: hint.citations }]]) {
    s.output({ ...reviewed, criteria });
    expect((await s.send({ action: "review", draft: "Light matters.", revision: 1, requestId: "review" })).status).toBe(502);
    expect(s.store.lesson("student-one", "lesson")!.assignment?.draft).toBe("");
  }
  s.output(reviewed);
  expect((await s.send({ action: "review", draft: "Light matters.", revision: 1, requestId: "review" })).status).toBe(200);
  const request = s.requests.at(-1)!;
  expect(String(request.instructions)).toContain("untrusted data");
  expect(String(request.instructions)).toContain("No scores or grades");
  expect(request.store).toBe(false);
});

test("saved requirements are revalidated against refreshed sources before help; native rubric availability comes from sources", async () => {
  const s = setup(); await s.send(s.prepare);
  const lesson = s.store.lesson("student-one", "lesson")!;
  await expect(generateAssignment({ ...lesson, sources: [] }, { action: "help", revision: 1, requestId: "hint" }, { apiKey: "fake", model: "fake" })).rejects.toThrow("No readable assignment instructions");
  await expect(generateAssignment({ ...lesson, sources: sources.map((source) => source.id === instruction.sourceId ? { ...source, passages: [{ id: "instructions", text: "Instructions changed" }] } : source) }, { action: "help", revision: 1, requestId: "hint" }, { apiKey: "fake", model: "fake" })).rejects.toThrow("unverified passage");
  const rubric = { ...sources[0]!, id: "classroom-rubric-work-rubric", title: "Teacher rubric", passages: [{ id: "criterion-1", text: "Explain light's role" }] };
  const state = await generateAssignment({ ...lesson, sources: [...sources, rubric] }, s.prepare, { apiKey: "fake", model: "fake", fetcher: (async () => Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(prepared) }] }] })) as unknown as typeof fetch });
  expect(state.rubricAvailable).toBe(true);
});


test("concurrent assignment actions serialize and cross-endpoint request IDs cannot be reused", async () => {
  let release!: () => void, started!: () => void;
  const ready = new Promise<void>((resolve) => started = resolve);
  const gate = new Promise<void>((resolve) => release = resolve);
  const s = setup(async () => { started(); await gate; });
  const pending = s.send(s.prepare);
  await ready;
  expect((await s.send(s.prepare)).status).toBe(409);
  expect(s.calls()).toBe(1);
  release();
  expect((await pending).status).toBe(200);
  const lesson = s.store.lesson("student-one", "lesson")!;
  s.store.commitTurn("student-one", lesson, "teaching-request", JSON.stringify({ intent: "teach", text: "", revision: 1, requestId: "teaching-request" }), s.store.profile("student-one"));
  expect((await s.send({ action: "save", draft: "draft", revision: 1, requestId: "teaching-request" })).status).toBe(409);
  expect(s.store.lesson("student-one", "lesson")!.assignment?.draft).toBe("");
});


test("added teacher requirements invalidate feedback even when original quotes remain; refreshing preserves the draft", async () => {
  const s = setup();
  await s.send(s.prepare);
  s.output(reviewed);
  await s.send({ action: "review", draft: "Light matters.", revision: 1, requestId: "review" });
  s.output(hint);
  await s.send({ action: "help", revision: 2, requestId: "help" });
  const expanded = sources.map((source) => source.id === instruction.sourceId ? { ...source, passages: [{ id: "instructions", text: `${instruction.quote} Include a diagram.` }] } : source);
  s.sources(expanded);
  const response = await s.app(new Request("http://localhost/api/lessons/lesson", { headers: { Authorization: "Bearer student-one" } }));
  expect(response.status).toBe(200);
  const changed: Lesson = await response.json();
  expect(changed.assignment?.requirementsStale).toBe(true);
  expect(changed.assignment?.draft).toBe("Light matters.");
  expect(changed.assignment?.review).toBeNull();
  expect(changed.assignment?.help).toBeNull();
  const calls = s.calls();
  for (const action of ["help", "review"]) {
    const denied = await s.send({ action, revision: 3, requestId: `stale-${action}` });
    expect(denied.status).toBe(409);
    expect((await denied.json()).code).toBe("stale_assignment");
  }
  expect(s.calls()).toBe(calls);
  expect((await s.send({ action: "save", draft: "My preserved draft", revision: 3, requestId: "save-stale" })).status).toBe(200);
  s.output({ ...prepared, requirements: [...prepared.requirements, { id: "diagram", text: "Include a diagram.", citations: [{ ...instruction, quote: "Include a diagram." }] }] });
  const refreshed = await s.send({ ...s.prepare, revision: 4, requestId: "refresh" });
  expect(refreshed.status).toBe(200);
  const current: Lesson = await refreshed.json();
  expect(current.assignment?.requirementsStale).not.toBe(true);
  expect(current.assignment?.requirements).toHaveLength(2);
  expect(current.assignment?.draft).toBe("My preserved draft");
});


test("source change detection covers new or edited rubric criteria without treating lesson-note edits or source ordering as requirements changes", async () => {
  const s = setup(); await s.send(s.prepare);
  const lesson = s.store.lesson("student-one", "lesson")!;
  expect(assignmentSourcesChanged(lesson, [...sources].reverse())).toBe(false);
  expect(assignmentSourcesChanged(lesson, sources.map((source) => source.id === "notes" ? { ...source, passages: [{ id: "p1", text: "Updated learning notes" }] } : source))).toBe(false);
  const rubric = { ...sources[0]!, id: "classroom-rubric-work-rubric", passages: [{ id: "criterion-1", text: "Explain light's role" }] };
  expect(assignmentSourcesChanged(lesson, [...sources, rubric])).toBe(true);
  expect(assignmentSourcesChanged({ ...lesson, sources: [...sources, rubric] }, [...sources, { ...rubric, passages: [...rubric.passages, { id: "criterion-2", text: "Include a diagram" }] }])).toBe(true);
  expect(assignmentSourcesChanged({ ...lesson, sources: [...sources, rubric] }, sources)).toBe(true);
});
