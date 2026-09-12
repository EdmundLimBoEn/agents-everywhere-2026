import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { posts } from "./fixtures";

test("Classroom content controls survive DOM updates and restore page focus", async ({
  page,
}) => {
  await page.route("https://classroom.google.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<html><body><h1>Biology</h1><article data-stream-item-id="post-a">Light and leaves</article><div id="more"></div></body></html>',
    }),
  );
  await page.route("https://classroom.google.com/study.html**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<h1>Study fixture</h1>" }),
  );
  await page.goto("https://classroom.google.com/c/Y291cnNlLTE=");
  await page.evaluate(
    ({ fixturePosts }) => {
      // Open the otherwise closed root solely for inspecting the injected UI in this test.
      const attach = Element.prototype.attachShadow;
      Element.prototype.attachShadow = function (options) {
        return attach.call(this, { ...options, mode: "open" });
      };
      Object.assign(window, {
        chrome: {
          runtime: {
            id: "abcdefghijklmnopabcdefghijklmnop",
            getURL: (path: string) => `https://classroom.google.com/${path}`,
            onMessage: { addListener: () => {} },
            sendMessage: async ({ path }: { path: string }) => ({
              ok: true,
              data:
                path === "/api/courses"
                  ? { courses: [{ id: "course-1", name: "Biology" }] }
                  : { posts: fixturePosts },
            }),
          },
        },
      });
    },
    { fixturePosts: posts },
  );
  await page.addScriptTag({ path: resolve("dist/extension/content.js") });
  const first = page.getByRole("checkbox", {
    name: "Select Light and leaves for study",
  });
  await first.check();
  await expect(
    page.getByRole("button", { name: "Study these together (1)", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    document.querySelector("#more")!.innerHTML =
      '<article data-stream-item-id="post-b">Making glucose</article>';
  });
  await page
    .getByRole("checkbox", { name: "Select Making glucose for study" })
    .check();
  const launch = page.getByRole("button", {
    name: "Study these together (2)",
    exact: true,
  });
  await expect(page.locator('[data-classroom-study="post"]')).toHaveCount(2);
  await launch.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const frameUrl = await page.locator("iframe").getAttribute("src");
  const selected = JSON.parse(new URL(frameUrl!).searchParams.get("posts")!);
  expect(selected.map((post: { id: string }) => post.id)).toEqual([
    "post-a",
    "post-b",
  ]);
  await page.evaluate(() => {
    const frame = document
      .querySelector("[data-classroom-study=launcher]")!
      .shadowRoot!.querySelector("iframe")!;
    Object.assign(window, { studyFrame: frame, closeMessages: [] });
    frame.contentWindow!.postMessage = ((message: unknown, origin: string) => {
      (window as any).closeMessages.push({ message, origin });
    }) as typeof window.postMessage;
  });
  await page.getByRole("button", { name: "Close study window" }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).closeMessages))
    .toEqual([
      {
        message: { type: "classroom-study-hidden" },
        origin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop",
      },
    ]);
  await page.evaluate(() => {
    history.pushState({}, "", "/c/Y291cnNlLTE=/t/all");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(first).toBeChecked();
  await expect(page.locator('[data-classroom-study="post"]')).toHaveCount(2);
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(launch).toBeFocused();
  await launch.click();
  expect(
    await page.evaluate(
      () =>
        (window as any).studyFrame ===
        document
          .querySelector("[data-classroom-study=launcher]")!
          .shadowRoot!.querySelector("iframe"),
    ),
  ).toBe(true);
  await expect(page.locator("iframe")).toHaveAttribute("src", frameUrl!);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.evaluate(() => {
    history.pushState({}, "", "/c/b3RoZXItY291cnNl");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(
    page.getByRole("button", { name: "Study notes", exact: true }),
  ).toBeVisible();
  await expect(page.locator('[data-classroom-study="post"]')).toHaveCount(0);
});
