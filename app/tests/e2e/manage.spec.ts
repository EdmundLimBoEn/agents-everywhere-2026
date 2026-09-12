import { test, expect } from "@playwright/test";

test("browser reviews a draft, creates a Google Doc, attaches it, and updates the same assignment", async ({ page }) => {
  const writes: { path: string; method: string; body: any }[] = [];
  await page.route("**/api/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname, method = request.method();
    const body = request.postData() ? request.postDataJSON() : undefined;
    if (method !== "GET") writes.push({ path, method, body });
    let data: unknown = {};
    if (path === "/api/status") data = { configured: { google: true, teaching: true, voice: false } };
    else if (path === "/api/courses") data = { courses: [{ id: "physics", name: "Physics demo" }] };
    else if (path.endsWith("/posts")) data = { posts: [], topics: [], warnings: [] };
    else if (path === "/api/author/draft") data = { title: "Force investigation", text: "Tutor-generated: compare force and acceleration." };
    else if (path === "/api/documents") data = { id: "new-doc" };
    else if (path.includes("/assignments")) data = { id: "new-assignment" };
    await route.fulfill({ json: data });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Docs & assignments", exact: true }).click();
  await page.getByLabel("Ask the agent to draft").fill("Create a force investigation worksheet");
  await page.getByRole("button", { name: "Generate draft for review" }).click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Force investigation");
  expect(writes.filter(w => w.path === "/api/documents")).toHaveLength(0);
  await page.getByRole("button", { name: "Create Google Doc", exact: true }).click();
  await expect(page.getByLabel("Attachment Drive IDs (one per line)")).toHaveValue("new-doc");
  await page.getByLabel("Attachment access").selectOption("STUDENT_COPY");
  await page.getByRole("button", { name: "Save assignment", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Assignment saved" })).toBeVisible();
  const creation = writes.find(w => w.path.endsWith("/assignments"))!;
  expect(creation.body).toMatchObject({ state: "DRAFT", attachments: [{ id: "new-doc", shareMode: "STUDENT_COPY" }] });
  await page.getByLabel("Title", { exact: true }).fill("Updated investigation");
  await page.getByRole("button", { name: "Save assignment", exact: true }).click();
  await expect.poll(() => writes.some(w => w.method === "PATCH")).toBe(true);
  expect(writes.at(-1)).toMatchObject({ path: "/api/courses/physics/assignments/new-assignment", method: "PATCH", body: { title: "Updated investigation" } });
  expect(writes.at(-1)?.body.attachments).toBeUndefined();
});
