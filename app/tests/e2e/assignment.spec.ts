import { test, expect, type Page } from "@playwright/test";
import type { AssignmentState, ClassroomPost, Lesson } from "../../packages/shared-types/src/study";
import { lessonFixture, posts } from "./fixtures";

// Synthetic browser-test classroom only. Production sources require Google authorization.
const assignment: ClassroomPost = {
  id: "assignment-1", type: "courseWork", courseId: "course-1",
  title: "Explain photosynthesis", topicId: "topic-1",
  description: "Explain how light supports photosynthesis. Describe the role of chlorophyll. Support your explanation with evidence from the lesson notes.",
  alternateLink: "https://classroom.google.com/c/course-1/a/assignment-1/details",
  dueAt: "2026-09-18T15:59:00Z", attachments: [],
};
const instructionCitation = { sourceId: "assignment-source", passageId: "instructions", quote: "Explain how light supports photosynthesis." };
const prepared = (): AssignmentState => ({
  assignmentId: assignment.id, goal: "Write your own explanation of how plants use light to make glucose.",
  requirements: [
    { id: "light", text: "Explain how light supports photosynthesis", citations: [instructionCitation] },
    { id: "chlorophyll", text: "Describe the role of chlorophyll", citations: [{ ...instructionCitation, quote: "Describe the role of chlorophyll." }] },
    { id: "evidence", text: "Support the explanation with lesson evidence", citations: [{ ...instructionCitation, quote: "Support your explanation with evidence from the lesson notes." }] },
  ],
  rubricAvailable: false,
  materials: [{ sourceId: "source-a", reason: "Find the role of light and chlorophyll." }, { sourceId: "source-b", reason: "Trace how light energy becomes glucose." }],
  blocker: null, nextAction: "Start by explaining what light provides to a plant.", draft: "", help: null, review: null, updatedAt: "2026-09-12T06:00:00Z",
});
async function mockAssignment(page: Page) {
  const requests: { path: string; method: string; body: any }[] = [];
  let lesson: Lesson = {
    ...lessonFixture(), title: assignment.title, posts: [{ id: assignment.id, type: assignment.type }, ...posts.map(({ id, type }) => ({ id, type }))],
    classroomPosts: [assignment, ...posts], sources: [{
      id: "assignment-source", title: "Assignment instructions", mimeType: "text/plain", postIds: [assignment.id], originalUrl: assignment.alternateLink!, pdfAvailable: false,
      passages: [{ id: "instructions", text: assignment.description }],
    }, ...lessonFixture().sources],
  };
  await page.route("**/api/**", async route => {
    const req = route.request(), path = new URL(req.url()).pathname, method = req.method();
    const body = req.postData() ? req.postDataJSON() : undefined;
    requests.push({ path, method, body });
    let data: unknown;
    if (path === "/api/status") data = { configured: { google: true, teaching: true, voice: false } };
    else if (path === "/api/courses") data = { courses: [{ id: "course-1", name: "Biology" }] };
    else if (path === "/api/courses/course-1/posts") data = { posts: [assignment, ...posts], topics: [], warnings: [] };
    else if (path === "/api/courses/course-1/relevant") data = { posts, warnings: [] };
    else if (path === "/api/lessons" && method === "POST") data = lesson;
    else if (path === "/api/lessons" && method === "GET") data = { lessons: [{ id: lesson.id, title: lesson.title, updatedAt: lesson.updatedAt }] };
    else if (path === "/api/lessons/lesson-1") data = lesson;
    else if (path === "/api/lessons/lesson-1/assignment") {
      const state = structuredClone(lesson.assignment ?? prepared());
      if (typeof body.draft === "string" && body.draft !== state.draft) { state.draft = body.draft; state.review = null; }
      if (body.action === "help") {
        state.blocker = body.question || "Where does the energy come from?";
        state.help = { text: "Look at the first sentence of Light notes. Is sunlight an ingredient or a source of energy?", citations: [{ sourceId: "source-a", passageId: "passage-a", quote: "Sunlight supplies energy" }] };
      }
      if (body.action === "review") state.review = {
        summary: "Your explanation identifies energy. Add chlorophyll and a source reference before submitting.",
        criteria: state.requirements.map((r, i) => ({ requirementId: r.id, status: i === 0 ? "addressed" as const : "missing" as const,
          feedback: i === 0 ? "You connected sunlight to energy." : i === 1 ? "Explain where chlorophyll fits into the process." : "Include evidence from your teacher’s notes.",
          draftQuote: i === 0 ? state.draft : "", citations: r.citations,
        })), nextAction: "Add a sentence about chlorophyll using Light notes.",
      };
      lesson = { ...lesson, assignment: state, revision: lesson.revision + 1 };
      data = lesson;
    } else { await route.fulfill({ status: 404, json: { error: `Unexpected ${method} ${path}` } }); return; }
    await route.fulfill({ json: data });
  });
  return requests;
}

