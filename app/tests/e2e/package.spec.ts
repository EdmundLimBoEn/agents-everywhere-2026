import { test, expect, chromium } from "@playwright/test";
import { resolve } from "node:path";

test("packaged MV3 extension starts its worker, injects Classroom and opens its study page", async ({}, testInfo) => {
  const extension = resolve("dist/extension");
  const context = await chromium.launchPersistentContext(
    testInfo.outputPath("profile"),
    {
      channel: "chromium",
      headless: true,
      ignoreDefaultArgs: ["--disable-extensions"],
      args: [
        `--disable-extensions-except=${extension}`,
        `--load-extension=${extension}`,
      ],
    },
  );
  try {
    await context.route("https://classroom.google.com/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<html><body><h1>Offline Classroom packaging check</h1></body></html>",
      }),
    );
    const worker =
      context.serviceWorkers()[0] ||
      (await context.waitForEvent("serviceworker"));
    const id = new URL(worker.url()).host;
    expect(id).toMatch(/^[a-p]{32}$/);
    const classroom = await context.newPage();
    const startupErrors: string[] = [];
    classroom.on("pageerror", (error) => startupErrors.push(error.message));
    classroom.on("requestfailed", (request) => {
      if (request.url().startsWith("chrome-extension://"))
        startupErrors.push(request.url());
    });
    await classroom.goto("https://classroom.google.com/c/Y291cnNlLTE=");
    await expect(
      classroom.locator('[data-classroom-study="launcher"]'),
    ).toHaveCount(1);
    await worker.evaluate(async () => {
      const tabs = await chrome.tabs.query({
        url: "https://classroom.google.com/*",
      });
      await chrome.tabs.sendMessage(tabs[0]!.id!, { type: "open-study" });
    });
    await expect
      .poll(() =>
        classroom
          .frames()
          .find((frame) =>
            frame.url().startsWith(`chrome-extension://${id}/study.html`),
          )
          ?.url(),
      )
      .toBeTruthy();
    const frame = classroom
      .frames()
      .find((frame) =>
        frame.url().startsWith(`chrome-extension://${id}/study.html`),
      )!;
    await expect(
      frame.getByRole("heading", { name: "Let’s get you caught up.", exact: true }),
    ).toBeVisible();
    await expect(
      frame.getByRole("button", {
        name: "Connect Google Classroom →",
        exact: true,
      }),
    ).toBeVisible();
    expect(startupErrors).toEqual([]);
    await classroom.screenshot({
      path: testInfo.outputPath("packaged-extension.png"),
      fullPage: true,
    });
    await testInfo.attach("Packaged extension inside Classroom fixture", {
      path: testInfo.outputPath("packaged-extension.png"),
      contentType: "image/png",
    });
    await frame.getByRole("button", { name: "learning.md", exact: true }).click();
    const preview = frame.locator(".study-learning-preview");
    await expect(preview).toContainText("Fictional demo");
    await expect(preview).toContainText("What seems understood");
    await expect(preview).toContainText("What might need another check");
    await expect(preview).toContainText("Not checked yet");
    await expect(frame.getByRole("link", { name: "Download learning.md" })).toHaveAttribute("href", `chrome-extension://${id}/learning.md`);
    await classroom.screenshot({ path: testInfo.outputPath("learning-memory-demo.png"), fullPage: true });
    await frame.getByRole("button", { name: "Done", exact: true }).click();
    await expect(frame.getByRole("dialog")).toHaveCount(0);
    expect(startupErrors).toEqual([]);
  } finally {
    await context.close();
  }
});
