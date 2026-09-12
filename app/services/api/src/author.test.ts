import { test, expect } from "bun:test";
import { assignmentWrite as assignment } from "./validation";

test("assignment boundary defaults to draft, validates attachment sharing, and rejects attachment edits", () => {
  expect(assignment({ title: "Exercise", attachments: [{ id: "doc1", shareMode: "STUDENT_COPY" }], dueAt: "2026-09-20T15:30:00Z" }, false)).toEqual({ title: "Exercise", state: "DRAFT", materials: [{ driveFile: { driveFile: { id: "doc1" }, shareMode: "STUDENT_COPY" } }], dueDate: { year: 2026, month: 9, day: 20 }, dueTime: { hours: 15, minutes: 30 } });
  for (const value of [{ title: "" }, { title: "X", state: "BOGUS" }, { title: "X", maxPoints: -1 }, { title: "X", attachments: [{ id: "../bad", shareMode: "VIEW" }] }]) expect(() => assignment(value, false)).toThrow();
  expect(() => assignment({ attachments: [] }, true)).toThrow("attachments");
  expect(assignment({ dueAt: null }, true)).toEqual({ dueDate: null, dueTime: null });
});

import { createApp } from "./app";
import { Store } from "./store";
import { GoogleClassroom } from "../../classroom/src";

test("authenticated author routes validate before writing and preserve revision and attachment payloads", async () => {
  const store = new Store(":memory:"), writes: { url: string; body: string }[] = [];
  const fetcher = (async (input: unknown, init: RequestInit) => {
    const url = String(input);
    if (url.includes("tokeninfo")) return Response.json({ aud: "client", expires_in: 3600 });
    if (url.includes("userinfo")) return Response.json({ sub: "teacher", email: "teacher@example.com", email_verified: true });
    if (init.method && init.method !== "GET") writes.push({ url, body: String(init.body) });
    return Response.json({ id: "created", documentId: "created", revisionId: "rev", associatedWithDeveloper: true });
  }) as typeof fetch;
  const app = createApp({ store, config: { googleClientIds: ["client"], apiKey: "", model: "", realtimeModel: "", allowedEmails: [], allowedOrigins: ["http://localhost"] }, google: token => new GoogleClassroom(token, fetcher) });
  const request = (path: string, method: string, body: unknown, auth = true) => app(new Request(`http://localhost/api${path}`, { method, headers: { "Content-Type": "application/json", ...(auth ? { Authorization: "Bearer teacher-token" } : {}) }, body: JSON.stringify(body) }));
  try {
    expect((await request("/documents", "POST", { title: "Notes", text: "Evidence" }, false)).status).toBe(401);
    expect(writes).toHaveLength(0);
    expect((await request("/documents", "POST", { title: "Notes", text: "Evidence" })).status).toBe(201);
    expect(writes.at(-1)?.body).toContain("Evidence");
    expect((await request("/documents/created", "PATCH", { append: "More" })).status).toBe(400);
    expect((await request("/documents/created", "PATCH", { append: "More", revisionId: "rev", tabId: "tab" })).status).toBe(200);
    expect(JSON.parse(writes.at(-1)!.body).writeControl.requiredRevisionId).toBe("rev");
    expect((await request("/courses/class1/assignments", "POST", { title: "Practice", attachments: [{ id: "created", shareMode: "VIEW" }] })).status).toBe(201);
    expect(JSON.parse(writes.at(-1)!.body)).toMatchObject({ state: "DRAFT", materials: [{ driveFile: { driveFile: { id: "created" } } }] });
    const count = writes.length;
    expect((await request("/courses/class1/assignments/created", "PATCH", { attachments: [] })).status).toBe(400);
    expect(writes).toHaveLength(count);
    expect((await request("/documents/created", "PATCH", { name: "New", trashed: true })).status).toBe(400);
    expect(writes).toHaveLength(count);
  } finally { store.close(); }
});
