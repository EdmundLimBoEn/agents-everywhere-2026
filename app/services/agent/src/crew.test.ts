import { expect, test } from "bun:test";
import { generateCrewReply } from "./crew";
import { applyReply, type ModelConfig } from "./index";
import { lessonFixture, profile } from "../../../tests/e2e/fixtures";
import { turn } from "../../api/src/validation";

const citations = [{ sourceId: "source-a", passageId: "passage-a", quote: "Sunlight supplies energy" }];
const scout = { text: "Study the role of light in photosynthesis.", citations };
const plan = { reason: "Start with the energy prerequisite.", steps: [{ text: "Explain the difference between light energy and food.", minutes: 5, citations }] };
const diagnostic = { text: "Tutor-generated: What does sunlight supply?", action: "diagnostic", assessment: "none", misconception: null, citations, board: [] };
function provider(outputs: unknown[]) {
  const calls: any[] = [];
  const config: ModelConfig = {
    apiKey: "test", model: "test",
    fetcher: (async (_url, init) => {
      calls.push(JSON.parse(init!.body as string));
      const output = outputs[Math.min(calls.length - 1, outputs.length - 1)];
      if (output instanceof Error) throw output;
      return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(output) }] }] });
    }) as typeof fetch,
  };
  return { calls, config };
}
const first = { intent: "teach" as const, text: "", requestId: "start", revision: 0, catchUpMinutes: 25 };

test("crew starts a cited plan, reviews a wrong answer and passes remediation to planner and tutor", async () => {
  const start = provider([scout, plan, diagnostic]);
  const lesson = lessonFixture();
  const initial = applyReply(lesson, first, await generateCrewReply(lesson, profile, first, start.config));
  expect(start.calls.map((c) => c.text.format.name)).toEqual(["class_scout", "planner", "tutor_reply"]);
  expect(initial.catchUp?.review).toBeNull();
  expect(initial.catchUp?.plan.steps[0]?.minutes).toBe(5);
  expect(initial.phase).toBe("diagnostic");
  const review = { text: "Light supplies energy, not food.", assessment: "incorrect", prerequisite: "Energy versus food", citations };
  const wrong = provider([scout, review, plan, { ...diagnostic, action: "reteach", assessment: "incorrect", misconception: "Energy versus food" }]);
  const answer = { intent: "answer" as const, text: "Food", requestId: "answer", revision: initial.revision };
  const changed = applyReply(initial, answer, await generateCrewReply(initial, profile, answer, wrong.config));
  expect(wrong.calls.map((c) => c.text.format.name)).toEqual(["class_scout", "reviewer", "planner", "tutor_reply"]);
  expect(JSON.parse(wrong.calls[2].input[0].content).review.prerequisite).toBe("Energy versus food");
  expect(JSON.parse(wrong.calls[3].input[0].content).crewHandoff.plan).toEqual(plan);
  expect(changed.catchUp?.review?.prerequisite).toBe("Energy versus food");
  expect(changed.phase).toBe("reteaching");
  expect(changed.evidence[0]?.assessment).toBe("incorrect");
  expect(initial.evidence).toHaveLength(0);
});

test("ordinary lessons keep the single tutor path; interruptions do not invoke reviewer", async () => {
  const lesson = lessonFixture();
  const plain = provider([diagnostic]);
  await generateCrewReply(lesson, profile, { ...first, catchUpMinutes: undefined }, plain.config);
  expect(plain.calls).toHaveLength(1);
  const question = provider([scout, plan, { ...diagnostic, action: "answer" }]);
  const result = await generateCrewReply(lesson, profile, { ...first, intent: "question", text: "Why light?" }, question.config);
  expect(question.calls.map(c => c.text.format.name)).not.toContain("reviewer");
  expect(result.assessment).toBe("none");
});

test("crew rejects invented citations, impossible budgets and upstream failures without mutating lesson", async () => {
  for (const outputs of [
    [{ ...scout, citations: [{ ...citations[0], quote: "Invented quote" }] }],
    [scout, { ...plan, steps: [{ ...plan.steps[0], minutes: 26 }] }],
    [scout, { ...plan, steps: [{ ...plan.steps[0], minutes: -1 }] }],
    [scout, { ...plan, steps: [] }],
    [scout, new Error("Provider unavailable")],
  ]) {
    const lesson = lessonFixture(), before = structuredClone(lesson);
    await expect(generateCrewReply(lesson, profile, first, provider(outputs).config)).rejects.toThrow();
    expect(lesson).toEqual(before);
  }
  for (const catchUpMinutes of [0, 4, 121, 5.5, "25", null]) {
    expect(() => turn({ ...first, catchUpMinutes })).toThrow("5–120");
  }
  expect(turn(first).catchUpMinutes).toBe(25);
});

test("reviewer disagreement cannot record false evidence", async () => {
  const lesson = lessonFixture();
  lesson.phase = "diagnostic";
  lesson.messages = [{ id: "question", role: "agent", text: diagnostic.text, action: "diagnostic", citations, createdAt: lesson.createdAt }];
  const review = { ...scout, assessment: "incorrect", prerequisite: "Energy versus food" };
  const model = provider([scout, review, plan, { ...diagnostic, action: "practice", assessment: "correct" }]);
  await expect(generateCrewReply(lesson, profile, { ...first, intent: "answer", text: "Food" }, model.config)).rejects.toThrow("disagreed");
  expect(lesson.evidence).toHaveLength(0);
});


