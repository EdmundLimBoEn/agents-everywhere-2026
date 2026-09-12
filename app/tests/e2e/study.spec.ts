import { test, expect, type Page } from "@playwright/test";
import { lessonFixture, physicsLessonFixture, physicsScenarios, posts, profile } from "./fixtures";
import { applyReply, generateReply } from "../../services/agent/src/index";
import { board as validateBoard } from "../../services/api/src/validation";
import type { Lesson, TurnInput, TutorReply } from "../../packages/shared-types/src/study";

async function mockClassroom(page: Page, initial = lessonFixture(), tutor?: (lesson: Lesson, input: TurnInput) => Promise<TutorReply>) {
  let lesson = initial;
  const requests: { path: string; method: string; body: any }[] = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname,
      method = request.method();
    const body = request.postData() ? request.postDataJSON() : undefined;
    requests.push({ path, method, body });
    let data: unknown;
    if (path === "/api/status")
      data = { configured: { google: true, teaching: true, voice: false } };
    else if (path === "/api/courses")
      data = { courses: [{ id: "course-1", name: "Biology" }] };
    else if (path === "/api/courses/course-1/posts")
      data = {
        posts,
        topics: [{ topicId: "topic-1", name: "Photosynthesis" }],
        warnings: [],
      };
    else if (path === "/api/lessons" && method === "POST") data = lesson;
    else if (path === "/api/lessons" && method === "GET")
      data = {
        lessons: [
          { id: lesson.id, title: lesson.title, updatedAt: lesson.updatedAt },
        ],
      };
    else if (path === "/api/lessons/lesson-1") data = lesson;
    else if (path === "/api/profile")
      data = method === "GET" ? profile : { ...profile, ...body };
    else if (path === "/api/lessons/lesson-1/board") {
      lesson.board = body;
      data = lesson;
    } else if (path === "/api/lessons/lesson-1/turn") {
      if (tutor) {
        lesson = applyReply(lesson, body, await tutor(lesson, body));
        await route.fulfill({ json: lesson });
        return;
      }
      const diagnostic = body.intent === "teach";
      // Answers sent from the whiteboard tab also carry a picture; only questions get the annotated reply here.
      const whiteboard = body.intent === "question" && !!body.boardSnapshot;
      if (!diagnostic)
        lesson.messages.push({
          id: "student-1",
          role: "student",
          text: body.text,
          citations: [],
          createdAt: lesson.createdAt,
        });
      lesson.messages.push({
        id: `agent-${lesson.revision}`,
        role: "agent",
        action: diagnostic ? "diagnostic" : whiteboard ? "answer" : "reteach",
        text: diagnostic
          ? "What do plants get from sunlight?"
          : whiteboard
            ? "Your rectangle is the leaf. Light enters it from the side you marked."
            : "Sunlight gives plants energy to make food. Find the glucose in your teacher’s notes.",
        citations: diagnostic
          ? []
          : [
              {
                sourceId: "source-b",
                passageId: "passage-b",
                quote: "Plants use light energy to make glucose",
              },
            ],
        ...(whiteboard ? { annotated: true } : {}),
        createdAt: lesson.createdAt,
      });
      if (body.whiteboard && !whiteboard) {
        // Teaching at the board: the tutor keeps its earlier parts and adds one more each turn.
        const kept = lesson.board.items.filter((item) => item.id.startsWith("tutor-"));
        lesson.board = {
          ...lesson.board,
          items: diagnostic
            ? [
                { id: "tutor-0", kind: "rectangle", x: 0, y: 0, width: 220, height: 90, text: "Leaf" },
                { id: "tutor-1", kind: "text", x: 0, y: -80, width: 0, height: 0, text: "Sunlight arrives" },
                { id: "tutor-2", kind: "arrow", x: 60, y: -50, width: 60, height: 50, text: "energy" },
              ]
            : [...kept, { id: `tutor-${kept.length}`, kind: "ellipse", x: 300, y: 0, width: 160, height: 90, text: "Glucose" }],
        };
      }
      if (whiteboard) {
        // A whiteboard question: annotate the student's rectangle the way the tutor would.
        const shape = lesson.board.scene?.elements.find(
          (e) => e.type === "rectangle" && !e.isDeleted && !e.customData,
        ) as { id: string; x: number; y: number; width: number; height: number } | undefined;
        lesson.board = {
          ...lesson.board,
          items: shape
            ? [
                { id: "tutor-0", kind: "ellipse", x: 0, y: 0, width: 0, height: 0, text: "Your leaf", target: shape.id },
                { id: "tutor-1", kind: "text", x: shape.x + shape.width + 140, y: shape.y - 70, width: 0, height: 0, text: "Light enters here", target: shape.id },
                { id: "tutor-2", kind: "arrow", x: shape.x - 160, y: shape.y + shape.height + 90, width: 0, height: 0, text: "energy", target: shape.id },
              ]
            : [],
        };
      }
      if (body.catchUpMinutes || lesson.catchUp) {
        const note = { text: "Light supplies energy, not food.", citations: [{ sourceId: "source-a", passageId: "passage-a", quote: "Sunlight supplies energy" }] };
        lesson.catchUp = {
          minutes: body.catchUpMinutes ?? lesson.catchUp!.minutes,
          scout: { ...note, text: "Two selected materials explain photosynthesis." },
          review: diagnostic ? null : { ...note, assessment: "incorrect", prerequisite: "Energy versus food" },
          plan: { reason: diagnostic ? "Begin with the role of light." : "Revisit energy before the glucose exercise.", steps: [{ ...note, text: "Explain what plants get from sunlight.", minutes: 5 }, ...(body.catchUpMinutes >= 25 || (lesson.catchUp?.minutes ?? 0) >= 25 ? [
            { ...note, text: "Trace how light energy becomes glucose.", minutes: 10, citations: [{ sourceId: "source-b", passageId: "passage-b", quote: "Plants use light energy to make glucose" }] },
            { ...note, text: "Describe the role of chlorophyll in your own words.", minutes: 5, citations: [{ sourceId: "source-a", passageId: "passage-a2", quote: "Chlorophyll absorbs the light" }] },
          ] : [])] },
        };
      }
      lesson.phase = diagnostic ? "diagnostic" : "reteaching";
      lesson.revision++;
      data = lesson;
    } else {
      await route.fulfill({
        status: 404,
        json: { error: `Unexpected test request: ${method} ${path}` },
      });
      return;
    }
    await route.fulfill({ json: data });
  });
  return requests;
}

