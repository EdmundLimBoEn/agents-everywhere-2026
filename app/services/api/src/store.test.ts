import { expect, test } from "bun:test";
import { Store } from "./store";
import type {
  Lesson,
  LearnerProfile,
} from "../../../packages/shared-types/src/study";
const lesson = (id = "lesson"): Lesson => ({
  id,
  courseId: "course",
  title: "Light",
  posts: [],
  sources: [],
  failures: [],
  phase: "ready",
  messages: [],
  board: { items: [], strokes: [] },
  evidence: [],
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  revision: 0,
});
test("failed turn transaction rolls back lesson and profile together", () => {
  const s = new Store(":memory:");
  try {
    const l = lesson(),
      p: LearnerProfile = {
        name: "Original",
        pace: "balanced",
        explanation: "examples",
        goals: "",
        evidence: [],
      };
    s.commitTurn("alice", l, "request", "fingerprint", p);
    expect(() =>
      s.commitTurn("alice", { ...l, revision: 99 }, "request", "different", {
        ...p,
        name: "Should roll back",
      }),
    ).toThrow();
    expect(s.lesson("alice", l.id)!.revision).toBe(0);
    expect(s.profile("alice").name).toBe("Original");
    expect(s.turn("alice", l.id, "request")!.fingerprint).toBe("fingerprint");
  } finally {
    s.close();
  }
});
test("deletion removes owner evidence and cached turns while retaining other owners", () => {
  const s = new Store(":memory:");
  try {
    const l = lesson();
    l.evidence = [
      {
        id: "evidence",
        lessonId: l.id,
        topic: "Light",
        answer: "Food",
        assessment: "incorrect",
        misconception: "Light is food",
        intervention: "Light supplies energy",
        createdAt: l.createdAt,
      },
    ];
    for (const owner of ["alice", "bob"])
      s.commitTurn(owner, l, "request", "fingerprint", {
        name: owner,
        pace: "balanced",
        explanation: "examples",
        goals: "",
        evidence: l.evidence,
      });
    s.deleteLesson("alice", l.id);
    expect(s.lesson("alice", l.id)).toBeNull();
    expect(s.turn("alice", l.id, "request")).toBeNull();
    expect(s.profile("alice").evidence).toEqual([]);
    expect(s.lesson("bob", l.id)).not.toBeNull();
    expect(s.profile("bob").evidence).toHaveLength(1);
    expect(s.turn("bob", l.id, "request")).not.toBeNull();
    s.deleteProfile("bob");
    expect(s.list("bob")).toEqual([]);
    expect(s.turn("bob", l.id, "request")).toBeNull();
    expect(s.profile("bob").evidence).toEqual([]);
  } finally {
    s.close();
  }
});

test("saved crew survives reload and forgetting evidence clears derived crew notes", () => {
  const store = new Store(":memory:");
  try {
    const l = lesson();
    l.evidence = [{ id: "review", lessonId: l.id, topic: "Light", answer: "Food", assessment: "incorrect", misconception: "Energy versus food", intervention: "Review energy", createdAt: l.createdAt }];
    const note = { text: "Review energy", citations: [] };
    l.catchUp = { minutes: 15, scout: note, review: { ...note, assessment: "incorrect", prerequisite: "Energy versus food" }, plan: { reason: "Revisit first", steps: [{ ...note, minutes: 5 }] } };
    store.commitTurn("alice", l, "crew-turn", "fingerprint", { name: "Alice", pace: "balanced", explanation: "words", goals: "", evidence: l.evidence });
    expect(store.lesson("alice", l.id)?.catchUp).toEqual(l.catchUp);
    store.deleteEvidence("alice", "review");
    expect(store.lesson("alice", l.id)?.catchUp).toBeUndefined();
    expect(store.lesson("alice", l.id)?.evidence).toEqual([]);
    expect(store.turn("alice", l.id, "crew-turn")).toBeNull();
  } finally {
    store.close();
  }
});
