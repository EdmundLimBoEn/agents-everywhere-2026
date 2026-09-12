import { test, expect, type Page } from "@playwright/test";
import { lessonFixture, posts, profile } from "./fixtures";

async function mockClassroom(page: Page) {
  let lesson = lessonFixture();
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

async function chooseMaterials(page: Page) {
  await page.goto("/");
  await page.getByRole("checkbox").nth(0).check();
  await page.getByRole("checkbox").nth(1).check();
  await page
    .getByRole("button", { name: "Study these together →", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Photosynthesis", exact: true }),
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
    .getByRole("button", { name: "Resume a lesson", exact: true })
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
  await page.getByRole("button", { name: "Resume a lesson", exact: true }).click();
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
  await page.getByRole("button", { name: "Resume a lesson", exact: true }).click();
  await page.getByRole("button", { name: "Photosynthesis", exact: true }).click();
  await page.getByRole("button", { name: "Your catch-up plan", exact: true }).click();
  await expect(page.getByLabel("Mark step 1 complete")).toBeChecked();
  await page.getByRole("button", { name: "Resume a lesson", exact: true }).click();
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
  await expect.poll(() => fonts.length).toBeGreaterThan(0);
  expect(fonts.every(url => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("excalidraw.png"), fullPage: true });
  await page.evaluate(() => document.querySelector(".study-app")!.dispatchEvent(new CustomEvent("study:close")));
  await expect(page.locator(".excalidraw canvas").first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".excalidraw canvas").first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("excalidraw-mobile.png"), fullPage: true });
});