test("crew generation declares the same text bounds its validator requires", async () => {
  const lesson = lessonFixture();
  lesson.phase = "diagnostic";
  lesson.messages = [{ id: "question", role: "agent", text: diagnostic.text, action: "diagnostic", citations, createdAt: lesson.createdAt }];
  const model = provider([scout, { ...scout, assessment: "incorrect", prerequisite: "Energy versus food" }, plan, { ...diagnostic, action: "reteach", assessment: "incorrect" }]);
  await generateCrewReply(lesson, profile, { ...first, intent: "answer", text: "Food" }, model.config);
  const [scoutSchema, reviewerSchema, plannerSchema] = model.calls.map(call => call.text.format.schema.properties);
  for (const field of [scoutSchema.text, reviewerSchema.text, reviewerSchema.prerequisite, plannerSchema.reason, plannerSchema.steps.items.properties.text]) {
    expect(field).toMatchObject({ minLength: 1, maxLength: 2000, pattern: "\\S" });
  }
});

test("invalid crew text never commits a partial lesson", async () => {
  for (const text of ["", "   ", "x".repeat(2001)]) {
    for (const outputs of [[{ ...scout, text }], [scout, { ...plan, reason: text }], [scout, { ...plan, steps: [{ ...plan.steps[0], text }] }]]) {
      const lesson = lessonFixture(), before = structuredClone(lesson);
      await expect(generateCrewReply(lesson, profile, first, provider(outputs).config)).rejects.toThrow("invalid text");
      expect(lesson).toEqual(before);
    }
  }
});


test("crew repairs rejected scout citations and tutor output without restarting valid stages", async () => {
  const invalidScout = { ...scout, citations: Array.from({ length: 21 }, () => citations[0]) };
  const invalidTutor = { ...diagnostic, citations: [] };
  const model = provider([invalidScout, scout, plan, invalidTutor, diagnostic]);
  const lesson = lessonFixture();
  const result = await generateCrewReply(lesson, profile, first, model.config);
  expect(result.catchUp?.scout).toEqual(scout);
  expect(result.citations).toEqual(citations);
  expect(model.calls.map(c => c.text.format.name)).toEqual(["class_scout", "class_scout", "planner", "tutor_reply", "tutor_reply"]);
  expect(lesson.messages).toHaveLength(0);
  for (const call of [model.calls[0], model.calls[3]]) {
    expect(call.text.format.schema.properties.citations).toMatchObject({ minItems: 1, maxItems: 20 });
  }
});

test("citation repair is bounded and never accepts fabricated evidence", async () => {
  const model = provider([{ ...scout, citations: [{ ...citations[0], quote: "Invented evidence" }] }]);
  const lesson = lessonFixture(), before = structuredClone(lesson);
  await expect(generateCrewReply(lesson, profile, first, model.config)).rejects.toThrow("unverified passage");
  expect(model.calls).toHaveLength(2);
  expect(lesson).toEqual(before);
});


test("metadata mistaken for a passage is corrected using the rejected citation details", async () => {
  const citation = { ...citations[0], quote: 'dueAt: 2026-09-25' };
  const model = provider([{ ...scout, citations: [citation] }, scout, plan, diagnostic]);
  const result = await generateCrewReply(lessonFixture(), profile, first, model.config);
  expect(result.catchUp?.scout.citations).toEqual(citations);
  const correction = JSON.parse(model.calls[1].input[0].content);
  expect(correction.validationDetails.citation).toEqual(citation);
  expect(correction.validationDetails.rule).toContain("metadata");
  const ids = model.calls[0].text.format.schema.properties.citations.items.properties;
  expect(ids.sourceId.enum).toContain("source-a");
  expect(ids.passageId.enum).toContain("passage-a");
  expect(ids.passageId.enum).not.toContain("unknown");
});

test("crew does not retry provider transport failures", async () => {
  const model = provider([new Error("Provider unavailable")]);
  await expect(generateCrewReply(lessonFixture(), profile, first, model.config)).rejects.toThrow("Provider unavailable");
  expect(model.calls).toHaveLength(1);
});


test("tutor assessment follows the reviewer and repairs disagreement before saving", async () => {
  const lesson = lessonFixture();
  lesson.phase = "diagnostic";
  lesson.messages = [{ id: "question", role: "agent", text: diagnostic.text, action: "diagnostic", citations, createdAt: lesson.createdAt }];
  const review = { ...scout, assessment: "incorrect", prerequisite: "Energy versus food" };
  const model = provider([scout, review, plan, { ...diagnostic, action: "practice", assessment: "correct" }, { ...diagnostic, action: "reteach", assessment: "incorrect" }]);
  const result = await generateCrewReply(lesson, profile, { ...first, intent: "answer", text: "Food" }, model.config);
  expect(result.assessment).toBe("incorrect");
  expect(result.action).toBe("reteach");
  expect(model.calls[3].text.format.schema.properties.assessment.enum).toEqual(["incorrect"]);
  expect(model.calls[3].text.format.schema.properties.action.enum).toEqual(["reteach"]);
  expect(model.calls[4].text.format.name).toBe("tutor_reply");
  expect(lesson.evidence).toHaveLength(0);
});
