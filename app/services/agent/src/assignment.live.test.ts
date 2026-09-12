import { expect, test } from "bun:test";
import type { Lesson } from "../../../packages/shared-types/src/study";
import { generateAssignment } from "./assignment";

// Explicit opt-in: synthetic TEST materials only; never reads a student's account.
test.skipIf(process.env.RUN_LIVE_ASSIGNMENT !== "1")("live assignment assistant prepares, hints, and checks the student's own draft", async () => {
  const config = { apiKey: process.env.OPENAI_API_KEY || "", model: process.env.OPENAI_MODEL || "" };
  const lesson: Lesson = {
    id: "test-lesson", courseId: "test-course", title: "TEST photosynthesis assignment", posts: [{ id: "test-work", type: "courseWork" }],
    classroomPosts: [{ id: "test-work", courseId: "test-course", type: "courseWork", title: "TEST photosynthesis assignment", description: "Explain how light affects photosynthesis. Identify the energy source and explain why a plant kept in darkness makes less glucose.", attachments: [] }],
    sources: [
      { id: "classroom-courseWork-test-work", title: "TEST assignment instructions", mimeType: "text/plain", postIds: ["test-work"], passages: [{ id: "instructions", text: "Explain how light affects photosynthesis. Identify the energy source and explain why a plant kept in darkness makes less glucose." }], originalUrl: "https://classroom.google.com", pdfAvailable: false },
      { id: "test-notes", title: "TEST light notes", mimeType: "text/plain", postIds: ["test-notes-post"], passages: [{ id: "p1", text: "Light supplies energy for photosynthesis. Plants use this energy to make glucose from carbon dioxide and water. Darkness limits the light energy available for this process." }], originalUrl: "https://docs.google.com", pdfAvailable: false },
    ],
    failures: [], phase: "ready", messages: [], board: { items: [], strokes: [] }, evidence: [], revision: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  lesson.assignment = await generateAssignment(lesson, { action: "prepare", assignmentId: "test-work", revision: 0, requestId: "live-prepare" }, config);
  expect(lesson.assignment.requirements.length).toBeGreaterThan(0);
  expect(lesson.assignment.rubricAvailable).toBe(false);
  lesson.assignment = await generateAssignment(lesson, { action: "help", question: "I do not understand the role of light. Give me a hint without writing my response.", revision: 1, requestId: "live-help" }, config);
  expect(lesson.assignment.help?.citations.length).toBeGreaterThan(0);
  lesson.assignment = await generateAssignment(lesson, { action: "save", draft: "Light is important for plants.", revision: 2, requestId: "live-save" }, { apiKey: "", model: "" });
  lesson.assignment = await generateAssignment(lesson, { action: "review", revision: 3, requestId: "live-review" }, config);
  expect(lesson.assignment.review?.criteria.length).toBe(lesson.assignment.requirements.length);
  expect(lesson.assignment.review?.criteria.some((c) => c.status !== "addressed")).toBe(true);
  expect(lesson.assignment.draft).toBe("Light is important for plants.");
}, 240000);
