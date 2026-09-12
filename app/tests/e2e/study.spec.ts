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
        action: diagnostic ? "diagnostic" : "reteach",
        text: diagnostic
          ? "What do plants get from sunlight?"
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
        createdAt: lesson.createdAt,
      });
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
