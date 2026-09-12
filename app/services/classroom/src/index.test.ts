import { test, expect } from "bun:test";
import { GoogleClassroom, documentPassages } from "./index";

const doc = {
  tabs: [
    {
      tabProperties: { tabId: "a", title: "Lesson" },
      documentTab: {
        body: {
          content: [
            {
              startIndex: 1,
              paragraph: {
                elements: [
                  {
                    textRun: {
                      content: "Plants use sunlight to make glucose.\n",
                    },
                  },
                ],
              },
            },
          ],
        },
      },
      childTabs: [
        {
          tabProperties: { tabId: "b" },
          documentTab: {
            body: {
              content: [
                {
                  startIndex: 1,
                  paragraph: {
                    elements: [
                      { textRun: { content: "Chlorophyll absorbs light." } },
                    ],
                  },
                },
              ],
            },
          },
        },
      ],
    },
  ],
};
const material = (postId: string) => ({
  id: postId,
  courseId: "class1",
  title: postId,
  materials: [
    { driveFile: { driveFile: { id: "doc1", title: "Notes" } } },
    { driveFile: { driveFile: { id: "denied", title: "Private notes" } } },
    { link: { url: "http://127.0.0.1/admin" } },
  ],
});
function stub(handler: (url: URL) => unknown) {
  const requests: string[] = [];
  const fetcher = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    requests.push(url.href);
    const value = handler(url);
    return value instanceof Response ? value : Response.json(value);
  }) as typeof fetch;
  return { fetcher, requests };
}

