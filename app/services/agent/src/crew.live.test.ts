import { expect, test } from "bun:test";
import { generateCrewReply } from "./crew";
import { applyReply } from "./index";
import { lessonFixture, profile } from "../../../tests/e2e/fixtures";

// Explicit opt-in: uses the configured provider with synthetic TEST material, never a student's account.
test.skipIf(process.env.RUN_LIVE_CREW !== "1")("live crew starts and replans after an incorrect answer", async () => {
  const config = { apiKey: process.env.OPENAI_API_KEY || "", model: process.env.OPENAI_MODEL || "" };
  const lesson = lessonFixture();
  const input = { intent: "teach" as const, text: "", requestId: "live-start", revision: 0, catchUpMinutes: 15 };
  const reply = await generateCrewReply(lesson, profile, input, config);
  expect(reply.action).toBe("diagnostic");
  expect(reply.catchUp?.plan.steps.length).toBeGreaterThan(0);
  const started = applyReply(lesson, input, reply);
  const next = { intent: "answer" as const, text: "Plants do not need light or energy. They make glucose from nothing.", requestId: "live-answer", revision: started.revision };
  const reviewed = await generateCrewReply(started, profile, next, config);
  expect(["incorrect", "partial"]).toContain(reviewed.catchUp?.review?.assessment ?? "none");
  expect(reviewed.action).toBe("reteach");
  expect(reviewed.catchUp?.plan.steps.reduce((sum, step) => sum + step.minutes, 0)).toBeLessThanOrEqual(15);
  expect(applyReply(started, next, reviewed).evidence).toHaveLength(1);
}, 360000);
