import { describe, expect, test } from "bun:test";
import { applyReply, describeBoard, generateReply, retrieve, validateReply } from "./index";
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

describe("whiteboard annotations", () => {
  const scene = {
    elements: [
      { id: "battery", type: "rectangle", x: -40.4, y: 20, width: 80, height: 30.6, isDeleted: false },
      { id: "wire", type: "freedraw", x: 40, y: 35, width: 200, height: 4 },
      { id: "label", type: "text", x: -40, y: 60, width: 60, height: 20, text: "cell" },
      { id: "gone", type: "ellipse", x: 0, y: 0, width: 10, height: 10, isDeleted: true },
      { id: "old-mark", type: "arrow", x: 0, y: 0, width: 10, height: 10, customData: { boardItemId: "tutor-0" } },
    ],
    files: {},
    sourceItems: [],
  };
  const drawn: Lesson = { ...lesson, board: { items: [], strokes: [], scene } };
  const question: TurnInput = { ...input, intent: "question", text: "Is my battery drawn right?", boardSnapshot: "data:image/jpeg;base64,QUJD" };
  const annotation = { id: "ring", kind: "ellipse" as const, x: -60, y: 0, width: 120, height: 70, text: "Battery", target: "battery" };
  const answer = { ...reply, action: "answer" as const };

  test("the tutor sees the student's shapes, not deleted ones or its own earlier marks", () => {
    const context = describeBoard(drawn.board)!;
    expect(context.elements.map((e) => e.id)).toEqual(["battery", "wire", "label"]);
    expect(context.elements[0]).toEqual({ id: "battery", type: "rectangle", x: -40, y: 20, width: 80, height: 31 });
    expect(context.elements[2]?.text).toBe("cell");
    expect(context.bounds).toEqual({ minX: -40, minY: 20, maxX: 240, maxY: 80 });
    expect(context.tutorAnnotations).toBe(1);
    expect(describeBoard({ items: [], strokes: [] })).toBeNull();
    expect(describeBoard({ items: [{ id: "tutor-0", kind: "text", x: 0, y: 0, width: 1, height: 1, text: "mine" }], strokes: [] })).toBeNull();
    expect(describeBoard({ items: [{ id: "note", kind: "text", x: 5, y: 6, width: 1, height: 1, text: "mine" }], strokes: [] })?.elements).toEqual([
      { id: "note", type: "text", x: 5, y: 6, width: 1, height: 1, text: "mine" },
    ]);
  });

  test("whiteboard questions send the drawing as text and picture; the picture stays out of the prompt JSON", async () => {
    const result = await generateReply(drawn, profile, question, config({ ...answer, board: [annotation] }, (body) => {
      const [text, image] = body.input[0].content;
      const data = JSON.parse(text.text);
      expect(data.whiteboard.elements.map((e: { id: string }) => e.id)).toEqual(["battery", "wire", "label"]);
      expect(data.input).toEqual({ ...input, intent: "question", text: question.text });
      expect(image).toEqual({ type: "input_image", image_url: question.boardSnapshot, detail: "auto" });
      expect(body.max_output_tokens).toBe(16000);
    }));
    expect(result.board).toEqual([annotation]);
    const next = applyReply(drawn, question, result);
    expect(next.board.items).toEqual([{ ...annotation, id: "tutor-0" }]);
    expect(next.messages.at(-1)).toMatchObject({ role: "agent", annotated: true });
    expect(applyReply(drawn, question, { ...result, board: [] }).messages.at(-1)?.annotated).toBeUndefined();
    await generateReply(lesson, profile, { ...input, intent: "question" }, config(answer, (body) => {
      expect(typeof body.input[0].content).toBe("string");
      expect(JSON.parse(body.input[0].content).whiteboard).toBeUndefined();
    }));
  });

  test("teaching at the whiteboard hands the tutor its own diagram so it can grow it turn by turn", async () => {
    const card = { id: "tutor-0", kind: "rectangle" as const, x: 0, y: 0, width: 200, height: 80, text: "Leaf" };
    const student = { ...card, id: "note", kind: "text" as const, text: "my note" };
    const started: Lesson = { ...lesson, board: { items: [student, card], strokes: [] } };
    const atBoard: TurnInput = { ...input, whiteboard: true };
    const grown = { ...reply, board: [{ ...card, target: null }, { id: "sun", kind: "ellipse", x: 300, y: 0, width: 120, height: 80, text: "Sun", target: null }] };
    const result = await generateReply(started, profile, atBoard, config(grown, (body) => {
      const data = JSON.parse(body.input[0].content);
      expect(data.whiteboardLesson).toBe(true);
      expect(data.tutorBoard).toEqual([card]);
      expect(data.whiteboard.elements.map((e: { id: string }) => e.id)).toEqual(["note"]);
      expect(data.input.whiteboard).toBe(true);
    }));
    // Unchanged items keep their id and content, so the board rebuilds them without redrawing.
    expect(applyReply(started, atBoard, result).board.items).toEqual([
      student,
      card,
      { id: "tutor-1", kind: "ellipse", x: 300, y: 0, width: 120, height: 80, text: "Sun" },
    ]);
    await generateReply(lesson, profile, input, config(reply, (body) => {
      const data = JSON.parse(body.input[0].content);
      expect(data.whiteboardLesson).toBe(false);
      expect(data.tutorBoard).toBeUndefined();
    }));
    const passages = retrieve(lesson.sources, "");
    const many = (n: number) => Array.from({ length: n }, (_, i) => ({ ...card, id: `part-${i}`, target: null }));
    expect(validateReply({ ...reply, board: many(40) }, passages).board).toHaveLength(40);
    expect(() => validateReply({ ...reply, board: many(41) }, passages)).toThrow("invalid lesson");
  });

  test("generation constrains targets to the current student shapes, including empty and tutor-only boards", async () => {
    const tutorOnly: Lesson = { ...lesson, board: { items: [{ id: "tutor-0", kind: "rectangle", x: 0, y: 0, width: 100, height: 50, text: "Leaf" }], strokes: [] } };
    for (const [current, allowed] of [[drawn, ["battery", "wire", "label", null]], [lesson, [null]], [tutorOnly, [null]]] as const) {
      await generateReply(current, profile, { ...question, whiteboard: true }, config(answer, (body) => {
        const target = body.text.format.schema.properties.board.items.properties.target;
        expect(target.enum).toEqual(allowed);
      }));
    }
  });

  test("annotations may only point at shapes the student drew, and free notes drop the null target", async () => {
    for (const target of ["gone", "old-mark", "nope"])
      await expect(
        generateReply(drawn, profile, question, config({ ...answer, board: [{ ...annotation, target }] })),
      ).rejects.toThrow("not on the whiteboard");
    await expect(
      generateReply(lesson, profile, { ...input, intent: "question" }, config({ ...answer, board: [annotation] })),
    ).rejects.toThrow("not on the whiteboard");
    const free = await generateReply(lesson, profile, { ...input, intent: "question" }, config({ ...answer, board: [{ ...annotation, target: null }] }));
    expect(free.board[0]).not.toHaveProperty("target");
    const passages = retrieve(lesson.sources, "");
    for (const change of [{ kind: "diamond" }, { x: 100001 }, { y: -100001 }, { width: -5 }, { target: 3 }])
      expect(() => validateReply({ ...reply, board: [{ ...annotation, target: null, ...change }] }, passages)).toThrow("invalid board");
    expect(() =>
      validateReply({ ...reply, board: [{ id: "a", kind: "text", x: 0, y: 0, width: 1, height: 1, text: "no target key" }] }, passages),
    ).toThrow("invalid board");
    expect(validateReply({ ...reply, board: [{ ...annotation, x: -99999, y: 99999, target: null }] }, passages).board[0]?.x).toBe(-99999);
  });
});