async function openAssignment(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Work on this assignment →", exact: true }).click();
  await expect(page.getByRole("heading", { name: assignment.title, exact: true })).toBeVisible();
}

test("assignment workspace prepares, saves, gives cited help, reviews and resumes", async ({ page }, testInfo) => {
  const requests = await mockAssignment(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openAssignment(page);
  const creation = requests.find(r => r.path === "/api/lessons" && r.method === "POST")!.body;
  expect(creation.posts).toContainEqual({ id: assignment.id, type: "courseWork" });
  expect(creation.posts).toHaveLength(3);
  await expect(page.getByText(/No.*rubric|rubric.*not|rubric.*unavailable/i).first()).toBeVisible();
  const draft = page.getByRole("textbox", { name: "Assignment draft", exact: true });
  await draft.fill("Plants use sunlight as energy to make glucose.");
  await page.getByRole("combobox", { name: "Class material" }).selectOption("assignment-source");
  await expect(draft).toHaveValue("Plants use sunlight as energy to make glucose.");
  await page.getByRole("combobox", { name: "Class material" }).selectOption("source-a");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect.poll(() => requests.filter(r => r.body?.action === "save").length).toBe(1);
  await page.getByRole("textbox", { name: "What are you stuck on?", exact: true }).fill("What is chlorophyll doing?");
  await page.getByRole("button", { name: "Get a hint", exact: true }).click();
  await expect(page.getByText("Look at the first sentence of Light notes. Is sunlight an ingredient or a source of energy?", { exact: true })).toBeVisible();
  await expect(draft).toHaveValue("Plants use sunlight as energy to make glucose.");
  await page.getByRole("button", { name: "Check my draft", exact: true }).click();
  await expect(page.getByText("Your explanation identifies energy. Add chlorophyll and a source reference before submitting.", { exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: testInfo.outputPath("assignment-desktop.png"), fullPage: true });
  await expect(page.getByRole("link", { name: /Classroom/ }).first()).toHaveAttribute("href", assignment.alternateLink!);
  expect(requests.some(r => /submit|turnIn/.test(r.path))).toBe(false);
  await draft.fill("Plants use sunlight as energy to make glucose. Chlorophyll absorbs light.");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Your explanation identifies energy. Add chlorophyll and a source reference before submitting.", { exact: true })).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: /Saved lessons/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: assignment.title, exact: true }).click();
  await expect(draft).toHaveValue("Plants use sunlight as energy to make glucose. Chlorophyll absorbs light.");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("assignment-mobile.png"), fullPage: true });
});

test("failed assignment save retains edits and retries the identical request", async ({ page }) => {
  await mockAssignment(page);
  await openAssignment(page);
  const attempts: unknown[] = [];
  await page.route("**/api/lessons/lesson-1/assignment", async route => {
    if (route.request().postDataJSON().action !== "save") { await route.fallback(); return; }
    attempts.push(route.request().postDataJSON());
    if (attempts.length === 1) await route.fulfill({ status: 503, json: { error: "Draft save unavailable. Please retry." } });
    else await route.fallback();
  });
  const draft = page.getByRole("textbox", { name: "Assignment draft", exact: true });
  await draft.fill("Keep my own work, even when saving fails.");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Draft save unavailable. Please retry.", { exact: true })).toBeVisible();
  await expect(draft).toHaveValue("Keep my own work, even when saving fails.");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect.poll(() => attempts.length).toBe(2);
  expect(attempts[0]).toEqual(attempts[1]);
  await expect(draft).toHaveValue("Keep my own work, even when saving fails.");
});

