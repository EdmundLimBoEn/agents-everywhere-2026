import { test, expect } from "bun:test";
import { assignment } from "./validation";

test("assignment boundary defaults to draft, validates attachment sharing, and rejects attachment edits", () => {
  expect(assignment({ title: "Exercise", attachments: [{ id: "doc1", shareMode: "STUDENT_COPY" }], dueAt: "2026-09-20T15:30:00Z" }, false)).toEqual({ title: "Exercise", state: "DRAFT", materials: [{ driveFile: { driveFile: { id: "doc1" }, shareMode: "STUDENT_COPY" } }], dueDate: { year: 2026, month: 9, day: 20 }, dueTime: { hours: 15, minutes: 30 } });
  for (const value of [{ title: "" }, { title: "X", state: "BOGUS" }, { title: "X", maxPoints: -1 }, { title: "X", attachments: [{ id: "../bad", shareMode: "VIEW" }] }]) expect(() => assignment(value, false)).toThrow();
  expect(() => assignment({ attachments: [] }, true)).toThrow("attachments");
  expect(assignment({ dueAt: null }, true)).toEqual({ dueDate: null, dueTime: null });
});