async function chooseMaterials(page: Page, title = "Photosynthesis") {
  await page.goto("/");
  await page.getByRole("checkbox").nth(0).check();
  await page.getByRole("checkbox").nth(1).check();
  await page
    .getByRole("button", { name: "Study these together →", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
}

test("selected posts, adaptive response, exact citation and saved lesson resume", async ({
  page,
}, testInfo) => {
  const requests = await mockClassroom(page);
  await chooseMaterials(page);
  expect(
    requests.find((r) => r.path === "/api/lessons" && r.method === "POST")?.body
      .posts,
  ).toEqual(posts.map(({ id, type }) => ({ id, type })));
  // Both posts reference Light notes; the API's deduplicated source appears once.
  await expect(
    page.getByRole("button", { name: "Light notes", exact: true }),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "Glucose diagram", exact: true })
    .click();
  await expect(
    page.getByText(
      "Plants use light energy to make glucose from carbon dioxide and water.",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Teach me this topic →", exact: true })
    .click();
  await expect(
    page.getByText("What do plants get from sunlight?", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Your answer or question" })
    .fill("Food");
  await page.getByRole("button", { name: "Send ↗", exact: true }).click();
  await expect(
    page.getByText(
      "Sunlight gives plants energy to make food. Find the glucose in your teacher’s notes.",
      { exact: true },
    ),
  ).toBeVisible();
  const answer = requests.filter((r) => r.path.endsWith("/turn")).at(-1)!.body;
  expect(answer).toMatchObject({ intent: "answer", text: "Food", revision: 1 });
  expect(answer.requestId).toBeTruthy();
  await page.getByRole("button", { name: "Light notes", exact: true }).click();
  await page.getByRole("button", { name: /↗ Glucose diagram ·/ }).click();
  const layout = await page.locator(".study-split").boundingBox();
  const voice = await page.locator(".study-voice-host").boundingBox();
  const composer = await page.locator(".study-composer").boundingBox();
  expect(voice!.y + voice!.height).toBeLessThanOrEqual(layout!.y + layout!.height + 1);
  expect(composer!.y + composer!.height).toBeLessThanOrEqual(layout!.y + layout!.height + 1);
  await page.screenshot({
    path: testInfo.outputPath("lesson.png"),
    fullPage: true,
  });
  await testInfo.attach("Lesson and citation", {
    path: testInfo.outputPath("lesson.png"),
    contentType: "image/png",
  });
  await expect(page.locator("#passage-passage-b")).toHaveClass(/highlight/);
  await expect(page.locator("#passage-passage-b")).toBeFocused();
  await page.getByRole("button", { name: "← Materials", exact: true }).click();
  await page.screenshot({
    path: testInfo.outputPath("picker.png"),
    fullPage: true,
  });
  await testInfo.attach("Materials picker", {
    path: testInfo.outputPath("picker.png"),
    contentType: "image/png",
  });
  await page
    .getByRole("button", { name: /Saved lessons/ })
    .click();
  await page
    .getByRole("button", { name: "Photosynthesis", exact: true })
    .click();
  await expect(
    page.getByText(
      "Sunlight gives plants energy to make food. Find the glucose in your teacher’s notes.",
      { exact: true },
    ),
  ).toBeVisible();
});

test("profile preferences and editable whiteboard persist through API", async ({
  page,
}) => {
  const requests = await mockClassroom(page);
  await chooseMaterials(page);
  await page.getByRole("button", { name: "My learning", exact: true }).click();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Sam");
  await page
    .getByRole("combobox", { name: "Pace", exact: true })
    .selectOption("gentle");
  await page
    .getByRole("button", { name: "Save preferences", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    requests.find((r) => r.path === "/api/profile" && r.method !== "GET")?.body,
  ).toMatchObject({ name: "Sam", pace: "gentle" });
  await page.getByRole("button", { name: "Whiteboard", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Whiteboard text" })
    .fill("Light → energy → glucose");
  await page.getByRole("button", { name: "Add text", exact: true }).click();
  await expect(
    page.locator(".excalidraw canvas").first(),
  ).toBeVisible();
  await expect
    .poll(() => requests.filter((r) => r.path.endsWith("/board")).length)
    .toBe(1);
  expect(
    requests.find((r) => r.path.endsWith("/board"))?.body.scene.elements.find((e: { type: string }) => e.type === "text").text,
  ).toBe("Light → energy → glucose");
});

test("failed teaching request preserves the lesson and offers a working retry", async ({
  page,
}) => {
  await mockClassroom(page);
  await chooseMaterials(page);
  await page.route("**/api/lessons/lesson-1/turn", async (route) => {
    await page.unroute("**/api/lessons/lesson-1/turn");
    await route.fulfill({
      status: 503,
      json: {
        error: "Teaching service is temporarily unavailable.",
        code: "UPSTREAM_ERROR",
      },
    });
  });
  await page
    .getByRole("button", { name: "Teach me this topic →", exact: true })
    .click();
  await expect(
    page.getByText("Teaching service is temporarily unavailable.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Photosynthesis", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(
    page.getByText("What do plants get from sunlight?", { exact: true }),
  ).toBeVisible();
});

test("whiteboard combines queued edits before teaching without losing the latest drawing", async ({ page }) => {
  const requests = await mockClassroom(page);
  await chooseMaterials(page);
  let finishSave!: () => void;
  const pending = new Promise<void>(resolve => { finishSave = resolve; });
  let saves = 0;
  await page.route("**/api/lessons/lesson-1/board", async route => {
    saves++;
    await pending;
    await route.fallback();
  });
  await page.getByRole("button", { name: "Whiteboard", exact: true }).click();
  for (const text of ["First idea", "Second idea", "Latest idea"]) {
    await page.getByRole("textbox", { name: "Whiteboard text" }).fill(text);
    await page.getByRole("button", { name: "Add text", exact: true }).click();
    await expect(page.getByText("Saving…", { exact: true })).toBeVisible();
  }
  await expect.poll(() => saves).toBe(1);
  await page.getByRole("textbox", { name: "Your answer or question" }).fill("Explain my drawing");
  await page.getByRole("button", { name: "Send ↗", exact: true }).click();
  expect(requests.filter(r => r.path.endsWith("/turn"))).toHaveLength(0);
  finishSave();
  await expect(page.getByText("Your rectangle is the leaf. Light enters it from the side you marked.", { exact: true })).toBeVisible();
  const turnIndex = requests.findIndex(r => r.path.endsWith("/turn"));
  const saved = requests.slice(0, turnIndex).filter(r => r.path.endsWith("/board"));
  expect(saved).toHaveLength(2);
  expect(saved.at(-1)!.body.scene.elements.filter((e: { type: string }) => e.type === "text").map((e: { text: string }) => e.text))
    .toEqual(["First idea", "Second idea", "Latest idea"]);
  const notes = saved.at(-1)!.body.scene.elements;
  for (let i = 1; i < notes.length; i++) expect(notes[i].y).toBeGreaterThan(notes[i - 1].y + notes[i - 1].height);
});

test("teaching waits for a pending whiteboard save and preserves failed draft on tab changes", async ({
  page,
}) => {
  const requests = await mockClassroom(page);
  await chooseMaterials(page);
  await page
    .getByRole("button", { name: "Teach me this topic →", exact: true })
    .click();
  let finishSave: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    finishSave = resolve;
  });
  await page.route("**/api/lessons/lesson-1/board", async (route) => {
    await pending;
    await route.fallback();
  });
  await page.getByRole("button", { name: "Whiteboard", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Whiteboard text" })
    .fill("Energy is not food");
  await page.getByRole("button", { name: "Add text", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Your answer or question" })
    .fill("Food");
  await page.getByRole("button", { name: "Send ↗", exact: true }).click();
  expect(requests.filter((r) => r.path.endsWith("/turn"))).toHaveLength(1);
  finishSave();
  await expect(
    page.getByText(
      "Sunlight gives plants energy to make food. Find the glucose in your teacher’s notes.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(requests.findIndex((r) => r.path.endsWith("/board"))).toBeLessThan(
    requests.map((r) => r.path).lastIndexOf("/api/lessons/lesson-1/turn"),
  );
  await page.unroute("**/api/lessons/lesson-1/board");
  await page.route("**/api/lessons/lesson-1/board", (route) =>
    route.fulfill({ status: 503, json: { error: "Save unavailable" } }),
  );
  await page.getByRole("button", { name: "Whiteboard", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Whiteboard text" })
    .fill("Keep this unsaved idea");
  await page.getByRole("button", { name: "Add text", exact: true }).click();
  await expect(page.getByText(/Not saved/)).toBeVisible();
  await page.getByRole("button", { name: "Light notes", exact: true }).click();
  await page.getByRole("button", { name: "Whiteboard", exact: true }).click();
  await expect(
    page.locator(".excalidraw canvas").first(),
  ).toBeVisible();
  await page.unroute("**/api/lessons/lesson-1/board");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  expect(requests.filter(r => r.path.endsWith("/board")).at(-1)?.body.scene.elements
    .some((e: { text?: string }) => e.text === "Keep this unsaved idea")).toBe(true);
});


test("catch-up crew plans within chosen time, replans after an answer and survives resume", async ({ page }, testInfo) => {
  const requests = await mockClassroom(page);
  await chooseMaterials(page);
  await page.getByRole("spinbutton", { name: "Time I have right now" }).fill("15");
  await page.getByRole("button", { name: "Help me catch up →" }).click();
  await expect(page.getByText("Your catch-up crew · 15 min window")).toBeVisible();
  expect(requests.find((r) => r.path.endsWith("/turn"))?.body.catchUpMinutes).toBe(15);
  await page.locator(".study-crew summary").click();
  await expect(page.getByText("Waiting for an answer to check. No understanding assumed.")).toBeVisible();
  await page.getByRole("textbox", { name: "Your answer or question" }).fill("Food");
  await page.getByRole("button", { name: "Send ↗", exact: true }).click();
  await expect(page.getByText("Revisit first: Energy versus food")).toBeVisible();
  await expect(page.getByText("Revisit energy before the glucose exercise.")).toBeVisible();
  await page.locator(".study-crew").getByRole("button", { name: "↗ Light notes", exact: true }).first().click();
  await expect(page.locator("#passage-passage-a")).toBeFocused();
  const layout = await page.locator(".study-split").boundingBox();
  const voice = await page.locator(".study-voice-host").boundingBox();
  expect(voice!.y + voice!.height).toBeLessThanOrEqual(layout!.y + layout!.height + 1);
  await page.locator(".study-crew summary").click();
  await page.screenshot({ path: testInfo.outputPath("catch-up-crew.png"), fullPage: true });
  await page.getByRole("button", { name: "← Materials", exact: true }).click();
  await page.getByRole("button", { name: /Saved lessons/ }).click();
  await page.getByRole("button", { name: "Photosynthesis", exact: true }).click();
  await page.locator(".study-crew summary").click();
  await expect(page.getByText("Revisit first: Energy versus food")).toBeVisible();
});

test("dashboard builds a cited plan, remembers checkmarks and opens the tutor at the source", async ({ page }, testInfo) => {
  const requests = await mockClassroom(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Let’s get you caught up." })).toBeVisible();
  await page.getByLabel("Time you have").selectOption("25");
  await page.getByRole("button", { name: "Build my plan" }).click();
  await expect(page.getByRole("heading", { name: "Your catch-up plan", exact: true })).toBeVisible();
  expect(requests.find(r => r.path.endsWith("/turn"))?.body.catchUpMinutes).toBe(25);
  expect(requests.find(r => r.path === "/api/lessons" && r.method === "POST")?.body.posts).toEqual(posts.map(({ id, type }) => ({ id, type })));
  await expect(page.getByText("20 min planned · 5 min breathing room")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("catch-up-dashboard-desktop.png"), fullPage: true });
  await page.getByLabel("Mark step 1 complete").check();
  await expect(page.getByText("1 of 3 checked off")).toBeVisible();
  await page.getByRole("button", { name: "Start step 1", exact: true }).click();
  await expect(page.locator("#passage-passage-a")).toBeFocused();
  await page.getByRole("button", { name: "Your catch-up plan", exact: true }).click();
  await expect(page.getByLabel("Mark step 1 complete")).toBeChecked();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("catch-up-dashboard-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: /Give me a hint/ }).click();
  await expect(page.getByText("Sunlight gives plants energy to make food. Find the glucose in your teacher’s notes.", { exact: true })).toBeVisible();
  const hint = requests.filter(r => r.path.endsWith("/turn")).at(-1)!.body;
  expect(hint.intent).toBe("question");
  expect(hint.text).toContain("without solving the assignment");
  await page.reload();
  await page.getByRole("button", { name: /Saved lessons/ }).click();
  await page.getByRole("button", { name: "Photosynthesis", exact: true }).click();
  await page.getByRole("button", { name: "Your catch-up plan", exact: true }).click();
  await expect(page.getByLabel("Mark step 1 complete")).toBeChecked();
  await page.getByRole("button", { name: /Saved lessons/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your catch-up plan", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("afterclass:checklist:lesson-1"))).toBeNull();
  await page.getByRole("button", { name: "Build my plan" }).click();
  await page.getByLabel("Mark step 1 complete").check();
  await page.getByRole("button", { name: "My learning", exact: true }).click();
  await page.getByRole("button", { name: "Delete all my learning data", exact: true }).click();
  await page.getByRole("button", { name: "Delete everything", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Your catch-up plan", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("afterclass:checklist:lesson-1"))).toBeNull();
});

test("dashboard date filters exclude old selected posts, retain unknown dates and retry the same turn", async ({ page }) => {
  const requests = await mockClassroom(page);
  await page.route("**/api/courses/course-1/posts", route => route.fulfill({ json: {
    posts: [{ ...posts[0], publishedAt: "2026-01-01T00:00:00Z" }, posts[1]], topics: [], warnings: [],
  } }));
  await page.goto("/");
  await page.getByLabel("Updates since").fill("2025-01-01");
  await page.getByRole("checkbox").first().check();
  await page.getByLabel("Updates since").fill("2026-09-01");
  await expect(page.getByText("Light and leaves", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Making glucose", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Study these together →", exact: true })).toBeDisabled();
  const attempts: unknown[] = [];
  await page.route("**/api/lessons/lesson-1/turn", async route => {
    attempts.push(route.request().postDataJSON());
    if (attempts.length === 1) await route.fulfill({ status: 503, json: { error: "Planner unavailable. Please retry." } });
    else await route.fallback();
  });
  await page.getByRole("button", { name: "Build my plan" }).click();
  await expect(page.getByText("Planner unavailable. Please retry.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your catch-up plan", exact: true })).toBeVisible();
  await expect(page.getByLabel("Updates since")).toHaveValue("2026-09-01");
  expect(attempts[0]).toEqual(attempts[1]);
  const creates = requests.filter(r => r.path === "/api/lessons" && r.method === "POST");
  expect(creates).toHaveLength(1);
  expect(creates[0]!.body.posts).toEqual([{ id: "post-b", type: "courseWorkMaterials" }]);
});

test("unavailable services retain a usable connection screen without fabricated class content", async ({ page }) => {
  await page.route("**/api/**", route => route.fulfill({ status: 503, json: { error: "Service unavailable" } }));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Let’s get you caught up." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Google Classroom ↗" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "My learning", exact: true })).toBeDisabled();
  await expect(page.locator(".catchup-update")).toHaveCount(0);
});

test("teaching at the whiteboard draws the tutor's diagram step by step and grows it on the next turn", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const requests = await mockClassroom(page);
  await chooseMaterials(page);
  await page.getByRole("button", { name: "Teach me at the whiteboard →", exact: true }).click();
  await expect(page.locator(".excalidraw canvas").first()).toBeVisible();
  await expect(page.getByText("What do plants get from sunlight?", { exact: true })).toBeVisible();
  const teach = requests.find(r => r.path.endsWith("/turn"))!;
  expect(teach.body).toMatchObject({ intent: "teach", whiteboard: true });
  expect(teach.body.boardSnapshot).toBeUndefined();
  type Saved = { id: string; type: string; text?: string; customData?: { boardItemId?: string } };
  const marks = () => (requests.filter(r => r.path.endsWith("/board")).at(-1)?.body.scene.elements ?? [])
    .filter((e: Saved) => e.customData?.boardItemId) as Saved[];
  // The drawing is revealed one item at a time, then saved once it is complete.
  await expect.poll(() => marks().length, { timeout: 8000 }).toBe(5);
  const first = marks();
  expect(first.map(e => e.type).sort()).toEqual(["arrow", "rectangle", "text", "text", "text"]);
  expect(first.map(e => e.text).filter(Boolean).sort()).toEqual(["Leaf", "Sunlight arrives", "energy"]);
  expect(requests.filter(r => r.path.endsWith("/board"))).toHaveLength(1);
  await page.screenshot({ path: testInfo.outputPath("whiteboard-lesson.png"), fullPage: true });
  await page.getByRole("textbox", { name: "Your answer or question" }).fill("Food");
  await page.getByRole("button", { name: "Send ↗", exact: true }).click();
  await expect(page.getByText("Sunlight gives plants energy to make food. Find the glucose in your teacher’s notes.", { exact: true })).toBeVisible();
  const answer = requests.filter(r => r.path.endsWith("/turn")).at(-1)!;
  expect(answer.body).toMatchObject({ intent: "answer", text: "Food", whiteboard: true });
  expect(answer.body.boardSnapshot).toMatch(/^data:image\/jpeg;base64,/);
  // The board stays open; earlier parts keep their elements and the new part joins them.
  await expect(page.locator(".excalidraw canvas").first()).toBeVisible();
  await expect.poll(() => marks().length, { timeout: 8000 }).toBe(7);
  const second = marks();
  for (const element of first) expect(second.some(e => e.id === element.id)).toBe(true);
  expect(second.filter(e => e.customData?.boardItemId === "tutor-3").map(e => e.type).sort()).toEqual(["ellipse", "text"]);
  expect(errors).toEqual([]);
});

test("asking from the whiteboard sends a picture and draws the tutor's marks beside the student's shape", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const requests = await mockClassroom(page);
  await chooseMaterials(page);
  await page.getByRole("button", { name: "Teach me this topic →", exact: true }).click();
  await page.getByRole("button", { name: "Whiteboard", exact: true }).click();
  await expect(page.locator(".excalidraw canvas").first()).toBeVisible();
  await page.getByTitle(/^Rectangle/).click();
  const canvas = page.locator(".excalidraw canvas").last();
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 200);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 120, bounds.y + 260, { steps: 3 });
  await page.mouse.up();
  await expect.poll(() => requests.filter(r => r.path.endsWith("/board")).at(-1)?.body.scene.elements
    .some((e: { type: string; width: number }) => e.type === "rectangle" && e.width > 50)).toBe(true);
  await page.getByRole("textbox", { name: "Ask about your drawing" }).fill("Is this the leaf?");
  await page.getByRole("button", { name: "Ask the tutor ✎", exact: true }).click();
  await expect(page.getByText("Your rectangle is the leaf. Light enters it from the side you marked.", { exact: true })).toBeVisible();
  const turn = requests.find(r => r.path.endsWith("/turn") && r.body.intent === "question")!;
  expect(turn.body.text).toBe("Is this the leaf?");
  expect(turn.body.boardSnapshot).toMatch(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/);
  expect(turn.body.boardSnapshot.length).toBeLessThan(2_000_000);
  // The whiteboard stays open with the tutor's marks; the next edit saves them into the same scene.
  await expect(page.locator(".excalidraw canvas").first()).toBeVisible();
  await expect(page.getByText("✎ Marked on your whiteboard", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Whiteboard text" }).fill("My note");
  await page.getByRole("button", { name: "Add text", exact: true }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  type Saved = { id: string; type: string; x: number; y: number; width: number; height: number; strokeColor: string; text?: string; customData?: { boardItemId?: string } };
  const saved: Saved[] = requests.filter(r => r.path.endsWith("/board")).at(-1)!.body.scene.elements;
  const marks = saved.filter(e => e.customData?.boardItemId);
  expect(marks.map(e => e.type).sort()).toEqual(["arrow", "arrow", "ellipse", "text", "text", "text"]);
  expect(marks.every(e => e.strokeColor === "#187c55")).toBe(true);
  const leaf = saved.find(e => e.type === "rectangle" && !e.customData)!;
  const ring = marks.find(e => e.type === "ellipse")!;
  expect(ring.x).toBeLessThan(leaf.x);
  expect(ring.y).toBeLessThan(leaf.y);
  expect(ring.x + ring.width).toBeGreaterThan(leaf.x + leaf.width);
  expect(ring.y + ring.height).toBeGreaterThan(leaf.y + leaf.height);
  expect(marks.filter(e => e.type === "text").map(e => e.text).sort()).toEqual(["Light enters here", "Your leaf", "energy"]);
  expect(saved.some(e => e.text === "My note" && !e.customData)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("whiteboard-annotations.png"), fullPage: true });
  // Leaving and returning rebuilds the same marks from the saved lesson rather than duplicating them.
  await page.getByRole("button", { name: "Light notes", exact: true }).click();
  await expect(page.getByRole("button", { name: "✎ See it on the whiteboard", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "✎ See it on the whiteboard", exact: true }).click();
  await expect(page.locator(".excalidraw canvas").first()).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  const again: Saved[] = requests.filter(r => r.path.endsWith("/board")).at(-1)!.body.scene.elements;
  expect(again.filter(e => e.customData?.boardItemId).length).toBe(6);
});

test("Excalidraw draws native shapes, restores scenes and loads local fonts", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const fonts: string[] = [];
  page.on("response", response => {
    if (response.url().includes(".woff2")) {
      expect(response.ok()).toBe(true);
      fonts.push(response.url());
    }
  });
  const requests = await mockClassroom(page);
  await chooseMaterials(page);
  await page.getByRole("button", { name: "Teach me this topic →", exact: true }).click();
  await page.getByRole("button", { name: "Whiteboard", exact: true }).click();
  await expect(page.locator(".excalidraw canvas").first()).toBeVisible();
  await page.getByTitle(/^Rectangle/).click();
  const canvas = page.locator(".excalidraw canvas").last();
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 200);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 80, bounds.y + 270, { steps: 3 });
  await page.mouse.up();
  await expect.poll(() => requests.filter(r => r.path.endsWith("/board")).at(-1)?.body.scene.elements
    .some((e: { type: string; width: number }) => e.type === "rectangle" && e.width > 50)).toBe(true);
  await page.getByRole("textbox", { name: "Whiteboard text" }).fill("Saved in this lesson");
  await page.getByRole("button", { name: "Add text", exact: true }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Light notes", exact: true }).click();
  await page.getByRole("button", { name: "Whiteboard", exact: true }).click();
  await expect(page.locator(".excalidraw canvas").first()).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  const saved = requests.filter(r => r.path.endsWith("/board")).at(-1)!.body.scene.elements;
  expect(saved.some((e: { type: string }) => e.type === "rectangle")).toBe(true);
  expect(saved.some((e: { text?: string }) => e.text === "Saved in this lesson")).toBe(true);
  await page.getByTitle(/^Text/).click();
  const textBounds = (await canvas.boundingBox())!;
  await page.mouse.click(textBounds.x + 100, textBounds.y + 150);
  await page.locator(".excalidraw-wysiwyg").fill("Native text");
  await page.keyboard.press("Escape");
  const liveText = () => requests.filter(r => r.path.endsWith("/board")).at(-1)?.body.scene.elements
    .filter((e: { isDeleted?: boolean; text?: string }) => !e.isDeleted && e.text === "Native text").length;
  await expect.poll(liveText).toBe(1);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(liveText).toBe(0);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect.poll(liveText).toBe(1);
  await expect.poll(() => fonts.length).toBeGreaterThan(0);
  expect(fonts.every(url => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("excalidraw.png"), fullPage: true });
  await page.evaluate(() => document.querySelector(".study-app")!.dispatchEvent(new CustomEvent("study:close")));
  await expect(page.locator(".excalidraw canvas").first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".excalidraw canvas").first()).toBeVisible();
  await expect.poll(async () => (await canvas.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(350);
  await page.screenshot({ path: testInfo.outputPath("excalidraw-mobile.png"), fullPage: true });
});

test("whiteboard saves complete tutor diagrams with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const requests = await mockClassroom(page);
  await chooseMaterials(page);
  await page.getByRole("button", { name: "Teach me at the whiteboard →", exact: true }).click();
  await expect(page.getByText("What do plants get from sunlight?", { exact: true })).toBeVisible();
  await expect.poll(() => requests.filter(r => r.path.endsWith("/board")).at(-1)?.body.scene.elements.length).toBe(5);
});

test("whiteboard diagrams have readable bound labels and arrows in every direction", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const requests = await mockClassroom(page);
  const lesson = lessonFixture();
  lesson.board.items = [
    { id: "title", kind: "text", x: 0, y: -75, width: 360, height: 0, text: "The water cycle" },
    { id: "vapour", kind: "rectangle", x: 0, y: 0, width: 180, height: 90, text: "Water vapour" },
    { id: "clouds", kind: "rectangle", x: 320, y: 0, width: 180, height: 90, text: "Clouds" },
    { id: "rain", kind: "rectangle", x: 320, y: 230, width: 180, height: 90, text: "Rain" },
    { id: "surface", kind: "rectangle", x: 0, y: 230, width: 180, height: 90, text: "Surface water" },
    { id: "condense", kind: "arrow", x: 190, y: 45, width: 120, height: 0, text: "condenses" },
    { id: "fall", kind: "arrow", x: 410, y: 100, width: 0, height: 120, text: "falls" },
    { id: "collect", kind: "arrow", x: 310, y: 275, width: -120, height: 0, text: "collects" },
    { id: "evaporate", kind: "arrow", x: 90, y: 220, width: 0, height: -120, text: "evaporates" },
    { id: "note", kind: "text", x: 0, y: 355, width: 300, height: 0, text: "The same water keeps moving through these four stages." },
  ];
  await page.route("**/api/lessons", route => route.fulfill({ json: lesson }));
  await chooseMaterials(page);
  await page.getByRole("button", { name: "Whiteboard", exact: true }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  const scene = requests.filter(r => r.path.endsWith("/board")).at(-1)!.body.scene;
  const elements = scene.elements as Array<{ type: string; id: string; x: number; y: number; width: number; height: number; roughness: number; fontSize?: number; containerId?: string; text?: string; points?: number[][]; customData?: { boardItemId: string } }>;
  for (const label of elements.filter(e => e.type === "text" && e.containerId)) {
    const container = elements.find(e => e.id === label.containerId)!;
    expect(label.fontSize).toBe(container.type === "arrow" ? 16 : 20);
    if (container.type !== "arrow") {
      expect(label.x).toBeGreaterThanOrEqual(container.x);
      expect(label.y).toBeGreaterThanOrEqual(container.y);
      expect(label.x + label.width).toBeLessThanOrEqual(container.x + container.width);
      expect(label.y + label.height).toBeLessThanOrEqual(container.y + container.height);
    }
  }
  expect(elements.filter(e => e.type !== "text").every(e => e.roughness === 0)).toBe(true);
  const arrow = (id: string) => elements.find(e => e.type === "arrow" && e.customData?.boardItemId === id)!.points!;
  expect(arrow("collect").at(-1)![0]).toBeLessThan(arrow("collect")[0][0]);
  expect(arrow("evaporate").at(-1)![1]).toBeLessThan(arrow("evaporate")[0][1]);
  expect(elements.find(e => e.customData?.boardItemId === "note")!.width).toBeLessThanOrEqual(300);
  await page.getByRole("button", { name: "Fit drawing", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("whiteboard-quality.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("whiteboard finishes an interrupted reveal and keeps student edits when changing tabs", async ({ page }) => {
  const requests = await mockClassroom(page);
  const lesson = lessonFixture();
  lesson.board.items = Array.from({ length: 12 }, (_, i) => ({
    id: `tutor-${i}`, kind: "text", x: i * 120, y: 0, width: 0, height: 0, text: `Step ${i + 1}`,
  }));
  await page.route("**/api/lessons", route => route.fulfill({ json: lesson }));
  await chooseMaterials(page);
  await page.getByRole("button", { name: "Whiteboard", exact: true }).click();
  await expect(page.locator(".excalidraw canvas").first()).toBeVisible();
  await page.getByRole("textbox", { name: "Whiteboard text" }).fill("Keep my question");
  await page.getByRole("button", { name: "Add text", exact: true }).click();
  await page.getByRole("button", { name: "Light notes", exact: true }).click();
  await page.getByRole("button", { name: "Whiteboard", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  const saved = requests.filter(r => r.path.endsWith("/board")).at(-1)!.body.scene.elements;
  expect(saved.filter((e: { customData?: { boardItemId?: string } }) => e.customData?.boardItemId)).toHaveLength(12);
  expect(saved.some((e: { text?: string }) => e.text === "Keep my question")).toBe(true);
});


test("Whiteboard remains discoverable with many source documents", async ({ page }) => {
  await mockClassroom(page);
  const lesson = lessonFixture();
  lesson.sources = Array.from({ length: 12 }, (_, index) => ({
    ...lesson.sources[0], id: `source-${index}`, title: `Classroom reading material ${index + 1}`,
  }));
  await page.route("**/api/lessons", route => route.fulfill({ json: lesson }));
  await chooseMaterials(page);
  const button = page.getByRole("button", { name: "Whiteboard", exact: true });
  const tabs = page.locator(".study-tabs");
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    // Visibility alone passes for buttons clipped by an overflowing tab bar.
    const bounds = (await button.boundingBox())!;
    const bar = (await tabs.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(bar.x);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(bar.x + bar.width);
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".excalidraw canvas").first()).toBeVisible();
    await tabs.evaluate(element => { element.scrollLeft = element.scrollWidth; });
    const scrolled = (await button.boundingBox())!;
    expect(scrolled.x).toBeGreaterThanOrEqual(bar.x);
    expect(scrolled.x + scrolled.width).toBeLessThanOrEqual(bar.x + bar.width);
  }
});

for (const live of [false, true]) for (const scenario of physicsScenarios) {
  test(`whiteboard physics ${live ? "live" : "rendering"}: ${scenario.name}`, async ({ page }, testInfo) => {
    test.skip(live && process.env.RUN_LIVE_WHITEBOARD !== "1", "Opt in to calls to the configured teaching model with synthetic physics notes.");
    test.setTimeout(live ? 180_000 : 30_000);
    await page.setViewportSize({ width: 1600, height: 1100 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const replies: TutorReply[] = [];
    const requests = await mockClassroom(page, physicsLessonFixture(), async (lesson, input) => {
      const reply = await generateReply(lesson, { ...profile, goals: "Understand forces", explanation: "diagrams" }, input, live
        ? { apiKey: process.env.OPENAI_API_KEY || "", model: process.env.OPENAI_MODEL || "" }
        : { apiKey: "test", model: "test", fetcher: (async () => Response.json({ status: "completed", output: [{ type: "message", content: [{
          type: "output_text", text: JSON.stringify({ text: scenario.text, action: "answer", assessment: "none", misconception: null,
            citations: [{ sourceId: "source-a", passageId: "forces", quote: "The resultant force is the vector sum of external forces: F_net = ma." }],
            board: scenario.board.map(item => ({ ...item, target: null })),
          }),
        }] }] })) as unknown as typeof fetch });
      replies.push(reply);
      return reply;
    });
    await chooseMaterials(page, "Forces and motion");
    await page.getByRole("button", { name: "Whiteboard", exact: true }).click();
    const ask = async (question: string) => {
      const count = replies.length;
      await page.getByRole("textbox", { name: "Ask about your drawing" }).fill(question);
      await page.getByRole("button", { name: "Ask the tutor ✎", exact: true }).click();
      await expect.poll(() => replies.length, { timeout: 125_000 }).toBe(count + 1);
      // An unchanged diagram needs no autosave; explicitly save when checking a follow-up.
      if (count) await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect(page.getByText("Saved", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Whiteboard", exact: true })).toHaveAttribute("aria-pressed", "true");
      const saved = requests.filter(r => r.path.endsWith("/board")).at(-1)!.body;
      expect(validateBoard(saved)).toEqual(saved);
      return saved;
    };
    const saved = await ask(scenario.question);
    const turn = requests.find(r => r.path.endsWith("/turn"))!.body;
    expect(turn).toMatchObject({ text: scenario.question, intent: "question", whiteboard: true });
    expect(turn.boardSnapshot).toBeUndefined(); // The initial board is empty.
    const reply = replies[0];
    await testInfo.attach("generated-reply", { body: JSON.stringify(reply, null, 2), contentType: "application/json" });
    expect(reply.board.filter(item => ["rectangle", "ellipse"].includes(item.kind)).length).toBeGreaterThanOrEqual(3);
    expect(reply.board.some(item => item.kind === "line")).toBe(true);
    expect(reply.board.some(item => item.kind === "arrow" && item.height > 0)).toBe(true);
    if (scenario.name === "car") {
      expect(reply.board.some(item => item.kind === "arrow" && item.height < 0)).toBe(true);
      expect(reply.board.some(item => item.kind === "arrow" && item.width < 0)).toBe(true);
      expect(reply.board.some(item => item.kind === "arrow" && item.width > 0)).toBe(true);
      expect(reply.text).toMatch(/constant[\s-]+(?:speed|velocity)|steady/i);
    } else {
      expect(reply.text).toMatch(/gravity|weight/i);
      expect(reply.text).toMatch(/downward|accelerat/i);
      expect(reply.text).toMatch(/air resistance|drag/i);
    }
    for (const item of saved.items) {
      const element = saved.scene.elements.find((e: any) => e.customData?.boardItemId === item.id && e.type === item.kind);
      expect(element).toBeDefined();
      if (item.kind === "arrow" || item.kind === "line") {
        const start = element.points[0], end = element.points.at(-1);
        // Excalidraw insets arrow endpoints by half a pixel at each end.
        expect(Math.abs(end[0] - start[0] - item.width)).toBeLessThanOrEqual(1);
        expect(Math.abs(end[1] - start[1] - item.height)).toBeLessThanOrEqual(1);
        expect(element.endArrowhead).toBe(item.kind === "arrow" ? "arrow" : null);
        if (item.kind === "line" && item.text.trim())
          expect(saved.scene.elements.some((e: any) => e.customData?.boardItemId === item.id && e.type === "text" && e.originalText === item.text)).toBe(true);
      } else if (item.kind !== "text") {
        expect(element.width).toBe(item.width);
        expect(element.height).toBe(item.height);
      }
    }
    const labels = saved.scene.elements.filter((e: any) => e.type === "text");
    for (const label of labels.filter((e: any) => !e.containerId))
      expect(labels.some((other: any) => other.id !== label.id && label.x < other.x + other.width && label.x + label.width > other.x &&
        label.y < other.y + other.height && label.y + label.height > other.y)).toBe(false);
    await page.getByRole("button", { name: "Fit drawing", exact: true }).click();
    await page.screenshot({ path: testInfo.outputPath(`${scenario.name}.png`), fullPage: true });
    // Reopening uses the persisted scene, including small sketch parts and signed lines.
    await page.getByRole("button", { name: "Forces notes", exact: true }).click();
    await page.getByRole("button", { name: "Whiteboard", exact: true }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    expect(requests.filter(r => r.path.endsWith("/board")).at(-1)!.body.scene.elements.map((e: any) => e.id))
      .toEqual(saved.scene.elements.map((e: any) => e.id));
    if (live && scenario.name === "car") {
      const steady = await ask("Now the car moves right at constant velocity. Traction is 600 N and resistance is 600 N. Update the same diagram with the resultant force.");
      const response = replies.at(-1)!;
      await testInfo.attach("constant-velocity-reply", { body: JSON.stringify(response, null, 2), contentType: "application/json" });
      expect(response.text + response.board.map(item => item.text).join(" ")).toMatch(/0\s*N|zero/i);
      const horizontal = response.board.filter(item => item.kind === "arrow" && item.height === 0);
      expect(horizontal.some(right => right.width > 0 && horizontal.some(left => left.width === -right.width))).toBe(true);
      expect(steady.items.some((item: any) => saved.items.some((old: any) => old.id === item.id && old.kind === item.kind))).toBe(true);
      expect(requests.filter(r => r.path.endsWith("/turn")).at(-1)!.body.boardSnapshot).toMatch(/^data:image\/jpeg;base64,/);
      await page.screenshot({ path: testInfo.outputPath("car-constant-velocity.png"), fullPage: true });
    }
    expect(errors).toEqual([]);
  });
}
