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
    page.locator("svg").getByText("Light → energy → glucose", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => requests.filter((r) => r.path.endsWith("/board")).length)
    .toBe(1);
  expect(
    requests.find((r) => r.path.endsWith("/board"))?.body.items[0].text,
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
    page.locator("svg").getByText("Keep this unsaved idea", { exact: true }),
  ).toBeVisible();
  await page.unroute("**/api/lessons/lesson-1/board");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
});