test("a stale revision reloads requirements without losing the local draft", async ({ page }) => {
  await mockAssignment(page);
  await openAssignment(page);
  const latest: Lesson = { ...lessonFixture(), revision: 9, classroomPosts: [assignment], assignment: { ...prepared(), requirementsStale: true, draft: "Saved in another tab" } };
  await page.route("**/api/lessons/lesson-1", route => route.fulfill({ json: latest }));
  const attempts: any[] = [];
  await page.route("**/api/lessons/lesson-1/assignment", async route => {
    attempts.push(route.request().postDataJSON());
    if (attempts.length === 1) await route.fulfill({ status: 409, json: { error: "This lesson changed in another tab. Reload before continuing.", code: "stale_lesson" } });
    else await route.fallback();
  });
  const draft = page.getByRole("textbox", { name: "Assignment draft", exact: true });
  await draft.fill("My local draft must survive the conflict.");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("button", { name: "Refresh requirements", exact: true })).toBeVisible();
  await expect(draft).toHaveValue("My local draft must survive the conflict.");
  await expect(page.getByRole("button", { name: "Check my draft", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Get a hint", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Refresh requirements", exact: true }).click();
  await expect.poll(() => attempts.length).toBe(2);
  expect(attempts[1]).toMatchObject({ action: "prepare", revision: 9, draft: "My local draft must survive the conflict." });
  await expect(draft).toHaveValue("My local draft must survive the conflict.");
  await expect(page.getByRole("button", { name: "Check my draft", exact: true })).toBeEnabled();
});

test("review gaps lead back to the draft and copying transfers the student's exact text", async ({ page }) => {
  await mockAssignment(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (text: string) => { (window as any).copiedDraft = text; } } });
  });
  await openAssignment(page);
  await expect(page.getByRole('button', { name: 'Copy my draft', exact: true })).toBeDisabled();
  const draft = page.getByRole('textbox', { name: 'Assignment draft', exact: true });
  const text = 'Plants use sunlight as energy to make glucose.';
  await draft.fill(text);
  await expect(page.getByText('8 words · 46 / 20,000 characters', { exact: true })).toBeVisible();
  await draft.press('Control+s');
  await expect(page.getByText('Saved draft', { exact: true })).toBeVisible();
  await expect(draft).toBeFocused();
  await page.getByRole('button', { name: 'Check my draft', exact: true }).click();
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '1');
  await page.getByRole('button', { name: 'Find in my draft ↗', exact: true }).click();
  await expect(draft).toBeFocused();
  expect(await draft.evaluate((e: HTMLTextAreaElement) => e.value.slice(e.selectionStart, e.selectionEnd))).toBe(text);
  await page.getByRole('button', { name: 'Work on this gap ↗', exact: true }).first().click();
  await expect(draft).toBeFocused();
  await expect(page.locator('.assignment-focus-note')).toHaveText('Explain where chlorophyll fits into the process.');
  await page.getByRole('button', { name: 'Copy my draft', exact: true }).click();
  expect(await page.evaluate(() => (window as any).copiedDraft)).toBe(text);
  await expect(page.getByText('Copied. Paste your draft into Classroom when ready.', { exact: true })).toBeVisible();
});

test("clipboard denial selects the draft without changing or losing it", async ({ page }) => {
  await mockAssignment(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('Denied'); } } });
  });
  await openAssignment(page);
  const draft = page.getByRole('textbox', { name: 'Assignment draft', exact: true });
  await draft.fill('My own answer.');
  await page.getByRole('button', { name: 'Copy my draft', exact: true }).click();
  await expect(draft).toBeFocused();
  await expect(draft).toHaveValue('My own answer.');
  expect(await draft.evaluate((e: HTMLTextAreaElement) => e.value.slice(e.selectionStart, e.selectionEnd))).toBe('My own answer.');
  await expect(page.getByText('Clipboard unavailable. Your draft is selected; use Copy to transfer it.', { exact: true })).toBeVisible();
});