test("validates token audience and identity before authenticating", async () => {
  const s = stub((url) =>
    url.pathname === "/tokeninfo"
      ? { aud: "client", expires_in: "3600", sub: "person" }
      : {
          sub: "person",
          email: "student@example.com",
          email_verified: true,
          name: "Student",
        },
  );
  expect(
    await new GoogleClassroom("secret", s.fetcher).authenticate(["client"]),
  ).toEqual({ id: "person", email: "student@example.com", name: "Student" });
  await expect(
    new GoogleClassroom("secret", s.fetcher).authenticate(["other"]),
  ).rejects.toThrow("audience");
});
test("paginates courses and includes later pages", async () => {
  const s = stub((url) =>
    url.searchParams.has("pageToken")
      ? { courses: [{ id: "second", name: "Second" }] }
      : { courses: [{ id: "first", name: "First" }], nextPageToken: "next" },
  );
  expect(
    (await new GoogleClassroom("secret", s.fetcher).courses()).map((c) => c.id),
  ).toEqual(["first", "second"]);
});
test("deduplicates attachments, keeps partial failures, and never fetches arbitrary links", async () => {
  const s = stub((url) => {
    if (url.hostname === "classroom.googleapis.com")
      return material(url.pathname.split("/").at(-1)!);
    if (url.pathname.endsWith("/denied"))
      return new Response("", { status: 403 });
    if (url.hostname === "docs.googleapis.com") return doc;
    return {
      id: "doc1",
      name: "Notes",
      mimeType: "application/vnd.google-apps.document",
      capabilities: { canDownload: true },
    };
  });
  const result = await new GoogleClassroom("secret", s.fetcher).loadSources(
    "class1",
    [
      { id: "one", type: "courseWorkMaterials" },
      { id: "two", type: "courseWorkMaterials" },
    ],
  );
  expect(result.sources).toHaveLength(1);
  expect(result.sources[0]!.postIds).toEqual(["one", "two"]);
  expect(result.sources[0]!.passages).toHaveLength(2);
  expect(result.failures).toEqual([
    {
      id: "denied",
      title: "Private notes",
      reason: "Google denied access to this resource",
    },
  ]);
  expect(
    s.requests.filter((url) => url.includes("docs.googleapis.com")),
  ).toHaveLength(1);
  expect(
    s.requests.every((url) => new URL(url).hostname.endsWith("googleapis.com")),
  ).toBe(true);
});
test("denied posts abort before any Drive file can be read", async () => {
  const s = stub(() => new Response("", { status: 403 }));
  await expect(
    new GoogleClassroom("secret", s.fetcher).loadSources("class1", [
      { id: "private", type: "courseWork" },
    ]),
  ).rejects.toThrow("denied");
  expect(s.requests).toHaveLength(1);
});
test("PDF route revalidates attachment membership and rejects unrelated files", async () => {
  const s = stub(() => material("one"));
  await expect(
    new GoogleClassroom("secret", s.fetcher).pdf(
      "class1",
      [{ id: "one", type: "courseWork" }],
      "unrelated",
    ),
  ).rejects.toThrow("not attached");
  expect(s.requests).toHaveLength(1);
});
test("rejects wrong-course posts, traversal, and invalid types", async () => {
  const s = stub(() => ({ ...material("one"), courseId: "another" }));
  const api = new GoogleClassroom("secret", s.fetcher);
  await expect(
    api.loadSources("class1", [{ id: "one", type: "courseWork" }]),
  ).rejects.toThrow("does not belong");
  await expect(
    api.loadSources("../bad", [{ id: "one", type: "courseWork" }]),
  ).rejects.toThrow("Invalid");
  await expect(
    api.loadSources("class1", [{ id: "one", type: "other" as any }]),
  ).rejects.toThrow("Invalid");
});
test("Docs passages retain stable tab IDs, including nested tabs and table cells", () => {
  expect(documentPassages(doc).map((p) => p.id)).toEqual([
    "tab-a-1",
    "tab-b-1",
  ]);
  expect(
    documentPassages({
      body: {
        content: [
          {
            startIndex: 1,
            table: {
              tableRows: [
                {
                  tableCells: [
                    {
                      content: [
                        {
                          startIndex: 3,
                          paragraph: {
                            elements: [{ textRun: { content: "Cell" } }],
                          },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    })[0],
  ).toEqual({ id: "body-1-r0c0-3", text: "Cell", heading: undefined });
});
test("PDF bytes are served only after authorized post and Drive metadata checks", async () => {
  const bytes = new TextEncoder().encode("%PDF-1.4\nexample");
  const s = stub((url) => {
    if (url.hostname === "classroom.googleapis.com") return material("one");
    if (url.searchParams.get("alt") === "media") return new Response(bytes);
    return { mimeType: "application/pdf", capabilities: { canDownload: true } };
  });
  expect(
    await new GoogleClassroom("secret", s.fetcher).pdf(
      "class1",
      [{ id: "one", type: "courseWork" }],
      "doc1",
    ),
  ).toEqual(bytes);
  expect(s.requests).toHaveLength(3);
});
test("rejects expired or missing expiry tokens and subject mismatch", async () => {
  for (const expires_in of [undefined, "0", "-1", "bad"]) {
    const s = stub(() => ({ aud: "client", expires_in }));
    await expect(
      new GoogleClassroom("secret", s.fetcher).authenticate(["client"]),
    ).rejects.toThrow("expiry");
  }
  const s = stub((url) =>
    url.pathname === "/tokeninfo"
      ? { aud: "client", expires_in: "100", sub: "one" }
      : { sub: "two", email: "x@example.com", email_verified: true },
  );
  await expect(
    new GoogleClassroom("secret", s.fetcher).authenticate(["client"]),
  ).rejects.toThrow("verified");
});
test("lists all post surfaces and preserves warnings when a scope is missing", async () => {
  const s = stub((url) => {
    if (url.pathname.endsWith("/topics"))
      return { topic: [{ topicId: "t", name: "Light" }] };
    if (url.pathname.endsWith("/announcements"))
      return new Response("", { status: 403 });
    if (url.pathname.endsWith("/courseWork"))
      return { courseWork: [material("assignment")] };
    if (url.pathname.endsWith("/courseWorkMaterials"))
      return { courseWorkMaterials: [material("notes")] };
    return { id: "class1" };
  });
  const result = await new GoogleClassroom("secret", s.fetcher).posts("class1");
  expect(result.posts.map((p) => p.type)).toEqual([
    "courseWork",
    "courseWorkMaterials",
  ]);
  expect(result.topics).toEqual([{ topicId: "t", name: "Light" }]);
  expect(result.warnings).toEqual([
    "announcements: Google denied access to this resource",
  ]);
});
test("parses a real PDF into bounded, page-linked passages", async () => {
  const text = "Chlorophyll absorbs light energy. ".repeat(90).trim();
  const stream = `BT /F1 12 Tf 50 750 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const s = stub((url) => {
    if (url.hostname === "classroom.googleapis.com")
      return {
        ...material("one"),
        materials: [
          { driveFile: { driveFile: { id: "doc1", title: "PDF notes" } } },
        ],
      };
    if (url.searchParams.get("alt") === "media") return new Response(pdf);
    return {
      mimeType: "application/pdf",
      name: "PDF notes",
      capabilities: { canDownload: true },
    };
  });
  const result = await new GoogleClassroom("secret", s.fetcher).loadSources(
    "class1",
    [{ id: "one", type: "courseWork" }],
  );
  expect(result.failures).toEqual([]);
  expect(result.sources[0]!.passages[0]!.page).toBe(1);
  expect(result.sources[0]!.passages.every((p) => p.text.length <= 2000)).toBe(
    true,
  );
  expect(result.sources[0]!.passages.map((p) => p.text).join(" ")).toContain(
    "Chlorophyll absorbs light energy.",
  );
});
test("splits long Docs paragraphs into stable bounded passages", () => {
  const passages = documentPassages({
    body: {
      content: [
        {
          startIndex: 1,
          paragraph: {
            elements: [{ textRun: { content: "word ".repeat(1000) } }],
          },
        },
      ],
    },
  });
  expect(passages.length).toBeGreaterThan(1);
  expect(passages[0]!.id).toBe("body-1-part-1");
  expect(passages.every((p) => p.text.length <= 2000)).toBe(true);
});
test("expired authorization is fatal instead of hidden as attachment failure", async () => {
  const s = stub((url) =>
    url.hostname === "classroom.googleapis.com"
      ? material("one")
      : new Response("", { status: 401 }),
  );
  await expect(
    new GoogleClassroom("secret", s.fetcher).loadSources("class1", [
      { id: "one", type: "courseWork" },
    ]),
  ).rejects.toThrow("authorization expired");
});


test("Classroom deadlines retain UTC time and absent deadlines stay unknown", async () => {
  const s = stub((url) => url.pathname.endsWith("/courseWork") ? { courseWork: [
    { id: "due", courseId: "class1", title: "Exercise", dueDate: { year: 2026, month: 9, day: 14 }, dueTime: { hours: 23, minutes: 59 }, creationTime: "2026-09-12T04:00:00Z" },
    { id: "unknown", courseId: "class1", title: "Practice" },
  ] } : {});
  const { posts } = await new GoogleClassroom("secret", s.fetcher).posts("class1");
  expect(posts[0]?.dueAt).toBe("2026-09-14T23:59:00.000Z");
  expect(posts[0]?.publishedAt).toBe("2026-09-12T04:00:00Z");
  expect(posts[1]?.dueAt).toBeUndefined();
});
