import { describe, expect, test } from "bun:test";
import { applyReply, generateReply, retrieve, validateReply } from "./index";
import type {
  Lesson,
  LearnerProfile,
  TutorReply,
  TurnInput,
} from "../../../packages/shared-types/src/study";
const lesson: Lesson = {
  id: "l",
  courseId: "c",
  title: "Plants",
  posts: [],
  sources: [
    {
      id: "s1",
      title: "Energy",
      mimeType: "text/plain",
      postIds: [],
      originalUrl: "",
      pdfAvailable: false,
      passages: [
        { id: "p1", text: "Sunlight supplies energy. Plants make glucose." },
      ],
    },
    {
      id: "s2",
      title: "Experiment",
      mimeType: "text/plain",
      postIds: [],
      originalUrl: "",
      pdfAvailable: false,
      passages: [
        { id: "p2", text: "In darkness the plant cannot photosynthesize." },
      ],
    },
  ],
  failures: [],
  phase: "diagnostic",
  messages: [
    {
      id: "first",
      role: "agent",
      text: "What does sunlight supply?",
      action: "diagnostic",
      citations: [],
      createdAt: "",
    },
  ],
  board: { items: [], strokes: [] },
  evidence: [],
  createdAt: "",
  updatedAt: "",
  revision: 0,
};
const profile: LearnerProfile = {
  name: "",
  pace: "balanced",
  explanation: "words",
  goals: "",
  evidence: [],
};
const input: TurnInput = {
  intent: "answer",
  text: "Food",
  revision: 0,
  requestId: "r",
};
const reply: TutorReply = {
  text: "Sunlight supplies energy to make glucose. What food is made?",
  action: "reteach",
  assessment: "incorrect",
  misconception: "Confuses energy with food",
  citations: [
    { sourceId: "s1", passageId: "p1", quote: "Sunlight supplies energy." },
  ],
  board: [],
};
function config(value: unknown, inspect?: (body: any) => void) {
  return {
    apiKey: "fake-test-key",
    model: "configured-model",
    fetcher: (async (_url: unknown, init: RequestInit) => {
      inspect?.(JSON.parse(init.body as string));
      return Response.json({
        status: "completed",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: JSON.stringify(value) }],
          },
        ],
      });
    }) as unknown as typeof fetch,
  };
}
describe("grounded adaptive tutor", () => {
  test("retrieval preserves multiple selected sources and bounded source text", () => {
    const found = retrieve(lesson.sources, "energy energy energy", 60);
    expect(new Set(found.map((p) => p.sourceId)).size).toBe(2);
    expect(found.reduce((n, p) => n + p.text.length, 0)).toBeLessThanOrEqual(
      60,
    );
  });
  test("wrong answer reteaches; correct answers progress through practice and teach back", async () => {
    const wrong = await generateReply(
      lesson,
      profile,
      input,
      config(reply, (body) => {
        expect(body.model).toBe("configured-model");
        expect(body.store).toBe(false);
        expect(body.text.format.strict).toBe(true);
        expect(JSON.parse(body.input[0].content).passages.length).toBe(2);
      }),
    );
    const changed = applyReply(lesson, input, wrong);
    expect(changed.phase).toBe("reteaching");
    expect(changed.evidence[0]?.assessment).toBe("incorrect");
    expect(lesson.evidence).toHaveLength(0);
    expect(lesson.messages).toHaveLength(1);
    const correct = await generateReply(
      lesson,
      profile,
      { ...input, text: "Energy" },
      config({
        ...reply,
        assessment: "correct",
        action: "practice",
        misconception: null,
      }),
    );
    expect(
      applyReply(lesson, { ...input, text: "Energy" }, correct).phase,
    ).toBe("practice");
    const practice = {
      ...lesson,
      messages: [{ ...lesson.messages[0]!, action: "practice" as const }],
    };
    expect(
      (
        await generateReply(
          practice,
          profile,
          input,
          config({ ...reply, assessment: "correct", action: "teach_back" }),
        )
      ).action,
    ).toBe("teach_back");
  });
  test("invented source, passage, quote and extra output fields fail closed", () => {
    const passages = retrieve(lesson.sources, "");
    for (const citation of [
      { ...reply.citations[0], sourceId: "other" },
      { ...reply.citations[0], passageId: "missing" },
      { ...reply.citations[0], quote: "Sunlight supplies food." },
    ]) {
      expect(() =>
        validateReply({ ...reply, citations: [citation] }, passages),
      ).toThrow("unverified");
    }
    expect(() =>
      validateReply({ ...reply, injected: true }, passages),
    ).toThrow();
    expect(() =>
      validateReply({ ...reply, citations: [] }, passages),
    ).toThrow();
  });
  test("interruptions never record mastery evidence even when provider assesses them", async () => {
    for (const [intent, action] of [
      ["skip", "explain"],
      ["question", "answer"],
      ["simplify", "reteach"],
      ["example", "explain"],
      ["why", "answer"],
      ["recap", "recap"],
    ] as const) {
      const turn = { ...input, intent };
      const output = await generateReply(
        lesson,
        profile,
        turn,
        config({ ...reply, assessment: "correct", action }),
      );
      expect(output.assessment).toBe("none");
      expect(output.misconception).toBeNull();
      expect(applyReply(lesson, turn, output).evidence).toHaveLength(0);
    }
  });
  test("Q&A interruptions end pending assessment; later follow-up does not earn evidence", async () => {
    const interrupted = applyReply(
      lesson,
      { ...input, intent: "question" },
      { ...reply, action: "answer" },
    );
    const followUp = {
      ...input,
      requestId: "follow-up",
      revision: interrupted.revision,
      text: "That makes sense",
    };
    const result = await generateReply(
      interrupted,
      profile,
      followUp,
      config({ ...reply, action: "explain", assessment: "correct" }),
    );
    expect(result.assessment).toBe("none");
    expect(applyReply(interrupted, followUp, result).evidence).toHaveLength(0);
    // The new explanation asks a fresh check, so its next answer can be assessed.
    const resumed = applyReply(interrupted, followUp, result);
    const checked = await generateReply(
      resumed,
      profile,
      { ...input, revision: resumed.revision, requestId: "check" },
      config(reply),
    );
    expect(checked.assessment).toBe("incorrect");
  });
  test("state reducer also rejects impossible assessed transitions", () => {
    expect(() =>
      applyReply(lesson, input, { ...reply, action: "recap" }),
    ).toThrow("lesson step");
    const recap = applyReply(
      lesson,
      { ...input, intent: "recap" },
      { ...reply, action: "recap", assessment: "correct" },
    );
    expect(recap.evidence).toHaveLength(0);
  });
  test("tutor diagram updates preserve student notes and strokes; empty updates preserve diagrams", () => {
    const item = {
      id: "student-uuid",
      kind: "text" as const,
      x: 10,
      y: 10,
      width: 100,
      height: 50,
      text: "My prediction",
    };
    const oldTutor = { ...item, id: "tutor-0", text: "Old diagram" };
    const boardLesson = {
      ...lesson,
      board: {
        items: [item, oldTutor],
        strokes: [{ points: [{ x: 1, y: 2 }], color: "#000000" }],
      },
    };
    const changed = applyReply(boardLesson, input, {
      ...reply,
      board: [{ ...item, id: "model-card", text: "New diagram" }],
    });
    expect(changed.board.items).toEqual([
      item,
      { ...item, id: "tutor-0", text: "New diagram" },
    ]);
    expect(changed.board.strokes).toEqual(boardLesson.board.strokes);
    expect(boardLesson.board.items).toEqual([item, oldTutor]);
    expect(applyReply(boardLesson, input, reply).board).toEqual(
      boardLesson.board,
    );
    for (const id of ["bad id", "<script>", "", "x".repeat(101)]) {
      expect(() =>
        validateReply(
          { ...reply, board: [{ ...item, id }] },
          retrieve(lesson.sources, ""),
        ),
      ).toThrow("invalid board");
    }
  });
  test("initial turn diagnoses and mismatched teaching action is rejected", async () => {
    await expect(
      generateReply(
        { ...lesson, phase: "ready", messages: [] },
        profile,
        { ...input, intent: "teach" },
        config({ ...reply, action: "diagnostic" }),
      ),
    ).resolves.toMatchObject({ action: "diagnostic", assessment: "none" });
    await expect(
      generateReply(
        lesson,
        profile,
        input,
        config({ ...reply, action: "recap" }),
      ),
    ).rejects.toThrow("lesson step");
  });
  test("stale writes and incomplete, refused, missing-config responses fail safely", async () => {
    expect(() => applyReply(lesson, { ...input, revision: 1 }, reply)).toThrow(
      "changed",
    );
    await expect(
      generateReply(lesson, profile, input, { ...config(reply), apiKey: "" }),
    ).rejects.toThrow("Configure");
    for (const body of [
      { status: "incomplete" },
      {
        status: "completed",
        output: [{ type: "message", content: [{ type: "refusal" }] }],
      },
    ]) {
      await expect(
        generateReply(lesson, profile, input, {
          ...config(reply),
          fetcher: (async () => Response.json(body)) as unknown as typeof fetch,
        }),
      ).rejects.toThrow();
    }
  });
});

test("unassessed answers cannot silently complete the lesson", () => {
  expect(() => applyReply(lesson, input, {...reply, assessment: "none", action: "recap"})).toThrow("cannot finish");
});
