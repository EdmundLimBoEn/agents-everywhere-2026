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
  expect(result.sources).toHaveLength(3);
  const attached = result.sources.find(s => s.id === "doc1")!;
  expect(attached.postIds).toEqual(["one", "two"]);
  expect(attached.passages).toHaveLength(2);
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
  expect(result.failures.some(f => f.reason.includes("Visual reading is not configured"))).toBe(true);
  expect(result.failures[0]!.reason).toContain("No teacher rubric");
  result.sources = result.sources.filter((source) => source.id === "doc1");
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

test("Google permission errors identify missing consent and disabled APIs", async () => {
  for (const [reason, expected] of [
    ["ACCESS_TOKEN_SCOPE_INSUFFICIENT", "Disconnect Google in extension settings"],
    ["SERVICE_DISABLED", "Enable the Google Classroom API"],
    ["DOMAIN_POLICY", "school administrator"],
  ]) {
    const s = stub((url) => url.pathname.endsWith("/courseWork")
      ? Response.json({ error: { details: [{ reason }], message: "private upstream detail" } }, { status: 403 })
      : {});
    const result = await new GoogleClassroom("secret", s.fetcher).posts("class1");
    expect(result.warnings[0]).toContain(expected!);
    expect(result.warnings[0]).not.toContain("private upstream detail");
  }
});

test("unclassified coursework denial explains account role even with a non-JSON response", async () => {
  const s = stub((url) => url.pathname.endsWith("/courseWork")
    ? new Response("Forbidden", { status: 403 }) : {});
  const result = await new GoogleClassroom("secret", s.fetcher).posts("class1");
  expect(result.warnings[0]).toContain("student");
  expect(result.warnings[0]).toContain("teacher");
});

test("post-only announcements and instructions are citable alongside failed attachments", async () => {
  const s = stub(url => url.hostname === "classroom.googleapis.com" ? { id: "notice", courseId: "class1", text: "Bring a leaf on Tuesday. This instruction is only in the announcement." } : new Response("", { status: 403 }));
  const loaded = await new GoogleClassroom("secret", s.fetcher).loadSources("class1", [{ id: "notice", type: "announcements" }]);
  expect(loaded.sources).toHaveLength(1);
  expect(loaded.sources[0]?.id).toBe("post-announcements-notice");
  expect(loaded.sources[0]?.passages[0]?.text).toContain("Bring a leaf on Tuesday");
  expect(loaded.sources[0]?.pdfAvailable).toBe(false);
});

test("reads Office, image, text and Workspace attachments through the correct format seam", async () => {
  for (const mimeType of ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel", "image/png", "text/csv", "application/vnd.google-apps.presentation", "application/vnd.google-apps.spreadsheet"]) {
    const calls: string[] = [];
    const s = stub(url => {
      if (url.hostname === "classroom.googleapis.com") return { id: "one", materials: [{ driveFile: { driveFile: { id: "file" } } }] };
      if (url.searchParams.get("alt") === "media" || url.pathname.endsWith("/export")) return new Response("a,b\n1,2");
      return { name: "data.xlsx", mimeType, capabilities: { canDownload: true } };
    });
    const reader = async (_: Uint8Array, mime: string) => { calls.push(mime); return [{ id: "reading-1", text: "Visible chart: 1, 2", heading: "AI-extracted" }]; };
    // Google exports are PDFs; the export URL is checked separately because this fixture contains CSV bytes.
    if (mimeType.startsWith("application/vnd.google-apps")) {
      await new GoogleClassroom("secret", s.fetcher, reader).pdf("class1", [{ id: "one", type: "courseWork" }], "file");
      expect(s.requests.at(-1)).toContain("/export?mimeType=application%2Fpdf");
      continue;
    }
    const loaded = await new GoogleClassroom("secret", s.fetcher, reader).loadSources("class1", [{ id: "one", type: "courseWork" }]);
    expect(loaded.failures).toEqual([]);
    expect(loaded.sources.at(-1)?.pdfAvailable).toBe(false);
    if (mimeType === "text/csv") expect(loaded.sources.at(-1)?.passages[0]?.text).toBe("a,b\n1,2");
    else expect(calls).toEqual([mimeType]);
  }
});

test("Google links inside the post are authorized attachments for both reading and preview", async () => {
  const s = stub(url => url.hostname === "classroom.googleapis.com" ? { id: "one", description: "Read https://docs.google.com/document/d/linked/edit and https://evil.example/doc" } : url.pathname.endsWith("/export") ? new Response("%PDF-example") : { mimeType: "application/vnd.google-apps.document" });
  const result = await new GoogleClassroom("secret", s.fetcher).pdf("class1", [{ id: "one", type: "announcements" }], "linked");
  expect(new TextDecoder().decode(result)).toBe("%PDF-example");
  expect(s.requests.every(u => new URL(u).hostname.endsWith("googleapis.com"))).toBe(true);
});

test("document import, revision-checked append and assignment attachment payloads use Google write APIs", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetcher = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return Response.json({ id: "created", associatedWithDeveloper: true }); }) as typeof fetch;
  const client = new GoogleClassroom("secret", fetcher);
  await client.createDocument("Review", "Content inside document");
  expect(calls[0]?.url).toContain("uploadType=multipart");
  expect(calls[0]?.init.body).toContain("Content inside document");
  expect(calls[0]?.init.body).toContain("application/vnd.google-apps.document");
  await client.updateDocument("created", { append: "More", revisionId: "rev1", tabId: "tab1" });
  const append = JSON.parse(String(calls[1]?.init.body));
  expect(append.writeControl).toEqual({ requiredRevisionId: "rev1" });
  expect(append.requests[0].insertText.endOfSegmentLocation).toEqual({ tabId: "tab1" });
  await client.saveAssignment("class1", { title: "Review", state: "DRAFT", materials: [{ driveFile: { driveFile: { id: "created" }, shareMode: "STUDENT_COPY" } }] });
  expect(JSON.parse(String(calls[2]?.init.body))).toMatchObject({ workType: "ASSIGNMENT", state: "DRAFT", materials: [{ driveFile: { driveFile: { id: "created" } } }] });
  await client.saveAssignment("class1", { title: "Updated" }, "assignment");
  expect(calls.at(-1)?.url).toContain("updateMask=title");
  expect(calls.at(-1)?.init.method).toBe("PATCH");
});

test("rejects assignment edits belonging to another Google project", async () => {
  const s = stub(() => ({ associatedWithDeveloper: false }));
  await expect(new GoogleClassroom("secret", s.fetcher).saveAssignment("class1", { title: "Changed" }, "other")).rejects.toThrow("Google project");
  expect(s.requests).toHaveLength(1);
});

test("assignment instructions and native rubric stay citable alongside readable attachments", async () => {
  const s = stub((url) => {
    if (url.pathname.endsWith("/rubrics")) return { rubrics: [{
      id: "rubric1", courseId: "class1", courseWorkId: "one",
      criteria: [{ id: "reasoning", title: "Show reasoning", description: "Explain each transformation.",
        levels: [{ title: "Complete", description: "All transformations justified.", points: 4 }, { title: "Missing", points: 0 }] }],
    }] };
    if (url.hostname === "classroom.googleapis.com") return {
      ...material("one"), description: "Solve questions 1–4 and show your working.",
      alternateLink: "https://classroom.google.com/c/abc/a/def/details",
    };
    if (url.pathname.endsWith("/denied")) return new Response("", { status: 403 });
    if (url.hostname === "docs.googleapis.com") return doc;
    return { id: "doc1", name: "Notes", mimeType: "application/vnd.google-apps.document" };
  });
  const api = new GoogleClassroom("secret", s.fetcher);
  const result = await api.loadSources("class1", [{ id: "one", type: "courseWork" }]);
  expect(result.sources.map((source) => source.id)).toEqual(["classroom-courseWork-one", "classroom-rubric-one-rubric1", "doc1"]);
  expect(result.sources[0]).toEqual({
    id: "classroom-courseWork-one", title: "Assignment instructions: one", mimeType: "text/plain", postIds: ["one"],
    passages: [{ id: "instructions", text: "one\n\nSolve questions 1–4 and show your working." }],
    originalUrl: "https://classroom.google.com/c/abc/a/def/details", pdfAvailable: false,
  });
  expect(result.sources[1]!.passages[0]).toEqual({
    id: "criterion-reasoning", text: "Teacher rubric criterion: Show reasoning\nExplain each transformation.\nComplete — All transformations justified. — 4 points\nMissing — 0 points",
  });
  expect(result.sources[1]!.postIds).toEqual(["one"]);
  expect((await api.loadSources("class1", [{ id: "one", type: "courseWork" }])).sources).toEqual(result.sources);
});

test("missing or denied rubrics preserve instructions while expired authorization is fatal", async () => {
  for (const status of [200, 403, 401]) {
    const s = stub((url) => url.pathname.endsWith("/rubrics")
      ? status === 200 ? {} : new Response("", { status })
      : { id: "one", courseId: "class1", title: "Exercise", description: "Explain your answer.", alternateLink: "https://evil.example/" });
    const result = new GoogleClassroom("secret", s.fetcher).loadSources("class1", [{ id: "one", type: "courseWork" }]);
    if (status === 401) await expect(result).rejects.toThrow("authorization expired");
    else {
      const loaded = await result;
      expect(loaded.sources).toHaveLength(1);
      expect(loaded.sources[0]!.originalUrl).toBe("https://classroom.google.com");
      expect(loaded.failures[0]!.reason).toContain(status === 403 ? "denied" : "No teacher rubric");
    }
    expect(s.requests).toHaveLength(2);
  }
});

test("assignment text is bounded and unrelated rubric content is excluded", async () => {
  const s = stub((url) => url.pathname.endsWith("/rubrics")
    ? { rubrics: [{ id: "rubric1", courseId: "class1", courseWorkId: "other", criteria: [] }] }
    : { id: "one", courseId: "class1", title: "Exercise", description: "word ".repeat(1000) });
  const loaded = await new GoogleClassroom("secret", s.fetcher).loadSources("class1", [{ id: "one", type: "courseWork" }]);
  expect(loaded.sources).toHaveLength(1);
  expect(loaded.sources[0]!.passages[0]!.id).toBe("instructions-part-1");
  expect(loaded.sources[0]!.passages.every((passage) => passage.text.length <= 2000)).toBe(true);
  expect(loaded.failures[0]!.reason).toContain("does not belong");
  const huge = stub(() => ({ id: "one", title: "Exercise", description: "x".repeat(250_001) }));
  await expect(new GoogleClassroom("secret", huge.fetcher).loadSources("class1", [{ id: "one", type: "courseWork" }])).rejects.toThrow("text limit");
});
